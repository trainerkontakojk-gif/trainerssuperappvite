import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { roundTo } from "../../lib/math-utils";
import {
  EXCLUDED_FOLDERS,
  EXCLUDED_JABATAN,
  isCountableFinding,
} from "./shared-constants";
import { getPeriods, getIndicators } from "./period-indicator";
import { getScoreRows } from "./dashboard-aggregation";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  VALID_SERVICE_TYPES,
  isServiceType,
  resolveServiceTypeFromTeam,
} from "../../lib/scoring";
import {
  loadPeriodScoringContext,
  normalizePeriodScoringRows,
  mergeServiceWeights,
} from "./period-scoring-context";
import type {
  AgentDetailData,
  AgentDirectoryEntry,
  ServiceType,
  AgentPeriodSummary,
  ServiceWeight,
} from "@trainers/types";
import type { DashboardTemuanRow } from "./dashboard-types";

export function isAgentExcluded(
  tim?: string | null,
  batchName?: string | null,
  jabatan?: string | null,
): boolean {
  const t = (tim ?? "").toLowerCase().trim();
  const b = (batchName ?? "").toLowerCase().trim();
  const j = (jabatan ?? "").toLowerCase().trim();
  return (
    EXCLUDED_FOLDERS.includes(t) ||
    EXCLUDED_FOLDERS.includes(b) ||
    EXCLUDED_JABATAN.includes(j)
  );
}

export async function getSoftDeletedPesertaIds(): Promise<string[]> {
  // profiler_peserta has no user_id column (only trainer_id).
  // The original query was always broken and returned [].
  // Restoring empty behavior to avoid incorrectly excluding agents
  // whose trainer is inactive/deleted.
  // TODO: Implement proper soft-delete check if needed.
  return [];

}

export async function getAgents(params: {
  batch_name?: string;
  tim?: string;
  search?: string;
  agent_ids?: string[];
  showArchived?: boolean;
}): Promise<any[]> {
  const excludedIds = params.showArchived
    ? []
    : await getSoftDeletedPesertaIds();

  const data = await fetchAllPages<any>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("profiler_peserta")
        .select("id, nama, tim, batch_name, foto_url, jabatan")
        .order("nama")
        .order("id", { ascending: true })
        .range(from, to);

      if (params.batch_name) q = q.eq("batch_name", params.batch_name);
      if (params.tim) q = q.eq("tim", params.tim);
      if (params.search) q = q.ilike("nama", `%${params.search}%`);
      if (params.agent_ids && params.agent_ids.length > 0)
        q = q.in("id", params.agent_ids);

      if (excludedIds.length > 0) {
        q = q.not("id", "in", `(${excludedIds.join(",")})`);
      }

      return q;
    },
  });
  return data;
}

