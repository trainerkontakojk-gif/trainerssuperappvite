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
 * Revision 2: an agent reads the staff per-agent SIDAK endpoints
 * (`sidak.agent.read`) for their own participant only, with full own findings;
 * every other participant is 403 and nothing of a peer leaks. `GET
 * /v1/profiler/me` is agent-only and takes no client input. `/v1/sidak/me` is
 * gone.
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
const OTHER = [
  `OTHER_PRIVATE_NAME_${ns}`,
  `OTHER_KTP_${ns}`,
  `OTHER_TICKET_${ns}`,
  `OTHER_NOTE_${ns}`,
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
    ('${other}','${period}','${indicator}','chat','OTHER_TICKET_${ns}',0,'OTHER_NOTE_${ns}',false);`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  sql(
    `BEGIN; DELETE FROM qa_temuan WHERE peserta_id IN ('${person}','${other}'); DELETE FROM qa_dashboard_agent_period_summary WHERE agent_id IN ('${person}','${other}'); DELETE FROM qa_indicators WHERE id='${indicator}'; DELETE FROM profiler_peserta WHERE batch_name='${folder}'; DELETE FROM profiler_folders WHERE name='${folder}'; DELETE FROM qa_periods WHERE id IN ('${[...createdPeriods, randomUUID()].join("','")}'); COMMIT;`,
  );
  for (const user of users)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
});

test("linked agent opens their own SIDAK agent detail with full findings", async () => {
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
  const detail = await call(
    `/v1/sidak/agents/${person}?year=2016&service_type=chat`,
    self.token,
  );
  expect(detail.status, detail.text).toBe(200);
  expect(detail.body.data.peserta.id).toBe(person);
  // Own findings are complete: ticket and QA note.
  expect(detail.text).toContain(`SELF_TICKET_${ns}`);
  expect(detail.text).toContain(`SELF_NOTE_${ns}`);
  for (const secret of OTHER) expect(detail.text).not.toContain(secret);
  expect(detail.text).not.toContain(other);

  const quickview = await call(
    `/v1/sidak/agents/${person}/quickview?year=2016&service_type=chat`,
    self.token,
  );
  expect(quickview.status, quickview.text).toBe(200);
  // Whole-team comparison ran (self + peer), but only the position leaves.
  const team = quickview.body.data.combinedTeam;
  expect(team).not.toBeNull();
  expect(typeof team.rank).toBe("number");
  expect(team.total).toBeGreaterThanOrEqual(2);
  expect(Object.keys(team).sort()).toEqual([
    "basis",
    "rank",
    "scopeId",
    "scopeLabel",
    "total",
  ]);
  expect(quickview.body.data.efekTraining).toBeUndefined();
  for (const secret of OTHER) expect(quickview.text).not.toContain(secret);
  expect(quickview.text).not.toContain(other);

  const heatmap = await call(
    `/v1/sidak/heatmap?mode=agent&year=2016&agent_id=${person}`,
    self.token,
  );
  expect(heatmap.status, heatmap.text).toBe(200);
  for (const secret of OTHER) expect(heatmap.text).not.toContain(secret);

  const simulations = await call(
    `/v1/sidak/agents/${person}/simulations?module=all`,
    self.token,
  );
  expect(simulations.status, simulations.text).toBe(200);
});

test("agent gets 403 for every other participant on the detail endpoints", async () => {
  for (const path of [
    `/v1/sidak/agents/${other}?year=2016&service_type=chat`,
    `/v1/sidak/agents/${other}/quickview?year=2016&service_type=chat`,
    `/v1/sidak/heatmap?mode=agent&year=2016&agent_id=${other}`,
    `/v1/sidak/heatmap?mode=agent&year=2016`,
    `/v1/sidak/agents/${other}/simulations?module=all`,
  ]) {
    const response = await call(path, self.token);
    expect(response.status, path).toBe(403);
    for (const secret of OTHER) expect(response.text).not.toContain(secret);
  }
  // An unlinked agent has no own participant at all.
  expect(
    (
      await call(
        `/v1/sidak/agents/${person}?year=2016&service_type=chat`,
        unlinked.token,
      )
    ).status,
  ).toBe(403);
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
  for (const secret of OTHER) expect(text).not.toContain(secret);
  expect(text).not.toContain(other);
});

test("unlinked agent gets an explicit unlinked KTP result, not someone else's data", async () => {
  const ktp = await call("/v1/profiler/me", unlinked.token);
  expect(ktp.status).toBe(200);
  expect(ktp.body.data).toEqual({ linked: false, peserta: null });
});

test("KTP self endpoint rejects client input, staff roles and anonymous callers", async () => {
  const path = "/v1/profiler/me";
  const filtered = await call(`${path}?id=${other}`, self.token);
  expect(filtered.status).toBe(400);
  expect(filtered.text).not.toContain(`OTHER_KTP_${ns}`);
  for (const staff of [trainer, leader, administrator])
    expect((await call(path, staff.token)).status).toBe(403);
  expect((await call(path)).status).toBe(401);
});

test("agent still cannot open staff SIDAK or KTP lists, and the retired self APIs are gone", async () => {
  for (const path of [
    "/v1/profiler/peserta",
    `/v1/profiler/peserta/${other}`,
    "/v1/sidak/agents?year=2016",
    "/v1/sidak/dashboard/trend?year=2016",
  ])
    expect((await call(path, self.token)).status, path).toBe(403);
  for (const path of ["/v1/sidak/me", "/v1/home/agent-summary"])
    expect((await call(path, self.token)).status, path).toBe(404);
});
