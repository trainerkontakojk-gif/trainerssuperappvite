import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import { resetSidakReferenceCache } from "./helpers/resetSidakReferenceCache";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Staf yang dulu agen (plan `sidak-staff-agent-months.md`).
 *
 * Kontrak: orang yang sekarang di Tim QA tetap dihitung untuk bulan-bulan
 * yang punya baris audit. Yang dimaksud adalah angka historis: dashboard,
 * ranking, dan Laporan Manajemen. Yang tetap tanpa staf karena mereka bukan
 * agen lagi: daftar agen aktif, roster Cakupan Audit, forecast per agen, dan
 * historis prediksi tren tim.
 *
 * Real JWT/Hono/PostgREST/RLS, loopback saja. Fixture memakai tahun lampau
 * yang belum punya periode QA, lalu dibersihkan di `afterAll`.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let year = 0;
const periodIds: Record<1 | 2, string> = { 1: "", 2: "" };
let profilerYearId = "";
let profilerYearCreated = false;
let folderId = "";
const folderName = `e2e-staff-months-${ns}`;
let agentId = "";
let staffId = "";

type Body = Record<string, any>;

async function call(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<Body> {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const parsed = JSON.parse(text);
  expect(parsed.success, text).toBe(true);
  return parsed.data;
}

function unusedPastYear(): number {
  return Number(
    sqlOne(
      env,
      `SELECT candidate
       FROM generate_series(2000, extract(year FROM clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::int - 1) candidate
       WHERE NOT EXISTS (SELECT 1 FROM qa_periods WHERE year = candidate)
       ORDER BY candidate DESC
       LIMIT 1;`,
    ),
  );
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
  installLoopbackFetchGuard();
  year = unusedPastYear();
  trainer = await createUserWithJwt(env, "trainer", `staff-months-${ns}`);

  for (const month of [1, 2] as const) {
    periodIds[month] = sqlOne(
      env,
      `INSERT INTO qa_periods (month, year) VALUES (${month}, ${year}) RETURNING id;`,
    );
  }
  const existingYear = runSql(
    env,
    `SELECT id FROM profiler_years WHERE year=${year};`,
  );
  if (existingYear) {
    profilerYearId = existingYear;
  } else {
    profilerYearId = sqlOne(
      env,
      `INSERT INTO profiler_years (year, label) VALUES (${year}, 'E2E ${year}') RETURNING id;`,
    );
    profilerYearCreated = true;
  }
  folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(folderName)}, ${quoted(profilerYearId)}) RETURNING id;`,
  );
  agentId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(folderName)}, ${quoted(`Agen Aktif ${ns}`)}, 'Tim Uji Staf', 'Agent', 1)
     RETURNING id;`,
  );
  // Audited in January as an agent, then moved to Tim QA as QA staff. Its
  // folder stays the fixture folder because `batch_name` must name a folder.
  staffId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(folderName)}, ${quoted(`Mantan Agen ${ns}`)}, 'Tim QA', 'QA', 2)
     RETURNING id;`,
  );

  const indicators = runSql(
    env,
    "SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name LIMIT 3;",
  )
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  if (indicators.length < 3)
    throw new Error("Fixture memerlukan tiga indikator call aktif.");
  const finding = quoted(`Temuan staf-bulan ${ns}`);
  const row = (
    pesertaId: string,
    month: 1 | 2,
    indicatorIndex: number,
    ticket: string,
  ) =>
    `(${quoted(pesertaId)},${quoted(periodIds[month])},${quoted(indicators[indicatorIndex]!)},'call',${quoted(`E2E-STAFF-${ns}-${ticket}`)},false,0,${finding},${year})`;
  const rows = [
    // Active agent: 2 findings in January, 1 in February.
    row(agentId, 1, 0, "A1"),
    row(agentId, 1, 1, "A1"),
    row(agentId, 2, 0, "A2"),
    // Former agent: 3 findings in January only.
    row(staffId, 1, 0, "S1"),
    row(staffId, 1, 1, "S1"),
    row(staffId, 1, 2, "S1"),
  ];
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun) VALUES ${rows.join(",")};`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
  await resetSidakReferenceCache();
});

