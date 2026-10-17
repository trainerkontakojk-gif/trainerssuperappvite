import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type {
  TnaMetricsSnapshot,
  TnaParametersResponse,
  TnaPeriodOption,
} from "@trainers/types";
import { createTnaFixture } from "./helpers/tnaFixture";
import { runSql } from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Periode berjalan (plans/markdown/tna-in-progress-period.md): the current
// Asia/Jakarta month and later months never produce a trend percentage or a
// candidate, and the default period is the newest completed one. The fixture
// periods sit in a past year; this spec owns the current and next Jakarta
// months and fails closed when either already exists.
test.describe.configure({ mode: "serial" });

const fixture = createTnaFixture(randomUUID());
const users = {} as { trainer: { userId: string; token: string } };
const running = randomUUID();
const future = randomUUID();
const alpha = fixture.ids.metricsIndicators.alpha;
let app: Hono;

function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("Period-status fixture SQL failed; details suppressed");
  }
}

async function get<T>(path: string, expectedStatus = 200) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    { headers: { Authorization: `Bearer ${users.trainer.token}` } },
  );
  const body = (await response.json()) as { success: boolean; data: T };
  expect(response.status, JSON.stringify(body)).toBe(expectedStatus);
  return body.data;
}

async function post<T>(path: string, payload: unknown) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${users.trainer.token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const body = (await response.json()) as { success: boolean; data: T };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body.data;
}

const query = (periodId: string, scope = "all", compareCount = 2) =>
  `/parameters?service_type=chat&period_id=${periodId}&compare_count=${compareCount}&scope=${scope}`;

function item(data: TnaParametersResponse, indicatorId: string) {
  const found = data.items.find((entry) => entry.indicatorId === indicatorId);
  expect(found, `parameter ${indicatorId}`).toBeDefined();
  return found as TnaMetricsSnapshot;
}

function cleanupOwned() {
  sql(`BEGIN;
    DELETE FROM tna_needs WHERE period_id IN ('${running}','${future}');
    DELETE FROM qa_temuan WHERE period_id IN ('${running}','${future}');
    DELETE FROM qa_periods WHERE id IN ('${running}','${future}');
    COMMIT;`);
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: fixture.env.apiUrl,
    VITE_SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  const seeded = await fixture.seed();
  users.trainer = seeded.trainer;

  // Jakarta month from the database clock, independent of the API code.
  const [month, year] = sql(
    "SELECT extract(month FROM clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::int || ',' || extract(year FROM clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::int;",
  )
    .split(",")
    .map(Number) as [number, number];
  const next =
    month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  const taken = sql(
    `SELECT count(*) FROM qa_periods WHERE (month,year) IN ((${month},${year}),(${next.month},${next.year}));`,
  );
  if (taken !== "0")
    throw new Error(
      "Period-status spec requires free current/next Jakarta month periods in the local DB",
    );
  sql(
    `INSERT INTO qa_periods(id,month,year) VALUES ('${running}',${month},${year}),('${future}',${next.month},${next.year});`,
  );
  // Strong signal in the running month: 5 audited agents x 5 sessions, two
  // findings each (10 findings, spread 100%). Completed-month rules would make
  // this a candidate; the QA agent (participant 5) stays excluded.
  for (const agent of fixture.ids.participants.slice(0, 6)) {
    sql(`INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,ketidaksesuaian,is_phantom_padding,tahun)
      SELECT '${agent}','${running}','${alpha}','chat','${randomUUID()}-' || s, CASE WHEN s<=2 THEN 1 ELSE 3 END, CASE WHEN s<=2 THEN 'Tidak melakukan probing' END, false, ${year}
      FROM generate_series(1,5) s;`);
  }
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  cleanupOwned();
  await fixture.cleanup();
});

