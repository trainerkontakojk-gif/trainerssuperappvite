import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Client, type ClientConfig } from "pg";

const SUPABASE_DIR = path.resolve(__dirname, "../../../../supabase");
const MIGRATION_PATH = path.join(
  SUPABASE_DIR,
  "migrations/20260904150000_telefun_scoring_claim_fencing.sql",
);
const ROLLBACK_PATH = path.join(
  SUPABASE_DIR,
  "rollbacks/rollback_20260904150000_telefun_scoring_claim_fencing.sql",
);
const PHASE4_PATH = path.join(
  SUPABASE_DIR,
  "migrations/20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql",
);
const REPAIR_PATH = path.join(
  SUPABASE_DIR,
  "migrations/20260622150000_repair_telefun_scoring_lifecycle_contract.sql",
);

const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
const rollbackSql = readFileSync(ROLLBACK_PATH, "utf8");

function extractFunction(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = sql.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not find ${marker}`);
  }
  const end = sql.indexOf("$$;", start);
  if (end < 0) {
    throw new Error(`Could not find end of ${marker}`);
  }
  return sql.slice(start, end + 3);
}

const baselineFunctions = [
  extractFunction(readFileSync(PHASE4_PATH, "utf8"), "claim_telefun_scoring"),
  extractFunction(
    readFileSync(PHASE4_PATH, "utf8"),
    "complete_telefun_scoring",
  ),
  extractFunction(readFileSync(REPAIR_PATH, "utf8"), "fail_telefun_scoring"),
  extractFunction(
    readFileSync(REPAIR_PATH, "utf8"),
    "reschedule_telefun_scoring",
  ),
];

const legacySignatures = [
  "public.claim_telefun_scoring(uuid,integer)",
  "public.complete_telefun_scoring(uuid,numeric,jsonb)",
  "public.fail_telefun_scoring(uuid,text)",
  "public.reschedule_telefun_scoring(uuid,text,timestamp with time zone)",
] as const;

const tokenizedSignatures = [
  "public.claim_telefun_scoring(uuid,integer,text,text)",
  "public.complete_telefun_scoring(uuid,numeric,jsonb,text)",
  "public.fail_telefun_scoring(uuid,text,text)",
  "public.reschedule_telefun_scoring(uuid,text,timestamp with time zone,text)",
] as const;

const allScoringSignatures = [...legacySignatures, ...tokenizedSignatures];

const baselineSchemaSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE TABLE public.telefun_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  telefun_transport TEXT,
  recording_status TEXT,
  recording_error TEXT,
  scoring_ready_at TIMESTAMPTZ,
  agent_recording_path TEXT,
  scoring_status TEXT DEFAULT 'pending'
    CHECK (scoring_status IN ('pending', 'processing', 'completed', 'failed')),
  scoring_claimed_at TIMESTAMPTZ,
  scoring_completed_at TIMESTAMPTZ,
  scoring_attempt_count INT DEFAULT 0,
  scoring_last_error TEXT,
  scoring_next_attempt_at TIMESTAMPTZ,
  score NUMERIC,
  voice_assessment JSONB
);
`;

// Effective pre-fencing ACLs from the lifecycle migrations. CREATE OR REPLACE
// must preserve these grants when the fencing overloads are applied.
const baselineAclSql = `
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_telefun_scoring(UUID, TEXT)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) TO service_role;
`;

interface DisposableDatabase {
  client: Client;
  config: ClientConfig;
  dataDirectory: string;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

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

async function startDisposableDatabase(): Promise<DisposableDatabase> {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "telefun-scoring-db-"));
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
        // Preserve the startup/connect error while still removing the cluster.
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

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

type SessionOptions = {
  scoringStatus?: "pending" | "processing" | "completed" | "failed";
  claimedAt?: Date | null;
  nextAttemptAt?: Date | null;
  status?: string;
  transport?: string | null;
  score?: number | null;
  voiceAssessment?: unknown;
};

async function insertSession(
  client: Client,
  id: string,
  options: SessionOptions = {},
): Promise<void> {
  await client.query(
    `
      INSERT INTO public.telefun_history (
        id, user_id, status, telefun_transport, scoring_status,
        scoring_claimed_at, scoring_next_attempt_at, score, voice_assessment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      id,
      "11111111-1111-1111-1111-111111111111",
      options.status ?? "completed",
      options.transport ?? "gemini",
      options.scoringStatus ?? "pending",
      options.claimedAt ?? null,
      options.nextAttemptAt ?? null,
      options.score ?? null,
      options.voiceAssessment === undefined
        ? null
        : JSON.stringify(options.voiceAssessment),
    ],
  );
}

async function tokenizedClaim(
  client: Client,
  id: string,
  timeout: number | null,
  token: string,
  owner = "integration-worker",
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT public.claim_telefun_scoring(
        $1::uuid, $2::integer, $3::text, $4::text
      ) AS claimed
    `,
    [id, timeout, token, owner],
  );
  return result.rows[0].claimed;
}

async function legacyClaim(
  client: Client,
  id: string,
  timeout: number | null,
): Promise<boolean> {
  const result = await client.query(
    "SELECT public.claim_telefun_scoring($1::uuid, $2::integer) AS claimed",
    [id, timeout],
  );
  return result.rows[0].claimed;
}

async function tokenizedComplete(
  client: Client,
  id: string,
  token: string,
  score = 8,
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT public.complete_telefun_scoring(
        $1::uuid, $2::numeric, $3::jsonb, $4::text
      ) AS completed
    `,
    [id, score, JSON.stringify({ overallScore: score }), token],
  );
  return result.rows[0].completed;
}

async function tokenizedFail(
  client: Client,
  id: string,
  token: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT public.fail_telefun_scoring($1::uuid, $2::text, $3::text) AS failed",
    [id, "stale", token],
  );
  return result.rows[0].failed;
}

async function tokenizedReschedule(
  client: Client,
  id: string,
  token: string,
): Promise<boolean> {
  const result = await client.query(
    `
      SELECT public.reschedule_telefun_scoring(
        $1::uuid, $2::text, $3::timestamptz, $4::text
      ) AS rescheduled
    `,
    [id, "stale", new Date(Date.now() + 60_000), token],
  );
  return result.rows[0].rescheduled;
}

async function legacyComplete(client: Client, id: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT public.complete_telefun_scoring(
        $1::uuid, $2::numeric, $3::jsonb
      ) AS completed
    `,
    [id, 7, JSON.stringify({ legacy: true })],
  );
  return result.rows[0].completed;
}

