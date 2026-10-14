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
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * `GET /api/v1/sidak/dashboard` — KPI temuan per parameter dan per tiket.
 * Backend NYATA in-process + Supabase lokal disposable.
 *
 * Kontrak (`plans/markdown/sidak-kpi-per-tiket.md`), sama dengan satuan
 * `tiket` heatmap SIDAK:
 * - hanya baris countable (`isCountableFinding`) yang dihitung;
 * - nomor tiket yang sama = satu tiket;
 * - baris tanpa nomor tiket = satu tiket per baris;
 * - sparkline per periode; total rentang = jumlah per periode.
 *
 * Fixture memakai tahun 2098 dan folder unik per run supaya tidak tercampur
 * data lokal lain, lalu dibersihkan di `afterAll`.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const YEAR = 2098;
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
const created = {
  folderName: `e2e-sidak-kpi-${ns}`,
  folderId: null as string | null,
  yearId: null as string | null,
  yearCreated: false,
  pesertaId: null as string | null,
  periodIds: {} as Record<1 | 2, string>,
};

type DashboardBody = {
  summary: Record<string, number>;
  periodMetrics: Array<Record<string, unknown>>;
  sparklines: Record<string, Array<{ label: string; value: number }>>;
};

async function dashboard(query: Record<string, string>) {
  const search = new URLSearchParams({
    service_type: "call",
    folder_ids: created.folderId!,
    year: String(YEAR),
    ...query,
  });
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/sidak/dashboard?${search}`,
    { method: "GET", headers: { Authorization: `Bearer ${trainer.token}` } },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data as DashboardBody;
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

  trainer = await createUserWithJwt(env, "trainer", `sidak-kpi-${ns}`);

  const indicators = runSql(
    env,
    `SELECT id FROM qa_indicators WHERE service_type='call' AND is_active ORDER BY sort_order, name;`,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (indicators.length < 5)
    throw new Error("Butuh ≥5 indikator call aktif di Supabase lokal.");

  for (const month of [1, 2] as const) {
    const existing = runSql(
      env,
      `SELECT id FROM qa_periods WHERE year=${YEAR} AND month=${month};`,
    );
    if (existing) throw new Error(`Periode ${month}/${YEAR} sudah ada.`);
    created.periodIds[month] = sqlOne(
      env,
      `INSERT INTO qa_periods (month, year) VALUES (${month}, ${YEAR}) RETURNING id;`,
    );
  }

  const existingYear = runSql(
    env,
    `SELECT id FROM profiler_years WHERE year=${YEAR};`,
  );
  if (existingYear) {
    created.yearId = existingYear;
  } else {
    created.yearId = sqlOne(
      env,
      `INSERT INTO profiler_years (year, label) VALUES (${YEAR}, 'E2E ${YEAR}') RETURNING id;`,
    );
    created.yearCreated = true;
  }
  created.folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES (${quoted(created.folderName)}, ${quoted(created.yearId)}) RETURNING id;`,
  );
  created.pesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES (${quoted(created.folderName)}, ${quoted(`Agen KPI ${ns}`)}, 'Tim Uji', 'Agent', 1)
     RETURNING id;`,
  );

  const ticket = (name: string) => quoted(`E2E-${ns}-${name}`);
  const row = (
    month: 1 | 2,
    indicatorIndex: number,
    noTiket: string,
    nilai: number,
    note: string,
  ) =>
    `(${quoted(created.pesertaId!)},${quoted(created.periodIds[month])},${quoted(indicators[indicatorIndex]!)},'call',${noTiket},false,${nilai},${note},${YEAR})`;
  const finding = quoted("E2E temuan");
  const rows = [
    // Januari — 6 temuan parameter, 4 tiket.
    row(1, 0, ticket("A"), 0, finding),
    row(1, 1, ticket("A"), 0, finding),
    row(1, 2, ticket("A"), 0, finding),
    row(1, 0, ticket("B"), 0, finding),
    row(1, 1, ticket("C"), 3, "NULL"), // complies: bukan temuan, bukan tiket
    row(1, 3, "NULL", 0, finding), // tanpa nomor: tiket sendiri
    row(1, 4, "NULL", 0, finding), // tanpa nomor: tiket sendiri
    // Februari — 2 temuan parameter, 1 tiket.
    row(2, 0, ticket("D"), 0, finding),
    row(2, 1, ticket("D"), 0, finding),
  ];
  runSql(
    env,
    `INSERT INTO qa_temuan (peserta_id, period_id, indicator_id, service_type, no_tiket, is_phantom_padding, nilai, ketidaksesuaian, tahun) VALUES ${rows.join(",")};`,
  );

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (created.pesertaId)
    runSql(
      env,
      `DELETE FROM qa_temuan WHERE peserta_id=${quoted(created.pesertaId)};
       DELETE FROM profiler_peserta WHERE id=${quoted(created.pesertaId)};`,
    );
  if (created.folderId)
    runSql(
      env,
      `DELETE FROM profiler_folders WHERE id=${quoted(created.folderId)};`,
    );
  if (created.yearCreated && created.yearId)
    runSql(
      env,
      `DELETE FROM profiler_years WHERE id=${quoted(created.yearId)};`,
    );
  const periodIds = Object.values(created.periodIds);
  if (periodIds.length)
    runSql(
      env,
      `DELETE FROM qa_periods WHERE id IN (${periodIds.map(quoted).join(",")});`,
    );
  if (trainer) {
    const { error } = await createAdmin(env).auth.admin.deleteUser(
      trainer.userId,
    );
    expect(error).toBeNull();
  }
});

test("rentang bulan: total per parameter dan per tiket, plus sparkline tiket", async () => {
  const data = await dashboard({ startMonth: "1", endMonth: "2" });

  expect(data.summary.totalDefects).toBe(8);
  expect(data.summary.totalTickets).toBe(5);
  expect(data.summary).not.toHaveProperty("avgDefectsPerAudit");

  expect(data.sparklines["total-defects"]).toEqual([
    { label: "Jan 98", value: 6 },
    { label: "Feb 98", value: 2 },
  ]);
  expect(data.sparklines["total-tickets"]).toEqual([
    { label: "Jan 98", value: 4 },
    { label: "Feb 98", value: 1 },
  ]);
  expect(data.sparklines).not.toHaveProperty("avg-defects");
  expect(data.periodMetrics.map((m) => m.totalTickets)).toEqual([4, 1]);
});

test("satu periode: tiket unik, tanpa nomor dihitung per baris, complies tidak dihitung", async () => {
  const data = await dashboard({ period_ids: created.periodIds[1] });

  expect(data.summary.totalDefects).toBe(6);
  expect(data.summary.totalTickets).toBe(4);
});
