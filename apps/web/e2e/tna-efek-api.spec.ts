import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type {
  EfekNameMatch,
  EfekProgram,
  EfekSession,
  EfekSessionDetail,
} from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";

// EFEK phase 1 (plans/markdown/efek.md): training sessions + participants on the
// real Hono app against loopback Supabase. Every row is namespaced and removed.
test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
for (const raw of [env.apiUrl, env.dbUrl])
  if (!["localhost", "127.0.0.1"].includes(new URL(raw).hostname))
    throw new Error("EFEK E2E requires loopback Supabase");
installLoopbackFetchGuard();
const admin = createAdmin(env);
const ns = randomUUID();
const tag = ns.slice(0, 8);
const folders = [randomUUID(), randomUUID()];
const people = {
  sari: { id: randomUUID(), nama: `Efek Sari Wulandari ${tag}` },
  dimas: { id: randomUUID(), nama: `Efek Dimas Pratama ${tag}` },
  putri: { id: randomUUID(), nama: `Efek Putri Anggraini ${tag}` },
  andi1: { id: randomUUID(), nama: `Efek Andi ${tag}` },
  andi2: { id: randomUUID(), nama: `Efek Andi ${tag}` },
};
type User = Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: User;
let leader: User;
let agent: User;
let app: Hono;

const sql = (query: string) => {
  try {
    return runSql(env, query);
  } catch {
    throw new Error("EFEK SQL probe failed; raw command suppressed");
  }
};

async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
  token: string = trainer.token,
) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna/efek${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const envelope = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { code: string; message: string };
  };
  return { status: response.status, ...envelope };
}

