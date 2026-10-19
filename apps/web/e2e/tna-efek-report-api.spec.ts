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
// monthly summaries on the real Hono app against loopback Supabase. Scores live in
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

// [agent, year, month, score, sessions, findings], service chat.
type Score = readonly [
  keyof typeof people,
  number,
  number,
  number,
  number,
  number,
];
const scores: Score[] = [
  ["sari", 2019, 2, 90, 3, 6],
  ["sari", 2019, 3, 91, 3, 3],
  ["sari", 2019, 4, 92, 3, 3],
  ["sari", 2019, 5, 50, 3, 9],
  ["sari", 2019, 6, 94, 3, 1],
  ["sari", 2019, 7, 95, 3, 2],
  ["sari", 2019, 8, 96, 3, 0],
  ["dimas", 2019, 4, 90, 2, 4],
  ["dimas", 2019, 6, 89.5, 2, 4],
  ["dimas", 2019, 9, 70, 5, 9],
  ...[2, 3, 4, 5].flatMap((m) => [
    ["putri", 2019, m, 80, 4, 4] as const,
    ["budi", 2019, m, 84, 4, 4] as const,
  ]),
  ...[6, 7, 8].flatMap((m) => [
    ["putri", 2019, m, 81, 4, 2] as const,
    ["budi", 2019, m, 85, 4, 2] as const,
  ]),
];

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
  const values = scores
    .map(
      ([who, y, m, score, sessions, findings]) =>
        `('${people[who].id}',(SELECT id FROM qa_periods WHERE year=${y} AND month=${m}),'chat',${score},${sessions},${findings})`,
    )
    .join(",");
  sql(
    `INSERT INTO qa_dashboard_agent_period_summary(agent_id,period_id,service_type,final_score,session_count,findings_count) VALUES ${values};`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;

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
  sql(
    `BEGIN; DELETE FROM efek_sessions WHERE created_by IN ('${ids.join("','")}'); DELETE FROM profiler_peserta WHERE batch_name='efek-r-${tag}'; DELETE FROM profiler_folders WHERE id='${folder}'; DELETE FROM activity_logs WHERE user_id IN ('${ids.join("','")}'); DELETE FROM qa_periods p WHERE p.id IN ('${periods.join("','")}') AND NOT EXISTS (SELECT 1 FROM qa_dashboard_agent_period_summary s WHERE s.period_id=p.id) AND NOT EXISTS (SELECT 1 FROM qa_temuan t WHERE t.period_id=p.id); COMMIT;`,
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
    avg_delta: 1.75,
    avg_relative_delta: 0.75,
    findings_per_session_before: 1.45,
    findings_per_session_after: 0.64,
  });
  const ceriwis = result.data.programs.find((p) => p.code === "ceriwis")!;
  expect(ceriwis).toMatchObject({
    service_type: "cso",
    participants: 0,
    avg_delta: null,
  });

  const meiRow = result.data.sessions.find((s) => s.id === mei)!;
  expect(meiRow).toMatchObject({
    participants: 3,
    evaluated: 2,
    avg_delta: 1.75,
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
    avg_delta: 4,
  });
  expect(team.data.sessions.map((s) => s.id)).toEqual([mei]);
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
    findings_before: 12,
    findings_after: 3,
    score_before: 91,
    score_after: 95,
    findings_per_session_before: 1.33,
    findings_per_session_after: 0.33,
    delta: 4,
    comparison_delta: 1,
    relative_delta: 3,
    status: "naik",
    thin: false,
  });
  expect(sari.months.map((m) => [m.offset, m.month, m.score])).toEqual([
    [-3, 2, 90],
    [-2, 3, 91],
    [-1, 4, 92],
    [0, 5, 50],
    [1, 6, 94],
    [2, 7, 95],
    [3, 8, 96],
  ]);
  expect(sari.months[0]).toMatchObject({
    sessions: 3,
    findings: 6,
    comparison_score: 82,
  });

  expect(byKey("dimas", mei)).toMatchObject({
    months_before: 1,
    months_after: 1,
    score_before: 90,
    score_after: 89.5,
    delta: -0.5,
    comparison_delta: 1,
    relative_delta: -1.5,
    status: "stabil",
    thin: true,
  });
  expect(byKey("andi", mei)).toMatchObject({
    status: "tanpa_data",
    delta: null,
  });
  expect(byKey("dimas", november)).toMatchObject({ status: "tanpa_data" });
  // Putri and Budi never joined KETIK, so they form the comparison group only.
  expect(
    result.data.participants.some((p) => p.peserta_id === people.putri.id),
  ).toBe(false);

  expect(result.data.chart.map((c) => c.offset)).toEqual([
    -3, -2, -1, 0, 1, 2, 3,
  ]);
  expect(result.data.chart.find((c) => c.offset === -1)).toEqual({
    offset: -1,
    score: 91,
    comparison_score: 82,
    findings_per_session: 1.4,
    comparison_findings_per_session: 1,
  });
  expect(result.data.chart.find((c) => c.offset === 3)).toMatchObject({
    score: 96,
    comparison_score: 83,
  });

  const one = await call<EfekProgramReport>(
    `/report/ketik?year=2019&session=${november}`,
  );
  expect(one.data.participants.map((p) => p.session_id)).toEqual([november]);
  expect(one.data.program.participants).toBe(1);
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
  expect(trainerView.body.data!.efekTraining).toEqual([
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
