import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { roundTo } from "../../lib/math-utils";
import { getPeriods, getIndicators } from "./period-indicator";
import { getScoreRows } from "./dashboard-aggregation";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  isServiceType,
} from "../../lib/scoring";
import { isCountableFinding } from "./shared-constants";
import { resolveFolderFiltersByIds } from "./access-scope";
import type {
  ServiceType,
  SidakAgentForecastEntry,
  SidakAgentForecastRequest,
  SidakAgentForecastResponse,
  SidakAgentForecastHistoricalPoint,
} from "@trainers/types";

type ForecastRow = {
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  nilai: number;
  service_type: string | null;
  no_tiket: string | null;
  is_phantom_padding: boolean | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  profiler_peserta: {
    id: string;
    nama: string | null;
    tim: string | null;
    batch_name: string | null;
    jabatan: string | null;
    foto_url: string | null;
  } | null;
};

type ForecastContext = {
  request: SidakAgentForecastRequest;
  accessibleAgentIds?: string[] | null;
  allowedServiceTypes?: ServiceType[] | null;
};

const MONTHS_SHORT = [
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

export async function generateSidakAgentForecast(
  context: ForecastContext,
): Promise<SidakAgentForecastResponse> {
  const year = context.request.year ?? new Date().getFullYear();
  const horizonMonths = clampHorizon(context.request.horizonMonths ?? 3);
  const serviceType = normalizeServiceType(
    context.request.serviceType ?? "call",
  );
  const allowedServiceTypes =
    context.allowedServiceTypes && context.allowedServiceTypes.length > 0
      ? context.allowedServiceTypes
      : null;

  if (allowedServiceTypes && !allowedServiceTypes.includes(serviceType)) {
    throw new Error("Layanan SIDAK tidak tersedia untuk scope Anda.");
  }

  const periods = await getPeriods();
  const filteredPeriods = periods
    .filter((period) => period.year === year)
    .filter((period) => context.request.startMonth == null || period.month >= context.request.startMonth)
    .filter((period) => context.request.endMonth == null || period.month <= context.request.endMonth)
    .sort((left, right) => left.month - right.month);

  const latestPeriodLabel =
    filteredPeriods[filteredPeriods.length - 1]?.label ??
    buildPeriodLabel(year, context.request.endMonth ?? context.request.startMonth ?? new Date().getMonth() + 1);

  const indicators = await getIndicators(serviceType);
  const weightsResult = await supabaseAdmin
    .from("qa_service_weights")
    .select("*");
  if (weightsResult.error) {
    throw new Error(weightsResult.error.message);
  }
  const activeWeight =
    weightsResult.data?.find((weight) => weight.service_type === serviceType) ??
    DEFAULT_SERVICE_WEIGHTS[serviceType];

  const folderNames =
    context.request.folderIds && context.request.folderIds.length > 0
      ? await resolveFolderFiltersByIds(context.request.folderIds)
      : null;

  const rows = await fetchAllPages<ForecastRow>({
    build: ({ from, to }) => {
      let query: any = supabaseAdmin
        .from("qa_temuan")
        .select(
          "peserta_id, period_id, indicator_id, nilai, service_type, no_tiket, is_phantom_padding, ketidaksesuaian, sebaiknya, profiler_peserta!inner(id, nama, tim, batch_name, jabatan, foto_url)",
        )
        .eq("tahun", year)
        .eq("service_type", serviceType)
        .order("period_id", { ascending: true })
        .order("peserta_id", { ascending: true })
        .order("id", { ascending: true });

      if (allowedServiceTypes && allowedServiceTypes.length > 0) {
        query = query.in("service_type", allowedServiceTypes);
      }
      if (folderNames && folderNames.filterNames.length > 0) {
        query = query.in("profiler_peserta.batch_name", folderNames.filterNames);
      }
      if (context.accessibleAgentIds && context.accessibleAgentIds.length > 0) {
        query = query.in("peserta_id", context.accessibleAgentIds);
      }
      return query.range(from, to) as PromiseLike<{
        data: ForecastRow[] | null;
        error: { message: string } | null;
      }>;
    },
  });

  const periodMap = new Map(filteredPeriods.map((period) => [period.id, period]));
  const rowsByAgent = new Map<string, ForecastRow[]>();
  for (const row of rows) {
    if (!periodMap.has(row.period_id)) continue;
    if (!rowsByAgent.has(row.peserta_id)) {
      rowsByAgent.set(row.peserta_id, []);
    }
    rowsByAgent.get(row.peserta_id)!.push(row);
  }

  const entries: SidakAgentForecastEntry[] = [];

  for (const [agentId, agentRows] of rowsByAgent) {
    const agent = agentRows[0]?.profiler_peserta;
    if (!agent) continue;

    const rowsByPeriod = new Map<string, ForecastRow[]>();
    for (const row of agentRows) {
      if (!rowsByPeriod.has(row.period_id)) rowsByPeriod.set(row.period_id, []);
      rowsByPeriod.get(row.period_id)!.push(row);
    }

    const historical: SidakAgentForecastHistoricalPoint[] = [];
    for (const period of filteredPeriods) {
      const periodRows = rowsByPeriod.get(period.id) ?? [];
      if (periodRows.length === 0) continue;

      const scoreRows = getScoreRows(periodRows as any);
      const scoreResult = calculateQAScoreFromTemuan(
        indicators,
        scoreRows as any,
        activeWeight,
      );
      if (!scoreResult) continue;

      const findingRows = periodRows.filter((row) => isCountableFinding(row));
      const criticalFindingsCount = findingRows.filter((row) => {
        const indicator = indicators.find((item) => item.id === row.indicator_id);
        return indicator?.category === "critical";
      }).length;

      historical.push({
        periodId: period.id,
        label: period.label ?? buildPeriodLabel(period.year, period.month),
        date: period.created_at ?? new Date(Date.UTC(period.year, period.month - 1, 1)).toISOString(),
        score: roundTo(scoreResult.finalScore, 2),
        findingsCount: findingRows.length,
        criticalFindingsCount,
      });
    }

    if (historical.length === 0) continue;

    const latest = historical[historical.length - 1];
    const scoreProjection = buildProjection(
      historical.map((point) => point.score),
      horizonMonths,
    );
    const findingsProjection = buildProjection(
      historical.map((point) => point.findingsCount),
      horizonMonths,
    );
    const criticalProjection = buildProjection(
      historical.map((point) => point.criticalFindingsCount),
      horizonMonths,
    );

    const projectedScore = clampScore(scoreProjection.value);
    const projectedFindings = clampCount(findingsProjection.value);
    const projectedCriticalFindings = clampCount(criticalProjection.value);
    const projectedScoreChange = roundTo(projectedScore - latest.score, 2);
    const projectedFindingsChange = roundTo(
      projectedFindings - latest.findingsCount,
      2,
    );
    const projectedCriticalFindingsChange = roundTo(
      projectedCriticalFindings - latest.criticalFindingsCount,
      2,
    );

    const confidence = lowerConfidence(
      scoreProjection.confidence,
      findingsProjection.confidence,
      criticalProjection.confidence,
    );

    const forecastStatus = classifyStatus({
      projectedScoreChange,
      projectedFindingsChange,
      projectedCriticalFindingsChange,
      historicalCount: historical.length,
    });

    entries.push({
      agentId,
      nama: agent.nama ?? "Unknown",
      tim: agent.tim ?? "",
      batchName: agent.batch_name ?? "",
      jabatan: agent.jabatan ?? null,
      foto_url: agent.foto_url ?? null,
      latestPeriodLabel: latest.label,
      latestScore: latest.score,
      latestFindingsCount: latest.findingsCount,
      latestCriticalFindingsCount: latest.criticalFindingsCount,
      projectedScore,
      projectedScoreChange,
      projectedFindings,
      projectedFindingsChange,
      projectedCriticalFindings,
      projectedCriticalFindingsChange,
      sourcePointCount: historical.length,
      forecastStatus,
      confidence,
      historical,
    });
  }

  const improvingAgents = entries
    .filter((entry) => entry.forecastStatus === "improving")
    .sort((left, right) => right.projectedScoreChange - left.projectedScoreChange);
  const decliningAgents = entries
    .filter((entry) => entry.forecastStatus === "declining")
    .sort((left, right) => left.projectedScoreChange - right.projectedScoreChange);
  const stableAgents = entries
    .filter((entry) => entry.forecastStatus === "stable")
    .sort((left, right) => Math.abs(left.projectedScoreChange) - Math.abs(right.projectedScoreChange));
  const watchlistAgents = entries
    .filter((entry) => entry.forecastStatus === "insufficient_data")
    .sort((left, right) => right.sourcePointCount - left.sourcePointCount);

  return {
    improvingAgents,
    decliningAgents,
    stableAgents,
    watchlistAgents,
    summary: {
      totalEligible: entries.length,
      improvingCount: improvingAgents.length,
      decliningCount: decliningAgents.length,
      stableCount: stableAgents.length,
      watchlistCount: watchlistAgents.length,
      latestPeriodLabel,
    },
  };
}

function classifyStatus(params: {
  projectedScoreChange: number;
  projectedFindingsChange: number;
  projectedCriticalFindingsChange: number;
  historicalCount: number;
}): SidakAgentForecastEntry["forecastStatus"] {
  if (params.historicalCount < 2) {
    return "insufficient_data";
  }

  const goodSignals = [
    params.projectedScoreChange > 0.1,
    params.projectedFindingsChange < -0.1,
  ].filter(Boolean).length;
  const badSignals = [
    params.projectedScoreChange < -0.1,
    params.projectedFindingsChange > 0.1,
    params.projectedCriticalFindingsChange > 0.1,
  ].filter(Boolean).length;

  if (goodSignals > badSignals && badSignals === 0) {
    return "improving";
  }

  if (badSignals > goodSignals || params.projectedCriticalFindingsChange > 0.1) {
    return "declining";
  }

  return "stable";
}

function buildProjection(values: number[], horizonMonths: number): {
  value: number;
  confidence: SidakAgentForecastEntry["confidence"];
} {
  const n = values.length;
  if (n === 0) {
    return { value: 0, confidence: "low" };
  }

  const x = Array.from({ length: n }, (_, index) => index);
  const sumX = x.reduce((sum, value) => sum + value, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = x.reduce((sum, value, index) => sum + value * values[index], 0);
  const sumXX = x.reduce((sum, value) => sum + value * value, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const projected = Math.max(0, slope * (n + horizonMonths - 1) + intercept);
  const errors = values.map((value, index) =>
    Math.abs(value - (slope * index + intercept)),
  );
  const averageError = errors.reduce((sum, value) => sum + value, 0) / n;
  const averageValue = sumY / n;

  let confidence: SidakAgentForecastEntry["confidence"] =
    n < 4 ? "low" : n >= 8 ? "high" : "medium";
  if (averageValue > 0 && averageError / averageValue > 0.4) {
    confidence = confidence === "high" ? "medium" : "low";
  }

  return {
    value: roundTo(projected, 2),
    confidence,
  };
}

function lowerConfidence(
  ...confidence: SidakAgentForecastEntry["confidence"][]
): SidakAgentForecastEntry["confidence"] {
  if (confidence.includes("low")) return "low";
  if (confidence.includes("medium")) return "medium";
  return "high";
}

function clampScore(value: number): number {
  return roundTo(Math.max(0, Math.min(100, value)), 2);
}

function clampCount(value: number): number {
  return roundTo(Math.max(0, value), 2);
}

function clampHorizon(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(6, Math.trunc(value)));
}

function normalizeServiceType(serviceType: string): ServiceType {
  return isServiceType(serviceType) ? serviceType : "call";
}

function buildPeriodLabel(year: number, month: number): string {
  const monthIndex = Math.max(0, Math.min(11, month - 1));
  return `${MONTHS_SHORT[monthIndex]} ${String(year).slice(-2)}`;
}
