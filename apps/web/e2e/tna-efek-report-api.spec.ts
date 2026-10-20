import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type {
  EfekProgramReport,
  EfekReport,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";

// EFEK phase 2 (plans/markdown/efek.md): before/after report computed from SIDAK
// temuan on the real Hono app against loopback Supabase. Scores live in
// 2019 so no other fixture shares the comparison group; every row is removed.
test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
for (const raw of [env.apiUrl, env.dbUrl])
  if (!["localhost", "127.0.0.1"].includes(new URL(raw).hostname))
    throw new Error("EFEK E2E requires loopback Supabase");
installLoopbackFetchGuard();
const admin = createAdmin(env);
const ns = randomUUID();
const tag = ns.slice(0, 8);
const folder = randomUUID();
const people = {
  sari: { id: randomUUID(), nama: `Efek R Sari ${tag}`, tim: `Tim A ${tag}` },
  dimas: { id: randomUUID(), nama: `Efek R Dimas ${tag}`, tim: `Tim B ${tag}` },
  andi: { id: randomUUID(), nama: `Efek R Andi ${tag}`, tim: `Tim B ${tag}` },
  putri: { id: randomUUID(), nama: `Efek R Putri ${tag}`, tim: `Tim C ${tag}` },
  budi: { id: randomUUID(), nama: `Efek R Budi ${tag}`, tim: `Tim C ${tag}` },
};
type User = Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: User;
let leader: User;
let app: Hono;
let mei: string;
let november: string;
let running: string;
let partial: string;
const createdPeriods: string[] = [];

const sql = (query: string) => {
  try {
    return runSql(env, query);
  } catch {
    throw new Error("EFEK SQL probe failed; raw command suppressed");
  }
};

async function call<T>(path: string, token: string = trainer.token) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna/efek${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const envelope = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { code: string };
  };
  return { status: response.status, ...envelope };
}

async function createSession(body: Record<string, unknown>) {
  const response = await tnaApiRequest(
    app,
    "http://localhost/api/v1/tna/efek/sessions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${trainer.token}`,
      },
      body: JSON.stringify(body),
    },
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

// [agent, month, sessions, bad sessions] in 2019, service chat. Scores come from
// raw SIDAK temuan the way SIDAK scores them: each bad session has one
// non-critical 0 (session score 50), so a month scores 100 − 10 × bad sessions.
type Audit = readonly [keyof typeof people, number, number, number];
const audits: Audit[] = [
  ["sari", 2, 3, 2],
  ["sari", 3, 3, 1],
  ["sari", 4, 3, 3],
  ["sari", 5, 5, 5],
  ["sari", 6, 3, 1],
  ["sari", 7, 3, 0],
  ["sari", 8, 3, 2],
  ["dimas", 4, 2, 1],
  ["dimas", 6, 2, 1],
  ["dimas", 9, 5, 3],
  ...[2, 3, 4, 5].flatMap((m) => [
    ["putri", m, 4, 2] as const,
    ["budi", m, 4, 1] as const,
  ]),
  ...[6, 7, 8].flatMap((m) => [
    ["putri", m, 4, 1] as const,
    ["budi", m, 4, 1] as const,
  ]),
];
const indicators = { critical: randomUUID(), nonCritical: randomUUID() };
const ruleVersion = randomUUID();
const serviceFixtures = (
  [
    ["ceriwis", "cso"],
    ["pdkt", "email"],
    ["telefun", "call"],
  ] as const
).map(([program, service]) => ({
  program,
  service,
  version: randomUUID(),
  critical: randomUUID(),
  nonCritical: randomUUID(),
}));