test.afterAll(async () => {
  if (trainer)
    runSql(
      env,
      `DELETE FROM sidak_dashboard_forecast_snapshots WHERE generated_by=${quoted(trainer.userId)};`,
    );
  for (const id of [agentId, staffId].filter(Boolean)) {
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id=${quoted(id)};
       DELETE FROM profiler_peserta WHERE id=${quoted(id)};`,
    );
  }
  if (folderId)
    runSql(env, `DELETE FROM profiler_folders WHERE id=${quoted(folderId)};`);
  if (profilerYearCreated && profilerYearId)
    runSql(
      env,
      `DELETE FROM profiler_years WHERE id=${quoted(profilerYearId)};`,
    );
  const ids = Object.values(periodIds).filter(Boolean);
  if (ids.length)
    runSql(
      env,
      `DELETE FROM qa_periods WHERE id IN (${ids.map(quoted).join(",")});`,
    );
  if (trainer) {
    const { error } = await createAdmin(env).auth.admin.deleteUser(
      trainer.userId,
    );
    expect(error).toBeNull();
  }
});

test("dashboard: temuan bulan saat masih agen ikut total, tren, dan tabel agen", async () => {
  const data = await call(
    "GET",
    `/sidak/dashboard?${new URLSearchParams({ service_type: "call", year: String(year) })}`,
  );

  expect(data.summary.totalDefects).toBe(6);
  expect(
    data.periodMetrics.map((metric: Body) => [metric.periodId, metric.total]),
  ).toEqual([
    [periodIds[1], 5],
    [periodIds[2], 1],
  ]);
  expect(
    data.topAgents.map((agent: Body) => [agent.agentId, agent.defects]),
  ).toEqual(
    expect.arrayContaining([
      [agentId, 3],
      [staffId, 3],
    ]),
  );
});

test("ranking: mantan agen ikut ranking periode yang ada auditnya", async () => {
  const data = await call(
    "GET",
    `/sidak/ranking?${new URLSearchParams({ period: periodIds[1], service_type: "call", year: String(year) })}`,
  );

  expect(data.rankings.map((agent: Body) => agent.agentId).sort()).toEqual(
    [agentId, staffId].sort(),
  );
});

test("Laporan Manajemen: mantan agen dihitung, tetapi tidak masuk roster Cakupan Audit", async () => {
  const data = await call("POST", "/sidak/reports/management", {
    serviceType: "call",
    year,
    startMonth: 1,
    endMonth: 2,
  });

  expect(data.agents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ agentId: staffId, findingsCount: 3 }),
      expect.objectContaining({ agentId, findingsCount: 3 }),
    ]),
  );
  const january = data.monthly.find(
    (row: Body) => row.rowType === "month" && row.month === 1,
  );
  expect(january.findingsCount).toBe(5);
  expect(january.agentsAudited).toBe(2);

  const coverageIds = data.coverage.agents.map((row: Body) => row.agentId);
  expect(coverageIds).toContain(agentId);
  expect(coverageIds).not.toContain(staffId);
});

test("daftar agen aktif tetap tanpa staf; show_all menampilkannya", async () => {
  const active = await call("GET", `/sidak/agents?year=${year}`);
  const activeIds = active.agents.map((agent: Body) => agent.id);
  expect(activeIds).toContain(agentId);
  expect(activeIds).not.toContain(staffId);

  const all = await call("GET", `/sidak/agents?year=${year}&show_all=true`);
  expect(all.agents.map((agent: Body) => agent.id)).toContain(staffId);
});

test("forecast per agen tetap tanpa staf", async () => {
  const data = await call("POST", "/sidak/forecast/agents", {
    year,
    serviceType: "call",
  });
  const ids = [
    ...data.improvingAgents,
    ...data.decliningAgents,
    ...data.stableAgents,
    ...data.watchlistAgents,
  ].map((entry: Body) => entry.agentId);

  expect(ids).toContain(agentId);
  expect(ids).not.toContain(staffId);
});

test("prediksi tren tim memakai historis tanpa staf", async () => {
  const data = await call("POST", "/sidak/dashboard/forecast", {
    filters: { year, serviceType: "call" },
    forceRefresh: true,
  });

  expect(
    data.snapshot.series.total.historical.map((point: Body) => [
      point.periodId,
      point.value,
    ]),
  ).toEqual([
    [periodIds[1], 2],
    [periodIds[2], 1],
  ]);
});
