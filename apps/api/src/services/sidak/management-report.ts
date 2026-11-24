import {
  formatQAIndicatorName,
  type QAPeriod,
  type QAIndicator,
  type ServiceType,
  type SidakManagementReportAgentRow,
  type SidakManagementReportMetricRow,
  type SidakManagementReportParetoRow,
  type SidakManagementReportRequest,
  type SidakManagementReportResponse,
  type SidakManagementReportTeamRow,
  type DashboardData,
  VALID_SERVICE_TYPES,
  getSidakCalendarMonth,
  isSidakActionableReportRow,
} from "@trainers/types";
import { DEFAULT_SERVICE_WEIGHTS, getTemuanSessionKey } from "../../lib/scoring";
import { isAgentExcluded } from "./agent-directory";
import {
  countFindingTickets,
  SIDAK_COMPLIANCE_TARGET,
} from "./shared-constants";
import { getDataReportRows } from "./report-data";
import { getDashboardData, resolveDashboardIndicator } from "./dashboard-data";
import { getIndicators, getPeriods } from "./period-indicator";
import {
  createPeriodScoringLoaders,
  getAllServiceWeights,
  loadPeriodScoringContext,
  mergeServiceWeights,
  type PeriodScoringContext,
} from "./period-scoring-context";
import { fetchPublishedRuleVersions, pickEffectiveRuleVersion } from "./rule-version-resolver";

type ReportSourceRow = Awaited<ReturnType<typeof getDataReportRows>>[number];
type ReportAgent = NonNullable<ReportSourceRow["profiler_peserta"]>;
type MetricPoint = {
  agents: number;
  sessions: number;
  findings: number;
  tickets: number;
  avgScore: number;
  complianceRate: number;
  zeroErrorRate: number;
  complianceCount: number;
  zeroErrorCount: number;
};
type ScopedSourceRow = ReportSourceRow & {
  peserta_id: string;
  period_id: string;
  service_type: ServiceType;
  indicator_id: string;
  profiler_peserta: ReportAgent;
  qa_periods: { month: number; year: number };
};
type MonthlyAgent = {
  id: string;
  name: string;
  team: string;
  batch: string;
  score: number;
  findings: number;
  sessions: number;
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function monthSerial(year: number, month: number): number {
  return year * 12 + month - 1;
}

function fromMonthSerial(serial: number): { year: number; month: number } {
  return { year: Math.floor(serial / 12), month: (serial % 12) + 1 };
}

function percentDelta(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 10000) / 100;
}

function pointDelta(current: number, previous: number): number {
  return Math.round((current - previous) * 100) / 100;
}

function noAuditPoint(): MetricPoint {
  return {
    agents: 0, sessions: 0, findings: 0, tickets: 0, avgScore: 0,
    complianceRate: 0, zeroErrorRate: 0, complianceCount: 0, zeroErrorCount: 0,
  };
}

function sumPoints(points: MetricPoint[]): MetricPoint {
  const audited = points.reduce((sum, point) => sum + point.agents, 0);
  const complianceCount = points.reduce((sum, point) => sum + point.complianceCount, 0);
  const zeroErrorCount = points.reduce((sum, point) => sum + point.zeroErrorCount, 0);
  const scoreSum = points.reduce((sum, point) => sum + point.avgScore * point.agents, 0);
  return {
    agents: audited,
    sessions: points.reduce((sum, point) => sum + point.sessions, 0),
    findings: points.reduce((sum, point) => sum + point.findings, 0),
    tickets: points.reduce((sum, point) => sum + point.tickets, 0),
    avgScore: audited ? scoreSum / audited : 0,
    complianceRate: audited ? (complianceCount / audited) * 100 : 0,
    zeroErrorRate: audited ? (zeroErrorCount / audited) * 100 : 0,
    complianceCount,
    zeroErrorCount,
  };
}

function deltaFor(current: MetricPoint, previous: MetricPoint | null, comparisonComplete = true) {
  if (!comparisonComplete || !previous || previous.agents === 0 || current.agents === 0) return null;
  return {
    findings: percentDelta(current.findings, previous.findings),
    tickets: percentDelta(current.tickets, previous.tickets),
    avgAgentScore: pointDelta(current.avgScore, previous.avgScore),
    complianceRate: pointDelta(current.complianceRate, previous.complianceRate),
    zeroErrorRate: pointDelta(current.zeroErrorRate, previous.zeroErrorRate),
  };
}

function metricRow(
  serviceType: ServiceType,
  point: MetricPoint,
  label: string,
  rowType: SidakManagementReportMetricRow["rowType"],
  month: number | null,
  delta: SidakManagementReportMetricRow["delta"],
  quarter?: SidakManagementReportMetricRow["quarter"],
): SidakManagementReportMetricRow {
  const audited = point.agents > 0;
  return {
    rowType,
    serviceType,
    month,
    label,
    ...(quarter ? { quarter } : {}),
    agentsAudited: audited ? point.agents : null,
    sessionsAudited: audited ? point.sessions : null,
    findingsCount: audited ? point.findings : null,
    ticketsWithFindings: audited ? point.tickets : null,
    avgAgentScore: audited ? Math.round(point.avgScore * 100) / 100 : null,
    complianceRate: audited ? Math.round(point.complianceRate * 100) / 100 : null,
    zeroErrorRate: audited ? Math.round(point.zeroErrorRate * 100) / 100 : null,
    delta,
  };
}

