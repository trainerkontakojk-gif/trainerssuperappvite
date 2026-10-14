import type { TnaCohortMetrics } from "@trainers/types";
import {
  buildPeriodBucket,
  periodMetrics,
  type TnaPeriodBucket,
} from "./metrics";
import { MIN_AUDITED_AGENTS } from "./thresholds";

/** Filter membership only; all finding/session/rate semantics remain in D1. */
export function cohortMetrics(
  bucket: TnaPeriodBucket,
  indicatorId: string,
  ids: ReadonlySet<string>,
): TnaCohortMetrics {
  const metrics = periodMetrics(
    buildPeriodBucket(
      bucket.period,
      bucket.rows.filter((row) => ids.has(row.peserta_id)),
    ),
    indicatorId,
  );
  return {
    agents: metrics.auditedAgents,
    findings: metrics.findings,
    sampledSessions: metrics.sampledSessions,
    ratePer100: metrics.ratePer100,
    spreadPct: metrics.spreadPct,
  };
}
export function computeTnaCohorts(
  baseline: TnaPeriodBucket,
  evaluation: TnaPeriodBucket,
  indicatorId: string,
  participantIds: ReadonlySet<string>,
) {
  // K13: the same non-participant agents must have audit presence in BOTH months.
  const comparisonIds = new Set(
    [...baseline.auditedAgentIds].filter(
      (id) => evaluation.auditedAgentIds.has(id) && !participantIds.has(id),
    ),
  );
  const compare = (ids: ReadonlySet<string>) => {
    const before = cohortMetrics(baseline, indicatorId, ids);
    const after = cohortMetrics(evaluation, indicatorId, ids);
    return {
      baseline: before,
      evaluation: after,
      delta:
        before.ratePer100 === null || after.ratePer100 === null
          ? null
          : after.ratePer100 - before.ratePer100,
    };
  };
  const participants = compare(participantIds);
  const comparison = compare(comparisonIds);
  const comparison_small =
    comparison.baseline.agents < MIN_AUDITED_AGENTS ||
    comparison.evaluation.agents < MIN_AUDITED_AGENTS;
  const enough =
    !comparison_small &&
    participants.baseline.agents >= MIN_AUDITED_AGENTS &&
    participants.evaluation.agents >= MIN_AUDITED_AGENTS;
  return {
    participants,
    comparison,
    comparison_small,
    net_effect:
      enough && participants.delta !== null && comparison.delta !== null
        ? participants.delta - comparison.delta
        : null,
  };
}