async function legacyFail(client: Client, id: string): Promise<boolean> {
  const result = await client.query(
    "SELECT public.fail_telefun_scoring($1::uuid, $2::text) AS failed",
    [id, "legacy"],
  );
  return result.rows[0].failed;
}

async function legacyReschedule(client: Client, id: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT public.reschedule_telefun_scoring(
        $1::uuid, $2::text, $3::timestamptz
      ) AS rescheduled
    `,
    [id, "legacy", new Date(Date.now() + 60_000)],
  );
  return result.rows[0].rescheduled;
}

describe("Telefun scoring claim fencing RPCs on disposable PostgreSQL", () => {
  let database: DisposableDatabase;
  let client: Client;
  const baselineDefinitions = new Map<string, string>();

  beforeAll(async () => {
    database = await startDisposableDatabase();
    client = database.client;
    await client.query(baselineSchemaSql);
    for (const functionSql of baselineFunctions) {
      await client.query(functionSql);
    }
    await client.query(baselineAclSql);
    for (const signature of legacySignatures) {
      const result = await client.query(
        "SELECT pg_get_functiondef($1::regprocedure) AS definition",
        [signature],
      );
      baselineDefinitions.set(signature, result.rows[0].definition);
    }
    await client.query(migrationSql);
  }, 30_000);

  afterAll(async () => {
    if (database) await stopDisposableDatabase(database);
  }, 30_000);

  beforeEach(async () => {
    await client.query("TRUNCATE public.telefun_history");
  });

  it("keeps scoring RPCs service-role-only across the fencing migration", async () => {
    for (const signature of allScoringSignatures) {
      const privileges = await client.query(
        `
          SELECT has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') AS service_role_execute,
                 has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon_execute,
                 has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS authenticated_execute,
                 has_function_privilege('public', $1::regprocedure, 'EXECUTE') AS public_execute
        `,
        [signature],
      );
      expect(privileges.rows[0], signature).toEqual({
        service_role_execute: true,
        anon_execute: false,
        authenticated_execute: false,
        public_execute: false,
      });
    }
  });

  it("enforces the 300-second floor for tokenized and compatibility claims", async () => {
    const id = randomUUID();
    await insertSession(client, id, {
      scoringStatus: "processing",
      claimedAt: new Date(Date.now() - 200_000),
    });

    for (const [timeout, token] of [
      [120, "a".repeat(64)],
      [180, "b".repeat(64)],
      [299, "c".repeat(64)],
    ] as const) {
      expect(await tokenizedClaim(client, id, timeout, token)).toBe(false);
      expect(await legacyClaim(client, id, timeout)).toBe(false);
    }
    expect(await tokenizedClaim(client, id, null, "d".repeat(64))).toBe(false);
    expect(await legacyClaim(client, id, null)).toBe(false);

    const row = await client.query(
      "SELECT scoring_status, scoring_claim_token_hash FROM public.telefun_history WHERE id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({
      scoring_status: "processing",
      scoring_claim_token_hash: null,
    });
  });

  it("reclaims at 301 seconds but keeps a 299-second claim active", async () => {
    const id = randomUUID();
    await insertSession(client, id, {
      scoringStatus: "processing",
      claimedAt: new Date(Date.now() - 299_000),
    });
    await client.query(
      `UPDATE public.telefun_history
       SET scoring_claim_token_hash = $2, scoring_claim_owner = 'old'
       WHERE id = $1`,
      [id, "c".repeat(64)],
    );

    expect(await tokenizedClaim(client, id, 300, "d".repeat(64))).toBe(false);
    await client.query(
      "UPDATE public.telefun_history SET scoring_claimed_at = now() - interval '301 seconds' WHERE id = $1",
      [id],
    );
    expect(await tokenizedClaim(client, id, 300, "d".repeat(64))).toBe(true);
    const row = await client.query(
      "SELECT scoring_claim_token_hash FROM public.telefun_history WHERE id = $1",
      [id],
    );
    expect(row.rows[0].scoring_claim_token_hash).toBe("d".repeat(64));
  });

  it("allows exactly one winner when two connections claim the same row", async () => {
    const id = randomUUID();
    await insertSession(client, id);
    const first = new Client(database.config);
    const second = new Client(database.config);
    await Promise.all([first.connect(), second.connect()]);
    try {
      const firstToken = "e".repeat(64);
      const secondToken = "f".repeat(64);
      const results = await Promise.all([
        tokenizedClaim(first, id, 300, firstToken, "first"),
        tokenizedClaim(second, id, 300, secondToken, "second"),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const row = await client.query(
        "SELECT scoring_claim_token_hash, scoring_attempt_count FROM public.telefun_history WHERE id = $1",
        [id],
      );
      expect([firstToken, secondToken]).toContain(
        row.rows[0].scoring_claim_token_hash,
      );
      expect(row.rows[0].scoring_attempt_count).toBe(1);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("rejects stale token completion, failure, and reschedule after reclaim", async () => {
    const id = randomUUID();
    await insertSession(client, id);
    const oldToken = "1".repeat(64);
    const newToken = "2".repeat(64);
    expect(await tokenizedClaim(client, id, 300, oldToken)).toBe(true);
    await client.query(
      "UPDATE public.telefun_history SET scoring_claimed_at = now() - interval '301 seconds' WHERE id = $1",
      [id],
    );
    expect(await tokenizedClaim(client, id, 300, newToken)).toBe(true);

    expect(await tokenizedComplete(client, id, oldToken)).toBe(false);
    expect(await tokenizedFail(client, id, oldToken)).toBe(false);
    expect(await tokenizedReschedule(client, id, oldToken)).toBe(false);
    const stillProcessing = await client.query(
      "SELECT scoring_status, scoring_claim_token_hash FROM public.telefun_history WHERE id = $1",
      [id],
    );
    expect(stillProcessing.rows[0]).toEqual({
      scoring_status: "processing",
      scoring_claim_token_hash: newToken,
    });
    expect(await tokenizedComplete(client, id, newToken)).toBe(true);
  });

  it("prevents legacy writes from overwriting a tokenized claim", async () => {
    const id = randomUUID();
    await insertSession(client, id);
    const token = "3".repeat(64);
    expect(await tokenizedClaim(client, id, 300, token)).toBe(true);
    expect(await legacyComplete(client, id)).toBe(false);
    expect(await legacyFail(client, id)).toBe(false);
    expect(await legacyReschedule(client, id)).toBe(false);
    const row = await client.query(
      "SELECT scoring_status, scoring_claim_token_hash FROM public.telefun_history WHERE id = $1",
      [id],
    );
    expect(row.rows[0]).toEqual({
      scoring_status: "processing",
      scoring_claim_token_hash: token,
    });
  });

  it("blocks claim admission behind rollback's table lock while the active guard waits", async () => {
    const id = randomUUID();
    await insertSession(client, id);
    const holder = new Client(database.config);
    const rollbackClient = new Client(database.config);
    const claimant = new Client(database.config);
    await Promise.all([
      holder.connect(),
      rollbackClient.connect(),
      claimant.connect(),
    ]);
    try {
      await holder.query("BEGIN");
      await holder.query(
        "SELECT id FROM public.telefun_history WHERE id = $1 FOR UPDATE",
        [id],
      );
      await holder.query(
        `UPDATE public.telefun_history
         SET scoring_status = 'processing', scoring_claimed_at = now(),
             scoring_claim_token_hash = $2, scoring_claim_owner = 'holder'
         WHERE id = $1`,
        [id, "4".repeat(64)],
      );

      const rollbackPromise = rollbackClient.query(rollbackSql);
      await waitFor(async () => {
        const locks = await client.query(
          `
            SELECT 1
            FROM pg_locks
            WHERE relation = 'public.telefun_history'::regclass
              AND mode = 'AccessExclusiveLock'
              AND NOT granted
          `,
        );
        return locks.rowCount === 1;
      });

      await claimant.query("SET statement_timeout = '500ms'");
      await expect(
        claimant.query(
          `SELECT public.claim_telefun_scoring(
             $1::uuid, 300, $2::text, 'blocked-claim'
           )`,
          [id, "5".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: "57014" });

      await holder.query("COMMIT");
      await expect(rollbackPromise).rejects.toMatchObject({ code: "55000" });
      const row = await client.query(
        "SELECT scoring_status, scoring_claim_token_hash FROM public.telefun_history WHERE id = $1",
        [id],
      );
      expect(row.rows[0]).toEqual({
        scoring_status: "processing",
        scoring_claim_token_hash: "4".repeat(64),
      });
    } finally {
      await Promise.all([holder.end(), rollbackClient.end(), claimant.end()]);
    }
  });

  it("rolls back atomically, restores legacy lifecycle bodies, preserves data, and reapplies", async () => {
    const preservedId = randomUUID();
    await insertSession(client, preservedId, {
      scoringStatus: "completed",
      score: 9.25,
      voiceAssessment: { preserved: true },
    });

    await client.query(rollbackSql);

    const columns = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'telefun_history'
          AND column_name IN ('scoring_claim_token_hash', 'scoring_claim_owner')
      `,
    );
    expect(columns.rows).toHaveLength(0);
    expect(
      (
        await client.query(
          "SELECT to_regprocedure('public.claim_telefun_scoring(uuid,integer,text,text)') AS procedure",
        )
      ).rows[0].procedure,
    ).toBeNull();

    for (const signature of legacySignatures) {
      const result = await client.query(
        "SELECT pg_get_functiondef($1::regprocedure) AS definition",
        [signature],
      );
      expect(result.rows[0].definition).toBe(
        baselineDefinitions.get(signature),
      );

      const privileges = await client.query(
        `
          SELECT has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') AS service_role_execute,
                 has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS anon_execute,
                 has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') AS authenticated_execute
        `,
        [signature],
      );
      expect(privileges.rows[0]).toEqual({
        service_role_execute: true,
        anon_execute: false,
        authenticated_execute: false,
      });
    }

    const preserved = await client.query(
      "SELECT score, voice_assessment FROM public.telefun_history WHERE id = $1",
      [preservedId],
    );
    expect(preserved.rows[0]).toEqual({
      score: "9.25",
      voice_assessment: { preserved: true },
    });

    const completedId = randomUUID();
    const failedId = randomUUID();
    const rescheduledId = randomUUID();
    await insertSession(client, completedId);
    await insertSession(client, failedId);
    await insertSession(client, rescheduledId);
    expect(await legacyClaim(client, completedId, 120)).toBe(true);
    expect(await legacyComplete(client, completedId)).toBe(true);
    expect(await legacyClaim(client, failedId, 120)).toBe(true);
    expect(await legacyFail(client, failedId)).toBe(true);
    expect(await legacyClaim(client, rescheduledId, 120)).toBe(true);
    expect(await legacyReschedule(client, rescheduledId)).toBe(true);

    await client.query(migrationSql);
    const reapplied = await client.query(
      `
        SELECT score, voice_assessment,
               to_regprocedure('public.claim_telefun_scoring(uuid,integer,text,text)') IS NOT NULL AS tokenized
        FROM public.telefun_history
        WHERE id = $1
      `,
      [preservedId],
    );
    expect(reapplied.rows[0]).toEqual({
      score: "9.25",
      voice_assessment: { preserved: true },
      tokenized: true,
    });
  });
});
