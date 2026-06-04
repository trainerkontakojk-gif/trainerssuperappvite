import { supabaseAdmin } from "../../lib/supabase";
import type {
  DashboardAgentWithMetrics,
  DashboardTemuanRow,
} from "./dashboard-types";
import {
  getDashboardServiceLabel,
  toDashboardFolderRows,
  toDashboardRuleIndicators,
  toDashboardScoreRows,
  toDashboardServiceSet,
  toDashboardTemuanRows,
  toDashboardWeightMap,
  toParetoCategory,
  withDashboardAgentMetrics,
} from "./dashboard-types";
import { groupTemuanByAgent, getScoreRows } from "./dashboard-aggregation";
import { buildDashboardTrends } from "./dashboard-trends";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  isServiceType,
  VALID_SERVICE_TYPES,
} from "../../lib/scoring";
import type {
  ServiceType,
  DashboardData,
  DashboardSummary,
  TopAgentData,
  ParetoData,
  QAIndicator,
  ServiceWeight,
} from "@trainers/types";
import {
  isCountableFinding,
  emptyDashboardResponse,
} from "./shared-constants";
import { roundTo } from "../../lib/math-utils";
import { getFolderNamesByIds, getFoldersByIds } from "./access-scope";
import { getPeriods, getIndicators } from "./period-indicator";
import { getSoftDeletedPesertaIds } from "./agent-directory";
import { resolveEffectiveRuleVersionForPeriod } from "./rule-version-resolver";