function sourceRowsInScope(rows: ReportSourceRow[]): ScopedSourceRow[] {
  return rows.filter((row): row is ScopedSourceRow =>
    typeof row.peserta_id === "string" &&
    typeof row.period_id === "string" &&
    typeof row.service_type === "string" &&
    typeof row.indicator_id === "string" &&
    row.profiler_peserta != null &&
    row.qa_periods != null &&
    !isAgentExcluded(
      row.profiler_peserta.tim,
      row.profiler_peserta.batch_name,
      row.profiler_peserta.jabatan,
    ),
  );
}

function sessionsByAgentPeriod(rows: ScopedSourceRow[]): Map<string, number> {
  const keys = new Set<string>();
  const rowIndex = new Map<string, number>();
  for (const row of rows) {
    const group = `${row.service_type}:${row.period_id}:${row.peserta_id}`;
    const index = rowIndex.get(group) ?? 0;
    rowIndex.set(group, index + 1);
    keys.add(`${group}:${getTemuanSessionKey(row, index)}`);
  }
  const counts = new Map<string, number>();
  for (const key of keys) {
    const [serviceType, periodId, pesertaId] = key.split(":", 4);
    const mapKey = `${serviceType}:${periodId}:${pesertaId}`;
    counts.set(mapKey, (counts.get(mapKey) ?? 0) + 1);
  }
  return counts;
}

function teamKey(team: string, batch: string): string {
  return `${team}\u0000${batch}`;
}

function teamPointsForMonth(
  serviceType: ServiceType,
  period: QAPeriod,
  agents: MonthlyAgent[],
  rows: ScopedSourceRow[],
): Map<string, MetricPoint> {
  const membersByTeam = new Map<string, MonthlyAgent[]>();
  for (const agent of agents) {
    const key = teamKey(agent.team, agent.batch);
    const members = membersByTeam.get(key) ?? [];
    members.push(agent);
    membersByTeam.set(key, members);
  }
  const periodRows = rows.filter((row) => row.service_type === serviceType && row.period_id === period.id);
  const points = new Map<string, MetricPoint>();
  for (const [key, members] of membersByTeam) {
    const agentIds = new Set(members.map((member) => member.id));
    const teamRows = periodRows.filter((row) => agentIds.has(row.peserta_id));
    const countableRows = teamRows.filter((row) => row.is_countable === true && row.is_phantom_padding !== true);
    const complianceCount = members.filter((member) => member.score >= SIDAK_COMPLIANCE_TARGET).length;
    const zeroErrorCount = members.filter((member) => member.findings === 0).length;
    points.set(key, {
      agents: members.length,
      sessions: members.reduce((sum, member) => sum + member.sessions, 0),
      findings: members.reduce((sum, member) => sum + member.findings, 0),
      tickets: countFindingTickets(countableRows),
      avgScore: members.reduce((sum, member) => sum + member.score, 0) / members.length,
      complianceCount,
      zeroErrorCount,
      complianceRate: (complianceCount / members.length) * 100,
      zeroErrorRate: (zeroErrorCount / members.length) * 100,
    });
  }
  const agentsByTeam = new Map<string, MonthlyAgent[]>();
  for (const agent of agents) {
    const members = agentsByTeam.get(agent.team) ?? [];
    members.push(agent);
    agentsByTeam.set(agent.team, members);
  }
  for (const [team, members] of agentsByTeam) {
    const batchPoints = [...new Set(members.map((member) => member.batch))]
      .map((batch) => points.get(teamKey(team, batch)))
      .filter((point): point is MetricPoint => point !== undefined);
    points.set(teamKey(team, "Semua batch"), sumPoints(batchPoints));
  }
  return points;
}

function sessionsByServicePeriod(
  countsByAgent: Map<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [key, count] of countsByAgent) {
    const [serviceType, periodId] = key.split(":", 3);
    const mapKey = `${serviceType}:${periodId}`;
    counts.set(mapKey, (counts.get(mapKey) ?? 0) + count);
  }
  return counts;
}