export async function getAgentDirectorySummary(
  year: number = new Date().getFullYear(),
  agentIds?: string[],
  includeExcluded?: boolean,
  allowedServiceTypes?: ServiceType[],
): Promise<{ agents: AgentDirectoryEntry[]; batches: string[] }> {
  const agents = await fetchAllPages<any>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_peserta")
        .select("id, nama, tim, batch_name, foto_url, jabatan")
        .order("nama")
        .order("id", { ascending: true })
        .range(from, to),
  });

  let filteredAgents = agents;

  if (agentIds) {
    const idSet = new Set(agentIds);
    filteredAgents = filteredAgents.filter((a: any) => idSet.has(a.id));
  }

  if (!includeExcluded) {
    filteredAgents = filteredAgents.filter(
      (a: any) => !isAgentExcluded(a.tim, a.batch_name, a.jabatan),
    );
  }

  const batches = [
    ...new Set(filteredAgents.map((a: any) => a.batch_name).filter(Boolean)),
  ] as string[];

  const allTemuan = await fetchAllPages<any>({
    build: ({ from, to }) => {
      let query = supabaseAdmin
        .from("qa_temuan")
        .select(
          "peserta_id, indicator_id, nilai, no_tiket, service_type, period_id, created_at, is_phantom_padding",
        )
        .eq("tahun", year)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (allowedServiceTypes && allowedServiceTypes.length > 0) {
        query = query.in("service_type", allowedServiceTypes);
      }

      return query;
    },
  });

  const periods = await getPeriods();
  const periodsMap = new Map(periods.map((p) => [p.id, p]));

  const temuanByAgent = new Map<string, any[]>();
  for (const t of allTemuan) {
    if (!temuanByAgent.has(t.peserta_id)) temuanByAgent.set(t.peserta_id, []);
    temuanByAgent.get(t.peserta_id)!.push(t);
  }

  const indicatorCache = new Map<string, any[]>();
  const svcsToLoad =
    allowedServiceTypes && allowedServiceTypes.length > 0
    ? allowedServiceTypes
    : VALID_SERVICE_TYPES;
  for (const st of svcsToLoad) {
    indicatorCache.set(st, await getIndicators(st));
  }

  const entries: AgentDirectoryEntry[] = filteredAgents.map((a: any) => ({
    id: a.id,
    nama: a.nama,
    tim: a.tim ?? "",
    batch: a.batch_name ?? "",
    batch_name: a.batch_name ?? "",
    foto_url: a.foto_url,
    jabatan: a.jabatan,
    avgScore: null,
    trend: "none" as const,
    trendValue: null,
    atRisk: false,
    periodMonth: null,
  }));

  for (const agent of entries) {
    const agentTemuan = temuanByAgent.get(agent.id) || [];
    if (agentTemuan.length === 0) continue;

    try {
      const pSvcMap = new Map<string, any[]>();
      for (const t of agentTemuan) {
        if (!periodsMap.has(t.period_id)) continue;
        const period = periodsMap.get(t.period_id)!;
        const activeService = (
          t.service_type || resolveServiceTypeFromTeam(agent.tim)
        ).toLowerCase();
        const key = `${period.year}-${String(period.month).padStart(2, "0")}-${activeService}`;
        if (!pSvcMap.has(key)) pSvcMap.set(key, []);
        pSvcMap.get(key)!.push(t);
      }

      const sortedKeys = [...pSvcMap.keys()].sort((a, b) => b.localeCompare(a));
      const latestPeriodPrefix = sortedKeys[0]?.slice(0, 7);
      const primaryService = resolveServiceTypeFromTeam(agent.tim);
      const latestKey =
        sortedKeys.find(
          (key) =>
            latestPeriodPrefix &&
            key.startsWith(latestPeriodPrefix) &&
            key.endsWith(`-${primaryService}`),
        ) ?? sortedKeys[0];
      if (!latestKey) continue;

      const latestTemuan = pSvcMap.get(latestKey)!;
      const activeService = (
        latestTemuan[0]?.service_type || resolveServiceTypeFromTeam(agent.tim)
      ).toLowerCase();
      const st = isServiceType(activeService)
        ? (activeService as ServiceType)
        : ("call" as ServiceType);

      const indicators = indicatorCache.get(st) || [];
      if (indicators.length === 0) continue;

      const weight =
        DEFAULT_SERVICE_WEIGHTS[st] || DEFAULT_SERVICE_WEIGHTS.call;

      const score = calculateQAScoreFromTemuan(
        indicators,
        latestTemuan,
        weight,
      );

      const roundedScore = Math.round(score.finalScore * 100) / 100;
      agent.avgScore = roundedScore;
      agent.atRisk = roundedScore < 95;

      const latestPeriodId = latestTemuan[0]?.period_id;
      const latestPeriod = latestPeriodId
        ? periodsMap.get(latestPeriodId)
        : null;
      if (latestPeriod) {
        agent.periodMonth = latestPeriod.month;
      }

      const prevKey = sortedKeys.find(
        (k) => k !== latestKey && k.endsWith(`-${st}`),
      );
      if (prevKey && prevKey !== latestKey) {
        const prevTemuan = pSvcMap.get(prevKey)!;
        const prevIndicators = indicatorCache.get(st) || [];
        const prevScore = calculateQAScoreFromTemuan(
          prevIndicators,
          prevTemuan,
          weight,
        );

        agent.trendValue =
          Math.round((score.finalScore - prevScore.finalScore) * 100) / 100;
        agent.trend =
          agent.trendValue > 0 ? "up" : agent.trendValue < 0 ? "down" : "same";
      }
    } catch (_e) {
      // leave defaults for agents that fail scoring
    }
  }

  return { agents: entries, batches };
}

