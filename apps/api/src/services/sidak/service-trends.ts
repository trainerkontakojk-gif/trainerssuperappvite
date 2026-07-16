import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { isCountableFinding } from "./shared-constants";
import { getPeriods, getIndicators } from "./period-indicator";
import { formatQAIndicatorName, type QAPeriod } from "@trainers/types";

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

export async function fetchPaginatedTrendData(
  pIds: string[],
  year?: number,
  agent_ids?: string[],
) {
  const allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from("qa_temuan")
      .select(
        "nilai, ketidaksesuaian, sebaiknya, period_id, service_type, peserta_id, no_tiket, indicator_id, tahun",
      )
      .in("period_id", pIds)
      .eq("is_phantom_padding", false)
      .order("id", { ascending: true })
      .range(from, from + step - 1);

    if (year) {
      query = query.eq("tahun", year);
    }
    if (agent_ids && agent_ids.length > 0) {
      query = query.in("peserta_id", agent_ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...data);
      hasMore = data.length === step;
      from += step;
    }
  }

  return allData;
}

export async function calculateTopParameters(temuan: any[]) {
  if (!temuan || temuan.length === 0) return {};
  const indicators = await getIndicators();
  const countsPerService: Record<
    string,
    Record<string, { count: number; name: string }>
  > = {};

  for (const finding of temuan) {
    if (!isCountableFinding(finding)) continue;
    const service = finding.service_type || "unknown";
    const id = finding.indicator_id;
    if (!id) continue;
    const indicator = indicators.find((i) => i.id === id);
    if (!indicator) continue;
    const name = formatQAIndicatorName(indicator);

    if (!countsPerService[service]) countsPerService[service] = {};
    if (!countsPerService[service][id])
      countsPerService[service][id] = { count: 0, name };
    countsPerService[service][id].count++;
  }

  const result: Record<string, { name: string; count: number }> = {};
  Object.entries(countsPerService).forEach(([service, map]) => {
    const sorted = Object.values(map).sort((a, b) => b.count - a.count);
    if (sorted[0]) {
      result[service] = sorted[0];
    }
  });

  return result;
}

function buildTrendResult(
  sortedPeriods: QAPeriod[],
  temuan: any[],
  topParameters: any,
) {
  const labels = sortedPeriods.map(
    (p) => `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`,
  );

  if (!temuan || temuan.length === 0) {
    return {
      labels,
      totalData: labels.map(() => 0),
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: {
        totalDefects: 0,
        auditedAgents: 0,
        activeServiceCount: 0,
      },
      periodStats: [],
      topParameters: {},
    };
  }

  const activeServicesSet = new Set<string>();
  const totalData = labels.map(() => 0);
  const serviceData: Record<string, number[]> = {};
  const serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  > = {};

  const totalAuditedAgentsSet = new Set(temuan.map((t) => t.peserta_id));
  const totalDefectsCount = temuan.filter(isCountableFinding).length;

  temuan.forEach((t) => {
    const sType = t.service_type || "unknown";
    activeServicesSet.add(sType);

    const periodIdx = sortedPeriods.findIndex((p) => p.id === t.period_id);
    if (periodIdx === -1) return;

    if (isCountableFinding(t)) {
      totalData[periodIdx]++;
    }
    if (!serviceData[sType]) serviceData[sType] = labels.map(() => 0);
    if (isCountableFinding(t)) {
      serviceData[sType][periodIdx]++;
    }

    if (!serviceSummary[sType]) {
      serviceSummary[sType] = { totalDefects: 0, auditedAgents: 0 };
    }
    if (isCountableFinding(t)) {
      serviceSummary[sType].totalDefects++;
    }
  });

  const serviceAgentsMap: Record<string, Set<string>> = {};
  temuan.forEach((t) => {
    const sType = t.service_type || "unknown";
    if (!serviceAgentsMap[sType]) serviceAgentsMap[sType] = new Set<string>();
    serviceAgentsMap[sType].add(t.peserta_id);
  });

  Object.keys(serviceSummary).forEach((sType) => {
    serviceSummary[sType].auditedAgents = serviceAgentsMap[sType]?.size || 0;
  });

  const periodStats = sortedPeriods.map((p, idx) => {
    const pTemuan = temuan.filter((t) => t.period_id === p.id);
    const svcStats: Record<
      string,
      { totalDefects: number; auditedAgents: number }
    > = {};

    const pAgents = new Set(pTemuan.map((t) => t.peserta_id));
    const pDefects = pTemuan.filter(isCountableFinding).length;

    activeServicesSet.forEach((svc) => {
      const sTemuan = pTemuan.filter((t) => t.service_type === svc);
      svcStats[svc] = {
        totalDefects: sTemuan.filter(isCountableFinding).length,
        auditedAgents: new Set(sTemuan.map((t) => t.peserta_id)).size,
      };
    });

    return {
      id: p.id,
      label: labels[idx],
      totalDefects: pDefects,
      auditedAgents: pAgents.size,
      serviceStats: svcStats,
    };
  });

  return {
    labels,
    totalData,
    serviceData,
    activeServices: Array.from(activeServicesSet),
    serviceSummary,
    totalSummary: {
      totalDefects: totalDefectsCount,
      auditedAgents: totalAuditedAgentsSet.size,
      activeServiceCount: activeServicesSet.size,
    },
    periodStats,
    topParameters,
  };
}