/** Months shifted from the current Asia/Jakarta month. */
function jakartaMonth(shift: number) {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + shift, 1),
  );
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.toISOString().slice(0, 10),
  };
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
  trainer = await createUserWithJwt(env, "trainer", `efek-r-${ns}`);
  leader = await createUserWithJwt(env, "leader", `efek-r-${ns}`);
  const rows = Object.values(people)
    .map(
      (p, i) =>
        `('${p.id}','efek-r-${tag}','${p.nama}','${p.tim}','Agent',${i + 1})`,
    )
    .join(",");
  sql(
    `BEGIN; INSERT INTO profiler_folders(id,name) VALUES ('${folder}','efek-r-${tag}'); INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES ${rows}; COMMIT;`,
  );
  const created = sql(
    `INSERT INTO qa_periods(month,year) SELECT m, 2019 FROM generate_series(1,12) m ON CONFLICT DO NOTHING RETURNING id;`,
  );
  createdPeriods.push(...created.split("\n").filter(Boolean));
  sql(
    `INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES ('${indicators.critical}','chat','Efek kritis ${tag}','critical',1),('${indicators.nonCritical}','chat','Efek non kritis ${tag}','non_critical',1);`,
  );
  // Pin a fixture-owned rule snapshot: master indicators/weights in a reused
  // disposable DB must not change these hand-calculated expectations.
  sql(`INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,created_by)
    VALUES ('${ruleVersion}','chat',(SELECT id FROM qa_periods WHERE year=2019 AND month=1),'published',0.5,0.5,'weighted',1,'${trainer.userId}');
    INSERT INTO qa_service_rule_indicators(id,rule_version_id,legacy_indicator_id,service_type,name,category,bobot,sort_order) VALUES
    ('${randomUUID()}','${ruleVersion}','${indicators.critical}','chat','Efek critical ${tag}','critical',1,0),
    ('${randomUUID()}','${ruleVersion}','${indicators.nonCritical}','chat','Efek non critical ${tag}','non_critical',1,1);`);
  const temuan = audits.flatMap(([who, m, sessions, bad]) =>
    Array.from({ length: sessions }, (_, i) =>
      i < bad
        ? `('${people[who].id}',(SELECT id FROM qa_periods WHERE year=2019 AND month=${m}),'${indicators.nonCritical}','chat','T-${tag}-${who}-${m}-${i}',0,'Salah sapa')`
        : `('${people[who].id}',(SELECT id FROM qa_periods WHERE year=2019 AND month=${m}),'${indicators.critical}','chat','T-${tag}-${who}-${m}-${i}',3,NULL)`,
    ),
  );
  sql(
    `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian) VALUES ${temuan.join(",")};`,
  );
  // A stale dashboard cache row (the SQL refresh writes final_score 0) must not
  // leak into EFEK; SIDAK itself scores from raw temuan.
  sql(
    `INSERT INTO qa_dashboard_agent_period_summary(agent_id,period_id,service_type,final_score,session_count,findings_count) VALUES ('${people.sari.id}',(SELECT id FROM qa_periods WHERE year=2019 AND month=2),'chat',0,3,2);`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;

  for (const f of serviceFixtures) {
    sql(`INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES
      ('${f.critical}','${f.service}','Efek critical ${tag}','critical',1),
      ('${f.nonCritical}','${f.service}','Efek non critical ${tag}','non_critical',1);
      INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,created_by)
      VALUES ('${f.version}','${f.service}',(SELECT id FROM qa_periods WHERE year=2019 AND month=1),'published',0.5,0.5,'weighted',1,'${trainer.userId}');
      INSERT INTO qa_service_rule_indicators(id,rule_version_id,legacy_indicator_id,service_type,name,category,bobot,sort_order) VALUES
      ('${randomUUID()}','${f.version}','${f.critical}','${f.service}','Efek critical ${tag}','critical',1,0),
      ('${randomUUID()}','${f.version}','${f.nonCritical}','${f.service}','Efek non critical ${tag}','non_critical',1,1);`);
    const months = f.service === "cso" ? [4, 5, 6, 7, 8] : [4, 6];
    const values = months.flatMap((m) =>
      ["sari", "dimas"].flatMap((who) => {
        const sariBad = m <= 5 ? 2 : m === 6 && f.service === "cso" ? 1 : 0;
        const bad = who === "sari" ? sariBad : 2 - sariBad;
        return Array.from(
          { length: 3 },
          (_, i) =>
            `('${people[who as "sari" | "dimas"].id}',(SELECT id FROM qa_periods WHERE year=2019 AND month=${m}),'${i < bad ? f.nonCritical : f.critical}','${f.service}','T-${tag}-${f.service}-${who}-${m}-${i}',${i < bad ? 0 : 3},${i < bad ? "'Salah sapa'" : "NULL"})`,
        );
      }),
    );
    sql(
      `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian) VALUES ${values.join(",")};`,
    );
    await createSession({
      program_code: f.program,
      title: `Service average ${f.program} ${tag}`,
      service_type: f.service,
      start_date: "2019-05-13",
      end_date: "2019-05-17",
      peserta_ids:
        f.service === "cso"
          ? [people.sari.id, people.dimas.id]
          : [people.sari.id],
    });
  }

  mei = await createSession({
    program_code: "ketik",
    title: `Level Up Week Mei 2019 ${tag}`,
    service_type: "chat",
    start_date: "2019-05-13",
    end_date: "2019-05-17",
    peserta_ids: [people.sari.id, people.dimas.id, people.andi.id],
  });
  november = await createSession({
    program_code: "ketik",
    title: `Level Up Week November 2019 ${tag}`,
    service_type: "chat",
    start_date: "2019-11-11",
    end_date: "2019-11-15",
    peserta_ids: [people.dimas.id],
  });
  const now = jakartaMonth(0);
  const twoAgo = jakartaMonth(-2);
  running = await createSession({
    program_code: "pdkt",
    title: `Sesi berjalan ${tag}`,
    service_type: "email",
    start_date: now.date,
    end_date: now.date,
    peserta_ids: [people.putri.id],
  });
  partial = await createSession({
    program_code: "pdkt",
    title: `Sesi dua bulan lalu ${tag}`,
    service_type: "email",
    start_date: twoAgo.date,
    end_date: twoAgo.date,
    peserta_ids: [people.budi.id],
  });
});