async function buildPareto(
  services: ServiceType[],
  months: number[],
  year: number,
  rows: ScopedSourceRow[],
  monthMetrics: Map<string, DashboardData>,
  periodByYearMonth: Map<string, QAPeriod>,
  contextFor: (serviceType: ServiceType, periodId: string) => Promise<PeriodScoringContext>,
  indicators: QAIndicator[],
): Promise<SidakManagementReportParetoRow[]> {
  const stats = new Map<string, {
    serviceType: ServiceType;
    parameter: string;
    category: "critical" | "non_critical";
    monthlyCounts: Map<number, number>;
    agents: Set<string>;
  }>();
  for (const serviceType of services) {
    for (const month of months) {
      const dashboard = monthMetrics.get(`${serviceType}:${year}:${month}`);
      const period = periodByYearMonth.get(`${year}:${month}`);
      if (!dashboard || !period) continue;
      const monthlyRows = rows.filter((row) =>
        row.service_type === serviceType && row.period_id === period.id &&
        row.is_countable === true && row.is_phantom_padding !== true,
      );
      if (monthlyRows.length === 0) continue;
      const context = await contextFor(serviceType, period.id);
      for (const row of monthlyRows) {
        const indicator = resolveDashboardIndicator(row, context, indicators);
        if (!indicator) continue;
        const identity = `${serviceType}:${indicator.id}`;
        const name = formatQAIndicatorName(indicator);
        const entry = stats.get(identity) ?? {
          serviceType,
          parameter: name,
          category: indicator.category === "critical" ? "critical" : "non_critical",
          monthlyCounts: new Map<number, number>(),
          agents: new Set<string>(),
        };
        entry.monthlyCounts.set(month, (entry.monthlyCounts.get(month) ?? 0) + 1);
        entry.agents.add(row.peserta_id);
        stats.set(identity, entry);
      }
    }
  }
  const totalFindings = [...stats.values()].reduce((sum, item) =>
    sum + [...item.monthlyCounts.values()].reduce((countSum, count) => countSum + count, 0), 0);
  let cumulative = 0;
  return [...stats.entries()]
    .map(([, value]) => ({
      serviceType: value.serviceType,
      parameter: value.parameter,
      category: value.category,
      monthlyCounts: months.map((month) => ({ month, count: value.monthlyCounts.get(month) ?? 0 })),
      total: [...value.monthlyCounts.values()].reduce((sum, count) => sum + count, 0),
      contribution: totalFindings ? (value.monthlyCounts.size ? [...value.monthlyCounts.values()].reduce((sum, count) => sum + count, 0) / totalFindings * 100 : 0) : 0,
      cumulativeContribution: 0,
      agentsAffected: value.agents.size,
    }))
    .sort((a, b) => b.total - a.total || a.parameter.localeCompare(b.parameter, "id"))
    .map((item) => {
      cumulative += item.contribution;
      return { ...item, cumulativeContribution: Math.round(cumulative * 100) / 100, contribution: Math.round(item.contribution * 100) / 100 };
    });
}

