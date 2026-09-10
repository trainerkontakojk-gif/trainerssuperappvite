import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Client, type ClientConfig } from "pg";

const MIGRATION_PATHS = [
  path.resolve(
    process.cwd(),
    "../../supabase/migrations/20260910000000_simulation_subject_attribution.sql",
  ),
  path.resolve(
    process.cwd(),
    "../../supabase/migrations/20260910000853_pdkt_mailbox_subject_intent_cleanup.sql",
  ),
];

const ACTOR_ID = randomUUID();
const TRAINER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();

type DisposableDatabase = {
  client: Client;
  config: ClientConfig;
  dataDirectory: string;
};

function runPostgresCommand(command: string, args: string[]): void {
  try {
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const details = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    throw new Error(
      `${command} ${args.join(" ")} failed: ${details.stderr || details.stdout || details.message || String(error)}`,
      { cause: error },
    );
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function startDisposableDatabase(): Promise<DisposableDatabase> {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "sim-subject-db-"));
  const port = await freePort();
  const logPath = path.join(dataDirectory, "postgres.log");
  let initialized = false;
  let client: Client | undefined;

  try {
    runPostgresCommand("initdb", [
      "-D",
      dataDirectory,
      "--no-locale",
      "--encoding=UTF8",
      "-A",
      "trust",
      "-U",
      "postgres",
    ]);
    initialized = true;
    runPostgresCommand("pg_ctl", [
      "-D",
      dataDirectory,
      "-l",
      logPath,
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ]);
    const config: ClientConfig = {
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
    };
    client = new Client(config);
    await client.connect();
    return { client, config, dataDirectory };
  } catch (error) {
    await client?.end().catch(() => undefined);
    if (initialized) {
      try {
        runPostgresCommand("pg_ctl", [
          "-D",
          dataDirectory,
          "-m",
          "immediate",
          "-w",
          "stop",
        ]);
      } catch {
        // Preserve the setup failure.
      }
    }
    rmSync(dataDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function stopDisposableDatabase(
  database: DisposableDatabase,
): Promise<void> {
  await database.client.end();
  runPostgresCommand("pg_ctl", [
    "-D",
    database.dataDirectory,
    "-m",
    "immediate",
    "-w",
    "stop",
  ]);
  rmSync(database.dataDirectory, { recursive: true, force: true });
}

async function withRole<T>(
  role: "authenticated" | "service_role",
  actorId: string,
  callback: () => Promise<T>,
): Promise<T> {
  await db.client.query(`SET ROLE ${role}`);
  await db.client.query(
    "SELECT set_config('request.jwt.claim.sub', $1, false)",
    [actorId],
  );
  try {
    return await callback();
  } finally {
    await db.client.query("RESET ROLE");
    await db.client.query("RESET request.jwt.claim.sub");
  }
}

let db: DisposableDatabase;

beforeAll(async () => {
  db = await startDisposableDatabase();
  const c = db.client;
  await c.query(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY,
      role TEXT NOT NULL,
      full_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      is_deleted BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE public.profiler_peserta (
      id UUID PRIMARY KEY,
      nama TEXT NOT NULL,
      batch_name TEXT,
      tim TEXT
    );
    CREATE TABLE public.ketik_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      scenario_title TEXT NOT NULL DEFAULT 'x',
      consumer_name TEXT NOT NULL DEFAULT 'y',
      consumer_phone TEXT,
      consumer_city TEXT,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE public.pdkt_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      emails JSONB NOT NULL DEFAULT '[]'::jsonb,
      evaluation_status TEXT NOT NULL DEFAULT 'processing',
      evaluation JSONB,
      evaluation_error TEXT,
      time_taken INTEGER
    );
    CREATE TABLE public.telefun_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      scenario_title TEXT NOT NULL DEFAULT 'x',
      consumer_name TEXT NOT NULL DEFAULT 'y',
      status TEXT NOT NULL DEFAULT 'active',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE public.pdkt_mailbox_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      created_by_user_id UUID NOT NULL,
      client_request_id TEXT,
      sender_name TEXT NOT NULL DEFAULT 'sender',
      sender_email TEXT NOT NULL DEFAULT 'sender@example.test',
      subject TEXT NOT NULL DEFAULT 'subject',
      snippet TEXT NOT NULL DEFAULT 'snippet',
      scenario_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      inbound_email JSONB NOT NULL DEFAULT '{}'::jsonb,
      emails_thread JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'open',
      is_shared_copy BOOLEAN NOT NULL DEFAULT false,
      history_id UUID,
      replied_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );
    CREATE OR REPLACE FUNCTION public.soft_delete_pdkt_mailbox_item(UUID)
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$ BEGIN RETURN; END; $$;

    INSERT INTO public.profiles (id, role, full_name, status)
    VALUES
      ('${ACTOR_ID}', 'agent', 'Agent One', 'active'),
      ('${TRAINER_ID}', 'trainer', 'Trainer One', 'active');
    INSERT INTO public.profiler_peserta (id, nama, batch_name, tim)
    VALUES ('${PARTICIPANT_ID}', 'Andi', 'Batch 12', 'Tim Alpha');

    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT TO authenticated USING (id = auth.uid());
    ALTER TABLE public.profiler_peserta ENABLE ROW LEVEL SECURITY;
    CREATE POLICY peserta_select_authenticated ON public.profiler_peserta
      FOR SELECT TO authenticated USING (true);
    ALTER TABLE public.ketik_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY ketik_select_own ON public.ketik_history
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY ketik_insert_own ON public.ketik_history
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY ketik_update_own ON public.ketik_history
      FOR UPDATE TO authenticated USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
    ALTER TABLE public.pdkt_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pdkt_select_own ON public.pdkt_history
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY pdkt_insert_own ON public.pdkt_history
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    ALTER TABLE public.telefun_history ENABLE ROW LEVEL SECURITY;
    CREATE POLICY telefun_select_own ON public.telefun_history
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY telefun_insert_own ON public.telefun_history
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    ALTER TABLE public.pdkt_mailbox_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY mailbox_select_shared ON public.pdkt_mailbox_items
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY mailbox_insert_own ON public.pdkt_mailbox_items
      FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() AND created_by_user_id = auth.uid()
      );
    CREATE POLICY mailbox_update_own ON public.pdkt_mailbox_items
      FOR UPDATE TO authenticated USING (created_by_user_id = auth.uid())
      WITH CHECK (created_by_user_id = auth.uid());

    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT SELECT ON public.profiles, public.profiler_peserta TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.ketik_history, public.pdkt_history,
      public.telefun_history, public.pdkt_mailbox_items TO authenticated;
    GRANT ALL ON public.profiles, public.profiler_peserta, public.ketik_history,
      public.pdkt_history, public.telefun_history, public.pdkt_mailbox_items
      TO service_role;
  `);

  // The test executes the shipped migration rather than reproducing a reduced
  // copy of its DDL.
  for (const migrationPath of MIGRATION_PATHS) {
    await c.query(readFileSync(migrationPath, "utf8"));
  }
}, 30_000);

afterAll(async () => {
  if (db) await stopDisposableDatabase(db);
});

describe("simulation-subject migration on disposable PostgreSQL", () => {
  it("normalizes an omitted authenticated history attribution to verified self", async () => {
    const id = randomUUID();
    await withRole("authenticated", ACTOR_ID, async () => {
      await db.client.query(
        `INSERT INTO public.ketik_history (id, user_id) VALUES ($1, $2)`,
        [id, ACTOR_ID],
      );
    });

    const result = await db.client.query(
      `SELECT simulation_subject_type, simulation_subject_name,
              simulation_subject_peserta_id
         FROM public.ketik_history WHERE id = $1`,
      [id],
    );
    expect(result.rows[0]).toEqual({
      simulation_subject_type: "self",
      simulation_subject_name: "Agent One",
      simulation_subject_peserta_id: null,
    });
  });

  it("rejects direct authenticated self and participant snapshot forgery", async () => {
    await expect(
      withRole("authenticated", ACTOR_ID, async () =>
        db.client.query(
          `INSERT INTO public.ketik_history
             (id, user_id, simulation_subject_type, simulation_subject_name)
           VALUES ($1, $2, 'self', 'Forged actor')`,
          [randomUUID(), ACTOR_ID],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `INSERT INTO public.ketik_history
             (id, user_id, simulation_subject_type,
              simulation_subject_peserta_id, simulation_subject_name,
              simulation_subject_batch_name, simulation_subject_team)
           VALUES ($1, $2, 'participant', $3, 'Forged', 'Batch 12', 'Tim Alpha')`,
          [randomUUID(), TRAINER_ID, PARTICIPANT_ID],
        ),
      ),
    ).rejects.toThrow();
  });

  it("rejects direct participant attribution without a live FK and keeps status updates usable", async () => {
    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `INSERT INTO public.ketik_history
             (id, user_id, simulation_subject_type,
              simulation_subject_name, simulation_subject_batch_name)
           VALUES ($1, $2, 'participant', 'Andi', 'Batch 12')`,
          [randomUUID(), TRAINER_ID],
        ),
      ),
    ).rejects.toThrow();

    const id = randomUUID();
    await withRole("authenticated", ACTOR_ID, async () => {
      await db.client.query(
        `INSERT INTO public.ketik_history (id, user_id) VALUES ($1, $2)`,
        [id, ACTOR_ID],
      );
      await db.client.query(
        `UPDATE public.ketik_history SET scenario_title = 'updated' WHERE id = $1`,
        [id],
      );
    });
    const result = await db.client.query(
      "SELECT scenario_title FROM public.ketik_history WHERE id = $1",
      [id],
    );
    expect(result.rows[0].scenario_title).toBe("updated");
  });

  it("revokes direct helper execution for authenticated and anonymous roles", async () => {
    const result = await db.client.query(`
      SELECT
        has_function_privilege(
          'authenticated',
          'public.validate_simulation_subject_snapshot()'::text,
          'EXECUTE'
        ) AS authenticated_can_execute,
        has_function_privilege(
          'anon',
          'public.validate_simulation_subject_snapshot()'::text,
          'EXECUTE'
        ) AS anon_can_execute
    `);
    expect(result.rows[0]).toEqual({
      authenticated_can_execute: false,
      anon_can_execute: false,
    });
  });

  it("deletes consumed and expired subject intents while preserving active ones", async () => {
    const consumedToken = randomUUID();
    const expiredToken = randomUUID();
    const activeToken = randomUUID();

    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.pdkt_mailbox_subject_intents
           (token, actor_id, subject_type, subject_peserta_id, subject_name,
            client_request_id, expires_at, consumed_at)
         VALUES
           ($1, $2, 'participant', $3, 'Consumed', $4,
            now() + interval '30 minutes', now()),
           ($5, $2, 'participant', $3, 'Expired', $6,
            now() - interval '1 minute', NULL),
           ($7, $2, 'participant', $3, 'Active', $8,
            now() + interval '30 minutes', NULL)`,
        [
          consumedToken,
          TRAINER_ID,
          PARTICIPANT_ID,
          randomUUID(),
          expiredToken,
          randomUUID(),
          activeToken,
          randomUUID(),
        ],
      );
      const cleanup = await db.client.query(
        "SELECT public.cleanup_pdkt_mailbox_subject_intents() AS deleted",
      );
      expect(Number(cleanup.rows[0].deleted)).toBeGreaterThanOrEqual(2);
    });

    const result = await db.client.query(
      `SELECT token FROM public.pdkt_mailbox_subject_intents
        WHERE token = ANY($1::uuid[]) ORDER BY token`,
      [[consumedToken, expiredToken, activeToken]],
    );
    expect(result.rows).toEqual([{ token: activeToken }]);
  });

  it("keeps intent cleanup executable only by the service role", async () => {
    const result = await db.client.query(`
      SELECT
        has_function_privilege(
          'authenticated',
          'public.cleanup_pdkt_mailbox_subject_intents()'::text,
          'EXECUTE'
        ) AS authenticated_can_execute,
        has_function_privilege(
          'anon',
          'public.cleanup_pdkt_mailbox_subject_intents()'::text,
          'EXECUTE'
        ) AS anon_can_execute,
        has_function_privilege(
          'service_role',
          'public.cleanup_pdkt_mailbox_subject_intents()'::text,
          'EXECUTE'
        ) AS service_role_can_execute
    `);
    expect(result.rows[0]).toEqual({
      authenticated_can_execute: false,
      anon_can_execute: false,
      service_role_can_execute: true,
    });
  });

  it("collapses same-target PDKT retries and rejects legacy/different-target replays", async () => {
    const requestId = randomUUID();
    const inbound = JSON.stringify({ id: "inbound-1", body: "hello" });
    const args = [
      requestId,
      "Sender",
      "sender@example.test",
      "Subject",
      "Snippet",
      JSON.stringify({}),
      JSON.stringify({}),
      inbound,
      "participant",
      PARTICIPANT_ID,
    ];

    const first = await withRole("authenticated", TRAINER_ID, async () =>
      db.client.query(
        `SELECT public.submit_pdkt_mailbox_batch_with_subject(
           $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
         ) AS id`,
        args,
      ),
    );
    const second = await withRole("authenticated", TRAINER_ID, async () =>
      db.client.query(
        `SELECT public.submit_pdkt_mailbox_batch_with_subject(
           $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
         ) AS id`,
        args,
      ),
    );
    expect(second.rows[0].id).toBe(first.rows[0].id);

    const concurrentRequestId = randomUUID();
    const concurrentArgs = [
      concurrentRequestId,
      "Concurrent Sender",
      "concurrent@example.test",
      "Concurrent Subject",
      "Snippet",
      JSON.stringify({}),
      JSON.stringify({}),
      inbound,
      "participant",
      PARTICIPANT_ID,
    ];
    const concurrentClients = [new Client(db.config), new Client(db.config)];
    try {
      await Promise.all(concurrentClients.map((client) => client.connect()));
      await Promise.all(
        concurrentClients.map(async (client) => {
          await client.query("SET ROLE authenticated");
          await client.query(
            "SELECT set_config('request.jwt.claim.sub', $1, false)",
            [TRAINER_ID],
          );
        }),
      );
      const concurrentResults = await Promise.all(
        concurrentClients.map((client) =>
          client.query(
            `SELECT public.submit_pdkt_mailbox_batch_with_subject(
               $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
             ) AS id`,
            concurrentArgs,
          ),
        ),
      );
      expect(
        new Set(concurrentResults.map((result) => result.rows[0].id)).size,
      ).toBe(1);
    } finally {
      await Promise.all(concurrentClients.map((client) => client.end()));
    }

    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `SELECT public.submit_pdkt_mailbox_batch(
             $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb
           ) AS id`,
          args.slice(0, 8),
        ),
      ),
    ).rejects.toThrow("CONFLICT");

    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `SELECT public.submit_pdkt_mailbox_batch_with_subject(
             $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
           ) AS id`,
          [...args.slice(0, 8), "self", null],
        ),
      ),
    ).rejects.toThrow("CONFLICT");
  });

  it("persists the resolved participant snapshot supplied by the API", async () => {
    const requestId = randomUUID();
    const snapshotToken = randomUUID();
    const inbound = JSON.stringify({ id: "frozen-inbound", body: "hello" });
    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.pdkt_mailbox_subject_intents
           (token, actor_id, subject_type, subject_peserta_id,
            subject_name, subject_batch_name, subject_team,
            client_request_id, expires_at)
         VALUES ($1, $2, 'participant', $3, $4, $5, $6, $7, now() + interval '30 minutes')`,
        [
          snapshotToken,
          TRAINER_ID,
          PARTICIPANT_ID,
          "Andi at start",
          "Batch at start",
          "Tim at start",
          requestId,
        ],
      );
    });
    await withRole("authenticated", TRAINER_ID, async () => {
      await db.client.query(
        `SELECT public.submit_pdkt_mailbox_batch_with_subject(
           $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
           $9, $10, $11, $12, $13, $14
         ) AS id`,
        [
          requestId,
          "Frozen Sender",
          "frozen@example.test",
          "Frozen Subject",
          "Snippet",
          JSON.stringify({}),
          JSON.stringify({}),
          inbound,
          "participant",
          PARTICIPANT_ID,
          "Andi at start",
          "Batch at start",
          "Tim at start",
          snapshotToken,
        ],
      );
    });

    const result = await db.client.query(
      `SELECT simulation_subject_type, simulation_subject_name,
              simulation_subject_batch_name, simulation_subject_team
         FROM public.pdkt_mailbox_items
        WHERE client_request_id = $1`,
      [requestId],
    );
    expect(result.rows[0]).toEqual({
      simulation_subject_type: "participant",
      simulation_subject_name: "Andi at start",
      simulation_subject_batch_name: "Batch at start",
      simulation_subject_team: "Tim at start",
    });
  });

  it("reports one row-lock winner for concurrent mailbox replies", async () => {
    const mailboxId = randomUUID();
    await withRole("service_role", ACTOR_ID, async () => {
      await db.client.query(
        `INSERT INTO public.pdkt_mailbox_items
           (id, user_id, created_by_user_id, inbound_email,
            config_snapshot, simulation_subject_type)
         VALUES ($1, $2, $2, '{"id":"inbound"}'::jsonb,
                 '{}'::jsonb, 'self')`,
        [mailboxId, ACTOR_ID],
      );
    });

    const concurrentClients = [new Client(db.config), new Client(db.config)];
    try {
      await Promise.all(concurrentClients.map((client) => client.connect()));
      await Promise.all(
        concurrentClients.map(async (client) => {
          await client.query("SET ROLE authenticated");
          await client.query(
            "SELECT set_config('request.jwt.claim.sub', $1, false)",
            [ACTOR_ID],
          );
        }),
      );
      const results = await Promise.all(
        concurrentClients.map((client, index) =>
          client.query(
            `SELECT public.submit_pdkt_mailbox_reply_with_outcome(
               $1, $2::jsonb, 10
             ) AS outcome`,
            [mailboxId, JSON.stringify({ id: `reply-${index}` })],
          ),
        ),
      );
      const outcomes = results.map((result) => result.rows[0].outcome);
      expect(outcomes.filter((outcome: any) => outcome.created).length).toBe(1);
      expect(
        new Set(outcomes.map((outcome: any) => outcome.history_id)).size,
      ).toBe(1);
    } finally {
      await Promise.all(concurrentClients.map((client) => client.end()));
    }
  });

  it("rejects direct authenticated participant snapshot fields without a backend intent", async () => {
    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `SELECT public.submit_pdkt_mailbox_batch_with_subject(
             $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
             'participant', $9, 'Forged', 'Forged batch', 'Forged team'
           ) AS id`,
          [
            randomUUID(),
            "Forged Sender",
            "forged@example.test",
            "Forged Subject",
            "Snippet",
            JSON.stringify({}),
            JSON.stringify({}),
            JSON.stringify({ id: "forged-inbound" }),
            PARTICIPANT_ID,
          ],
        ),
      ),
    ).rejects.toThrow("subject snapshot intent required");
  });

  it("validates participant reply roles before the replied fast path", async () => {
    const mailboxId = randomUUID();
    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.pdkt_mailbox_items
           (id, user_id, created_by_user_id, inbound_email,
            config_snapshot, simulation_subject_type,
            simulation_subject_peserta_id, simulation_subject_name,
            simulation_subject_batch_name, simulation_subject_team)
         VALUES ($1, $2, $2, '{}'::jsonb, '{}'::jsonb,
                 'participant', $3, 'Andi', 'Batch 12', 'Tim Alpha')`,
        [mailboxId, TRAINER_ID, PARTICIPANT_ID],
      );
    });

    await expect(
      withRole("authenticated", ACTOR_ID, async () =>
        db.client.query(
          `SELECT public.submit_pdkt_mailbox_reply(
             $1, '{"id":"reply-1"}'::jsonb, 10
           )`,
          [mailboxId],
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");

    await withRole("authenticated", TRAINER_ID, async () =>
      db.client.query(
        `SELECT public.submit_pdkt_mailbox_reply(
           $1, '{"id":"reply-1"}'::jsonb, 10
         )`,
        [mailboxId],
      ),
    );

    await expect(
      withRole("authenticated", ACTOR_ID, async () =>
        db.client.query(
          `SELECT public.submit_pdkt_mailbox_reply(
             $1, '{"id":"reply-2"}'::jsonb, 10
           )`,
          [mailboxId],
        ),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects direct live-FK nulling before allowing real FK cleanup", async () => {
    const historyId = randomUUID();
    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.ketik_history
           (id, user_id, simulation_subject_type,
            simulation_subject_peserta_id, simulation_subject_name,
            simulation_subject_batch_name, simulation_subject_team)
         VALUES ($1, $2, 'participant', $3, 'Andi', 'Batch 12', 'Tim Alpha')`,
        [historyId, TRAINER_ID, PARTICIPANT_ID],
      );
    });

    await expect(
      withRole("authenticated", TRAINER_ID, async () =>
        db.client.query(
          `UPDATE public.ketik_history
              SET simulation_subject_peserta_id = NULL
            WHERE id = $1`,
          [historyId],
        ),
      ),
    ).rejects.toThrow("SIMULATION_SUBJECT_IMMUTABLE");
  });

  it("preserves a participant snapshot after FK deletion", async () => {
    const historyId = randomUUID();
    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.ketik_history
           (id, user_id, simulation_subject_type,
            simulation_subject_peserta_id, simulation_subject_name,
            simulation_subject_batch_name, simulation_subject_team)
         VALUES ($1, $2, 'participant', $3, 'Andi', 'Batch 12', 'Tim Alpha')`,
        [historyId, TRAINER_ID, PARTICIPANT_ID],
      );
    });
    await db.client.query("DELETE FROM public.profiler_peserta WHERE id = $1", [
      PARTICIPANT_ID,
    ]);
    const result = await db.client.query(
      `SELECT simulation_subject_type, simulation_subject_peserta_id,
              simulation_subject_name, simulation_subject_batch_name,
              simulation_subject_team
         FROM public.ketik_history WHERE id = $1`,
      [historyId],
    );
    expect(result.rows[0]).toEqual({
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: null,
      simulation_subject_name: "Andi",
      simulation_subject_batch_name: "Batch 12",
      simulation_subject_team: "Tim Alpha",
    });
  });
});