test.afterAll(async () => {
  const users = [trainer, leader].filter(Boolean).map((u) => u.userId);
  const ids = [...users, randomUUID()];
  const periods = [...createdPeriods, randomUUID()];
  const pesertaIds = Object.values(people)
    .map((p) => p.id)
    .join("','");
  for (const f of serviceFixtures) {
    sql(`DELETE FROM qa_temuan WHERE peserta_id IN ('${pesertaIds}') AND service_type='${f.service}';
      DELETE FROM qa_service_rule_indicators WHERE rule_version_id='${f.version}';
      DELETE FROM qa_service_rule_versions WHERE id='${f.version}';
      DELETE FROM qa_indicators WHERE id IN ('${f.critical}','${f.nonCritical}');`);
  }
  sql(
    `BEGIN; DELETE FROM efek_sessions WHERE created_by IN ('${ids.join("','")}'); DELETE FROM qa_temuan WHERE peserta_id IN ('${pesertaIds}'); DELETE FROM qa_dashboard_agent_period_summary WHERE agent_id IN ('${pesertaIds}'); DELETE FROM qa_service_rule_indicators WHERE rule_version_id='${ruleVersion}'; DELETE FROM qa_service_rule_versions WHERE id='${ruleVersion}'; DELETE FROM qa_indicators WHERE id IN ('${indicators.critical}','${indicators.nonCritical}'); DELETE FROM profiler_peserta WHERE batch_name='efek-r-${tag}'; DELETE FROM profiler_folders WHERE id='${folder}'; DELETE FROM activity_logs WHERE user_id IN ('${ids.join("','")}'); DELETE FROM qa_periods p WHERE p.id IN ('${periods.join("','")}') AND NOT EXISTS (SELECT 1 FROM qa_dashboard_agent_period_summary s WHERE s.period_id=p.id) AND NOT EXISTS (SELECT 1 FROM qa_temuan t WHERE t.period_id=p.id); COMMIT;`,
  );
  for (const id of users)
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("summary compares the closed months before and after training per program and session", async () => {
  const result = await call<EfekReport>("/report?year=2019&window=3");
  expect(result.status).toBe(200);
  const now = jakartaMonth(-1);
  expect(result.data.data_until).toEqual({ year: now.year, month: now.month });
  expect(result.data.window).toBe(3);
  expect(result.data.years).toContain(2019);
  expect(result.data.teams).toEqual(
    expect.arrayContaining([people.sari.tim, people.dimas.tim]),
  );

  const ketik = result.data.programs.find((p) => p.code === "ketik")!;
  expect(ketik).toMatchObject({
    name: "KETIK",
    service_type: "chat",
    participants: 4,
    evaluated: 2,
    pending: 0,
    naik: 1,
    stabil: 1,
    turun: 0,
    avg_delta: 5,
    // (Sari 4.1667 + Dimas -7.5) / 2 = -1.6667.
    avg_relative_delta: -1.67,
    findings_per_session_before: 0.64,
    findings_per_session_after: 0.36,
  });
  const ceriwis = result.data.programs.find((p) => p.code === "ceriwis")!;
  expect(ceriwis).toMatchObject({
    service_type: "cso",
    participants: 2,
    avg_delta: 0,
  });

  const meiRow = result.data.sessions.find((s) => s.id === mei)!;
  expect(meiRow).toMatchObject({
    participants: 3,
    evaluated: 2,
    avg_delta: 5,
    status: "terukur",
    months_after_closed: 3,
    first_after: { year: 2019, month: 6 },
  });
  expect(result.data.sessions.find((s) => s.id === november)).toMatchObject({
    participants: 1,
    evaluated: 0,
    avg_delta: null,
    status: "terukur",
  });
  // The year filter keeps the current-year sessions out.
  expect(result.data.sessions.some((s) => s.id === running)).toBe(false);

  const team = await call<EfekReport>(
    `/report?year=2019&tim=${encodeURIComponent(people.sari.tim)}`,
  );
  expect(team.data.programs.find((p) => p.code === "ketik")).toMatchObject({
    participants: 1,
    evaluated: 1,
    naik: 1,
    avg_delta: 10,
  });
  expect(
    team.data.sessions
      .filter((s) => s.program_code === "ketik")
      .map((s) => s.id),
  ).toEqual([mei]);
});

test("program detail lists every participant with status, comparison, and monthly breakdown", async () => {
  const result = await call<EfekProgramReport>("/report/ketik?year=2019");
  expect(result.status).toBe(200);
  const byKey = (who: keyof typeof people, session: string) =>
    result.data.participants.find(
      (p) => p.peserta_id === people[who].id && p.session_id === session,
    )!;
  const sari = byKey("sari", mei);
  expect(sari).toMatchObject({
    nama: people.sari.nama,
    tim: people.sari.tim,
    months_before: 3,
    months_after: 3,
    sessions_before: 9,
    sessions_after: 9,
    findings_before: 6,
    findings_after: 3,
    score_before: 80,
    score_after: 90,
    findings_per_session_before: 0.67,
    findings_per_session_after: 0.33,
    delta: 10,
    // Before: ((80+80+90)/3 + (90+80+90)/3 + (70+90+80+90)/4)/3 = 84.1667.
    // After: ((90+90+90+90)/4 + (100+90+90)/3 + (80+90+90)/3)/3 = 90.
    comparison_delta: 5.83,
    // Participant 10 - service 5.8333 = 4.1667.
    relative_delta: 4.17,
    status: "naik",
    thin: false,
  });
  expect(sari.months.map((m) => [m.offset, m.month, m.score])).toEqual([
    [-3, 2, 80],
    [-2, 3, 90],
    [-1, 4, 70],
    [0, 5, 50],
    [1, 6, 90],
    [2, 7, 100],
    [3, 8, 80],
  ]);
  expect(sari.months[0]).toMatchObject({
    sessions: 3,
    findings: 2,
    // (Sari 80 + Putri 80 + Budi 90) / 3 = 83.3333.
    comparison_score: 83.33,
  });

  expect(byKey("dimas", mei)).toMatchObject({
    months_before: 1,
    months_after: 1,
    score_before: 90,
    score_after: 90,
    delta: 0,
    // June (90+90+90+90)/4 - April (70+90+80+90)/4 = 7.5.
    comparison_delta: 7.5,
    // Participant 0 - service 7.5 = -7.5.
    relative_delta: -7.5,
    status: "stabil",
    thin: true,
  });
  expect(byKey("andi", mei)).toMatchObject({
    status: "tanpa_data",
    delta: null,
  });
  expect(byKey("dimas", november)).toMatchObject({ status: "tanpa_data" });
  // Putri and Budi never joined KETIK, so they only appear in the service average.
  expect(
    result.data.participants.some((p) => p.peserta_id === people.putri.id),
  ).toBe(false);

  expect(result.data.chart.map((c) => c.offset)).toEqual([
    -3, -2, -1, 0, 1, 2, 3,
  ]);
  expect(result.data.chart.find((c) => c.offset === -1)).toEqual({
    offset: -1,
    score: 80,
    // April: (70+90+80+90)/4 = 82.5; pooled findings (3+1+2+1)/(3+2+4+4).
    comparison_score: 82.5,
    findings_per_session: 0.8,
    comparison_findings_per_session: 0.54,
  });
  expect(result.data.chart.find((c) => c.offset === 3)).toMatchObject({
    score: 80,
    // August: (80+90+90)/3 = 86.6667; pooled findings (2+1+1)/(3+4+4).
    comparison_score: 86.67,
    comparison_findings_per_session: 0.36,
  });

  const one = await call<EfekProgramReport>(
    `/report/ketik?year=2019&session=${november}`,
  );
  expect(one.data.participants.map((p) => p.session_id)).toEqual([november]);
  expect(one.data.program.participants).toBe(1);
});

test("CERIWIS keeps the service average when every audited agent participated", async () => {
  const result = await call<EfekProgramReport>("/report/ceriwis?year=2019");
  expect(result.status).toBe(200);
  for (const offset of [0, 1, 2, 3]) {
    // Both participants: (80 + 100) / 2 or (90 + 90) / 2; pooled findings 2 / 6.
    expect(result.data.chart.find((p) => p.offset === offset)).toMatchObject({
      score: 90,
      comparison_score: 90,
      findings_per_session: 0.33,
      comparison_findings_per_session: 0.33,
    });
  }
  expect(result.data.participants.every((p) => p.relative_delta !== null)).toBe(
    true,
  );
});

test("PDKT and Telefun include participants in the monthly service average", async () => {
  for (const program of ["pdkt", "telefun"]) {
    const result = await call<EfekProgramReport>(
      `/report/${program}?year=2019`,
    );
    expect(result.status).toBe(200);
    for (const offset of [-1, 1]) {
      // Participant and non-participant: (80 + 100) / 2 = 90 in both months.
      expect(
        result.data.chart.find((p) => p.offset === offset)?.comparison_score,
      ).toBe(90);
    }
    // Participant improves 100 - 80; service average changes 90 - 90.
    expect(result.data.participants[0]).toMatchObject({
      comparison_delta: 0,
      relative_delta: 20,
    });
  }
});

test("exclusions adjust aggregates without deleting attendance or changing the service average", async () => {
  const reason = "Data audit perlu ditinjau";
  const query = new URLSearchParams({
    year: "2019",
    exclusions: JSON.stringify([{ peserta_id: people.dimas.id, reason }]),
  });
  const result = await call<EfekProgramReport>(`/report/ketik?${query}`);
  expect(result.status).toBe(200);
  expect(result.data.analysis).toMatchObject({
    all_participants: { participants: 4, evaluated: 2, avg_delta: 5 },
    exclusions: [
      { peserta_id: people.dimas.id, nama: people.dimas.nama, reason },
    ],
  });
  expect(result.data.program).toMatchObject({
    participants: 2,
    evaluated: 1,
    avg_delta: 10,
    // Only Sari remains: 10 - (90 - 84.1667) = 4.1667.
    avg_relative_delta: 4.17,
    findings_per_session_before: 0.67,
    findings_per_session_after: 0.33,
  });
  expect(result.data.participants).toHaveLength(4);
  const dimas = result.data.participants.filter(
    (p) => p.peserta_id === people.dimas.id,
  );
  expect(dimas).toHaveLength(2);
  expect(dimas.every((p) => p.exclusion_reason === reason)).toBe(true);
  expect(dimas.find((p) => p.session_id === mei)?.delta).toBe(0);
  const unfiltered = await call<EfekProgramReport>("/report/ketik?year=2019");
  expect(result.data.chart.find((c) => c.offset === -1)?.comparison_score).toBe(
    unfiltered.data.chart.find((c) => c.offset === -1)?.comparison_score,
  );
  expect(result.data.chart.find((c) => c.offset === -1)).toMatchObject({
    score: 70,
    // (Sari 70 + Dimas 90 + Putri 80 + Budi 90) / 4 = 82.5, even with Dimas excluded.
    comparison_score: 82.5,
    findings_per_session: 1,
  });
  expect(result.data.sessions.find((s) => s.id === mei)).toMatchObject({
    participants: 2,
    evaluated: 1,
    avg_delta: 10,
  });
  const summary = await call<EfekReport>(`/report?${query}`);
  expect(summary.data.programs.find((p) => p.code === "ketik")).toMatchObject({
    avg_delta: 10,
    // Only Sari: participant 10 - service (90 - 84.1667) = 4.1667.
    avg_relative_delta: 4.17,
  });
  const all = new URLSearchParams({
    year: "2019",
    exclusions: JSON.stringify(
      [people.sari, people.dimas, people.andi].map((p) => ({
        peserta_id: p.id,
        reason,
      })),
    ),
  });
  const empty = await call<EfekProgramReport>(`/report/ketik?${all}`);
  expect(empty.data.program).toMatchObject({
    participants: 0,
    evaluated: 0,
    avg_delta: null,
  });
  expect(empty.data.participants).toHaveLength(4);
  expect(empty.data.chart.every((c) => c.score === null)).toBe(true);
  const restored = await call<EfekProgramReport>("/report/ketik?year=2019");
  expect(restored.data.program.avg_delta).toBe(5);
  expect(restored.data.analysis).toBeUndefined();
  expect(restored.data.participants.every((p) => !p.exclusion_reason)).toBe(
    true,
  );
  const unknown = await call<EfekProgramReport>(
    `/report/ketik?exclusions=${encodeURIComponent(JSON.stringify([{ peserta_id: randomUUID(), reason }]))}`,
  );
  expect(unknown.status).toBe(200);
  expect(unknown.data.analysis).toBeUndefined();
});

test("exclusion filters reject malformed, duplicate or unreasoned entries", async () => {
  for (const value of [
    "not-json",
    "{}",
    JSON.stringify([{ peserta_id: people.dimas.id, reason: "  " }]),
    JSON.stringify([{ peserta_id: "bad-id", reason: "test" }]),
    JSON.stringify([{ peserta_id: people.dimas.id, reason: "x".repeat(201) }]),
    JSON.stringify(
      Array.from({ length: 11 }, () => ({
        peserta_id: randomUUID(),
        reason: "test",
      })),
    ),
    JSON.stringify(
      Array.from({ length: 2 }, () => ({
        peserta_id: people.dimas.id,
        reason: "test",
      })),
    ),
  ]) {
    expect(
      (await call(`/report/ketik?exclusions=${encodeURIComponent(value)}`))
        .status,
    ).toBe(400);
  }
});

test("sessions whose after months have not closed wait instead of concluding", async () => {
  const result = await call<EfekProgramReport>("/report/pdkt");
  expect(result.status).toBe(200);
  const next = jakartaMonth(1);
  expect(result.data.sessions.find((s) => s.id === running)).toMatchObject({
    status: "menunggu",
    months_after_closed: 0,
    first_after: { year: next.year, month: next.month },
  });
  expect(result.data.sessions.find((s) => s.id === partial)).toMatchObject({
    status: "sebagian",
    months_after_closed: 1,
  });
  expect(
    result.data.participants.find((p) => p.session_id === running),
  ).toMatchObject({ status: "menunggu", delta: null });
  expect(result.data.program.pending).toBeGreaterThanOrEqual(1);
});

test("report validates input and stays admin/trainer only", async () => {
  expect((await call("/report?window=7")).status).toBe(400);
  expect((await call("/report?year=19")).status).toBe(400);
  expect((await call("/report/ketik?session=bukan-uuid")).status).toBe(400);
  expect((await call("/report/asing")).status).toBe(404);
  expect((await call("/report", leader.token)).status).toBe(403);
  expect((await call("/report/ketik", leader.token)).status).toBe(403);
});

test("SIDAK agent quickview lists the agent's EFEK training for admin and trainer only", async () => {
  const quickview = async (token: string) => {
    const response = await tnaApiRequest(
      app,
      `http://localhost/api/v1/sidak/agents/${people.dimas.id}/quickview?year=2019&service_type=chat`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        data?: SidakAgentQuickviewResponse;
      },
    };
  };
  const trainerView = await quickview(trainer.token);
  expect(trainerView.status).toBe(200);
  expect(trainerView.body.data!.efekTraining).toHaveLength(3);
  expect(
    trainerView.body.data!.efekTraining!.filter(
      (s) => s.programCode === "ketik",
    ),
  ).toEqual([
    {
      sessionId: november,
      programCode: "ketik",
      programName: "KETIK",
      title: `Level Up Week November 2019 ${tag}`,
      startDate: "2019-11-11",
      endDate: "2019-11-15",
    },
    {
      sessionId: mei,
      programCode: "ketik",
      programName: "KETIK",
      title: `Level Up Week Mei 2019 ${tag}`,
      startDate: "2019-05-13",
      endDate: "2019-05-17",
    },
  ]);
  // Leaders read SIDAK for their own team only; training stays a TNA view.
  const leaderView = await quickview(leader.token);
  if (leaderView.status === 200)
    expect(leaderView.body.data!.efekTraining).toBeUndefined();
  else expect(leaderView.status).toBe(403);
});
