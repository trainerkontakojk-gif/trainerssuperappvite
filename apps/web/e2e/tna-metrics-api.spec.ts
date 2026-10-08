import { tnaApiRequest } from "./helpers/tnaApi";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type {
  TnaMetricsSnapshot,
  TnaParametersResponse,
} from "@trainers/types";
import { createTnaFixture } from "./helpers/tnaFixture";
import { runSql } from "./helpers/sidakRealBackend";

// D1 metric contract against the real backend. Tests are serial because the
// later scenarios deliberately delete fixture rows and each state builds on the
// previous one. Every expected number below is the hand count for the
// substrate documented in helpers/tnaFixture.ts.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const users = {} as { trainer: { userId: string; token: string } };
let app: Hono;

// Substrate per period (audited agents = fixture agents 0-4, QA agent excluded):
// sampledSessions = max(5, 12) + max(5, 5) + max(5, 4) + max(5, 6) + max(5, 5) = 33
// findings: mapped 3, alpha 3, critical 3, beta 3 (2 agents), delta 9.
const SAMPLED = 33;
const rate = (findings: number) => (findings / SAMPLED) * 100;

const inList = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(",");
// Mirrors isCountableFinding(): nilai < 3 OR a non-blank note.
const countableSql =
  "is_phantom_padding = false AND (nilai < 3 OR btrim(coalesce(ketidaksesuaian, '')) <> '' OR btrim(coalesce(sebaiknya, '')) <> '')";

function deleteCountable(
  periodIds: readonly string[],
  indicatorIds?: string[],
) {
  runSql(
    fixture.env,
    `DELETE FROM qa_temuan WHERE period_id IN (${inList(periodIds)}) AND peserta_id IN (${inList(fixture.ids.participants)})${indicatorIds ? ` AND indicator_id IN (${inList(indicatorIds)})` : ""} AND ${countableSql};`,
  );
}

