import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tnaEvaluationSnapshotSchema,
  tnaParticipantEvaluationSchema,
  tnaEvaluationPeriodOptionSchema,
  type TnaNeed,
  type TnaPlan,
  type TnaPlanParticipant,
  type TnaPeriodMetrics,
  type TnaEvaluationSnapshot,
} from "@trainers/types";
import { getTnaParameterAnalysis } from "./analysis";
import { fetchPeriods, hasAuditedAgent } from "./metrics";
import { cohortMetrics, computeTnaCohorts } from "./cohorts";

function verdict(
  population: TnaPeriodMetrics,
  plan: TnaPlan,
): TnaEvaluationSnapshot["verdict"] {
  if (
    population.auditStatus === "no_audit" ||
    population.ratePer100 === null ||
    population.spreadPct === null
  )
    return null;
  const rate = population.ratePer100 <= plan.target_max_rate_per_100;
  const spread = population.spreadPct <= plan.target_max_spread_pct;
  return rate && spread
    ? "tercapai"
    : rate || spread
      ? "tercapai_sebagian"
      : "tidak_tercapai";
}
export async function computeTnaEvaluation(
  supabase: SupabaseClient,
  need: TnaNeed,
  plan: TnaPlan,
  participants: TnaPlanParticipant[],
) {
  if (!plan.evaluation_period_id || !plan.baseline_snapshot)
    throw new Error("Evaluation requires a period and frozen baseline");
  const args = {
    supabase,
    serviceType: need.service_type,
    indicatorId: need.indicator_id,
    compareCount: need.compare_count,
    dataScope: { kind: "all" } as const,
  };
  const baseline = await getTnaParameterAnalysis({
    ...args,
    periodId: need.period_id,
  });
  const evaluation = await getTnaParameterAnalysis({
    ...args,
    periodId: plan.evaluation_period_id,
  });
  const {
    periodId,
    auditedAgents,
    sampledSessions,
    findings,
    affectedAgents,
    ratePer100,
    spreadPct,
    auditStatus,
    insufficientData,
  } = evaluation.metrics;
  const population = {
    periodId,
    auditedAgents,
    sampledSessions,
    findings,
    affectedAgents,
    ratePer100,
    spreadPct,
    auditStatus,
    insufficientData,
  };
  const ids = new Set(
    participants.flatMap((p) => (p.peserta_id === null ? [] : [p.peserta_id])),
  );
  const snapshot = tnaEvaluationSnapshotSchema.parse({
    metric_version: 1,
    computed_at: new Date().toISOString(),
    evaluation_period_id: plan.evaluation_period_id,
    population,
    cohorts: computeTnaCohorts(
      baseline.bucket,
      evaluation.bucket,
      need.indicator_id,
      ids,
    ),
    baseline_recompute_drift: {
      findings: baseline.metrics.findings - plan.baseline_snapshot.findings,
      auditedAgents:
        baseline.metrics.auditedAgents - plan.baseline_snapshot.auditedAgents,
    },
    verdict: verdict(population, plan),
  });
  return {
    snapshot,
    participants: tnaParticipantEvaluationSchema.array().parse(
      participants.map((p) => {
        const member = new Set(p.peserta_id === null ? [] : [p.peserta_id]);
        const before = cohortMetrics(
          baseline.bucket,
          need.indicator_id,
          member,
        );
        const after = cohortMetrics(
          evaluation.bucket,
          need.indicator_id,
          member,
        );
        const audited = after.agents > 0;
        return {
          participant_id: p.id,
          peserta_id: p.peserta_id,
          baseline_findings: p.baseline_findings,
          baseline_sessions:
            p.baseline_sessions ??
            (before.agents > 0 ? before.sampledSessions : null),
          baseline_sessions_source:
            p.baseline_sessions != null
              ? "frozen"
              : before.agents > 0
                ? "recomputed"
                : "unavailable",
          eval_findings: audited ? after.findings : null,
          eval_sessions: audited ? after.sampledSessions : null,
          audited_in_eval: audited,
        };
      }),
    ),
  };
}

/** K9: chronological options after the training month, first audited month default. */
export async function getTnaEvaluationPeriodOptions(
  supabase: SupabaseClient,
  need: TnaNeed,
  plan: TnaPlan,
) {
  const endMonth =
    Number(plan.end_date.slice(0, 4)) * 12 + Number(plan.end_date.slice(5, 7));
  const periods = (await fetchPeriods(supabase)).filter(
    (p) => p.year * 12 + p.month > endMonth,
  );
  const audited = await Promise.all(
    periods.map((period) =>
      hasAuditedAgent({
        supabase,
        serviceType: need.service_type,
        periodId: period.id,
      }),
    ),
  );
  const defaultIndex = audited.indexOf(true);
  return tnaEvaluationPeriodOptionSchema.array().parse(
    periods.map((period, i) => ({
      ...period,
      auditStatus: audited[i] ? "audited" : "no_audit",
      is_default: i === defaultIndex,
    })),
  );
}