test("running month: no trend percentage and no candidate", async () => {
  const all = await get<TnaParametersResponse>(query(running));
  expect(all.selected_audit_status).toBe("audited");
  expect(all.selected_period_status).toBe("berjalan");
  const metrics = item(all, alpha);
  // D1 counts are unchanged; only the interpretation is suppressed.
  expect(metrics).toMatchObject({
    auditedAgents: 5,
    sampledSessions: 25,
    findings: 10,
    affectedAgents: 5,
    ratePer100: 40,
    spreadPct: 100,
    auditStatus: "audited",
    insufficientData: false,
    periodStatus: "berjalan",
    trendStatus: "period_in_progress",
    trendPct: null,
    isCandidate: false,
  });
  expect(metrics.comparisonRatePer100).not.toBeNull();
  expect(metrics.signals).not.toContain("naik");

  const candidates = await get<TnaParametersResponse>(
    query(running, "candidates"),
  );
  expect(candidates.selected_period_status).toBe("berjalan");
  expect(candidates.items.map((entry) => entry.indicatorId)).not.toContain(
    alpha,
  );

  const detail = await get<{ metrics: TnaMetricsSnapshot }>(
    `/parameters/detail?service_type=chat&period_id=${running}&compare_count=2&indicator_id=${alpha}`,
  );
  expect(detail.metrics).toMatchObject({
    periodStatus: "berjalan",
    trendStatus: "period_in_progress",
    isCandidate: false,
  });
});

test("completed month keeps the existing trend and candidate rules", async () => {
  const data = await get<TnaParametersResponse>(query(fixture.ids.periods[2]!));
  expect(data.selected_period_status).toBe("selesai");
  expect(item(data, alpha)).toMatchObject({
    periodStatus: "selesai",
    trendStatus: "computed",
    trendPct: 0,
    isCandidate: true,
  });
});

test("future month without audit keeps no_audit precedence", async () => {
  // One comparison (the owned running month) keeps the no_audit parameter
  // universe to fixture indicators only.
  const data = await get<TnaParametersResponse>(query(future, "all", 1));
  expect(data.compare_period_ids).toEqual([running]);
  expect(data.selected_audit_status).toBe("no_audit");
  expect(data.selected_period_status).toBe("berjalan");
  const metrics = item(data, alpha);
  expect(metrics).toMatchObject({
    auditedAgents: 0,
    ratePer100: null,
    spreadPct: null,
    auditStatus: "no_audit",
    trendStatus: "no_current_audit",
    trendPct: null,
    isCandidate: false,
  });
});

test("period options default to the newest completed period", async () => {
  const options = await get<TnaPeriodOption[]>("/periods");
  const byId = new Map(options.map((option) => [option.id, option]));
  expect(byId.get(running)).toMatchObject({
    status: "berjalan",
    is_default: false,
  });
  expect(byId.get(future)).toMatchObject({
    status: "berjalan",
    is_default: false,
  });
  expect(byId.get(fixture.ids.periods[2]!)?.status).toBe("selesai");

  // Newest first, exactly one default, and it is the newest completed period.
  const keys = options.map((option) => option.year * 12 + option.month);
  expect(keys).toEqual([...keys].sort((a, b) => b - a));
  const defaults = options.filter((option) => option.is_default);
  expect(defaults).toHaveLength(1);
  expect(defaults[0]).toEqual(
    options.find((option) => option.status === "selesai"),
  );
});

test("a need can still be validated on a running period", async () => {
  const need = await post<{
    id: string;
    validation_snapshot: TnaMetricsSnapshot;
  }>("/needs", {
    service_type: "chat",
    period_id: running,
    indicator_id: alpha,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Fixture periode berjalan untuk probing",
    gap_type: "skill",
    outcome: "training",
  });
  expect(need.validation_snapshot).toMatchObject({
    periodStatus: "berjalan",
    trendStatus: "period_in_progress",
    isCandidate: false,
  });
  const loaded = await get<{
    need: { validation_snapshot: TnaMetricsSnapshot };
  }>(`/needs/${need.id}`);
  expect(loaded.need.validation_snapshot.periodStatus).toBe("berjalan");
});
