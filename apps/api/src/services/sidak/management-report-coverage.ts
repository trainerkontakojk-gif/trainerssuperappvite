import type {
  ServiceType,
  SidakManagementReportCoverage,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { applyPesertaScope, pesertaScopeFromIds } from "../access/scope";
import { getAgents, isAgentExcluded } from "./agent-directory";

const TARGET_SESSIONS_PER_MONTH = 5;

type ReportRosterAgent = {
  id: string;
  nama: string;
  tim: string | null;
  batch_name: string | null;
  jabatan: string | null;
};

export async function getEligibleReportAgents(
  agentIds: string[] | null,
  showArchived?: boolean,
): Promise<ReportRosterAgent[]> {
  if (agentIds?.length === 0) return [];
  const agents: ReportRosterAgent[] = await getAgents({
    agent_ids: agentIds ?? undefined,
    showArchived,
  });
  return agents.filter((agent) =>
    !isAgentExcluded(agent.tim, agent.batch_name, agent.jabatan),
  );
}

async function loadSoftDeletedAgentIds(agentIds: string[] | null): Promise<Set<string>> {
  const scope = pesertaScopeFromIds(agentIds);
  const rows = await fetchAllPages<{ id: string }>({
    build: ({ from, to }) =>
      applyPesertaScope(
        supabaseAdmin
          .from("profiler_peserta")
          .select("id, akun:profiles!akun_id!inner(is_deleted)")
          .eq("akun.is_deleted", true)
          .order("id")
          .range(from, to),
        scope,
        "id",
      ),
  });
  return new Set(rows.map(({ id }) => id));
}

export async function buildAuditCoverage({
  agentIds, showArchived, services, periods, sessionsByAgentPeriod,
}: {
  agentIds: string[] | null;
  showArchived?: boolean;
  services: ServiceType[];
  periods: Array<{ month: number; periodId?: string }>;
  sessionsByAgentPeriod: ReadonlyMap<string, number>;
}): Promise<SidakManagementReportCoverage> {
  const roster = await getEligibleReportAgents(agentIds, showArchived);
  // The legacy archive filter includes deleted accounts when enabled.
  const deletedIds = showArchived && roster.length
    ? await loadSoftDeletedAgentIds(agentIds)
    : new Set<string>();
  const agents = roster.filter(({ id }) => !deletedIds.has(id))
    .map((agent) => {
      const monthlySessions: Partial<Record<number, number>> = {};
      let monthsAtTarget = 0;
      for (const { month, periodId } of periods) {
        if (!periodId) continue;
        const sessions = services.reduce((total, service) =>
          total + (sessionsByAgentPeriod.get(`${service}:${periodId}:${agent.id}`) ?? 0), 0);
        if (sessions > 0) monthlySessions[month] = sessions;
        if (sessions >= TARGET_SESSIONS_PER_MONTH) monthsAtTarget++;
      }
      return {
        agentId: agent.id,
        name: agent.nama,
        team: agent.tim?.trim() || "Tanpa tim",
        batchName: agent.batch_name?.trim() || "Tanpa batch",
        monthlySessions,
        monthsAtTarget,
      };
    });
  const activeAgents = agents.length;
  const monthly = periods.map(({ month }) => {
    let auditedAgents = 0;
    let agentsAtTarget = 0;
    for (const { monthlySessions } of agents) {
      const sessions = monthlySessions[month] ?? 0;
      if (sessions > 0) auditedAgents++;
      if (sessions >= TARGET_SESSIONS_PER_MONTH) agentsAtTarget++;
    }
    return {
      month,
      activeAgents,
      auditedAgents,
      coverageRate: activeAgents ? Math.round(auditedAgents / activeAgents * 10000) / 100 : null,
      agentsAtTarget,
      agentsBelowTarget: auditedAgents - agentsAtTarget,
      unauditedAgents: activeAgents - auditedAgents,
    };
  });
  return { targetSessionsPerMonth: TARGET_SESSIONS_PER_MONTH, monthly, agents };
}