export async function getServiceTrendForDashboard(
  timeframe: "3m" | "6m" | "all" = "3m",
  agent_ids?: string[],
  service_type?: string,
) {
  const limitMap = { "3m": 3, "6m": 6, all: 12 };
  const limit = limitMap[timeframe] || 3;

  const { data: periods, error } = await supabaseAdmin
    .from("qa_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!periods || periods.length === 0) {
    return {
      labels: [],
      totalData: [],
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: {
        totalDefects: 0,
        auditedAgents: 0,
        activeServiceCount: 0,
      },
      periodStats: [],
      topParameters: {},
    };
  }

  const sortedPeriods = [...periods].reverse();
  const pIds = sortedPeriods.map((p) => p.id);

  let temuan = await fetchPaginatedTrendData(pIds, undefined, agent_ids);
  if (service_type) {
    temuan = temuan.filter((t) => t.service_type === service_type);
  }
  const topParameters = await calculateTopParameters(temuan);

  return buildTrendResult(sortedPeriods, temuan, topParameters);
}

export async function getServiceTrendForDashboardByRange(
  year: number,
  startMonth: number,
  endMonth: number,
  agent_ids?: string[],
  service_type?: string,
) {
  const allPeriods = await getPeriods();
  const sortedPeriods = allPeriods
    .filter(
      (p) => p.year === year && p.month >= startMonth && p.month <= endMonth,
    )
    .sort((a, b) => a.month - b.month);

  const pIds = sortedPeriods.map((p) => p.id);

  if (pIds.length === 0) {
    return {
      labels: [],
      totalData: [],
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: {
        totalDefects: 0,
        auditedAgents: 0,
        activeServiceCount: 0,
      },
      periodStats: [],
      topParameters: {},
    };
  }

  let temuan = await fetchPaginatedTrendData(pIds, year, agent_ids);
  if (service_type) {
    temuan = temuan.filter((t) => t.service_type === service_type);
  }
  const topParameters = await calculateTopParameters(temuan);

  return buildTrendResult(sortedPeriods, temuan, topParameters);
}

export function sliceTrendData(data: any, months: number) {
  const safeLabels = data.labels || [];
  const safeTotalData = data.totalData || [];
  const safeServiceData = data.serviceData || {};
  const safeActiveServices = data.activeServices || [];
  const safePeriodStats = data.periodStats || [];

  const sliceIdx = Math.max(0, safeLabels.length - months);
  const slicedLabels = safeLabels.slice(sliceIdx);
  const slicedTotalData = safeTotalData.slice(sliceIdx);

  const slicedPeriodStats = safePeriodStats.slice(sliceIdx);

  const slicedServiceData: Record<string, number[]> = {};
  Object.entries(safeServiceData).forEach(([svc, arr]) => {
    if (Array.isArray(arr)) {
      slicedServiceData[svc] = arr.slice(sliceIdx);
    }
  });

  const latestStat = slicedPeriodStats[slicedPeriodStats.length - 1] || {
    totalDefects: 0,
    auditedAgents: 0,
    serviceStats: {} as Record<
      string,
      { totalDefects: number; auditedAgents: number }
    >,
  };

  const totalDefects = slicedTotalData.reduce(
    (a: number, b: number) => a + b,
    0,
  );

  const serviceSummary: Record<
    string,
    { totalDefects: number; auditedAgents: number }
  > = {};
  safeActiveServices.forEach((svc: string) => {
    const svcTotalDefects =
      slicedServiceData[svc]?.reduce((a: number, b: number) => a + b, 0) || 0;
    serviceSummary[svc] = {
      totalDefects: svcTotalDefects,
      auditedAgents: latestStat.serviceStats[svc]?.auditedAgents || 0,
    };
  });

  return {
    labels: slicedLabels,
    totalData: slicedTotalData,
    serviceData: slicedServiceData,
    activeServices: safeActiveServices,
    serviceSummary,
    totalSummary: {
      totalDefects,
      auditedAgents: latestStat.auditedAgents || 0,
      activeServiceCount: safeActiveServices.length,
    },
    periodStats: slicedPeriodStats,
  };
}

export async function getAvailableYears(
  agent_ids?: string[],
): Promise<number[]> {
  const allData = await fetchAllPages<{ tahun: number | null }>({
    build: ({ from, to }) => {
      let query = supabaseAdmin
        .from("qa_temuan")
        .select("tahun")
        .not("tahun", "is", null)
        .order("tahun", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (agent_ids && agent_ids.length > 0) {
        query = query.in("peserta_id", agent_ids);
      }

      return query;
    },
  });

  const years = [
    ...new Set(allData.map((r) => r.tahun).filter(Boolean)),
  ] as number[];
  return years;
}
