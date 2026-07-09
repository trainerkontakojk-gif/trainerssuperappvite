import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { roundTo } from "../../lib/math-utils";
import {
  EXCLUDED_FOLDERS,
  EXCLUDED_JABATAN,
  isCountableFinding,
} from "./shared-constants";
import { deriveAgentRootCauses } from "./agent-root-causes";
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
  AgentComparisonTable,
  AgentComparisonScope,
  AgentComparisonRow,
  ServiceType,
  AgentPeriodSummary,
  ServiceWeight,
} from "@trainers/types";
import type { DashboardTemuanRow } from "./dashboard-types";

const SERVICE_LABELS: Record<ServiceType, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

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
  accessibleAgentIds?: string[] | null,
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

  // Derive root causes from raw temuan rows (before phantom padding filtering)
  const rootCauses = deriveAgentRootCauses({
    temuan: rows,
    indicators,
    periodById,
    serviceType: serviceType && isServiceType(serviceType) ? (serviceType as ServiceType) : undefined,
  });

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

  const comparisonTable = await buildAgentComparisonTable({
    agentId,
    year: currentYear,
    serviceType,
    startMonth,
    endMonth,
    periodIdsInRange,
    indicators,
    peserta,
    allowedServiceTypes,
    accessibleAgentIds,
  });

  return {
    indicators,
    periodSummaries: sortedSummaries,
    temuan: rows.filter((r) => !r.is_phantom_padding),
    weights: resolvedWeights as Record<ServiceType, ServiceWeight>,
    comparisonTable,
    rootCauses,
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

interface BuildComparisonArgs {
  agentId: string;
  year: number;
  serviceType?: string;
  startMonth?: number;
  endMonth?: number;
  periodIdsInRange: string[];
  indicators: any[];
  peserta: any;
  allowedServiceTypes?: ServiceType[];
  accessibleAgentIds?: string[] | null;
}

/**
 * Builds the benchmark comparison table for an agent's cumulative findings
 * across the trend period range. Cohorts:
 *  - agent:   rows belonging to the viewed agent
 *  - team:    audited agents sharing the viewed agent's batch_name (fallback tim)
 *  - service: all accessible audited agents for the selected service/range
 * Only "countable" findings (per isCountableFinding) are tallied.
 */
async function buildAgentComparisonTable({
  agentId,
  year,
  serviceType,
  startMonth,
  endMonth,
  periodIdsInRange,
  indicators,
  peserta,
  allowedServiceTypes,
  accessibleAgentIds,
}: BuildComparisonArgs): Promise<AgentComparisonTable> {
  const effectiveServiceType: ServiceType = isServiceType(serviceType)
    ? serviceType
    : allowedServiceTypes?.length === 1
      ? allowedServiceTypes[0]
      : "call";
  const scope: AgentComparisonScope = {
    year,
    serviceType: effectiveServiceType,
    startMonth: startMonth ?? 1,
    endMonth: endMonth ?? 12,
    teamLabel: peserta.data.batch_name || peserta.data.tim || "—",
    serviceLabel: SERVICE_LABELS[effectiveServiceType],
  };

  const emptyTable: AgentComparisonTable = { scope, rows: [] };
  if (periodIdsInRange.length === 0) return emptyTable;

  // 1. Fetch all temuan rows in the range, joined to the participant for
  //    cohorting (batch_name / tim).
  let temuanRows = await fetchAllPages<any>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("qa_temuan")
        .select(
          "id, peserta_id, indicator_id, nilai, no_tiket, sebaiknya, ketidaksesuaian, is_phantom_padding, service_type, period_id, tahun, profiler_peserta!inner(id, batch_name, tim)",
        )
        .eq("tahun", year)
        .in("period_id", periodIdsInRange)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      q = q.eq("service_type", effectiveServiceType);
      if (allowedServiceTypes && allowedServiceTypes.length > 0) {
        q = q.in("service_type", allowedServiceTypes);
      }
      if (accessibleAgentIds && accessibleAgentIds.length > 0) {
        q = q.in("peserta_id", accessibleAgentIds);
      }

      return q;
    },
  });

  if (temuanRows.length === 0) return emptyTable;

  // Defense-in-depth: ensure only accessible agents are included in the
  // cohort even if the underlying query is not fully scoped.
  if (accessibleAgentIds && accessibleAgentIds.length > 0) {
    const allowed = new Set(accessibleAgentIds);
    temuanRows = temuanRows.filter((r: any) => allowed.has(r.peserta_id));
  }

  // 2. Map each agent to its cohort keys (batch_name/tim) from the join.
  const participantMap = new Map<string, { batch: string; tim: string }>();
  for (const row of temuanRows) {
    const pid = row.peserta_id;
    if (!pid || participantMap.has(pid)) continue;
    const p = row.profiler_peserta;
    participantMap.set(pid, {
      batch: p?.batch_name ?? "",
      tim: p?.tim ?? "",
    });
  }
  // Ensure the viewed agent is present even if not in the temuan result.
  if (!participantMap.has(agentId)) {
    participantMap.set(agentId, {
      batch: peserta.data.batch_name ?? "",
      tim: peserta.data.tim ?? "",
    });
  }

  // 3. Tally cumulative countable findings per agent, per indicator, and total.
  interface AgentTally {
    total: number;
    byIndicator: Map<string, number>;
  }
  const tallies = new Map<string, AgentTally>();

  for (const row of temuanRows) {
    if (!isCountableFinding(row)) continue;
    const pid = row.peserta_id;
    if (!tallies.has(pid)) {
      tallies.set(pid, { total: 0, byIndicator: new Map() });
    }
    const tally = tallies.get(pid)!;
    tally.total += 1;
    if (row.indicator_id) {
      tally.byIndicator.set(
        row.indicator_id,
        (tally.byIndicator.get(row.indicator_id) ?? 0) + 1,
      );
    }
  }

  // 4. Determine cohorts.
  const viewedBatch = peserta.data.batch_name ?? "";
  const viewedTim = peserta.data.tim ?? "";
  const teamKeyOf = (pid: string): string => {
    const p = participantMap.get(pid);
    const batch = p?.batch ?? "";
    return batch || p?.tim || "";
  };
  const viewedTeamKey = viewedBatch || viewedTim || "";

  const teamAgentIds: string[] = [];
  const serviceAgentIds: string[] = [];
  for (const pid of tallies.keys()) {
    serviceAgentIds.push(pid);
    if (viewedTeamKey && teamKeyOf(pid) === viewedTeamKey) {
      teamAgentIds.push(pid);
    }
  }

  // 5. Compute rows.
  const agentTally = tallies.get(agentId);

  const computeAverage = (
    cohortIds: string[],
    selector: (t: AgentTally) => number,
  ): { average: number; count: number } => {
    if (cohortIds.length === 0) return { average: 0, count: 0 };
    const sum = cohortIds.reduce((acc, pid) => {
      const t = tallies.get(pid);
      return acc + (t ? selector(t) : 0);
    }, 0);
    return {
      average: roundTo(sum / cohortIds.length, 2),
      count: cohortIds.length,
    };
  };

  const rows: AgentComparisonRow[] = [];

  // Total row (pinned first).
  const totalTeam = computeAverage(teamAgentIds, (t) => t.total);
  const totalService = computeAverage(serviceAgentIds, (t) => t.total);
  rows.push({
    key: "total",
    label: "Total Temuan",
    agentCount: agentTally?.total ?? 0,
    teamAverage: totalTeam.average,
    serviceAverage: totalService.average,
    teamAgentCount: totalTeam.count,
    serviceAgentCount: totalService.count,
  });

  // Parameter rows (one per service indicator that has any countable finding).
  const paramRows: AgentComparisonRow[] = [];
  for (const ind of indicators) {
    const anyFindings = serviceAgentIds.some((pid) => {
      const t = tallies.get(pid);
      return t ? (t.byIndicator.get(ind.id) ?? 0) > 0 : false;
    });
    if (!anyFindings) continue;

    const agentCount = agentTally?.byIndicator.get(ind.id) ?? 0;
    const team = computeAverage(teamAgentIds, (t) => t.byIndicator.get(ind.id) ?? 0);
    const service = computeAverage(serviceAgentIds, (t) => t.byIndicator.get(ind.id) ?? 0);

    paramRows.push({
      key: ind.id,
      label: ind.name,
      agentCount,
      teamAverage: team.average,
      serviceAverage: service.average,
      teamAgentCount: team.count,
      serviceAgentCount: service.count,
    });
  }

  // Sort param rows by highest agent count, then highest team average.
  paramRows.sort((a, b) => {
    if (b.agentCount !== a.agentCount) return b.agentCount - a.agentCount;
    return b.teamAverage - a.teamAverage;
  });

  rows.push(...paramRows);

  return { scope, rows };
}
