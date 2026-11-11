import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";

/**
 * Agent self views (plan `plans/markdown/agent-self-sidak-ktp.md`).
 * Real JWT/Hono/PostgREST on the local Supabase stack; no business mocks.
 * `GET /v1/sidak/me` and `GET /v1/profiler/me` are agent-only, take no client
 * input, and never leak another participant's row, ticket or note.
 */
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
installLoopbackFetchGuard();
const admin = createAdmin(env);
const ns = randomUUID().slice(0, 8);
const folder = `agent-self-${ns}`;
const person = randomUUID();
const other = randomUUID();
const indicator = randomUUID();
const createdPeriods: string[] = [];
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users: Identity[] = [];
let self: Identity;
let stranger: Identity;
let unlinked: Identity;
let trainer: Identity;
let leader: Identity;
let administrator: Identity;
let app: Hono;
let period = "";
const sql = (query: string) => runSql(env, query);
const PRIVATE = [
  `OTHER_PRIVATE_NAME_${ns}`,
  `OTHER_KTP_${ns}`,
  `OTHER_TICKET_${ns}`,
  `SELF_TICKET_${ns}`,
  `SELF_NOTE_${ns}`,
];

async function call(path: string, token?: string) {
  const response = await tnaApiRequest(app, `http://localhost/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) };
}

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
  for (const role of [
    "agent",
    "agent",
    "agent",
    "trainer",
    "leader",
    "admin",
  ] as const)
    users.push(
      await createUserWithJwt(env, role, `agent-self-${ns}-${users.length}`),
    );
  [self, stranger, unlinked, trainer, leader, administrator] = users;
  sql(`INSERT INTO profiler_folders(name) VALUES ('${folder}');
    INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut,akun_id,no_ktp,alamat_tinggal) VALUES
    ('${person}','${folder}','Self ${ns}','Chat','Agent',1,'${self.userId}','SELF_KTP_${ns}','Jalan Sendiri ${ns}'),
    ('${other}','${folder}','OTHER_PRIVATE_NAME_${ns}','Chat','Agent',2,'${stranger.userId}','OTHER_KTP_${ns}','Jalan Lain');`);
  const created = sql(
    `INSERT INTO qa_periods(year,month) VALUES (2016,5) ON CONFLICT DO NOTHING RETURNING id;`,
  );
  if (created) createdPeriods.push(created);
  period = sql(`SELECT id FROM qa_periods WHERE year=2016 AND month=5;`);
  sql(`INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES ('${indicator}','chat','Akurasi ${ns}','non_critical',1);
    INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian,is_phantom_padding) VALUES
    ('${person}','${period}','${indicator}','chat','SELF_TICKET_${ns}',0,'SELF_NOTE_${ns}',false),
    ('${other}','${period}','${indicator}','chat','OTHER_TICKET_${ns}',0,'other note',false);`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  sql(
    `BEGIN; DELETE FROM qa_temuan WHERE peserta_id IN ('${person}','${other}'); DELETE FROM qa_dashboard_agent_period_summary WHERE agent_id IN ('${person}','${other}'); DELETE FROM qa_indicators WHERE id='${indicator}'; DELETE FROM profiler_peserta WHERE batch_name='${folder}'; DELETE FROM profiler_folders WHERE name='${folder}'; DELETE FROM qa_periods WHERE id IN ('${[...createdPeriods, randomUUID()].join("','")}'); COMMIT;`,
  );
  for (const user of users)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
});

test("linked agent reads only their own SIDAK aggregate and standing", async () => {
  // Ranks read the dashboard summary; build it like a trainer would.
  const refresh = await tnaApiRequest(
    app,
    "http://localhost/api/v1/sidak/dashboard/refresh-summary",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ periodId: period, serviceType: "chat" }),
    },
  );
  expect(refresh.status).toBe(200);
  const { status, body, text } = await call("/v1/sidak/me", self.token);
  expect(status).toBe(200);
  expect(Object.keys(body.data).sort()).toEqual(["linked", "qa", "standing"]);
  expect(body.data.linked).toBe(true);
  expect(body.data.qa).toMatchObject({
    serviceType: "chat",
    periodLabel: "Mei 2016",
  });
  expect(body.data.standing).toMatchObject({ year: 2016, serviceType: "chat" });
  expect(Object.keys(body.data.standing).sort()).toEqual([
    "combinedTeam",
    "forecast",
    "leaderTeam",
    "serviceType",
    "year",
  ]);
  // Whole-team comparison ran (self + peer), but only the position leaves.
  const team = body.data.standing.combinedTeam;
  expect(team).not.toBeNull();
  expect(typeof team.rank).toBe("number");
  expect(team.total).toBeGreaterThanOrEqual(2);
  for (const rank of [team, body.data.standing.leaderTeam])
    if (rank)
      expect(Object.keys(rank).sort()).toEqual([
        "basis",
        "rank",
        "scopeId",
        "scopeLabel",
        "total",
      ]);
  for (const secret of PRIVATE) expect(text).not.toContain(secret);
  expect(text).not.toContain(other);
});

test("linked agent reads their own full KTP row and nobody else's", async () => {
  const { status, body, text } = await call("/v1/profiler/me", self.token);
  expect(status).toBe(200);
  expect(body.data.linked).toBe(true);
  expect(body.data.peserta).toMatchObject({
    id: person,
    nama: `Self ${ns}`,
    no_ktp: `SELF_KTP_${ns}`,
    alamat_tinggal: `Jalan Sendiri ${ns}`,
  });
  // Every column of the own row, exactly as stored.
  const row = await admin
    .from("profiler_peserta")
    .select("*")
    .eq("id", person)
    .single();
  expect(row.error).toBeNull();
  expect(body.data.peserta).toEqual(row.data);
  for (const secret of PRIVATE) expect(text).not.toContain(secret);
  expect(text).not.toContain(other);
});

test("unlinked agent gets an explicit unlinked result, not someone else's data", async () => {
  const sidak = await call("/v1/sidak/me", unlinked.token);
  expect(sidak.status).toBe(200);
  expect(sidak.body.data).toEqual({ linked: false, qa: null, standing: null });
  const ktp = await call("/v1/profiler/me", unlinked.token);
  expect(ktp.status).toBe(200);
  expect(ktp.body.data).toEqual({ linked: false, peserta: null });
});

test("self endpoints reject client input, staff roles and anonymous callers", async () => {
  for (const path of ["/v1/sidak/me", "/v1/profiler/me"]) {
    const filtered = await call(`${path}?id=${other}`, self.token);
    expect(filtered.status, path).toBe(400);
    expect(filtered.text).not.toContain(`OTHER_KTP_${ns}`);
    for (const staff of [trainer, leader, administrator]) {
      const denied = await call(path, staff.token);
      expect(denied.status, `${path} staff`).toBe(403);
    }
    expect((await call(path)).status, `${path} anon`).toBe(401);
  }
});

test("agent still cannot open the staff KTP list or another participant", async () => {
  expect((await call("/v1/profiler/peserta", self.token)).status).toBe(403);
  expect((await call(`/v1/profiler/peserta/${other}`, self.token)).status).toBe(
    403,
  );
  expect(
    (
      await call(
        `/v1/sidak/agents/${other}/quickview?year=2016&service_type=chat`,
        self.token,
      )
    ).status,
  ).toBe(403);
});
