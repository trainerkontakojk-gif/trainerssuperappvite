import {
  formatQAIndicatorName,
  type QAIndicator,
  type QAPeriod,
  type ServiceType,
  type SidakManagementReportCriticalRow,
  type SidakManagementReportFollowUpRow,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { getLeaderScopeSnapshot } from "../access/leader-scope";
import { resolveDashboardIndicator } from "./dashboard-data";
import { SIDAK_COMPLIANCE_TARGET } from "./shared-constants";
import type { MonthlyAgent, ScopedSourceRow } from "./management-report";
import type { PeriodScoringContext } from "./period-scoring-context";

export type ManagementReportLeaderDescriptor = {
  leaderId: string;
  leaderName: string;
  pesertaIds: string[];
  serviceTypes: ServiceType[];
};

export async function getVisibleSidakLeaders(
  role: string | undefined,
  userId: string | undefined,
): Promise<ManagementReportLeaderDescriptor[]> {
  const normalizedRole = role ?? "";
  if (!userId || !["admin", "trainer", "leader"].includes(normalizedRole)) return [];
  let profilesQuery = supabaseAdmin.from("profiles").select("id, full_name").eq("role", "leader");
  if (normalizedRole === "leader") profilesQuery = profilesQuery.eq("id", userId);
  const { data, error } = await profilesQuery;
  if (error) throw new Error("Gagal memuat daftar leader laporan.");
  const profiles = data ?? [];
  const leaders: ManagementReportLeaderDescriptor[] = [];
  for (const profile of profiles) {
    const snapshot = await getLeaderScopeSnapshot(profile.id, "sidak");
    if (snapshot.requestIds.length === 0) continue;
    leaders.push({
      leaderId: profile.id,
      leaderName: profile.full_name?.trim() || profile.id,
      pesertaIds: snapshot.pesertaIds,
      serviceTypes: snapshot.serviceTypes,
    });
  }
  return leaders;
}

type FollowUpAgentStats = {
  agentId: string;
  name: string;
  team: string;
  batchName: string;
  reasons: Set<SidakManagementReportFollowUpRow["reasons"][number]>;
  parameterCounts: Map<string, { parameter: string; category: "critical" | "non_critical"; count: number; months: Set<number> }>;
  scores: Map<number, number>;
};

export async function buildCriticalAndFollowUps(input: {
  services: ServiceType[];
  months: number[];
  year: number;
  sourceRows: ScopedSourceRow[];
  periodByYearMonth: Map<string, QAPeriod>;
  agentCache: Map<string, MonthlyAgent[]>;
  contextFor: (serviceType: ServiceType, periodId: string) => Promise<PeriodScoringContext>;
  indicators: QAIndicator[];
}): Promise<{ critical: SidakManagementReportCriticalRow[]; followUps: SidakManagementReportFollowUpRow[] }> {
  const critical: SidakManagementReportCriticalRow[] = [];
  const followUpStats = new Map<string, FollowUpAgentStats>();
  for (const serviceType of input.services) {
    for (const month of input.months) {
      for (const agent of input.agentCache.get(`${serviceType}:${input.year}:${month}`) ?? []) {
        const key = `${serviceType}:${agent.id}`;
        const current = followUpStats.get(key) ?? {
          agentId: agent.id,
          name: agent.name,
          team: agent.team,
          batchName: agent.batch,
          reasons: new Set<SidakManagementReportFollowUpRow["reasons"][number]>(),
          parameterCounts: new Map(),
          scores: new Map<number, number>(),
        };
        current.scores.set(month, agent.score);
        followUpStats.set(key, current);
      }
    }
  }
  for (const serviceType of input.services) {
    for (const month of input.months) {
      const period = input.periodByYearMonth.get(`${input.year}:${month}`);
      if (!period) continue;
      const monthRows = input.sourceRows.filter((row) => row.service_type === serviceType && row.period_id === period.id &&
        row.is_countable === true && row.is_phantom_padding !== true);
      if (!monthRows.length) continue;
      const context = await input.contextFor(serviceType, period.id);
      for (const row of monthRows) {
        const indicator = resolveDashboardIndicator(row, context, input.indicators);
        if (!indicator) continue;
        const name = formatQAIndicatorName(indicator);
        if (indicator.category === "critical") {
          critical.push({ ...row, category: "critical", month, year: input.year, parameterName: name });
        }
        const key = `${serviceType}:${row.peserta_id}`;
        const current = followUpStats.get(key) ?? {
          agentId: row.peserta_id,
          name: row.profiler_peserta.nama ?? "Tanpa nama",
          team: row.profiler_peserta.tim?.trim() || "Tanpa tim",
          batchName: row.profiler_peserta.batch_name?.trim() || "Tanpa batch",
          reasons: new Set<SidakManagementReportFollowUpRow["reasons"][number]>(),
          parameterCounts: new Map(),
          scores: new Map<number, number>(),
        };
        const parameterKey = `${serviceType}:${indicator.id}`;
        const parameter = current.parameterCounts.get(parameterKey) ?? {
          parameter: name,
          category: indicator.category === "critical" ? "critical" as const : "non_critical" as const,
          count: 0,
          months: new Set<number>(),
        };
        parameter.count += 1;
        if (indicator.category === "critical") parameter.category = "critical";
        parameter.months.add(month);
        current.parameterCounts.set(parameterKey, parameter);
        followUpStats.set(key, current);
      }
    }
  }
  for (const stat of followUpStats.values()) {
    const periodScores = [...stat.scores.entries()].sort(([a], [b]) => a - b);
    if (periodScores.length && periodScores.reduce((sum, [, score]) => sum + score, 0) / periodScores.length < SIDAK_COMPLIANCE_TARGET) {
      stat.reasons.add("score_below_target");
    }
    if (periodScores.some(([month, score], index) =>
      index >= 2 &&
      periodScores[index - 1]![0] === month - 1 &&
      periodScores[index - 2]![0] === month - 2 &&
      score < periodScores[index - 1]![1] &&
      periodScores[index - 1]![1] < periodScores[index - 2]![1],
    )) {
      stat.reasons.add("consecutive_decline");
    }
    for (const parameter of stat.parameterCounts.values()) {
      if (parameter.months.size >= 2) stat.reasons.add("repeated_parameter");
    }
  }
  const followUpsByAgent = new Map<string, SidakManagementReportFollowUpRow>();
  const repeatedMonthsByAgent = new Map<string, Set<number>>();
  for (const stat of followUpStats.values()) {
    if (stat.reasons.size === 0) continue;
    const worstParameters = [...stat.parameterCounts.values()]
      .sort((a, b) => b.count - a.count || Number(b.category === "critical") - Number(a.category === "critical") || a.parameter.localeCompare(b.parameter, "id"))
      .slice(0, 3)
      .map(({ parameter, category, count }) => ({ parameter, category, count }));
    const repeatedMonths = repeatedMonthsByAgent.get(stat.agentId) ?? new Set<number>();
    for (const month of [...stat.parameterCounts.values()]
      .filter((parameter) => parameter.months.size >= 2)
      .flatMap((parameter) => [...parameter.months])) repeatedMonths.add(month);
    repeatedMonthsByAgent.set(stat.agentId, repeatedMonths);
    const entry = followUpsByAgent.get(stat.agentId) ?? {
      agentId: stat.agentId,
      name: stat.name,
      team: stat.team,
      batchName: stat.batchName,
      reasons: [],
      worstParameters: [],
      repeatMonthCount: 0,
    };
    entry.reasons = [...new Set([...entry.reasons, ...stat.reasons])];
    entry.worstParameters = [...entry.worstParameters, ...worstParameters]
      .sort((a, b) => b.count - a.count || Number(b.category === "critical") - Number(a.category === "critical") || a.parameter.localeCompare(b.parameter, "id"))
      .slice(0, 3);
    entry.repeatMonthCount = repeatedMonths.size;
    followUpsByAgent.set(stat.agentId, entry);
  }
  return {
    critical,
    followUps: [...followUpsByAgent.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "id") || a.agentId.localeCompare(b.agentId),
    ),
  };
}