export async function getSidakManagementReport(
  input: SidakManagementReportRequest,
  scope: { agentIds: string[] | null; allowedServiceTypes?: ServiceType[] },
): Promise<SidakManagementReportResponse> {
  const services = input.serviceType
    ? [input.serviceType]
    : (scope.allowedServiceTypes?.length ? scope.allowedServiceTypes : VALID_SERVICE_TYPES);
  const allowedServices = scope.allowedServiceTypes?.length ? scope.allowedServiceTypes : undefined;
  const scopedAgentIds = input.pesertaId
    ? scope.agentIds === null
      ? [input.pesertaId]
      : scope.agentIds.includes(input.pesertaId) ? [input.pesertaId] : []
    : scope.agentIds;
  const startSerial = monthSerial(input.year, input.startMonth);
  const endSerial = monthSerial(input.year, input.endMonth);
  const months = Array.from({ length: endSerial - startSerial + 1 }, (_, index) => input.startMonth + index);
  const now = getSidakCalendarMonth();
  const isYearToDate = input.year === now.year &&
    input.startMonth === 1 && input.endMonth === now.month;
  const previousStart = isYearToDate
    ? { year: input.year - 1, month: 1 }
    : fromMonthSerial(startSerial - months.length);
  const previousMonths = Array.from({ length: months.length }, (_, index) => {
    const serial = monthSerial(previousStart.year, previousStart.month) + index;
    return fromMonthSerial(serial);
  });
  const precedingMonthPeriods = months.map((month) => fromMonthSerial(monthSerial(input.year, month) - 1));
  const priorQuarterPeriods = [...new Map(months.flatMap((month) => {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    const previousQuarterStart = monthSerial(input.year, quarterStart) - 3;
    return Array.from({ length: 3 }, (_, index) => fromMonthSerial(previousQuarterStart + index));
  }).map((period) => [`${period.year}:${period.month}`, period])).values()];
  const comparisonMonths = [...new Map([...previousMonths, ...precedingMonthPeriods, ...priorQuarterPeriods]
    .map((period) => [`${period.year}:${period.month}`, period])).values()];
  const allPeriods = await getPeriods();
  const periodByYearMonth = new Map(allPeriods.map((period) => [`${period.year}:${period.month}`, period]));
  const allRelevant = [
    ...months.map((month) => ({ year: input.year, month })),
    ...comparisonMonths,
  ];
  const currentMonthKeys = new Set(months.map((month) => `${input.year}:${month}`));
  const comparisonMonthKeys = new Set(comparisonMonths.map(({ year, month }) => `${year}:${month}`));
  const queryMonthsByYear = new Map<number, number[]>();
  for (const item of allRelevant) {
    const values = queryMonthsByYear.get(item.year) ?? [];
    values.push(item.month);
    queryMonthsByYear.set(item.year, values);
  }
  const fetchedRows = (await Promise.all([...queryMonthsByYear].map(([year, range]) =>
    getDataReportRows({
      year,
      startMonth: Math.min(...range),
      endMonth: Math.max(...range),
      serviceType: input.serviceType,
      agent_ids: scopedAgentIds ?? undefined,
      allowedServiceTypes: allowedServices,
      showArchived: input.showArchived,
    }),
  ))).flat();
  const relevantRows = fetchedRows.filter((row) => {
    const key = `${row.qa_periods?.year}:${row.qa_periods?.month}`;
    return currentMonthKeys.has(key) || comparisonMonthKeys.has(key);
  });
  const sourceRows = sourceRowsInScope(relevantRows.filter((row) =>
    currentMonthKeys.has(`${row.qa_periods?.year}:${row.qa_periods?.month}`),
  ));
  const previousSourceRows = sourceRowsInScope(relevantRows.filter((row) =>
    comparisonMonthKeys.has(`${row.qa_periods?.year}:${row.qa_periods?.month}`),
  ));
  const currentDetails = sourceRows.filter((row) =>
    isSidakActionableReportRow(row) && (!input.indicatorId || row.indicator_id === input.indicatorId),
  );
  const sessionsPerAgent = sessionsByAgentPeriod(sourceRows);
  for (const [key, count] of sessionsByAgentPeriod(previousSourceRows)) sessionsPerAgent.set(key, count);
  const sessionCounts = sessionsByServicePeriod(sessionsPerAgent);
  const dashboardCache = new Map<string, DashboardData>();
  const pointCache = new Map<string, MetricPoint>();
  const agentCache = new Map<string, MonthlyAgent[]>();
  const teamPointCache = new Map<string, MetricPoint>();
  const loadMonth = async (serviceType: ServiceType, year: number, month: number) => {
    const key = `${serviceType}:${year}:${month}`;
    if (dashboardCache.has(key)) return dashboardCache.get(key)!;
    const period = periodByYearMonth.get(`${year}:${month}`);
    if (!period) return null;
    const data = await getDashboardData({
      period_ids: [period.id],
      service_type: serviceType,
      agent_ids: scopedAgentIds ?? undefined,
      showArchived: input.showArchived,
      allowedServiceTypes: allowedServices,
      year,
      limit: 0,
    });
    dashboardCache.set(key, data);
    const summary = data.summary;
    const agents = data.topAgents.map((agent) => ({
      id: agent.agentId,
      name: agent.nama,
      team: agent.tim?.trim() || "Tanpa tim",
      batch: agent.batch?.trim() || "Tanpa batch",
      score: agent.score,
      findings: agent.defects,
      sessions: sessionsPerAgent.get(`${serviceType}:${period.id}:${agent.agentId}`) ?? 0,
    }));
    agentCache.set(key, agents);
    const audited = summary?.totalAgents ?? 0;
    const point: MetricPoint = audited === 0
      ? noAuditPoint()
      : {
          agents: audited,
          sessions: sessionCounts.get(`${serviceType}:${period.id}`) ?? 0,
          findings: summary?.totalDefects ?? 0,
          tickets: summary?.totalTickets ?? 0,
          avgScore: summary?.avgAgentScore ?? 0,
          complianceRate: summary?.complianceRate ?? 0,
          zeroErrorRate: summary?.zeroErrorRate ?? 0,
          complianceCount: summary?.complianceCount ?? 0,
          zeroErrorCount: data.topAgents.filter((agent) => agent.defects === 0).length,
        };
    pointCache.set(key, point);
    return data;
  };

  const dashboardPointForPeriods = async (
    serviceType: ServiceType,
    periods: Array<{ year: number; month: number }>,
    basePoint: MetricPoint,
    agentIds?: string[],
  ): Promise<MetricPoint> => {
    const periodsByYear = new Map<number, string[]>();
    for (const { year, month } of periods) {
      const periodId = periodByYearMonth.get(`${year}:${month}`)?.id;
      if (!periodId) continue;
      const ids = periodsByYear.get(year) ?? [];
      ids.push(periodId);
      periodsByYear.set(year, ids);
    }
    if (periodsByYear.size === 0 || agentIds?.length === 0) return noAuditPoint();
    const dashboards: DashboardData[] = [];
    for (const [year, periodIds] of periodsByYear) {
      dashboards.push(await getDashboardData({
        period_ids: periodIds,
        service_type: serviceType,
        agent_ids: agentIds ?? scopedAgentIds ?? undefined,
        showArchived: input.showArchived,
        allowedServiceTypes: allowedServices,
        year,
        limit: 0,
      }));
    }
    if (dashboards.length === 1 && dashboards[0]!.summary) {
      const summary = dashboards[0]!.summary!;
      return {
        ...basePoint,
        agents: summary.totalAgents,
        findings: summary.totalDefects,
        tickets: summary.totalTickets,
        avgScore: summary.avgAgentScore,
        complianceRate: summary.complianceRate,
        zeroErrorRate: summary.zeroErrorRate,
        complianceCount: summary.complianceCount,
      };
    }
    const metrics = dashboards.flatMap((dashboard) => dashboard.periodMetrics);
    const totalAudited = metrics.reduce((sum, metric) => sum + metric.totalAudited, 0);
    const totalCompliant = metrics.reduce((sum, metric) => sum + metric.compliance, 0);
    const totalZeroError = metrics.reduce((sum, metric) =>
      sum + Math.round((metric.zero / 100) * metric.totalAudited), 0);
    const uniqueAgents = new Set(periods.flatMap(({ year, month }) =>
      (agentCache.get(`${serviceType}:${year}:${month}`) ?? [])
        .filter((agent) => !agentIds || agentIds.includes(agent.id))
        .map((agent) => agent.id),
    ));
    return {
      ...basePoint,
      agents: uniqueAgents.size,
      findings: metrics.reduce((sum, metric) => sum + metric.total, 0),
      tickets: metrics.reduce((sum, metric) => sum + metric.totalTickets, 0),
      avgScore: totalAudited ? Math.round(metrics.reduce((sum, metric) =>
        sum + metric.avgAgentScore * metric.totalAudited, 0) / totalAudited * 100) / 100 : 0,
      complianceRate: totalAudited ? Math.round(totalCompliant / totalAudited * 10000) / 100 : 0,
      zeroErrorRate: totalAudited ? Math.round(totalZeroError / totalAudited * 10000) / 100 : 0,
      complianceCount: totalCompliant,
    };
  };

  const monthLoads = services.flatMap((serviceType) => allRelevant.map(({ year, month }) => ({ serviceType, year, month })));
  for (let index = 0; index < monthLoads.length; index += 4) {
    await Promise.all(monthLoads.slice(index, index + 4).map(({ serviceType, year, month }) => loadMonth(serviceType, year, month)));
  }
  for (const serviceType of services) {
    for (const item of comparisonMonths) {
      const period = periodByYearMonth.get(`${item.year}:${item.month}`);
      if (!period) continue;
      const agents = agentCache.get(`${serviceType}:${item.year}:${item.month}`) ?? [];
      for (const [group, point] of teamPointsForMonth(serviceType, period, agents, previousSourceRows)) {
        teamPointCache.set(`${serviceType}:${item.year}:${item.month}:${group}`, point);
      }
    }
  }
  const reportMonths: SidakManagementReportMetricRow[] = [];
  const teamMonthRows: SidakManagementReportTeamRow[] = [];
  const agentEntries = new Map<string, {
    agentId: string; name: string; team: string; batchName: string; serviceType: ServiceType;
    monthlyScores: Map<number, number>; findingsCount: number; sessionsAudited: number;
  }>();
  const ruleVersions: SidakManagementReportResponse["metadata"]["ruleVersions"] = [];
  const versionsByService = new Map(
    await Promise.all(services.map(async (serviceType) => [
      serviceType,
      await fetchPublishedRuleVersions(serviceType),
    ] as const)),
  );
  for (const serviceType of services) {
    for (const month of months) {
      const period = periodByYearMonth.get(`${input.year}:${month}`);
      const key = `${serviceType}:${input.year}:${month}`;
      const point = pointCache.get(key) ?? noAuditPoint();
      const previousMonth = month === 1 ? { year: input.year - 1, month: 12 } : { year: input.year, month: month - 1 };
      const previousPoint = pointCache.get(`${serviceType}:${previousMonth.year}:${previousMonth.month}`) ?? null;
      const previousPeriodAvailable = periodByYearMonth.has(`${previousMonth.year}:${previousMonth.month}`) && (previousPoint?.agents ?? 0) > 0;
      const monthLabel = `${MONTH_NAMES[month - 1]} ${input.year}${month === now.month && input.year === now.year ? " · berjalan — data sementara" : ""}`;
      reportMonths.push(metricRow(serviceType, point, monthLabel, "month", month, deltaFor(point, previousPoint, previousPeriodAvailable)));
      if (period) {
        const agents = agentCache.get(key) ?? [];
        const teamPoints = teamPointsForMonth(serviceType, period, agents, sourceRows);
        for (const [group, baseTeamPoint] of teamPoints) {
          const [team, batchName] = group.split("\u0000");
          const teamAgentIds = agents
            .filter((agent) => agent.team === team && (batchName === "Semua batch" || agent.batch === batchName))
            .map((agent) => agent.id);
          const teamPoint = await dashboardPointForPeriods(
            serviceType,
            [{ year: input.year, month }],
            baseTeamPoint,
            teamAgentIds,
          );
          teamPointCache.set(`${serviceType}:${input.year}:${month}:${group}`, teamPoint);
          const previousMonth = month === 1 ? { year: input.year - 1, month: 12 } : { year: input.year, month: month - 1 };
          const previousTeamPoint = teamPointCache.get(`${serviceType}:${previousMonth.year}:${previousMonth.month}:${group}`) ?? null;
          const previousTeamAvailable = periodByYearMonth.has(`${previousMonth.year}:${previousMonth.month}`) && (previousTeamPoint?.agents ?? 0) > 0;
          teamMonthRows.push({
            ...metricRow(serviceType, teamPoint, monthLabel, "month", month, deltaFor(teamPoint, previousTeamPoint, previousTeamAvailable)),
            team: team || "Tanpa tim",
            batchName: batchName || "Tanpa batch",
          });
        }
        for (const agent of agents) {
          const agentKey = `${serviceType}:${agent.id}`;
          const entry = agentEntries.get(agentKey) ?? {
            agentId: agent.id, name: agent.name, team: agent.team, batchName: agent.batch,
            serviceType, monthlyScores: new Map<number, number>(), findingsCount: 0, sessionsAudited: 0,
          };
          entry.monthlyScores.set(month, agent.score);
          entry.findingsCount += agent.findings;
          entry.sessionsAudited += agent.sessions;
          agentEntries.set(agentKey, entry);
        }
      }
      const version = period
        ? pickEffectiveRuleVersion(period, versionsByService.get(serviceType) ?? [])
        : null;
      ruleVersions.push({ serviceType, month, versionId: version?.id ?? null });
    }
  }

  const hasCompleteComparison = (serviceType: ServiceType, periods: Array<{ year: number; month: number }>) =>
    periods.every(({ year, month }) => periodByYearMonth.has(`${year}:${month}`) &&
      (pointCache.get(`${serviceType}:${year}:${month}`)?.agents ?? 0) > 0);
  const hasCompleteTeamComparison = (
    serviceType: ServiceType,
    periods: Array<{ year: number; month: number }>,
    team: string,
    batchName: string,
  ) => periods.every(({ year, month }) => periodByYearMonth.has(`${year}:${month}`) &&
    (teamPointCache.get(`${serviceType}:${year}:${month}:${teamKey(team, batchName)}`)?.agents ?? 0) > 0);

  const agentIdsForTeam = (
    serviceType: ServiceType,
    periods: Array<{ year: number; month: number }>,
    team: string,
    batchName: string,
  ) => [...new Set(periods.flatMap(({ year, month }) =>
    (agentCache.get(`${serviceType}:${year}:${month}`) ?? [])
      .filter((agent) => agent.team === team && (batchName === "Semua batch" || agent.batch === batchName))
      .map((agent) => agent.id),
  ))];

  const aggregateRows = async (
    rows: Array<{ serviceType: ServiceType; month: number; point: MetricPoint; label: string; team?: string; batchName?: string }>,
    rowType: "quarter" | "total",
  ) => {
    const results: Array<SidakManagementReportMetricRow | SidakManagementReportTeamRow> = [];
    const buckets = rowType === "total"
      ? [[null, rows] as const]
      : QUARTERS.map((quarter, index) => [quarter, rows.filter((row) => Math.ceil(row.month / 3) === index + 1)] as const)
        .filter(([, bucket]) => bucket.length > 0);
    for (const [quarter, bucket] of buckets) {
      const serviceTypes = [...new Set(bucket.map((row) => row.serviceType))];
      for (const serviceType of serviceTypes) {
        const values = bucket.filter((row) => row.serviceType === serviceType);
        const currentPointBase = sumPoints(values.map((row) => row.point));
        if (rowType === "total") {
          const currentPeriods = values.map((row) => ({ year: input.year, month: row.month }));
          const priorPoints = previousMonths.map(({ year, month }) => pointCache.get(`${serviceType}:${year}:${month}`) ?? noAuditPoint());
          const currentPoint = await dashboardPointForPeriods(serviceType, currentPeriods, currentPointBase);
          const previousPoint = await dashboardPointForPeriods(serviceType, previousMonths, sumPoints(priorPoints));
          results.push(metricRow(serviceType, currentPoint, `Total ${input.startMonth}–${input.endMonth}/${input.year}`, "total", null, deltaFor(currentPoint, previousPoint, hasCompleteComparison(serviceType, previousMonths))));
        } else {
          const currentPeriods = values.map((row) => ({ year: input.year, month: row.month }));
          const currentPoint = await dashboardPointForPeriods(serviceType, currentPeriods, currentPointBase);
          const quarterIndex = Math.floor((values[0]!.month - 1) / 3);
          const priorQuarterStart = fromMonthSerial(monthSerial(input.year, quarterIndex * 3 + 1) - 3);
          const priorPeriods = Array.from({ length: 3 }, (_, index) => fromMonthSerial(monthSerial(priorQuarterStart.year, priorQuarterStart.month) + index));
          const previousPoint = await dashboardPointForPeriods(
            serviceType,
            priorPeriods,
            sumPoints(priorPeriods.map(({ year, month }) => pointCache.get(`${serviceType}:${year}:${month}`) ?? noAuditPoint())),
          );
          const temporary = input.year === now.year && values.some((row) => row.month === now.month);
          const metric = metricRow(serviceType, currentPoint, `Subtotal ${quarter}${temporary ? " · berjalan — data sementara" : ""}`, "quarter", null, deltaFor(currentPoint, previousPoint, hasCompleteComparison(serviceType, priorPeriods)), quarter ?? undefined);
          results.push(metric);
        }
      }
    }
    return results;
  };
  const currentMetricPoints = services.flatMap((serviceType) => months.map((month) => ({
    serviceType,
    month,
    point: pointCache.get(`${serviceType}:${input.year}:${month}`) ?? noAuditPoint(),
    label: MONTH_NAMES[month - 1],
  })));
  const monthlyAndQuarterRows: SidakManagementReportMetricRow[] = [];
  for (const serviceType of services) {
    const rows = currentMetricPoints.filter((row) => row.serviceType === serviceType);
    const monthly = reportMonths.filter((row) => row.serviceType === serviceType);
    const quarters = (await aggregateRows(rows, "quarter")).filter((row): row is SidakManagementReportMetricRow => row.serviceType === serviceType && !("team" in row));
    const total = (await aggregateRows(rows, "total")).filter((row): row is SidakManagementReportMetricRow => row.serviceType === serviceType && !("team" in row));
    monthlyAndQuarterRows.push(...monthly);
    for (const quarter of QUARTERS) {
      const quarterRow = quarters.find((row) => row.quarter === quarter);
      if (quarterRow) monthlyAndQuarterRows.push(quarterRow);
    }
    monthlyAndQuarterRows.push(...total);
  }

  const knownTeams = [...new Map(teamMonthRows.map((row) => [
    `${row.team}\u0000${row.batchName}\u0000${row.serviceType}`,
    { team: row.team, batchName: row.batchName, serviceType: row.serviceType },
  ])).values()];
  for (const group of knownTeams) {
    for (const month of months) {
      if (teamMonthRows.some((row) => row.team === group.team && row.batchName === group.batchName && row.serviceType === group.serviceType && row.month === month)) continue;
      const summary = reportMonths.find((row) => row.serviceType === group.serviceType && row.month === month);
      teamMonthRows.push({
        ...metricRow(group.serviceType, noAuditPoint(), summary?.label ?? `${MONTH_NAMES[month - 1]} ${input.year}`, "month", month, null),
        team: group.team,
        batchName: group.batchName,
      });
    }
  }
  const teamAggregates: SidakManagementReportTeamRow[] = [...teamMonthRows];
  const teamKeys = [...new Set(teamMonthRows.map((row) => `${row.team}\u0000${row.batchName}\u0000${row.serviceType}`))];
  for (const groupKey of teamKeys) {
    const [team, batchName, serviceText] = groupKey.split("\u0000");
    const serviceType = VALID_SERVICE_TYPES.find((item) => item === serviceText);
    if (!serviceType) continue;
    const rows = teamMonthRows.filter((row) => row.team === team && row.batchName === batchName && row.serviceType === serviceType);
    const teamPeriodPoints = rows.map((row) => ({
      serviceType, month: row.month ?? 1, label: row.label,
      point: teamPointCache.get(`${serviceType}:${input.year}:${row.month}:${teamKey(team, batchName)}`) ?? noAuditPoint(),
      team, batchName,
    }));
    for (const quarter of QUARTERS) {
      const group = teamPeriodPoints.filter((row) => Math.ceil(row.month / 3) === Number(quarter[1]));
      if (!group.length) continue;
      const pointBase = sumPoints(group.map((row) => row.point));
      const currentPeriods = group.map((row) => ({ year: input.year, month: row.month }));
      const teamAgentIds = agentIdsForTeam(serviceType, [...currentPeriods, ...previousMonths], team, batchName);
      const point = await dashboardPointForPeriods(serviceType, currentPeriods, pointBase, teamAgentIds);
      const quarterIndex = Math.floor((group[0]!.month - 1) / 3);
      const priorQuarterStart = fromMonthSerial(monthSerial(input.year, quarterIndex * 3 + 1) - 3);
      const priorPeriods = Array.from({ length: 3 }, (_, index) => fromMonthSerial(monthSerial(priorQuarterStart.year, priorQuarterStart.month) + index));
      const priorPoints = priorPeriods.map(({ year, month }) =>
        teamPointCache.get(`${serviceType}:${year}:${month}:${teamKey(team, batchName)}`) ?? noAuditPoint(),
      );
      const previousPoint = await dashboardPointForPeriods(serviceType, priorPeriods, sumPoints(priorPoints), teamAgentIds);
      teamAggregates.push({
        ...metricRow(serviceType, point, `Subtotal ${quarter}${input.year === now.year && group.some((row) => row.month === now.month) ? " · berjalan — data sementara" : ""}`, "quarter", null, deltaFor(point, previousPoint, hasCompleteTeamComparison(serviceType, priorPeriods, team, batchName)), quarter),
        team, batchName,
      });
    }
    const pointBase = sumPoints(teamPeriodPoints.map((row) => row.point));
    const currentPeriods = teamPeriodPoints.map((row) => ({ year: input.year, month: row.month }));
    const teamAgentIds = agentIdsForTeam(serviceType, [...currentPeriods, ...previousMonths], team, batchName);
    const point = await dashboardPointForPeriods(serviceType, currentPeriods, pointBase, teamAgentIds);
    const priorPoints = previousMonths.map(({ year, month }) =>
      teamPointCache.get(`${serviceType}:${year}:${month}:${teamKey(team, batchName)}`) ?? noAuditPoint(),
    );
    const previousPoint = await dashboardPointForPeriods(serviceType, previousMonths, sumPoints(priorPoints), teamAgentIds);
    teamAggregates.push({
      ...metricRow(serviceType, point, `Total ${input.startMonth}–${input.endMonth}/${input.year}`, "total", null, deltaFor(point, previousPoint, hasCompleteTeamComparison(serviceType, previousMonths, team, batchName))),
      team, batchName,
    });
  }

  const agents: SidakManagementReportAgentRow[] = [...agentEntries.values()].map((entry) => {
    const auditedScores = [...entry.monthlyScores.values()];
    const periodScore = auditedScores.length ? auditedScores.reduce((sum, value) => sum + value, 0) / auditedScores.length : null;
    const monthlyScores: Record<number, number | null> = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [index + 1, entry.monthlyScores.get(index + 1) ?? null]),
    );
    const quarterScore = (index: number): number | null => {
      const values = [index * 3 + 1, index * 3 + 2, index * 3 + 3]
        .map((month) => entry.monthlyScores.get(month)).filter((value): value is number => value !== undefined);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const quarterScores: SidakManagementReportAgentRow["quarterScores"] = {
      Q1: quarterScore(0), Q2: quarterScore(1), Q3: quarterScore(2), Q4: quarterScore(3),
    };
    const auditedMonths = months.filter((month) => entry.monthlyScores.has(month));
    const previousMonth = auditedMonths.at(-2);
    const latestMonth = auditedMonths.at(-1);
    const previousScore = previousMonth === undefined ? undefined : entry.monthlyScores.get(previousMonth);
    const latestScore = latestMonth === undefined ? undefined : entry.monthlyScores.get(latestMonth);
    const trend = previousMonth === undefined || latestMonth === undefined || latestMonth !== previousMonth + 1
      ? "Belum cukup data"
      : latestScore! > previousScore! ? "Naik" : latestScore! < previousScore! ? "Turun" : "Stabil";
    return {
      agentId: entry.agentId, name: entry.name, team: entry.team, batchName: entry.batchName,
      serviceType: entry.serviceType, sessionsAudited: entry.sessionsAudited,
      findingsCount: entry.findingsCount, monthlyScores, quarterScores, periodScore,
      monthsAtTarget: `${auditedScores.filter((score) => score >= SIDAK_COMPLIANCE_TARGET).length}/${auditedScores.length}`,
      rank: 0, trend,
    };
  });
  for (const serviceType of services) {
    const ordered = agents.filter((row) => row.serviceType === serviceType)
      .sort((a, b) => (b.periodScore ?? -1) - (a.periodScore ?? -1) || a.findingsCount - b.findingsCount || a.name.localeCompare(b.name, "id"));
    ordered.forEach((agent, index) => { agent.rank = index + 1; });
  }

  const [indicators, weightResult] = await Promise.all([getIndicators(), getAllServiceWeights()]);
  if (weightResult.error) throw new Error("Gagal memuat bobot layanan laporan.");
  const serviceWeights = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, weightResult.data ?? []);
  const scoringLoaders = createPeriodScoringLoaders(allPeriods);
  const contexts = new Map<string, Promise<PeriodScoringContext>>();
  const contextFor = (serviceType: ServiceType, periodId: string) => {
    const key = `${serviceType}:${periodId}`;
    let context = contexts.get(key);
    if (!context) {
      context = loadPeriodScoringContext(
        serviceType,
        periodId,
        indicators,
        serviceWeights[serviceType],
        scoringLoaders,
      );
      contexts.set(key, context);
    }
    return context;
  };
  const paretoContextLoads = services.flatMap((serviceType) => months
    .map((month) => periodByYearMonth.get(`${input.year}:${month}`))
    .filter((period): period is QAPeriod => period !== undefined)
    .map((period) => ({ serviceType, periodId: period.id })));
  for (let index = 0; index < paretoContextLoads.length; index += 4) {
    await Promise.all(paretoContextLoads.slice(index, index + 4)
      .map(({ serviceType, periodId }) => contextFor(serviceType, periodId)));
  }
  const pareto = await buildPareto(
    services, months, input.year, sourceRows, dashboardCache, periodByYearMonth, contextFor, indicators,
  );
  const dataTimestamp = new Date().toISOString();
  const currentMonth = now.month;
  const temporaryMonths = input.year === now.year && input.startMonth <= currentMonth && input.endMonth >= currentMonth
    ? [currentMonth]
    : [];
  const versionIds = new Set(ruleVersions.map((item) => item.versionId).filter((value): value is string => value !== null));
  const agentName = input.pesertaId
    ? sourceRows.find((row) => row.peserta_id === input.pesertaId)?.profiler_peserta.nama ?? null
    : null;
  const selectedIndicator = indicators.find((item) => item.id === input.indicatorId);
  const indicatorName = selectedIndicator ? formatQAIndicatorName(selectedIndicator) : null;

  return {
    metadata: {
      mode: input.pesertaId ? "individu" : "layanan",
      agentId: input.pesertaId ?? null,
      agentName,
      indicatorId: input.indicatorId ?? null,
      indicatorName,
      indicatorScope: "detail-only",
      allowedServiceTypes: allowedServices ?? null,
      showArchived: input.showArchived ?? false,
      year: input.year,
      generatedAtJakarta: new Date(dataTimestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "medium" }),
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      serviceType: input.serviceType ?? null,
      generatedAt: dataTimestamp,
      temporaryMonths,
      ruleVersions,
      mixedRuleVersions: versionIds.size > 1,
    },
    monthly: monthlyAndQuarterRows,
    teams: teamAggregates,
    agents,
    pareto,
    details: currentDetails,
  };
}
