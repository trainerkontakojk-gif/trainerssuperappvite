import { roundTo } from "../../lib/math-utils";
import type { QAPeriod, ServiceWeight } from "@trainers/types";
import type { DashboardTemuanRow } from "./dashboard-types";
import { getScoreRows } from "./dashboard-aggregation";



export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

export type BuildDashboardTrendsParams = {
  periods: QAPeriod[];
  rows: DashboardTemuanRow[];
  indicators: Array<{ id: string; name: string }>;
  weightMap: Record<string, ServiceWeight>;
  year: number;
  startMonth?: number;
  endMonth?: number;
  isCountableFinding: (row: DashboardTemuanRow) => boolean;
  calculateScore: (rows: DashboardTemuanRow[], serviceType: string, periodId: string) => number;
};

export function buildDashboardTrends(params: BuildDashboardTrendsParams) {
  const trendYear = params.year;
  let filteredPeriods = params.periods
    .filter((p: any) => p.year === trendYear)
    .filter((p: any) => !params.startMonth || p.month >= params.startMonth)
    .filter((p: any) => !params.endMonth || p.month <= params.endMonth)
    .sort((a: any, b: any) => a.month - b.month);

  const rows = params.rows;

  if (filteredPeriods.length > 0 && rows.length > 0) {
    const validPeriodIds = new Set(filteredPeriods.map((p: any) => p.id));

    const rowsByPeriod = new Map<string, DashboardTemuanRow[]>();
    for (const row of rows) {
      if (validPeriodIds.has(row.period_id)) {
        if (!rowsByPeriod.has(row.period_id)) rowsByPeriod.set(row.period_id, []);
        rowsByPeriod.get(row.period_id)!.push(row);
      }
    }

    filteredPeriods = filteredPeriods.filter((p: any) => rowsByPeriod.has(p.id));

    const agentPeriodGroups = new Map<string, DashboardTemuanRow[]>();
    for (const [pid, periodRows] of rowsByPeriod) {
      const agentGroups = new Map<string, DashboardTemuanRow[]>();
      for (const row of periodRows) {
        const key = `${pid}:${row.peserta_id}`;
        if (!agentGroups.has(key)) agentGroups.set(key, []);
        agentGroups.get(key)!.push(row);
      }
      for (const [key, agentRows] of agentGroups) {
        agentPeriodGroups.set(key, agentRows);
      }
    }

    const periodMetrics = filteredPeriods.map((period: any) => {
      const periodRows = rowsByPeriod.get(period.id) ?? [];
      const periodAgentKeys = [...agentPeriodGroups.keys()].filter(
        (k: string) => k.startsWith(period.id + ":")
      );

      const totalAudited = periodAgentKeys.length;
      const totalFindings = periodRows.filter((r: any) => params.isCountableFinding(r)).length;

      let zeroCount = 0;
      let complianceCount = 0;
      let totalScore = 0;

      for (const agentKey of periodAgentKeys) {
        const agentRows = agentPeriodGroups.get(agentKey)!;
        const svc = agentRows[0]?.service_type ?? "call";
        const scoreRows = getScoreRows(agentRows);
        const finalScore = params.calculateScore(scoreRows, svc, period.id);

        const findingRows = agentRows.filter((r: any) => params.isCountableFinding(r));
        if (findingRows.length === 0) zeroCount++;
        if (finalScore >= 95) complianceCount++;
        totalScore += finalScore;
      }

      return {
        periodId: period.id,
        label: `${MONTHS_SHORT[period.month - 1]} ${String(period.year).slice(-2)}`,
        total: totalFindings,
        avg: totalAudited > 0 ? roundTo(totalFindings / totalAudited, 1) : 0,
        zero: totalAudited > 0 ? roundTo((zeroCount / totalAudited) * 100, 1) : 0,
        compliance: complianceCount,
        avgAgentScore: totalAudited > 0 ? roundTo(totalScore / totalAudited, 1) : 0,
        totalAudited,
      };
    });

    const paramCounts: Record<string, Record<string, number>> = {};
    const totalFindingsByPeriod: Record<string, number> = {};

    for (const [pid, periodRows] of rowsByPeriod) {
      for (const row of periodRows) {
        if (!params.isCountableFinding(row)) continue;
        totalFindingsByPeriod[pid] = (totalFindingsByPeriod[pid] || 0) + 1;

        const indicator = params.indicators.find((i: any) => i.id === row.indicator_id);
        const paramName = indicator?.name || "Unknown";
        if (!paramCounts[paramName]) paramCounts[paramName] = {};
        paramCounts[paramName][pid] = (paramCounts[paramName][pid] || 0) + 1;
      }
    }

    const topParams = Object.entries(paramCounts)
      .map(([name, periodCounts]) => ({
        name,
        total: Object.values(periodCounts).reduce((a: number, b: number) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map((p) => p.name);

    const labels = filteredPeriods.map((p: any) =>
      `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`
    );

    const datasets = [
      {
        label: "Total Temuan",
        data: filteredPeriods.map((p: any) => totalFindingsByPeriod[p.id] || 0),
        isTotal: true,
      },
      ...topParams.map((name) => ({
        label: name,
        data: filteredPeriods.map((p: any) => paramCounts[name][p.id] || 0),
        isTotal: false,
      })),
    ];

    const sparklines = {
      "total-defects": periodMetrics.map((m) => ({ label: m.label, value: m.total })),
      "avg-defects": periodMetrics.map((m) => ({ label: m.label, value: m.avg })),
      "avg-score": periodMetrics.map((m) => ({ label: m.label, value: m.avgAgentScore })),
      "compliance": periodMetrics.map((m) => ({ label: m.label, value: m.compliance })),
    };

    return { paramTrend: { labels, datasets }, sparklines };
  }

  return { paramTrend: { labels: [], datasets: [] }, sparklines: {} };
}