export async function getDashboardData(params: {
  period_ids?: string[];
  service_type?: string;
  folder_ids?: string[];
  year?: number;
  peserta_id?: string;
  agent_ids?: string[];
  showArchived?: boolean;
  startMonth?: number;
  endMonth?: number;
  allowedServiceTypes?: ServiceType[];
  limit?: number;
}): Promise<DashboardData> {
  const [periods, indicators, weights] = await Promise.all([
    getPeriods(),
    getIndicators(),
    supabaseAdmin.from("qa_service_weights").select("*"),
  ]);

  const excludedIds = params.showArchived
    ? []
    : await getSoftDeletedPesertaIds();

  const allowedSvcs =
    params.allowedServiceTypes && params.allowedServiceTypes.length > 0
      ? params.allowedServiceTypes
      : null;

  const folderNames =
    params.folder_ids && params.folder_ids.length > 0
      ? await getFolderNamesByIds(params.folder_ids)
      : null;

  let query = supabaseAdmin
    .from("qa_temuan")
    .select("*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan)");

  if (params.service_type && params.service_type !== "all") {
    if (allowedSvcs && !allowedSvcs.includes(params.service_type as ServiceType)) {
      return emptyDashboardResponse(periods);
    }
    query = query.eq("service_type", params.service_type);
  } else if (allowedSvcs) {
    query = query.in("service_type", allowedSvcs);
  }
  if (params.period_ids && params.period_ids.length > 0) {
    query = query.in("period_id", params.period_ids);
  }
  if (params.year) {
    query = query.eq("tahun", params.year);
  }
  if (params.peserta_id) {
    query = query.eq("peserta_id", params.peserta_id);
  }
  if (params.agent_ids && params.agent_ids.length > 0) {
    query = query.in("peserta_id", params.agent_ids);
  }

  if (folderNames && folderNames.length > 0) {
    query = query.in("profiler_peserta.batch_name", folderNames);
  }

  if (excludedIds.length > 0) {
    query = query.not("peserta_id", "in", `(${excludedIds.join(",")})`);
  }

  let distinctQuery = supabaseAdmin
    .from("qa_temuan")
    .select("service_type");

  if (allowedSvcs) {
    distinctQuery = distinctQuery.in("service_type", allowedSvcs);
  }
  if (params.period_ids && params.period_ids.length > 0) {
    distinctQuery = distinctQuery.in("period_id", params.period_ids);
  }
  if (params.year) {
    distinctQuery = distinctQuery.eq("tahun", params.year);
  }
  if (params.peserta_id) {
    distinctQuery = distinctQuery.eq("peserta_id", params.peserta_id);
  }
  if (params.agent_ids && params.agent_ids.length > 0) {
    distinctQuery = distinctQuery.in("peserta_id", params.agent_ids);
  }
  if (excludedIds.length > 0) {
    distinctQuery = distinctQuery.not("peserta_id", "in", `(${excludedIds.join(",")})`);
  }

  const [{ data: allTemuan }, { data: distinctServiceRows }] = await Promise.all([
    query,
    distinctQuery,
  ]);
  const rows = toDashboardTemuanRows(allTemuan);

  const weightMap = toDashboardWeightMap(weights?.data);

  // 1. Find all unique combinations of (service_type, period_id) in rows
  const uniqueCombos = new Set<string>();
  for (const r of rows) {
    if (r.service_type && r.period_id) {
      uniqueCombos.add(`${r.service_type}:${r.period_id}`);
    }
  }

  // 2. Resolve effective rule versions for each combo concurrently
  const ruleWeightMap: Record<string, ServiceWeight> = {};
  const ruleIndicatorsMap: Record<string, QAIndicator[]> = {};

  await Promise.all(
    Array.from(uniqueCombos).map(async (combo) => {
      const [svc, pid] = combo.split(":");
      const rule = await resolveEffectiveRuleVersionForPeriod(svc, pid);
      if (rule) {
        ruleWeightMap[combo] = {
          service_type: isServiceType(svc) ? svc : "call",
          critical_weight: rule.critical_weight,
          non_critical_weight: rule.non_critical_weight,
          scoring_mode: rule.scoring_mode,
        };
        // Fetch indicators snapshot
        const { data: snapshotInds } = await supabaseAdmin
          .from("qa_service_rule_indicators")
          .select("*")
          .eq("rule_version_id", rule.id);
        if (snapshotInds && snapshotInds.length > 0) {
          ruleIndicatorsMap[combo] = toDashboardRuleIndicators(snapshotInds);
        }
      }
    })
  );

  const auditedAgents = groupTemuanByAgent(rows);
  const auditedAgentsWithMetrics: DashboardAgentWithMetrics[] = [];
  let totalFindings = 0;
  let totalScore = 0;
  let zeroErrorCount = 0;
  let complianceCount = 0;
  const complianceThreshold = 95;

  const serviceDefects: Record<string, number> = {};
  const paretoMap = new Map<
    string,
    { name: string; count: number; cat: ParetoData["category"] }
  >();
  let criticalCount = 0;
  let nonCriticalCount = 0;

  for (const agent of auditedAgents) {
    // Group this agent's rows by period_id
    const rowsByPeriod = new Map<string, DashboardTemuanRow[]>();
    for (const r of agent.rows) {
      if (!rowsByPeriod.has(r.period_id)) {
        rowsByPeriod.set(r.period_id, []);
      }
      rowsByPeriod.get(r.period_id)!.push(r);
    }

    let agentScoreSum = 0;
    let agentPeriodsCount = 0;
    let agentFindings = 0;
    let hasCritical = false;

    for (const [pid, periodRows] of rowsByPeriod) {
      const svc = periodRows[0]?.service_type ?? "call";
      const comboKey = `${svc}:${pid}`;
      const weight =
        ruleWeightMap[comboKey] ??
        weightMap[svc] ??
        DEFAULT_SERVICE_WEIGHTS[svc as ServiceType] ??
        DEFAULT_SERVICE_WEIGHTS["call"];

      const agentIndicators =
        ruleIndicatorsMap[comboKey] ??
        indicators.filter((i) => i.service_type === svc);

      const scoreRows = toDashboardScoreRows(getScoreRows(periodRows));
      const score = calculateQAScoreFromTemuan(agentIndicators, scoreRows, weight);

      agentScoreSum += score.finalScore;
      agentPeriodsCount++;

      const findingRows = periodRows.filter((r) => isCountableFinding(r));
      agentFindings += findingRows.length;

      const agentServiceType = svc;
      serviceDefects[agentServiceType] =
        (serviceDefects[agentServiceType] ?? 0) + findingRows.length;

      const periodHasCritical = periodRows.some((r) => {
        if (r.is_phantom_padding === true) return false;
        if (r.nilai === null || r.nilai === undefined || Number(r.nilai) !== 0) return false;
        const ind = agentIndicators.find((i) => i.id === r.indicator_id) || indicators.find((i) => i.id === r.indicator_id);
        return ind?.category === "critical";
      });
      if (periodHasCritical) hasCritical = true;

      for (const row of findingRows) {
        const ind = agentIndicators.find((i) => i.id === row.indicator_id) || indicators.find((i) => i.id === row.indicator_id);
        if (ind) {
          const key = ind.name;
          paretoMap.set(key, {
            name: key,
            count: (paretoMap.get(key)?.count ?? 0) + 1,
            cat: toParetoCategory(ind.category),
          });
          if (ind.category === "critical") criticalCount++;
          else if (ind.category === "non_critical") nonCriticalCount++;
        }
      }
    }

    const finalAgentScore = agentPeriodsCount > 0 ? agentScoreSum / agentPeriodsCount : 100;

    auditedAgentsWithMetrics.push(
      withDashboardAgentMetrics(agent, {
        finalAgentScore,
        agentFindings,
        hasCritical,
      }),
    );

    totalFindings += agentFindings;
    totalScore += finalAgentScore;

    if (agentFindings === 0) zeroErrorCount++;
    if (finalAgentScore >= complianceThreshold) complianceCount++;
  }

  const trends = buildDashboardTrends({
    periods,
    rows,
    indicators,
    weightMap,
    year: params.year ?? new Date().getFullYear(),
    startMonth: params.startMonth,
    endMonth: params.endMonth,
    isCountableFinding,
    calculateScore: (scoreRows, serviceType, periodId) => {
      const comboKey = `${serviceType}:${periodId}`;
      const weight =
        ruleWeightMap[comboKey] ??
        weightMap[serviceType] ??
        DEFAULT_SERVICE_WEIGHTS[serviceType as ServiceType] ??
        DEFAULT_SERVICE_WEIGHTS.call;
      const agentIndicators =
        ruleIndicatorsMap[comboKey] ??
        indicators.filter((i) => i.service_type === serviceType);
      return calculateQAScoreFromTemuan(agentIndicators, toDashboardScoreRows(scoreRows), weight).finalScore;
    },
  });

  const totalAgents = auditedAgents.length;

  let summary: DashboardSummary;
  if (
    params.period_ids?.length === 1 &&
    params.service_type &&
    params.service_type !== "all"
  ) {
    summary = {
      totalDefects: totalFindings,
      avgDefectsPerAudit: roundTo(
        totalAgents > 0 ? totalFindings / totalAgents : 0,
        2,
      ),
      zeroErrorRate: roundTo(
        totalAgents > 0 ? (zeroErrorCount / totalAgents) * 100 : 0,
        2,
      ),
      avgAgentScore: roundTo(totalAgents > 0 ? totalScore / totalAgents : 0, 2),
      complianceRate: roundTo(
        totalAgents > 0 ? (complianceCount / totalAgents) * 100 : 0,
        2,
      ),
      complianceCount,
      totalAgents,
    };
    // Keep dashboard summary on the app scoring engine; SQL MV/cache formulas are not scoring-equivalent.
  } else {
    if (trends.periodMetrics && trends.periodMetrics.length > 0) {
      const metrics = trends.periodMetrics;
      const totalDefects = metrics.reduce((acc, m) => acc + m.total, 0);
      const totalAudited = metrics.reduce((acc, m) => acc + m.totalAudited, 0);
      const totalCompliant = metrics.reduce((acc, m) => acc + m.compliance, 0);
      const avgAgentScoreSum = metrics.reduce((acc, m) => acc + m.avgAgentScore * m.totalAudited, 0);
      const totalZeroError = metrics.reduce((acc, m) => {
        const zCount = Math.round((m.zero / 100) * m.totalAudited);
        return acc + zCount;
      }, 0);

      summary = {
        totalDefects,
        avgDefectsPerAudit: totalAgents > 0 ? roundTo(totalDefects / totalAgents, 2) : 0,
        zeroErrorRate: totalAudited > 0 ? roundTo((totalZeroError / totalAudited) * 100, 2) : 0,
        avgAgentScore: totalAudited > 0 ? roundTo(avgAgentScoreSum / totalAudited, 2) : 0,
        complianceRate: totalAudited > 0 ? roundTo((totalCompliant / totalAudited) * 100, 2) : 0,
        complianceCount: metrics.length > 0 ? roundTo(totalCompliant / metrics.length, 1) : 0,
        totalAgents,
      };
    } else {
      summary = {
        totalDefects: 0,
        avgDefectsPerAudit: 0,
        zeroErrorRate: 0,
        avgAgentScore: 0,
        complianceRate: 0,
        complianceCount: 0,
        totalAgents: 0,
      };
    }
  }

  const limit = params.limit !== undefined ? params.limit : 20;
  const topAgentsAll: TopAgentData[] = auditedAgentsWithMetrics
    .map((agent) => ({
      agentId: agent.id,
      nama: agent.nama,
      batch: agent.batch_name,
      tim: agent.tim,
      jabatan: agent.jabatan,
      defects: agent.agentFindings,
      score: roundTo(agent.finalAgentScore, 2),
      hasCritical: agent.hasCritical,
    }))
    .sort((a, b) => b.defects - a.defects || a.nama.localeCompare(b.nama));

  const topAgents = limit > 0 ? topAgentsAll.slice(0, limit) : topAgentsAll;

  const paretoArray: ParetoData[] = Array.from(paretoMap.entries())
    .map(([_key, val]) => ({
      name: val.name,
      fullName: val.name,
      count: val.count,
      cumulative: 0,
      category: val.cat,
    }))
    .sort((a, b) => b.count - a.count);

  let cumulative = 0;
  for (const p of paretoArray) {
    cumulative += p.count;
    p.cumulative = cumulative;
  }

  let folderIds: { id: string; name: string }[];
  if (params.folder_ids && params.folder_ids.length > 0) {
    const matchedFolders = await getFoldersByIds(params.folder_ids);
    folderIds = matchedFolders;
  } else {
    const { data: allFolders } = await supabaseAdmin
      .from("profiler_folders")
      .select("id, name")
      .order("name");
    folderIds = toDashboardFolderRows(allFolders);
  }

  const availableYears = [
    ...new Set(
      rows
        .map((r) => r.tahun)
        .filter((year): year is number => typeof year === "number"),
    ),
  ].sort((a, b) => b - a);
  const currentYear = params.year ?? new Date().getFullYear();

  const distinctSvcs = toDashboardServiceSet(distinctServiceRows);
  const availableServices = allowedSvcs
    ? allowedSvcs.filter((svc) => distinctSvcs.has(svc))
    : VALID_SERVICE_TYPES.filter((svc) => distinctSvcs.has(svc));

  return {
    periods,
    folders: folderIds,
    summary,
    serviceData: Object.entries(serviceDefects).map(([svc, total]) => ({
      name: getDashboardServiceLabel(svc),
      serviceType: svc,
      total,
      severity:
        total > 50
          ? "Critical"
          : total > 30
            ? "High"
            : total > 15
              ? "Medium"
              : "Low",
    })),
    topAgents,
    paretoData: paretoArray,
    donutData: {
      critical: criticalCount,
      nonCritical: nonCriticalCount,
      total: criticalCount + nonCriticalCount,
    },
    ...trends,
    availableYears,
    currentYear,
    availableServices,
  };
}
