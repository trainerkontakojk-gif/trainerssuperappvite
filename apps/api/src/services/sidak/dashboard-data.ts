import { supabaseAdmin } from "../../lib/supabase";
import type { DashboardTemuanRow } from "./dashboard-types";
import { groupTemuanByAgent, getScoreRows } from "./dashboard-aggregation";
import { buildDashboardTrends } from "./dashboard-trends";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  SERVICE_LABELS,
  VALID_SERVICE_TYPES,
} from "../../lib/scoring";
import type {
  ServiceType,
  DashboardData,
  DashboardSummary,
  TopAgentData,
  ParetoData,
} from "@trainers/types";
import {
  isCountableFinding,
  emptyDashboardResponse,
} from "./shared-constants";
import { roundTo } from "../../lib/math-utils";
import { getFolderNamesByIds, getFoldersByIds } from "./access-scope";
import { getPeriods, getIndicators } from "./period-indicator";
import { getSoftDeletedPesertaIds } from "./agent-directory";

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
  const rows = allTemuan ?? [];

  const weightMap = (weights?.data ?? []).reduce(
    (acc: Record<string, any>, w: any) => {
      acc[w.service_type] = w;
      return acc;
    },
    {},
  );

  const auditedAgents = groupTemuanByAgent(rows as DashboardTemuanRow[]);
  let totalFindings = 0;
  let totalScore = 0;
  let zeroErrorCount = 0;
  let complianceCount = 0;
  const complianceThreshold = 95;

  const serviceDefects: Record<string, number> = {};
  const paretoMap = new Map<
    string,
    { name: string; count: number; cat: string }
  >();
  let criticalCount = 0;
  let nonCriticalCount = 0;

  for (const agent of auditedAgents) {
    const svc = agent.rows[0]?.service_type ?? "call";
    const weight =
      weightMap[svc] ??
      DEFAULT_SERVICE_WEIGHTS[svc as ServiceType] ??
      DEFAULT_SERVICE_WEIGHTS["call"];

    const scoreRows = getScoreRows(agent.rows);
    const score = calculateQAScoreFromTemuan(indicators, scoreRows as any, weight);

    const findingRows = agent.rows.filter((r) => isCountableFinding(r));
    const agentFindings = findingRows.length;
    totalFindings += agentFindings;
    totalScore += score.finalScore;

    if (agentFindings === 0) zeroErrorCount++;
    if (score.finalScore >= complianceThreshold) complianceCount++;

    const agentServiceType = agent.rows[0]?.service_type ?? "unknown";
    serviceDefects[agentServiceType] =
      (serviceDefects[agentServiceType] ?? 0) + agentFindings;

    for (const row of findingRows) {
      const ind = indicators.find((i) => i.id === row.indicator_id);
      if (ind) {
        const key = ind.name;
        paretoMap.set(key, {
          name: key,
          count: (paretoMap.get(key)?.count ?? 0) + 1,
          cat: ind.category,
        });
        if (ind.category === "critical") criticalCount++;
        else if (ind.category === "non_critical") nonCriticalCount++;
      }
    }
  }

  const totalAgents = auditedAgents.length;

  let summary: DashboardSummary = {
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

  if (
    params.period_ids?.length === 1 &&
    params.service_type &&
    params.service_type !== "all"
  ) {
    try {
      const { data: mvRow } = await supabaseAdmin
        .from("mv_qa_period_summary")
        .select("*")
        .eq("period_id", params.period_ids[0])
        .eq("service_type", params.service_type)
        .maybeSingle();
      if (mvRow) {
        summary = {
          totalDefects: Number(mvRow.total_defects),
          avgDefectsPerAudit: Number(mvRow.avg_defects_per_audit),
          zeroErrorRate: Number(mvRow.zero_error_rate) * 100,
          avgAgentScore: Number(mvRow.avg_agent_score),
          complianceRate: Number(mvRow.compliance_rate) * 100,
          complianceCount: Number(mvRow.compliance_count),
          totalAgents: Number(mvRow.total_agents),
        };
      } else {
        const { data: cachedPeriod } = await supabaseAdmin
          .from("qa_dashboard_period_summary")
          .select("*")
          .eq("period_id", params.period_ids[0])
          .eq("service_type", params.service_type)
          .maybeSingle();
        if (cachedPeriod) {
          summary = {
            totalDefects: cachedPeriod.total_defects,
            avgDefectsPerAudit: Number(cachedPeriod.avg_defects_per_audit),
            zeroErrorRate: Number(cachedPeriod.zero_error_rate),
            avgAgentScore: Number(cachedPeriod.avg_agent_score),
            complianceRate: Number(cachedPeriod.compliance_rate),
            complianceCount: cachedPeriod.compliance_count,
            totalAgents: cachedPeriod.total_agents,
          };
        }
      }
    } catch {
      // MV unavailable — fall back to raw computed values above
    }
  }

  const limit = params.limit !== undefined ? params.limit : 20;
  const topAgentsAll: TopAgentData[] = auditedAgents
    .map((agent) => {
      const svc = agent.rows[0]?.service_type ?? "call";
      const weight =
        weightMap[svc] ??
        DEFAULT_SERVICE_WEIGHTS[svc as ServiceType] ??
        DEFAULT_SERVICE_WEIGHTS["call"];
      const scoreRows = getScoreRows(agent.rows);
      const score = calculateQAScoreFromTemuan(indicators, scoreRows as any, weight);
      const findingRows = agent.rows.filter((r) => isCountableFinding(r));
      return {
        agentId: agent.id,
        nama: agent.nama,
        batch: agent.batch_name,
        tim: agent.tim,
        jabatan: agent.jabatan,
        defects: findingRows.length,
        score: roundTo(score.finalScore, 2),
        hasCritical: agent.rows.some((r) => {
          if (r.is_phantom_padding === true) return false;
          if (r.nilai === null || r.nilai === undefined || Number(r.nilai) !== 0) return false;
          const ind = indicators.find((i) => i.id === r.indicator_id);
          return ind?.category === "critical";
        }),
      };
    })
    .sort((a, b) => b.defects - a.defects || a.nama.localeCompare(b.nama));

  const topAgents = limit > 0 ? topAgentsAll.slice(0, limit) : topAgentsAll;

  const paretoArray: ParetoData[] = Array.from(paretoMap.entries())
    .map(([_key, val]) => ({
      name: val.name,
      fullName: val.name,
      count: val.count,
      cumulative: 0,
      category: val.cat as any,
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
    folderIds = (allFolders ?? []).map((f: any) => ({ id: f.id, name: f.name }));
  }

  const availableYears = [
    ...new Set(rows.map((r) => r.tahun).filter(Boolean)),
  ].sort((a, b) => b - a) as number[];
  const currentYear = params.year ?? new Date().getFullYear();

  const distinctSvcs = new Set(
    (distinctServiceRows ?? [])
      .map((r: any) => r.service_type)
      .filter((s: any) => typeof s === "string" && s.length > 0),
  );
  const availableServices = allowedSvcs
    ? allowedSvcs.filter((svc) => distinctSvcs.has(svc))
    : VALID_SERVICE_TYPES.filter((svc) => distinctSvcs.has(svc));

  return {
    periods,
    folders: folderIds,
    summary,
    serviceData: Object.entries(serviceDefects).map(([svc, total]) => ({
      name: (SERVICE_LABELS as any)[svc] ?? svc,
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
    ...buildDashboardTrends({
      periods,
      rows: rows as DashboardTemuanRow[],
      indicators,
      weightMap,
      year: params.year ?? new Date().getFullYear(),
      startMonth: params.startMonth,
      endMonth: params.endMonth,
      isCountableFinding,
      calculateScore: (scoreRows, serviceType) => {
        const weight =
          weightMap[serviceType] ??
          DEFAULT_SERVICE_WEIGHTS[serviceType as ServiceType] ??
          DEFAULT_SERVICE_WEIGHTS.call;
        return calculateQAScoreFromTemuan(indicators, scoreRows as any, weight).finalScore;
      },
    }),
    availableYears,
    currentYear,
    availableServices,
  };
}