const session = (overrides: Record<string, unknown> = {}) => ({
  program_code: "ketik",
  title: `Level Up Week Mei ${tag}`,
  service_type: "chat",
  start_date: "2026-05-12",
  end_date: "2026-05-16",
  peserta_ids: [people.sari.id, people.dimas.id],
  ...overrides,
});

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  trainer = await createUserWithJwt(env, "trainer", `efek-${ns}`);
  leader = await createUserWithJwt(env, "leader", `efek-${ns}`);
  agent = await createUserWithJwt(env, "agent", `efek-${ns}`);
  // (batch_name, nama) is unique, so the two namesakes sit in different batches.
  const rows = Object.values(people)
    .map(
      (p, i) =>
        `('${p.id}','efek-${tag}${p === people.andi2 ? "-b" : ""}','${p.nama}','Chat','Agent',${i + 1})`,
    )
    .join(",");
  sql(
    `BEGIN; INSERT INTO profiler_folders(id,name) VALUES ('${folders[0]}','efek-${tag}'),('${folders[1]}','efek-${tag}-b'); INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES ${rows}; COMMIT;`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const users = [trainer, leader, agent].filter(Boolean).map((u) => u.userId);
  // A placeholder keeps the IN lists valid when beforeAll failed early.
  const ids = [...users, randomUUID()];
  sql(
    `BEGIN; DELETE FROM efek_sessions WHERE created_by IN ('${ids.join("','")}'); DELETE FROM profiler_peserta WHERE batch_name LIKE 'efek-${tag}%'; DELETE FROM profiler_folders WHERE id IN ('${folders.join("','")}'); DELETE FROM activity_logs WHERE user_id IN ('${ids.join("','")}'); COMMIT;`,
  );
  for (const id of users)
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("programs map KETIK, PDKT, Telefun, and CERIWIS to their measured service", async () => {
  const result = await call<EfekProgram[]>("/programs");
  expect(result.status).toBe(200);
  expect(
    result.data.map((p) => [p.code, p.name, p.default_service_type]),
  ).toEqual([
    ["ketik", "KETIK", "chat"],
    ["pdkt", "PDKT", "email"],
    ["telefun", "Telefun", "call"],
    ["ceriwis", "CERIWIS", "cso"],
  ]);
});

test("trainer creates, lists, edits, and deletes a session with its participants", async () => {
  const created = await call<{ id: string }>("/sessions", "POST", session());
  expect(created.status).toBe(201);
  const id = created.data.id;

  const list = await call<{ items: EfekSession[] }>("/sessions?program=ketik");
  expect(list.data.items.find((s) => s.id === id)).toMatchObject({
    title: `Level Up Week Mei ${tag}`,
    service_type: "chat",
    participant_count: 2,
  });
  const other = await call<{ items: EfekSession[] }>("/sessions?program=pdkt");
  expect(other.data.items.some((s) => s.id === id)).toBe(false);

  const detail = await call<EfekSessionDetail>(`/sessions/${id}`);
  expect(detail.data.participants.map((p) => p.nama)).toEqual([
    people.dimas.nama,
    people.sari.nama,
  ]);

  const duplicate = await call(
    "/sessions",
    "POST",
    session({ title: `level up week mei ${tag} ` }),
  );
  expect(duplicate.status).toBe(409);
  expect(duplicate.error?.code).toBe("EFEK_SESSION_EXISTS");

  const edited = await call(
    `/sessions/${id}`,
    "PUT",
    session({
      service_type: "cso",
      peserta_ids: [people.dimas.id, people.putri.id],
    }),
  );
  expect(edited.status).toBe(200);
  const after = await call<EfekSessionDetail>(`/sessions/${id}`);
  expect(after.data.service_type).toBe("cso");
  expect(after.data.participants.map((p) => p.peserta_id).sort()).toEqual(
    [people.dimas.id, people.putri.id].sort(),
  );
  expect(
    sql(
      `SELECT count(*) FROM activity_logs WHERE user_id='${trainer.userId}' AND module='tna' AND action LIKE '%sesi EFEK%';`,
    ),
  ).toBe("2");

  expect((await call(`/sessions/${id}`, "DELETE")).status).toBe(200);
  expect((await call(`/sessions/${id}`)).status).toBe(404);
  expect(
    sql(`SELECT count(*) FROM efek_participants WHERE session_id='${id}';`),
  ).toBe("0");
});

test("invalid sessions are rejected before or by the database", async () => {
  const backwards = await call(
    "/sessions",
    "POST",
    session({ start_date: "2026-05-16", end_date: "2026-05-12" }),
  );
  expect(backwards.status).toBe(400);
  const empty = await call("/sessions", "POST", session({ peserta_ids: [] }));
  expect(empty.status).toBe(400);
  const unknownPerson = await call(
    "/sessions",
    "POST",
    session({ title: `Tidak dikenal ${tag}`, peserta_ids: [randomUUID()] }),
  );
  expect(unknownPerson.status).toBe(422);
  expect(unknownPerson.error?.code).toBe("EFEK_INVALID_PARTICIPANTS");
  const unknownProgram = await call(
    "/sessions",
    "POST",
    session({ title: `Program asing ${tag}`, program_code: "asing" }),
  );
  expect(unknownProgram.status).toBe(422);
  expect(unknownProgram.error?.code).toBe("EFEK_PROGRAM_INACTIVE");
});

test("leaders and agents cannot read or write; clients cannot bypass the API", async () => {
  for (const user of [leader, agent]) {
    expect((await call("/programs", "GET", undefined, user.token)).status).toBe(
      403,
    );
    expect((await call("/sessions", "GET", undefined, user.token)).status).toBe(
      403,
    );
    expect(
      (await call("/sessions", "POST", session(), user.token)).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/import/match",
          "POST",
          { names: [people.sari.nama] },
          user.token,
        )
      ).status,
    ).toBe(403);
  }

  const rest = (path: string, token: string, init: RequestInit = {}) =>
    fetch(`${env.apiUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  // Leaders see no rows through RLS even with the table granted for SELECT.
  const leaderRead = await rest("efek_programs?select=code", leader.token);
  expect(await leaderRead.json()).toEqual([]);
  // A trainer JWT cannot write the tables or call the guarded RPC directly.
  const insert = await rest("efek_sessions", trainer.token, {
    method: "POST",
    body: JSON.stringify({
      program_code: "ketik",
      title: `Langsung ${tag}`,
      service_type: "chat",
      start_date: "2026-05-01",
      end_date: "2026-05-01",
      created_by: trainer.userId,
      updated_by: trainer.userId,
    }),
  });
  expect(insert.ok).toBe(false);
  const rpc = await rest("rpc/efek_save_sessions", trainer.token, {
    method: "POST",
    body: JSON.stringify({
      p_actor_id: trainer.userId,
      p_sessions: [session({ title: `Langsung RPC ${tag}` })],
      p_mode: "create",
    }),
  });
  expect(rpc.ok).toBe(false);
  expect(JSON.stringify(await rpc.json())).toContain("TNA_FORBIDDEN");
  expect(
    sql(
      `SELECT count(*) FROM efek_sessions WHERE title LIKE 'Langsung%${tag}';`,
    ),
  ).toBe("0");
});

test("import matches names against Profiler and merges into existing sessions", async () => {
  const match = await call<{ items: EfekNameMatch[] }>(
    "/import/match",
    "POST",
    {
      names: [
        `  efek SARI wulandari ${tag} `,
        `Efek Dimas P. ${tag}`,
        `Efek Putri Angraini ${tag}`,
        `Efek Andi ${tag}`,
        `Orang Asing Sekali ${tag}`,
      ],
    },
  );
  expect(match.status).toBe(200);
  const [sari, dimas, putri, andi, stranger] = match.data.items;
  expect(sari).toMatchObject({ status: "cocok" });
  expect(sari!.candidates.map((c) => c.id)).toEqual([people.sari.id]);
  expect(dimas).toMatchObject({ status: "pilih" });
  expect(dimas!.candidates.map((c) => c.id)).toContain(people.dimas.id);
  expect(putri).toMatchObject({ status: "pilih" });
  expect(putri!.candidates.map((c) => c.id)).toContain(people.putri.id);
  expect(andi).toMatchObject({ status: "pilih" });
  expect(andi!.candidates.map((c) => c.id).sort()).toEqual(
    [people.andi1.id, people.andi2.id].sort(),
  );
  expect(stranger).toMatchObject({
    status: "tidak_ditemukan",
    candidates: [],
  });

  const first = await call<{ id: string }>(
    "/sessions",
    "POST",
    session({
      title: `Level Up Week Juni ${tag}`,
      start_date: "2026-06-09",
      end_date: "2026-06-13",
      peserta_ids: [people.sari.id],
    }),
  );
  expect(first.status).toBe(201);
  const imported = await call<{ session_ids: string[] }>("/import", "POST", {
    sessions: [
      session({
        title: `LEVEL UP WEEK JUNI ${tag}`,
        start_date: "2026-06-09",
        end_date: "2026-06-13",
        peserta_ids: [people.sari.id, people.dimas.id],
      }),
      session({
        program_code: "ceriwis",
        service_type: "cso",
        title: `Level Up Week Juni ${tag}`,
        start_date: "2026-06-09",
        end_date: "2026-06-13",
        peserta_ids: [people.andi1.id],
      }),
    ],
  });
  expect(imported.status).toBe(201);
  expect(imported.data.session_ids).toHaveLength(2);
  expect(imported.data.session_ids).toContain(first.data.id);
  const merged = await call<EfekSessionDetail>(`/sessions/${first.data.id}`);
  expect(merged.data.participant_count).toBe(2);
  const ceriwis = await call<{ items: EfekSession[] }>(
    "/sessions?program=ceriwis",
  );
  expect(
    ceriwis.data.items.find((s) => imported.data.session_ids.includes(s.id)),
  ).toMatchObject({ service_type: "cso", participant_count: 1 });

  // One bad session rolls back the whole import.
  const before = sql(
    `SELECT count(*) FROM efek_sessions WHERE created_by='${trainer.userId}';`,
  );
  const failed = await call("/import", "POST", {
    sessions: [
      session({ title: `Rollback A ${tag}` }),
      session({ title: `Rollback B ${tag}`, peserta_ids: [randomUUID()] }),
    ],
  });
  expect(failed.status).toBe(422);
  expect(
    sql(
      `SELECT count(*) FROM efek_sessions WHERE created_by='${trainer.userId}';`,
    ),
  ).toBe(before);
});