export async function getAgentDetail(
  agentId: string,
  year?: number,
  serviceType?: string,
  startMonth?: number,
  endMonth?: number,
  allowedServiceTypes?: ServiceType[],
): Promise<AgentDetailData> {
  const [peserta, indicators, periods, weightsResult] = await Promise.all([
    supabaseAdmin
      .from("profiler_peserta")
      .select("*")
      .eq("id", agentId)
      .single(),
    getIndicators(serviceType),
    getPeriods(),
    supabaseAdmin.from("qa_service_weights").select("*"),
  ]);

  if (peserta.error) throw new Error("Agent tidak ditemukan");
  if (weightsResult.error) throw new Error(weightsResult.error.message);

  const currentYear = year ?? new Date().getFullYear();
  const hasMonthRangeFilter = startMonth !== undefined || endMonth !== undefined;
  const periodIdsInRange = periods
    .filter((period) => period.year === currentYear)
    .filter((period) => startMonth === undefined || period.month >= startMonth)
    .filter((period) => endMonth === undefined || period.month <= endMonth)
    .map((period) => period.id);

  const temuan =
    hasMonthRangeFilter && periodIdsInRange.length === 0
      ? []
      : await fetchAllPages<any>({
          build: ({ from, to }) => {
            let q = supabaseAdmin
              .from("qa_temuan")
              .select("*")
              .eq("peserta_id", agentId)
              .eq("tahun", currentYear)
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to);

            if (allowedServiceTypes && allowedServiceTypes.length > 0) {
              q = q.in("service_type", allowedServiceTypes);
            }
            if (hasMonthRangeFilter) {
              q = q.in("period_id", periodIdsInRange);
            }

            return q;
          },
        });

  const rows = temuan;

  // Build resolved weights from DB overrides + defaults
  const rawWeights = weightsResult?.data ?? [];
  const resolvedWeights = mergeServiceWeights(
    DEFAULT_SERVICE_WEIGHTS,
    rawWeights,
    );

  // Partition rows by period:service
  const periodServiceRows = new Map<string, DashboardTemuanRow[]>();
  for (const row of rows) {
    const svc: string | null | undefined = row.service_type;
    const service = svc && isServiceType(svc) ? svc : null;
    if (!service || !row.period_id) continue;
    if (serviceType && service !== serviceType) continue;
    const key = `${row.period_id}:${service}`;
    const bucket = periodServiceRows.get(key) ?? [];
    bucket.push(row);
    periodServiceRows.set(key, bucket);
  }

  const periodById = new Map(periods.map((p) => [p.id, p]));

  // Resolve summaries concurrently
  const summaries: AgentPeriodSummary[] = await Promise.all(
    [...periodServiceRows.entries()].map(async ([key, periodRows]) => {
      const separator = key.lastIndexOf(":");
      const periodId = key.slice(0, separator);
      const rawService = key.slice(separator + 1);
      if (!isServiceType(rawService)) {
        throw new Error(`Layanan SIDAK tidak valid: ${rawService}`);
        }

      const period = periodById.get(periodId);
      if (!period) {
        throw new Error(`Periode SIDAK tidak ditemukan: ${periodId}`);
      }

      const activeSvc = rawService;
      const activeWeight =
        resolvedWeights[activeSvc] ?? DEFAULT_SERVICE_WEIGHTS.call;

      const context = await loadPeriodScoringContext(
        activeSvc,
        periodId,
        indicators,
        activeWeight,
      );

      const scoreRows = getScoreRows(periodRows);
      const normalizedRows = normalizePeriodScoringRows(scoreRows, context);
      const score = calculateQAScoreFromTemuan(
        context.indicators,
        normalizedRows,
        context.weight,
      );

      const findingRows = periodRows.filter((r) => isCountableFinding(r));

      return {
      id: period.id,
      month: period.month,
      year: period.year,
      label: `${String(period.month).padStart(2, "0")}/${period.year}`,
      serviceType: activeSvc,
        finalScore: roundTo(score.finalScore, 2),
        nonCriticalScore: roundTo(score.nonCriticalScore, 2),
        criticalScore: roundTo(score.criticalScore, 2),
        sessionCount: score.sessionCount,
        findingsCount: findingRows.length,
      } satisfies AgentPeriodSummary;
    }),
  );

  const scoreHistory = summaries.map((s) => ({
    month: s.month,
    year: s.year,
    finalScore: s.finalScore,
    nonCriticalScore: s.nonCriticalScore,
    criticalScore: s.criticalScore,
    sessionCount: s.sessionCount,
    service_type: s.serviceType,
  }));

  const sortedSummaries = summaries.sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );

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
  const trendPeriods = periods
    .filter((p: any) => p.year === currentYear)
    .filter((p: any) => !startMonth || p.month >= startMonth)
    .filter((p: any) => !endMonth || p.month <= endMonth)
    .sort((a: any, b: any) => a.month - b.month);

  let personalTrend: {
    labels: string[];
    datasets: { label: string; data: number[]; isTotal: boolean }[];
  };

  if (trendPeriods.length > 0 && rows.length > 0) {
    const validPeriodIds = new Set(trendPeriods.map((p: any) => p.id));
    const paramCounts: Record<string, Record<string, number>> = {};
    const totalFindingsByPeriod: Record<string, number> = {};

    for (const row of rows) {
      if (!validPeriodIds.has(row.period_id)) continue;
      if (!isCountableFinding(row)) continue;
      if (serviceType && row.service_type !== serviceType) continue;
      const pid = row.period_id;
      totalFindingsByPeriod[pid] = (totalFindingsByPeriod[pid] || 0) + 1;
      const indicator = indicators.find((i: any) => i.id === row.indicator_id);
      if (!indicator) continue;
      const paramName = indicator.name;
      if (!paramCounts[paramName]) paramCounts[paramName] = {};
      paramCounts[paramName][pid] = (paramCounts[paramName][pid] || 0) + 1;
    }

    const topParams = Object.entries(paramCounts)
      .map(([name, periodCounts]) => ({
        name,
        total: Object.values(periodCounts).reduce(
          (a: number, b: number) => a + b,
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total)
      .map((p) => p.name);

    const labels = trendPeriods.map(
      (p: any) => `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`,
    );

    const datasets = [
      {
        label: "Total Temuan",
        data: trendPeriods.map((p: any) => totalFindingsByPeriod[p.id] || 0),
        isTotal: true,
      },
      ...topParams.map((name) => ({
        label: name,
        data: trendPeriods.map((p: any) => paramCounts[name][p.id] || 0),
        isTotal: false,
      })),
    ];

    personalTrend = { labels, datasets };
  } else {
    personalTrend = { labels: [], datasets: [] };
  }

  const availableYears = [
    ...new Set(rows.map((r) => r.tahun).filter(Boolean)),
  ].sort((a, b) => b - a) as number[];
  if (availableYears.length === 0) availableYears.push(currentYear);

  return {
    indicators,
    periodSummaries: sortedSummaries,
    temuan: rows.filter((r) => !r.is_phantom_padding),
    weights: resolvedWeights as Record<ServiceType, ServiceWeight>,
    personalTrend,
    scoreHistory,
    initialYear: currentYear,
    initialService: (serviceType as ServiceType) ?? "call",
    initialTrendRange: { start: startMonth ?? 1, end: endMonth ?? 12 },
    availableYears,
    peserta: {
      id: peserta.data.id,
      nama: peserta.data.nama ?? "Unknown",
      tim: peserta.data.tim ?? "",
      batch_name: peserta.data.batch_name ?? "",
      jabatan: peserta.data.jabatan ?? null,
      foto_url: peserta.data.foto_url ?? null,
      bergabung_date: peserta.data.bergabung_date ?? null,
    },
  };
}
