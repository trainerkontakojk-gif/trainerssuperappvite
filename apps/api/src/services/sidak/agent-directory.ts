import { supabaseAdmin } from "../../lib/supabase";
import { roundTo } from "../../lib/math-utils";
import { EXCLUDED_FOLDERS, EXCLUDED_JABATAN, isCountableFinding } from "./shared-constants";
import { getPeriods, getIndicators } from "./period-indicator";
import { getScoreRows } from "./dashboard-aggregation";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  VALID_SERVICE_TYPES,
  isServiceType,
  resolveServiceTypeFromTeam,
} from "../../lib/scoring";
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
  const { data: deletedProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .or("is_deleted.eq.true,status.eq.inactive");

  if (!deletedProfiles || deletedProfiles.length === 0) return [];

  const profileIds = deletedProfiles.map((p) => p.id);

  const { data: pesertaRows } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id")
    .in("user_id", profileIds);

  return (pesertaRows ?? []).map((p) => p.id);
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

  let query = supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama, tim, batch_name, foto_url, jabatan")
    .order("nama");

  if (params.batch_name) query = query.eq("batch_name", params.batch_name);
  if (params.tim) query = query.eq("tim", params.tim);
  if (params.search) query = query.ilike("nama", `%${params.search}%`);
  if (params.agent_ids && params.agent_ids.length > 0)
    query = query.in("id", params.agent_ids);

  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getAgentDirectorySummary(
  year: number = new Date().getFullYear(),
  agentIds?: string[],
  includeExcluded?: boolean,
  allowedServiceTypes?: ServiceType[],
): Promise<{ agents: AgentDirectoryEntry[]; batches: string[] }> {
  const { data: agentData } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama, tim, batch_name, foto_url, jabatan")
    .order("nama");

  let agents = agentData ?? [];

  if (agentIds) {
    const idSet = new Set(agentIds);
    agents = agents.filter((a: any) => idSet.has(a.id));
  }

  if (!includeExcluded) {
    agents = agents.filter(
      (a: any) => !isAgentExcluded(a.tim, a.batch_name, a.jabatan),
    );
  }

  const batches = [
    ...new Set(agents.map((a: any) => a.batch_name).filter(Boolean)),
  ] as string[];

  const allTemuan: any[] = [];
  let from = 0;
  const step = 1000;
  let finished = false;
  while (!finished) {
    let query = supabaseAdmin
      .from("qa_temuan")
      .select(
        "peserta_id, indicator_id, nilai, no_tiket, service_type, period_id, created_at, is_phantom_padding",
      )
      .eq("tahun", year);
    if (allowedServiceTypes && allowedServiceTypes.length > 0) {
      query = query.in("service_type", allowedServiceTypes);
    }
    const { data } = await query.range(from, from + step - 1);
    if (!data || data.length === 0) {
      finished = true;
    } else {
      allTemuan.push(...data);
      if (data.length < step) finished = true;
      else from += step;
    }
  }

  const periods = await getPeriods();
  const periodsMap = new Map(periods.map((p) => [p.id, p]));

  const temuanByAgent = new Map<string, any[]>();
  for (const t of allTemuan) {
    if (!temuanByAgent.has(t.peserta_id))
      temuanByAgent.set(t.peserta_id, []);
    temuanByAgent.get(t.peserta_id)!.push(t);
  }

  const indicatorCache = new Map<string, any[]>();
  const svcsToLoad = allowedServiceTypes && allowedServiceTypes.length > 0
    ? allowedServiceTypes
    : VALID_SERVICE_TYPES;
  for (const st of svcsToLoad) {
    indicatorCache.set(st, await getIndicators(st));
  }

  const entries: AgentDirectoryEntry[] = agents.map((a: any) => ({
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

      const sortedKeys = [...pSvcMap.keys()].sort((a, b) =>
        b.localeCompare(a),
      );
      const latestKey = sortedKeys[0];
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

      const weight = DEFAULT_SERVICE_WEIGHTS[st] || DEFAULT_SERVICE_WEIGHTS.call;

      const score = calculateQAScoreFromTemuan(
        indicators,
        latestTemuan,
        weight,
      );

      const roundedScore = Math.round(score.finalScore * 100) / 100;
      agent.avgScore = roundedScore;
      agent.atRisk = roundedScore < 95;

      const latestPeriodId = latestTemuan[0]?.period_id;
      const latestPeriod = latestPeriodId ? periodsMap.get(latestPeriodId) : null;
      if (latestPeriod) {
        agent.periodMonth = latestPeriod.month;
      }

      const prevKey =
        sortedKeys.find(
          (k, i) => i > 0 && k.endsWith(st),
        ) || sortedKeys[1];
      if (prevKey && prevKey !== latestKey) {
        const prevTemuan = pSvcMap.get(prevKey)!;
        const prevIndicators = indicatorCache.get(st) || [];
        const prevScore = calculateQAScoreFromTemuan(
          prevIndicators,
          prevTemuan,
          weight,
        );

        agent.trendValue =
          Math.round(
            (score.finalScore - prevScore.finalScore) * 100,
          ) / 100;
        agent.trend =
          agent.trendValue > 0
            ? "up"
            : agent.trendValue < 0
              ? "down"
              : "same";
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

  const currentYear = year ?? new Date().getFullYear();
  let temuanQuery = supabaseAdmin
    .from("qa_temuan")
    .select("*")
    .eq("peserta_id", agentId)
    .eq("tahun", currentYear);

  if (allowedServiceTypes && allowedServiceTypes.length > 0) {
    temuanQuery = temuanQuery.in("service_type", allowedServiceTypes);
  }

  const { data: temuan } = await temuanQuery.order("created_at", { ascending: false });

  const rows = temuan ?? [];
  const weight = serviceType
    ? (DEFAULT_SERVICE_WEIGHTS[serviceType as ServiceType] ??
      DEFAULT_SERVICE_WEIGHTS["call"])
    : DEFAULT_SERVICE_WEIGHTS["call"];

  const rawWeights = weightsResult?.data ?? [];
  const resolvedWeights: Record<string, ServiceWeight> = { ...DEFAULT_SERVICE_WEIGHTS };
  for (const w of rawWeights) {
    const st = w.service_type as ServiceType;
    if (resolvedWeights[st]) {
      resolvedWeights[st] = {
        service_type: st,
        critical_weight: Number(w.critical_weight ?? resolvedWeights[st].critical_weight),
        non_critical_weight: Number(w.non_critical_weight ?? resolvedWeights[st].non_critical_weight),
        scoring_mode: w.scoring_mode ?? resolvedWeights[st].scoring_mode,
      };
    }
  }

  const summaries: AgentPeriodSummary[] = [];
  for (const period of periods) {
    const periodRows = rows.filter(
      (r) =>
        r.period_id === period.id &&
        (serviceType ? r.service_type === serviceType : true),
    );
    if (periodRows.length === 0) continue;
    const scoreRowsForCalc = getScoreRows(periodRows as DashboardTemuanRow[]);
    const score = calculateQAScoreFromTemuan(
      indicators,
      scoreRowsForCalc as any,
      weight,
    );
    const findingsCount = periodRows.filter((r) =>
      isCountableFinding(r),
    ).length;
    summaries.push({
      id: period.id,
      month: period.month,
      year: period.year,
      label: `${String(period.month).padStart(2, "0")}/${period.year}`,
      serviceType: (serviceType as ServiceType) ?? (periodRows[0]?.service_type as ServiceType) ?? "call",
      finalScore: roundTo(score.finalScore, 2),
      nonCriticalScore: roundTo(score.nonCriticalScore, 2),
      criticalScore: roundTo(score.criticalScore, 2),
      sessionCount: score.sessionCount,
      findingsCount,
    });
  }

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

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const trendPeriods = periods
    .filter((p: any) => p.year === currentYear)
    .filter((p: any) => !startMonth || p.month >= startMonth)
    .filter((p: any) => !endMonth || p.month <= endMonth)
    .sort((a: any, b: any) => a.month - b.month);

  let personalTrend: { labels: string[]; datasets: { label: string; data: number[]; isTotal: boolean }[] };

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
      const paramName = indicator?.name || 'Unknown';
      if (!paramCounts[paramName]) paramCounts[paramName] = {};
      paramCounts[paramName][pid] = (paramCounts[paramName][pid] || 0) + 1;
    }

    const topParams = Object.entries(paramCounts)
      .map(([name, periodCounts]) => ({
        name,
        total: Object.values(periodCounts).reduce((a: number, b: number) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map((p) => p.name);

    const labels = trendPeriods.map((p: any) =>
      `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`
    );

    const datasets = [
      {
        label: 'Total Temuan',
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
      nama: peserta.data.nama ?? 'Unknown',
      tim: peserta.data.tim ?? '',
      batch_name: peserta.data.batch_name ?? '',
      jabatan: peserta.data.jabatan ?? null,
      foto_url: peserta.data.foto_url ?? null,
      bergabung_date: peserta.data.bergabung_date ?? null,
    },
  };
}
