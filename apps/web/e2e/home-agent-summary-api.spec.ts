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

// Real JWT/Hono/PostgREST; no business-logic mocks or external providers.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
installLoopbackFetchGuard();
const admin = createAdmin(env);
const ns = randomUUID().slice(0, 8);
const person = randomUUID();
const other = randomUUID();
const unaudited = randomUUID();
const folder = `home-agent-${ns}`;
const critical = randomUUID();
const callIndicator = randomUUID();
const params = ["Akurasi A", "Bahasa B", "Catatan C", "Detail D"].map(
  (name) => ({ id: randomUUID(), name }),
);
const versions = [randomUUID(), randomUUID()];
const createdPeriods: string[] = [];
const periodIds: string[] = [];
const months = [
  [2017, 8],
  [2017, 9],
  [2017, 10],
  [2017, 11],
  [2017, 12],
  [2018, 1],
  [2018, 2],
  [2018, 3],
];
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users: Identity[] = [];
let self: Identity;
let stranger: Identity;
let unlinked: Identity;
let noAudit: Identity;
let trainer: Identity;
let leader: Identity;
let administrator: Identity;
let app: Hono;
let failingTable = "";
const sql = (query: string) => runSql(env, query);

async function call(token?: string, query = "") {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/home/agent-summary${query}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  return { status: response.status, body: await response.json() };
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
  const guarded = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (failingTable && url.pathname === `/rest/v1/${failingTable}`)
      return new Response(
        JSON.stringify({ message: "PRIVATE_DATABASE_SENTINEL" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    return guarded(input, init);
  }) as typeof fetch;
  for (const role of [
    "agent",
    "agent",
    "agent",
    "agent",
    "trainer",
    "leader",
    "admin",
  ] as const)
    users.push(
      await createUserWithJwt(env, role, `home-agent-${ns}-${users.length}`),
    );
  [self, stranger, unlinked, noAudit, trainer, leader, administrator] = users;
  sql(`INSERT INTO profiler_folders(name) VALUES ('${folder}');
    INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut,akun_id) VALUES
    ('${person}','${folder}','Self ${ns}','Chat','Agent',1,'${self.userId}'),
    ('${other}','${folder}','OTHER_PRIVATE_NAME_${ns}','Chat','Agent',2,'${stranger.userId}'),
    ('${unaudited}','${folder}','No audit ${ns}','Chat','Agent',3,'${noAudit.userId}');`);
  for (const [year, month] of months) {
    const created = sql(
      `INSERT INTO qa_periods(year,month) VALUES (${year},${month}) ON CONFLICT DO NOTHING RETURNING id;`,
    );
    if (created) createdPeriods.push(created);
    periodIds.push(
      sql(`SELECT id FROM qa_periods WHERE year=${year} AND month=${month};`),
    );
  }
  sql(
    `INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES ('${callIndicator}','call','Call fixture ${ns}','critical',1),('${critical}','chat','Critical ${ns}','critical',1),${params.map((p) => `('${p.id}','chat','${p.name}','non_critical',1)`).join(",")};`,
  );
  for (let i = 0; i < versions.length; i++) {
    sql(`INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,created_by) VALUES ('${versions[i]}','chat','${periodIds[i ? 7 : 0]}','published',${i ? 0.2 : 0.5},${i ? 0.8 : 0.5},'weighted',1,'${trainer.userId}');
      INSERT INTO qa_service_rule_indicators(id,rule_version_id,legacy_indicator_id,service_type,name,category,bobot,sort_order) VALUES
      ('${randomUUID()}','${versions[i]}','${critical}','chat','Critical ${ns}','critical',1,0),${params.map((p, j) => `('${randomUUID()}','${versions[i]}','${p.id}','chat','${p.name}','non_critical',1,${j + 1})`).join(",")};`);
  }
  const rows: string[] = [];
  periodIds.forEach((periodId, m) => {
    for (let s = 0; s < 5; s++) {
      const selected =
        m === 7 ? params.filter((_, j) => s < [5, 4, 3, 3][j]) : [params[0]];
      selected.forEach((p) =>
        rows.push(
          `('${person}','${periodId}','${p.id}','chat','PRIVATE_TICKET_${ns}_${m}_${s}',0,'kurang teliti PRIVATE_NOTE_${ns}',false)`,
        ),
      );
    }
  });
  rows.push(
    `('${person}','${periodIds[7]}','${callIndicator}','call','OTHER_SERVICE_${ns}',3,NULL,false)`,
  );
  const extra = sql(
    `INSERT INTO qa_periods(year,month) VALUES (2018,4) ON CONFLICT DO NOTHING RETURNING id;`,
  );
  if (extra) createdPeriods.push(extra);
  const phantomPeriod = sql(
    `SELECT id FROM qa_periods WHERE year=2018 AND month=4;`,
  );
  rows.push(
    `('${person}','${phantomPeriod}','${params[0].id}','chat','PHANTOM_ONLY_${ns}',0,'padding',true)`,
  );
  rows.push(
    `('${other}','${periodIds[7]}','${critical}','chat','OTHER_PRIVATE_TICKET_${ns}',3,NULL,false)`,
  );
  rows.push(
    `('${person}','${periodIds[7]}','${params[0].id}','chat','PHANTOM_${ns}',0,'phantom',true)`,
  );
  sql(
    `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian,is_phantom_padding) VALUES ${rows.join(",")};`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  failingTable = "";
  sql(
    `BEGIN; DELETE FROM qa_temuan WHERE peserta_id IN ('${person}','${other}','${unaudited}'); DELETE FROM qa_dashboard_agent_period_summary WHERE agent_id IN ('${person}','${other}','${unaudited}'); DELETE FROM qa_service_rule_indicators WHERE rule_version_id IN ('${versions.join("','")}'); DELETE FROM qa_service_rule_versions WHERE id IN ('${versions.join("','")}'); DELETE FROM qa_indicators WHERE id IN ('${critical}','${callIndicator}','${params.map((p) => p.id).join("','")}'); DELETE FROM profiler_peserta WHERE batch_name='${folder}'; DELETE FROM profiler_folders WHERE name='${folder}'; DELETE FROM qa_periods WHERE id IN ('${[...createdPeriods, randomUUID()].join("','")}'); COMMIT;`,
  );
  for (const user of users)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
});

test("self-only summary uses period scoring versions, six audited months across years, top3 and no private fields", async () => {
  const { status, body } = await call(self.token);
  expect(status).toBe(200);
  expect(Object.keys(body.data).sort()).toEqual(["linked", "qa"]);
  expect(body.data.linked).toBe(true);
  expect(body.data.qa).toMatchObject({
    serviceType: "chat",
    periodLabel: "Mar 2018",
    score: 40,
    target: 95,
    gapToTarget: 55,
    previousLabel: "Feb 2018",
    delta: -47.5,
    topParameters: [
      { name: "Akurasi A", count: 5 },
      { name: "Bahasa B", count: 4 },
      { name: "Catatan C", count: 3 },
    ],
  });
  expect(body.data.qa.trend).toEqual(
    months.slice(-6).map(([y, m]) => ({
      periodLabel: `${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"][m - 1]} ${y}`,
      score: m === 3 && y === 2018 ? 40 : 87.5,
    })),
  );
  expect(body.data.qa.recommendation).toContain("checklist verifikasi");
  expect(Object.keys(body.data.qa).sort()).toEqual(
    [
      "delta",
      "gapToTarget",
      "periodLabel",
      "previousLabel",
      "recommendation",
      "score",
      "serviceType",
      "target",
      "topParameters",
      "trend",
    ].sort(),
  );
  const text = JSON.stringify(body);
  for (const secret of [
    person,
    other,
    "PRIVATE_",
    "peserta",
    "no_tiket",
    "ketidaksesuaian",
    "batch_name",
    "email",
    "akun_id",
  ])
    expect(text).not.toContain(secret);
  const raw = await fetch(
    `${env.apiUrl}/rest/v1/qa_temuan?select=id&peserta_id=eq.${person}`,
    { headers: { apikey: env.anonKey, Authorization: `Bearer ${self.token}` } },
  );
  expect(raw.status).toBe(200);
  expect(await raw.json()).toEqual([]); // Raw QA RLS remains closed to agents.
  const peer = await call(stranger.token);
  expect(peer.body.data.qa).toMatchObject({
    score: 100,
    gapToTarget: null,
    delta: null,
    previousLabel: null,
    topParameters: [],
    recommendation: null,
  });
  expect(peer.body.data.qa.trend).toHaveLength(1);
});

test("unlinked and linked without audit stay distinct; unlink is resolved afresh", async () => {
  expect((await call(unlinked.token)).body.data).toEqual({
    linked: false,
    qa: null,
  });
  expect((await call(noAudit.token)).body.data).toEqual({
    linked: true,
    qa: null,
  });
  sql(`UPDATE profiler_peserta SET akun_id=NULL WHERE id='${person}';`);
  try {
    expect((await call(self.token)).body.data).toEqual({
      linked: false,
      qa: null,
    });
  } finally {
    sql(
      `UPDATE profiler_peserta SET akun_id='${self.userId}' WHERE id='${person}';`,
    );
  }
});

test("zero is a real audited score, not missing data", async () => {
  const values = Array.from({ length: 5 }, (_, s) =>
    [critical, ...params.map((p) => p.id)].map(
      (indicator) =>
        `('${unaudited}','${periodIds[7]}','${indicator}','chat','ZERO_${ns}_${s}',0,'Perlu coaching')`,
    ),
  ).flat();
  sql(
    `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian) VALUES ${values.join(",")};`,
  );
  try {
    const result = await call(noAudit.token);
    expect(result.status).toBe(200);
    expect(result.body.data.qa).toMatchObject({
      score: 0,
      gapToTarget: 95,
      delta: null,
    });
    expect(result.body.data.qa.trend).toEqual([
      { periodLabel: "Mar 2018", score: 0 },
    ]);
  } finally {
    sql(
      `DELETE FROM qa_temuan WHERE peserta_id='${unaudited}'; DELETE FROM qa_dashboard_agent_period_summary WHERE agent_id='${unaudited}';`,
    );
  }
});

test("role gates, unauthenticated calls and IDOR/query attempts are rejected", async () => {
  expect((await call()).status).toBe(401);
  expect((await call(trainer.token)).status).toBe(403);
  expect((await call(leader.token)).status).toBe(403);
  expect((await call(administrator.token)).status).toBe(403);
  for (const query of [
    `?peserta_id=${other}`,
    `?agentId=${other}`,
    "?year=2018",
    "?service_type=call",
  ])
    expect((await call(self.token, query)).status).toBe(400);
});

test("database errors fail visibly without private diagnostics or plausible empty success", async () => {
  for (const table of [
    "profiler_peserta",
    "qa_temuan",
    "qa_periods",
    "qa_service_rule_indicators",
  ]) {
    failingTable = table;
    try {
      const result = await call(self.token);
      expect(result.status).toBe(503);
      expect(result.body.success).toBe(false);
      expect(result.body.data).toBeUndefined();
      expect(JSON.stringify(result.body)).not.toContain(
        "PRIVATE_DATABASE_SENTINEL",
      );
    } finally {
      failingTable = "";
    }
  }
  expect((await call(self.token)).status).toBe(200);
});
