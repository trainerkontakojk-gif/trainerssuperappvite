import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createTnaFixture } from "./helpers/tnaFixture";
import { createAdmin, runSql } from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

test.describe.configure({ mode: "default" });
const fixture = createTnaFixture(randomUUID());
const admin = createAdmin(fixture.env);
const comparisons = Array.from({ length: 6 }, () => randomUUID());
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
const baseline = fixture.ids.periods[0]!;
const evaluation = fixture.ids.periods[1]!;
const indicator = fixture.ids.metricsIndicators.alpha;
const roster = fixture.ids.participants.slice(0, 5);
function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("Evaluation fixture SQL failed; details suppressed");
  }
}
async function call(path: string, method = "GET", body?: unknown) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${users.trainer.token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const envelope = await response.json();
  expect(response.status, JSON.stringify(envelope)).toBe(
    method === "POST" && ["/needs", "/plans"].includes(path) ? 201 : 200,
  );
  return envelope.data;
}
function rows(
  agent: string,
  period: string,
  findings: number,
  phantom = false,
) {
  sql(`INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,nilai,is_phantom_padding,tahun)
    SELECT '${agent}','${period}','${indicator}','chat','${randomUUID()}-' || s, CASE WHEN s<=${findings} THEN 1 ELSE 3 END,${phantom},(SELECT year FROM qa_periods WHERE id='${period}') FROM generate_series(1,5) s;`);
}
async function setup(
  args: {
    comparisonCount?: number;
    absent?: boolean;
    noAudit?: boolean;
    rate?: number;
    spread?: number;
    legacy?: boolean;
  } = {},
) {
  const comparisonCount = args.comparisonCount ?? 5;
  for (const agent of roster) {
    rows(agent, baseline, 2);
    if (!args.noAudit && !(args.absent && agent === roster[4]))
      rows(agent, evaluation, 1);
  }
  for (const agent of comparisons.slice(0, comparisonCount)) {
    rows(agent, baseline, 1);
    if (!args.noAudit) rows(agent, evaluation, 1);
  }
  // QA rows must never contribute to either population or cohorts.
  rows(fixture.ids.participants[5]!, baseline, 5);
  if (!args.noAudit) rows(fixture.ids.participants[5]!, evaluation, 5);
  const need = await call("/needs", "POST", {
    service_type: "chat",
    period_id: baseline,
    indicator_id: indicator,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Fixture evaluasi probing terarah",
    gap_type: "skill",
    outcome: "training",
  });
  const endDate = sql(
    `SELECT make_date(year-1,12,31)::text FROM qa_periods WHERE id='${baseline}';`,
  );
  const today = sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const plan = await call("/plans", "POST", {
    need_id: need.id,
    program_id: sql(
      "SELECT id FROM tna_programs WHERE code='effective-probing';",
    ),
    title: "Evaluasi probing fixture",
    intervention_type: "kelas",
    start_date: endDate,
    end_date: endDate,
    evaluation_due_date: today,
    target_max_rate_per_100: args.rate ?? 20,
    target_max_spread_pct: args.spread ?? 100,
    participant_peserta_ids: roster,
  });
  let activated;
  if (args.legacy) {
    const draft = await call(`/plans/${plan.id}`);
    const result = await admin.rpc("tna_activate_plan", {
      p_actor_id: users.trainer.userId,
      p_plan_id: plan.id,
      p_expected_updated_at: plan.updated_at,
      p_baseline: draft.preview,
      p_participant_baselines: draft.participant_preview.map(
        (p: Record<string, unknown>) => {
          const { baseline_sessions: _sessions, ...legacy } = p;
          return legacy;
        },
      ),
    });
    expect(result.error).toBeNull();
    activated = result.data;
  } else
    activated = await call(`/plans/${plan.id}/activate`, "POST", {
      expected_updated_at: plan.updated_at,
    });
  const activeDetail = await call(`/plans/${plan.id}`);
  expect(
    activeDetail.evaluation_period_options
      .filter((p: { id: string }) => fixture.ids.periods.includes(p.id))
      .map((p: { id: string }) => p.id),
  ).toEqual(fixture.ids.periods);
  expect(activeDetail.evaluation_period_options[0]).toMatchObject({
    id: baseline,
    auditStatus: "audited",
    is_default: true,
  });
  expect(
    activeDetail.participants.map(
      (p: { baseline_sessions: number }) => p.baseline_sessions,
    ),
  ).toEqual(args.legacy ? [null, null, null, null, null] : [5, 5, 5, 5, 5]);
  const started = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: activated.updated_at,
    p_evaluation_period_id: evaluation,
  });
  expect(started.error).toBeNull();
  return plan.id as string;
}
const cohort = (
  agents: number,
  findings: number,
  rate: number | null,
  spread: number | null,
) => ({
  agents,
  findings,
  sampledSessions: agents * 5,
  ratePer100: rate,
  spreadPct: spread,
});
async function preview(id: string) {
  return (await call(`/plans/${id}`)).evaluation;
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
  users = await fixture.seed();
  sql(
    `INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES ${comparisons.map((id, i) => `('${id}',(SELECT name FROM profiler_folders WHERE id='${fixture.ids.folder}'),'Comparison ${i}','Chat','Agent',${i + 10})`).join(",")};`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
function clear() {
  sql(
    `DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id='${baseline}'); DELETE FROM tna_needs WHERE period_id='${baseline}'; DELETE FROM qa_temuan WHERE peserta_id IN ('${[...fixture.ids.participants, ...comparisons].join("','")}');`,
  );
}
test.beforeEach(clear);
test.afterAll(async () => {
  clear();
  sql(
    `DELETE FROM profiler_peserta WHERE id IN ('${comparisons.join("','")}');`,
  );
  await fixture.cleanup();
});

test("comparison sufficient: exact cohorts, scalar delta and SQL-compatible snapshot", async () => {
  const id = await setup();
  const result = await preview(id);
  expect(result.cohorts).toEqual({
    participants: {
      baseline: cohort(5, 10, 40, 100),
      evaluation: cohort(5, 5, 20, 100),
      delta: -20,
    },
    comparison: {
      baseline: cohort(5, 5, 20, 100),
      evaluation: cohort(5, 5, 20, 100),
      delta: 0,
    },
    comparison_small: false,
    net_effect: -20,
  });
  expect(result.population).toMatchObject({
    auditedAgents: 10,
    findings: 10,
    sampledSessions: 50,
    ratePer100: 20,
    spreadPct: 100,
  });
  expect(result.verdict).toBe("tercapai");
  expect(result.baseline_recompute_drift).toEqual({
    findings: 0,
    auditedAgents: 0,
  });
  // Exercise T1's exact snapshot shape without implementing a T3 route.
  const current = await call(`/plans/${id}`);
  const completed = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: id,
    p_expected_updated_at: current.plan.updated_at,
    p_evaluation_snapshot: result,
    p_participant_evaluations: current.participant_evaluation.map(
      ({
        participant_id,
        eval_findings,
        eval_sessions,
        audited_in_eval,
      }: {
        participant_id: string;
        eval_findings: number | null;
        eval_sessions: number | null;
        audited_in_eval: boolean;
      }) => ({ participant_id, eval_findings, eval_sessions, audited_in_eval }),
    ),
    p_verdict: result.verdict,
    p_conclusion_note: "Hasil evaluasi fixture valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(completed.error).toBeNull();
  rows(roster[0]!, evaluation, 5);
  expect(await preview(id)).toEqual(result); // finished reads the frozen snapshot
});
test("comparison small: intersection excludes baseline-only and evaluation-only agents", async () => {
  const id = await setup({ comparisonCount: 4, spread: 80 });
  rows(comparisons[4]!, baseline, 5);
  rows(comparisons[5]!, evaluation, 5);
  const result = await preview(id);
  expect(result.cohorts.comparison).toEqual({
    baseline: cohort(4, 4, 20, 100),
    evaluation: cohort(4, 4, 20, 100),
    delta: 0,
  });
  expect(result.cohorts.participants).toEqual({
    baseline: cohort(5, 10, 40, 100),
    evaluation: cohort(5, 5, 20, 100),
    delta: -20,
  });
  expect(result.cohorts.comparison_small).toBe(true);
  expect(result.cohorts.net_effect).toBeNull();
  expect(result.population).toMatchObject({
    findings: 14,
    auditedAgents: 10,
    sampledSessions: 50,
    ratePer100: (14 / 50) * 100,
    spreadPct: 100,
  });
  expect(result.verdict).toBe("tidak_tercapai");
});
test("participant not audited: null evaluation and participant threshold", async () => {
  const id = await setup({ absent: true, spread: 80 });
  const detail = await call(`/plans/${id}`);
  expect(detail.evaluation.cohorts.participants).toEqual({
    baseline: cohort(5, 10, 40, 100),
    evaluation: cohort(4, 4, 20, 100),
    delta: -20,
  });
  expect(detail.evaluation.cohorts.comparison_small).toBe(false);
  expect(detail.evaluation.cohorts.net_effect).toBeNull();
  expect(detail.evaluation.verdict).toBe("tercapai_sebagian");
  expect(
    detail.participant_evaluation.find(
      (p: { peserta_id: string }) => p.peserta_id === roster[4],
    ),
  ).toMatchObject({
    baseline_findings: 2,
    baseline_sessions: 5,
    baseline_sessions_source: "frozen",
    eval_findings: null,
    eval_sessions: null,
    audited_in_eval: false,
  });
});
test("evaluation no_audit: null metrics, null verdict, no fabricated zeros", async () => {
  const id = await setup({ noAudit: true });
  const detail = await call(`/plans/${id}`);
  expect(detail.evaluation.population).toEqual({
    periodId: evaluation,
    auditedAgents: 0,
    affectedAgents: 0,
    findings: 0,
    sampledSessions: 0,
    ratePer100: null,
    spreadPct: null,
    auditStatus: "no_audit",
    insufficientData: true,
  });
  expect(detail.evaluation.verdict).toBeNull();
  expect(detail.evaluation.cohorts.participants).toEqual({
    baseline: cohort(5, 10, 40, 100),
    evaluation: cohort(0, 0, null, null),
    delta: null,
  });
  expect(detail.evaluation.cohorts.comparison).toEqual({
    baseline: cohort(0, 0, null, null),
    evaluation: cohort(0, 0, null, null),
    delta: null,
  });
  expect(detail.evaluation.cohorts.net_effect).toBeNull();
  expect(
    detail.participant_evaluation.every(
      (p: { eval_findings: number | null; eval_sessions: number | null }) =>
        p.eval_findings === null && p.eval_sessions === null,
    ),
  ).toBe(true);
});
test("baseline drift: frozen participant data, labeled legacy recompute, target verdict unaffected", async () => {
  const id = await setup({ legacy: true });
  rows(roster[0]!, baseline, 5);
  rows(comparisons[5]!, baseline, 1);
  const detail = await call(`/plans/${id}`);
  expect(detail.evaluation.baseline_recompute_drift).toEqual({
    findings: 6,
    auditedAgents: 1,
  });
  expect(detail.evaluation.cohorts.participants.baseline).toEqual({
    agents: 5,
    findings: 15,
    sampledSessions: 30,
    ratePer100: 50,
    spreadPct: 100,
  });
  expect(detail.plan.baseline_snapshot).toMatchObject({
    findings: 15,
    auditedAgents: 10,
  });
  expect(detail.evaluation.verdict).toBe("tercapai");
  expect(
    detail.participant_evaluation.find(
      (p: { peserta_id: string }) => p.peserta_id === roster[0],
    ),
  ).toMatchObject({
    baseline_findings: 2,
    baseline_sessions: 10,
    baseline_sessions_source: "recomputed",
  });
  const completed = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: id,
    p_expected_updated_at: detail.plan.updated_at,
    p_evaluation_snapshot: detail.evaluation,
    p_participant_evaluations: detail.participant_evaluation.map(
      (p: {
        participant_id: string;
        eval_findings: number | null;
        eval_sessions: number | null;
        audited_in_eval: boolean;
      }) => ({
        participant_id: p.participant_id,
        eval_findings: p.eval_findings,
        eval_sessions: p.eval_sessions,
        audited_in_eval: p.audited_in_eval,
      }),
    ),
    p_verdict: detail.evaluation.verdict,
    p_conclusion_note: "Evaluasi legacy fixture selesai",
    p_follow_up: "selesai_tuntas",
  });
  expect(completed.error).toBeNull();
  const frozen = await call(`/plans/${id}`);
  expect(
    frozen.participant_evaluation.find(
      (p: { peserta_id: string }) => p.peserta_id === roster[0],
    ),
  ).toMatchObject({
    baseline_findings: 2,
    baseline_sessions: null,
    baseline_sessions_source: "unavailable",
  });
  rows(roster[0]!, baseline, 5);
  expect((await call(`/plans/${id}`)).participant_evaluation).toEqual(
    frozen.participant_evaluation,
  );
});
test("phantom batch: mixed ignores padding, phantom-only stays audited", async () => {
  const id = await setup();
  const before = await preview(id);
  fixture.addPhantomBatch({
    periodId: evaluation,
    pesertaId: roster[0]!,
    indicatorId: indicator,
  });
  expect((await preview(id)).cohorts).toEqual(before.cohorts);
  sql(
    `DELETE FROM qa_temuan WHERE peserta_id='${roster[4]}' AND period_id='${evaluation}';`,
  );
  rows(roster[4]!, evaluation, 5, true); // even dirty-looking phantom is never a finding
  const detail = await call(`/plans/${id}`);
  expect(detail.evaluation.cohorts.participants).toEqual({
    baseline: cohort(5, 10, 40, 100),
    evaluation: cohort(5, 4, 16, 80),
    delta: -24,
  });
  expect(detail.evaluation.cohorts.net_effect).toBe(-24);
  expect(detail.evaluation.population).toMatchObject({
    findings: 9,
    auditedAgents: 10,
    sampledSessions: 50,
    ratePer100: 18,
    spreadPct: 90,
  });
  expect(
    detail.participant_evaluation.find(
      (p: { peserta_id: string }) => p.peserta_id === roster[4],
    ),
  ).toMatchObject({
    audited_in_eval: true,
    eval_findings: 0,
    eval_sessions: 5,
  });
});