async function parameters(query: string) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna/parameters${query}`,
    {
      headers: { Authorization: `Bearer ${users.trainer.token}` },
    },
  );
  const body = (await response.json()) as {
    success: boolean;
    data: TnaParametersResponse;
    error?: { code: string; message: string };
  };
  return { status: response.status, body };
}

function item(
  body: { data: TnaParametersResponse },
  indicatorId: string,
): TnaMetricsSnapshot {
  const found = body.data.items.find(
    (entry) => entry.indicatorId === indicatorId,
  );
  expect(found, `parameter ${indicatorId}`).toBeDefined();
  return found!;
}

function periodQuery(periodId: string, scope = "all") {
  return `?service_type=chat&period_id=${periodId}&compare_count=2&scope=${scope}`;
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
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  await fixture.cleanup();
  await fixture.cleanup();
});

test("parameters endpoint validates input and reports an unknown period", async () => {
  const invalid = await parameters("?service_type=chat&compare_count=9");
  expect(invalid.status).toBe(400);

  const missing = await parameters(
    `?service_type=chat&period_id=${randomUUID()}`,
  );
  expect(missing.status).toBe(404);
  expect(missing.body.error?.code).toBe("TNA_PERIOD_NOT_FOUND");
});

test("parameter list counts every audited row and applies D1 metrics", async () => {
  const { status, body } = await parameters(
    periodQuery(fixture.ids.periods[2]!),
  );
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.data.compare_period_ids).toEqual([
    fixture.ids.periods[1]!,
    fixture.ids.periods[0]!,
  ]);
  expect(body.data.insufficientData).toBe(false);
  expect(body.data.selected_audit_status).toBe("audited");
  expect(body.data.items).toHaveLength(5);

  const mapped = item(body, fixture.ids.indicators[0]!);
  expect(mapped.parameterName).toBe(fixture.names.mappedRuleV1);
  expect(mapped.category).toBe("non_critical");
  expect(mapped).toMatchObject({
    auditedAgents: 5,
    sampledSessions: SAMPLED,
    findings: 3,
    affectedAgents: 3,
    ratePer100: rate(3),
    spreadPct: 60,
    auditStatus: "audited",
    insufficientData: false,
    isCandidate: true,
    signals: ["tersebar"],
    suggestedIntervention: "kelas",
    trendStatus: "computed",
    trendPct: 0,
    comparisonRatePer100: rate(3),
  });
  expect(mapped.comparePeriods).toHaveLength(2);
  for (const comparison of mapped.comparePeriods) {
    expect(comparison).toMatchObject({
      auditedAgents: 5,
      sampledSessions: SAMPLED,
      findings: 3,
      ratePer100: rate(3),
      spreadPct: 60,
      auditStatus: "audited",
    });
  }

  // Phantom-only agent 4 counts as audited with zero findings; the QA agent
  // (jabatan QA) contributes neither population nor findings.
  const alpha = item(body, fixture.ids.metricsIndicators.alpha);
  expect(alpha).toMatchObject({
    parameterName: fixture.names.alpha,
    auditedAgents: 5,
    sampledSessions: SAMPLED,
    findings: 3,
    affectedAgents: 3,
    ratePer100: rate(3),
    spreadPct: 60,
    isCandidate: true,
  });
  // The whitespace-only note row is not a countable finding.
  expect(alpha.findings).toBe(3);

  const critical = item(body, fixture.ids.metricsIndicators.critical);
  expect(critical.category).toBe("critical");
  expect(critical.signals).toContain("kritikal");

  const beta = item(body, fixture.ids.metricsIndicators.beta);
  expect(beta).toMatchObject({
    findings: 3,
    affectedAgents: 2,
    ratePer100: rate(3),
    spreadPct: 40,
    suggestedIntervention: "kelas",
  });

  const delta = item(body, fixture.ids.metricsIndicators.delta);
  expect(delta).toMatchObject({
    findings: 9,
    affectedAgents: 3,
    ratePer100: rate(9),
    spreadPct: 60,
  });

  // Candidate order: kritikal first, then spread/rate/name.
  const candidates = await parameters(
    periodQuery(fixture.ids.periods[2]!, "candidates"),
  );
  expect(candidates.status).toBe(200);
  expect(candidates.body.data.items.map((entry) => entry.indicatorId)).toEqual([
    fixture.ids.metricsIndicators.critical,
    fixture.ids.metricsIndicators.delta,
    fixture.ids.metricsIndicators.alpha,
    fixture.ids.indicators[0]!,
    fixture.ids.metricsIndicators.beta,
  ]);

  // The route default is the candidate scope.
  const defaultScope = await parameters(
    `?service_type=chat&period_id=${fixture.ids.periods[2]}&compare_count=2`,
  );
  expect(
    defaultScope.body.data.items.map((entry) => entry.indicatorId),
  ).toEqual(candidates.body.data.items.map((entry) => entry.indicatorId));
});

test("phantom padding never inflates sessions for an agent with real rows", async () => {
  const before = await parameters(periodQuery(fixture.ids.periods[2]!));
  const beforeMapped = item(before.body, fixture.ids.indicators[0]!);
  expect(beforeMapped.sampledSessions).toBe(SAMPLED);

  // Guardrail SIDAK #3: scoreRows memakai row real bila ada, jadi batch phantom
  // pada agent yang sudah punya row real tidak boleh menambah sesi sampel.
  fixture.addPhantomBatch({
    periodId: fixture.ids.periods[2]!,
    pesertaId: fixture.ids.participants[1]!,
    indicatorId: fixture.ids.indicators[0]!,
  });
  try {
    const after = await parameters(periodQuery(fixture.ids.periods[2]!));
    const afterMapped = item(after.body, fixture.ids.indicators[0]!);
    expect(afterMapped.sampledSessions).toBe(beforeMapped.sampledSessions);
    expect(afterMapped.findings).toBe(beforeMapped.findings);
    expect(afterMapped.ratePer100).toBe(beforeMapped.ratePer100);
    expect(afterMapped.spreadPct).toBe(beforeMapped.spreadPct);
  } finally {
    fixture.removePhantomBatch({
      periodId: fixture.ids.periods[2]!,
      pesertaId: fixture.ids.participants[1]!,
    });
  }

  const restored = await parameters(periodQuery(fixture.ids.periods[2]!));
  expect(item(restored.body, fixture.ids.indicators[0]!).sampledSessions).toBe(
    beforeMapped.sampledSessions,
  );
});

test("parameter list reads more than 1000 rows for one service and period", async () => {
  const { status, body } = await parameters(
    periodQuery(fixture.ids.extraPeriods[0]!),
  );
  expect(status).toBe(200);
  expect(body.data.selected_audit_status).toBe("audited");
  expect(body.data.compare_period_ids).toEqual([
    fixture.ids.periods[2]!,
    fixture.ids.periods[1]!,
  ]);
  expect(body.data.items).toHaveLength(1);
  const bulk = item(body, fixture.ids.bulkIndicator);
  expect(bulk).toMatchObject({
    parameterName: fixture.names.bulk,
    auditedAgents: 5,
    sampledSessions: 1250,
    findings: 1250,
    affectedAgents: 5,
    ratePer100: 100,
    spreadPct: 100,
    insufficientData: false,
    isCandidate: true,
    // No bulk rows exist in the comparison periods: new signal, not computed.
    trendStatus: "new_from_zero",
    trendPct: null,
    comparisonRatePer100: 0,
  });
});

test("data below MIN_FINDINGS is insufficient and not a candidate", async () => {
  const [agent2] = [fixture.ids.participants[2]!];
  runSql(
    fixture.env,
    `DELETE FROM qa_temuan WHERE period_id='${fixture.ids.periods[2]}' AND indicator_id='${fixture.ids.indicators[0]}' AND peserta_id='${agent2}';`,
  );

  const { body } = await parameters(periodQuery(fixture.ids.periods[2]!));
  const mapped = item(body, fixture.ids.indicators[0]!);
  expect(mapped).toMatchObject({
    findings: 2,
    affectedAgents: 2,
    ratePer100: rate(2),
    spreadPct: 40,
    insufficientData: true,
    isCandidate: false,
    signals: ["tersebar"],
  });

  const candidates = await parameters(
    periodQuery(fixture.ids.periods[2]!, "candidates"),
  );
  expect(
    candidates.body.data.items.map((entry) => entry.indicatorId),
  ).not.toContain(fixture.ids.indicators[0]);
});

test("trendStatus separates no comparison, new from zero, and zero to zero", async () => {
  // No earlier audited period: no_comparison_data even with findings.
  const earliest = await parameters(periodQuery(fixture.ids.periods[0]!));
  const earliestMapped = item(earliest.body, fixture.ids.indicators[0]!);
  expect(earliestMapped).toMatchObject({
    findings: 3,
    trendStatus: "no_comparison_data",
    trendPct: null,
    comparisonRatePer100: null,
  });
  expect(earliestMapped.comparePeriods).toEqual([]);

  // Comparison periods with audit presence but zero findings are still used.
  deleteCountable([fixture.ids.periods[0]!, fixture.ids.periods[1]!]);
  const rising = await parameters(periodQuery(fixture.ids.periods[2]!));
  const risingMapped = item(rising.body, fixture.ids.indicators[0]!);
  expect(risingMapped.findings).toBe(2);
  expect(risingMapped.trendStatus).toBe("new_from_zero");
  expect(risingMapped.trendPct).toBeNull();
  expect(risingMapped.comparisonRatePer100).toBe(0);
  expect(risingMapped.comparePeriods).toHaveLength(2);
  for (const comparison of risingMapped.comparePeriods) {
    expect(comparison).toMatchObject({
      auditedAgents: 2,
      findings: 0,
      affectedAgents: 0,
      ratePer100: 0,
      spreadPct: 0,
      auditStatus: "audited",
      insufficientData: true,
    });
  }

  // Audit exists but neither the selected period nor the comparisons have
  // findings. Zero is a number here, not null.
  deleteCountable([fixture.ids.periods[2]!], [fixture.ids.indicators[0]!]);
  const zeroBoth = await parameters(periodQuery(fixture.ids.periods[2]!));
  const zeroMapped = item(zeroBoth.body, fixture.ids.indicators[0]!);
  expect(zeroMapped).toMatchObject({
    auditedAgents: 5,
    findings: 0,
    affectedAgents: 0,
    ratePer100: 0,
    spreadPct: 0,
    auditStatus: "audited",
    insufficientData: true,
    isCandidate: false,
    trendStatus: "no_findings_both",
    trendPct: null,
  });
  const candidates = await parameters(
    periodQuery(fixture.ids.periods[2]!, "candidates"),
  );
  expect(
    candidates.body.data.items.map((entry) => entry.indicatorId),
  ).not.toContain(fixture.ids.indicators[0]);
});

test("a period without audit is skipped as comparison and never divides by zero", async () => {
  // Whole period removed: not eligible as a comparison period.
  runSql(
    fixture.env,
    `DELETE FROM qa_temuan WHERE period_id='${fixture.ids.periods[0]}' AND peserta_id IN (${inList(fixture.ids.participants)});`,
  );
  const skipped = await parameters(periodQuery(fixture.ids.periods[2]!));
  expect(skipped.body.data.compare_period_ids).toEqual([
    fixture.ids.periods[1]!,
  ]);

  // Selected period has no audit at all: nulls, not zero and not NaN. The
  // parameter universe comes from the comparison periods so trainers still see
  // which parameters were previously audited.
  runSql(
    fixture.env,
    `DELETE FROM qa_temuan WHERE period_id='${fixture.ids.periods[2]}' AND peserta_id IN (${inList(fixture.ids.participants)});`,
  );
  const empty = await parameters(periodQuery(fixture.ids.periods[2]!));
  expect(empty.status).toBe(200);
  expect(empty.body.data.selected_audit_status).toBe("no_audit");
  expect(empty.body.data.insufficientData).toBe(true);
  expect(empty.body.data.items).toHaveLength(5);
  const mapped = item(empty.body, fixture.ids.indicators[0]!);
  expect(mapped).toMatchObject({
    auditedAgents: 0,
    sampledSessions: 0,
    findings: 0,
    affectedAgents: 0,
    ratePer100: null,
    spreadPct: null,
    auditStatus: "no_audit",
    insufficientData: true,
    isCandidate: false,
    signals: [],
    trendStatus: "no_current_audit",
    trendPct: null,
  });
  for (const entry of empty.body.data.items) {
    expect(entry.ratePer100).toBeNull();
    expect(entry.spreadPct).toBeNull();
    expect(entry.auditStatus).toBe("no_audit");
  }
});
