import { formatQAIndicatorName, type AgentHomeSummary } from "@trainers/types";
import type { Actor } from "../../middleware/role";
import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { roundTo } from "../../lib/math-utils";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  isServiceType,
  resolveServiceTypeFromTeam,
} from "../../lib/scoring";
import { resolveDataScope } from "../access/scope";
import { deriveAgentRootCauses } from "../sidak/agent-root-causes";
import { getScoreRows } from "../sidak/dashboard-aggregation";
import { getIndicators, getPeriods } from "../sidak/period-indicator";
import {
  createPeriodScoringLoaders,
  loadPeriodScoringContext,
  mergeServiceWeights,
  normalizePeriodScoringRows,
} from "../sidak/period-scoring-context";
import {
  isCountableFinding,
  SIDAK_COMPLIANCE_TARGET,
} from "../sidak/shared-constants";

type Row = Parameters<typeof deriveAgentRootCauses>[0]["temuan"][number] & {
  rule_indicator_id: string | null;
  created_at: string;
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/**
 * Agent RLS intentionally forbids raw QA reads. This backend-only projection
 * uses the authenticated account's freshly resolved self scope on every read;
 * it never calls the broad profile/comparison path in getAgentDetail.
 */
export async function getAgentHomeSummary(
  actor: Actor,
): Promise<AgentHomeSummary> {
  if (actor.role !== "agent") throw new Error("Self summary requires agent");
  const scope = await resolveDataScope(actor, "sidak");
  if (scope.kind === "none" && scope.reason === "unlinked")
    return { linked: false, qa: null };
  if (scope.kind !== "self") throw new Error("Self scope required");
  const profile = await supabaseAdmin
    .from("profiler_peserta")
    .select("tim")
    .eq("id", scope.pesertaId)
    .eq("akun_id", actor.id)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return { linked: false, qa: null };
  const rows = await fetchAllPages<Row>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("qa_temuan")
        .select(
          "id,period_id,indicator_id,rule_indicator_id,service_type,no_tiket,nilai,tahun,ketidaksesuaian,sebaiknya,is_phantom_padding,created_at",
        )
        .eq("peserta_id", scope.pesertaId)
        .order("id")
        .range(from, to),
  });
  if (!rows.length) return { linked: true, qa: null };
  const periods = await getPeriods();
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    if (!periodById.has(row.period_id) || !isServiceType(row.service_type))
      continue;
    const key = `${row.period_id}|${row.service_type}`;
    const group = buckets.get(key) ?? [];
    group.push(row);
    buckets.set(key, group);
  }
  // Only actual scored audits qualify, not a phantom-only/nonnumeric month.
  const audited = [...buckets.values()].filter((group) =>
    group.some((r) => !r.is_phantom_padding && typeof r.nilai === "number"),
  );
  audited.sort((a, b) => {
    const x = periodById.get(a[0]!.period_id)!;
    const y = periodById.get(b[0]!.period_id)!;
    return (
      y.year - x.year ||
      y.month - x.month ||
      a[0]!.service_type.localeCompare(b[0]!.service_type)
    );
  });
  const latest = audited[0];
  if (!latest) return { linked: true, qa: null };
  const latestId = latest[0]!.period_id;
  const preferred = resolveServiceTypeFromTeam(profile.data.tim ?? "");
  const service =
    audited.find(
      (g) => g[0]!.period_id === latestId && g[0]!.service_type === preferred,
    )?.[0]?.service_type ?? latest[0]!.service_type;
  const selected = audited
    .filter((g) => g[0]!.service_type === service)
    .slice(0, 6);
  const indicators = await getIndicators(service);
  const weights = await supabaseAdmin
    .from("qa_service_weights")
    .select("*")
    .eq("service_type", service);
  if (weights.error) throw weights.error;
  const weight = mergeServiceWeights(
    DEFAULT_SERVICE_WEIGHTS,
    weights.data ?? [],
  )[service];
  const loaders = createPeriodScoringLoaders(periods);
  const points: { periodLabel: string; score: number }[] = [];
  let topParameters: { name: string; count: number }[] = [];
  let recommendation: string | null = null;
  for (const [index, group] of selected.entries()) {
    const period = periodById.get(group[0]!.period_id)!;
    const context = await loadPeriodScoringContext(
      service,
      period.id,
      indicators,
      weight,
      loaders,
    );
    const score = calculateQAScoreFromTemuan(
      context.indicators,
      normalizePeriodScoringRows(getScoreRows(group), context),
      context.weight,
    );
    points.push({
      periodLabel: `${MONTHS[period.month - 1]} ${period.year}`,
      score: roundTo(score.finalScore, 1),
    });
    if (index !== 0) continue;
    const findings = group
      .filter((r) => !r.is_phantom_padding && isCountableFinding(r))
      .map((r) => ({
        ...r,
        indicator_id:
          context.scoreIdByAnyId.get(r.rule_indicator_id || r.indicator_id) ??
          r.indicator_id,
      }));
    const names = new Map(
      context.indicators.map((i) => [i.id, formatQAIndicatorName(i)]),
    );
    const counts = new Map<string, number>();
    for (const row of findings) {
      const name = names.get(row.indicator_id) ?? "Parameter tidak dikenal";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    topParameters = [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "id"))
      .slice(0, 3);
    recommendation =
      deriveAgentRootCauses({
        temuan: findings,
        indicators: context.indicators,
        periodById,
        serviceType: service,
        maxResults: 1,
      })[0]?.recommendation ?? null;
  }
  const current = points[0]!;
  const previous = points[1];
  return {
    linked: true,
    qa: {
      serviceType: service,
      periodLabel: current.periodLabel,
      score: current.score,
      target: SIDAK_COMPLIANCE_TARGET,
      gapToTarget:
        current.score < SIDAK_COMPLIANCE_TARGET
          ? roundTo(SIDAK_COMPLIANCE_TARGET - current.score, 1)
          : null,
      previousLabel: previous?.periodLabel ?? null,
      delta: previous ? roundTo(current.score - previous.score, 1) : null,
      trend: points.reverse(),
      topParameters,
      recommendation,
    },
  };
}
