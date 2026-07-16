import { supabaseAdmin } from "../../lib/supabase";
import type {
  ServiceType,
  SidakAgentForecastEntry,
  SidakAgentForecastQuickview,
  SidakAgentQuickviewResponse,
  SidakAgentRankQuickview,
} from "@trainers/types";
import { getDashboardData } from "./dashboard-data";
import { generateSidakAgentForecast } from "./forecast";
import {
  getAllFolders,
  resolveScopedServiceType,
  type SidakFilterScope,
} from "./access-scope";

type QuickviewFolder = {
  id: string;
  name: string;
  parent_id: string | null;
};

export interface GetSidakAgentQuickviewParams {
  agentId: string;
  year: number;
  requestedServiceType?: string;
  accessibleAgentIds: string[] | null;
  filterScope: SidakFilterScope | null;
}

const FORECAST_COPY: Record<
  SidakAgentForecastEntry["forecastStatus"],
  Pick<SidakAgentForecastQuickview, "label" | "supportingText">
> = {
  improving: {
    label: "Membaik",
    supportingText: "Temuan diproyeksikan turun",
  },
  declining: {
    label: "Memburuk",
    supportingText: "Temuan diproyeksikan naik",
  },
  stable: {
    label: "Stabil/Stagnan",
    supportingText: "Perubahan temuan belum signifikan",
  },
  insufficient_data: {
    label: "Data belum cukup",
    supportingText: "Butuh minimal 2 periode audit",
  },
};

function normalizeFolderName(value?: string | null): string {
  return (value ?? "").trim().toLocaleLowerCase("id-ID");
}

function resolveAgentFolders(
  batchName: string,
  teamName: string,
  folders: QuickviewFolder[],
): {
  leaderFolder: QuickviewFolder | null;
  combinedFolder: QuickviewFolder | null;
} {
  const target = normalizeFolderName(batchName);
  const candidates = folders.filter(
    (folder) => normalizeFolderName(folder.name) === target,
  );
  const teamTarget = normalizeFolderName(teamName);
  const leaderFolder =
    candidates.find((folder) => {
      if (!folder.parent_id || !teamTarget) return false;
      const parent = folders.find((item) => item.id === folder.parent_id);
      return normalizeFolderName(parent?.name) === teamTarget;
    }) ??
    candidates.find((folder) => folder.parent_id !== null) ??
    candidates[0] ??
    null;

  if (!leaderFolder) {
    return { leaderFolder: null, combinedFolder: null };
  }

  const combinedFolder =
    (leaderFolder.parent_id
      ? folders.find((folder) => folder.id === leaderFolder.parent_id)
      : leaderFolder) ?? leaderFolder;

  return { leaderFolder, combinedFolder };
}

async function getRankForFolder(params: {
  agentId: string;
  year: number;
  serviceType: ServiceType;
  folder: QuickviewFolder;
  accessibleAgentIds: string[] | null;
  allowedServiceTypes?: ServiceType[];
}): Promise<SidakAgentRankQuickview> {
  const dashboard = await getDashboardData({
    service_type: params.serviceType,
    folder_ids: [params.folder.id],
    year: params.year,
    agent_ids: params.accessibleAgentIds ?? undefined,
    allowedServiceTypes: params.allowedServiceTypes,
    limit: 0,
  });
  const viewedAgent = dashboard.topAgents.find(
    (agent) => agent.agentId === params.agentId,
  );

  return {
    rank: viewedAgent
      ? 1 +
        dashboard.topAgents.filter(
          (agent) => agent.defects < viewedAgent.defects,
        ).length
      : null,
    total: dashboard.topAgents.length,
    scopeId: params.folder.id,
    scopeLabel: params.folder.name,
    basis: "least_findings_ytd",
  };
}

function mapForecastEntry(
  entry: SidakAgentForecastEntry | null,
): SidakAgentForecastQuickview | null {
  if (!entry) return null;

  const copy = FORECAST_COPY[entry.forecastStatus];
  return {
    status: entry.forecastStatus,
    ...copy,
    findingsSlope:
      entry.forecastStatus === "insufficient_data" && entry.sourcePointCount < 2
        ? null
        : entry.findingsSlope,
    sourcePointCount: entry.sourcePointCount,
    confidence: entry.confidence,
    horizonMonths: 3,
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function getSidakAgentQuickview(
  params: GetSidakAgentQuickviewParams,
): Promise<SidakAgentQuickviewResponse> {
  if (
    params.accessibleAgentIds !== null &&
    !params.accessibleAgentIds.includes(params.agentId)
  ) {
    throw new Error("Agent tidak dapat diakses.");
  }

  const { data: participant, error } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, batch_name, tim")
    .eq("id", params.agentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!participant) throw new Error("Agent tidak ditemukan.");

  let leaderFolder: QuickviewFolder | null = null;
  let combinedFolder: QuickviewFolder | null = null;
  try {
    const folders = params.filterScope
      ? params.filterScope.allowedFolders
      : await getAllFolders();
    const resolvedFolders = resolveAgentFolders(
      participant.batch_name ?? "",
      participant.tim ?? "",
      folders,
    );
    leaderFolder = resolvedFolders.leaderFolder;
    combinedFolder = resolvedFolders.combinedFolder;
  } catch {
    // Ranking segments are optional; forecast remains available without a
    // folder filter when the folder catalog cannot be resolved.
  }
  const effectiveServiceType = (resolveScopedServiceType(
    params.requestedServiceType,
    params.filterScope,
  ) ?? "call") as ServiceType;
  const allowedServiceTypes = params.filterScope?.allowedServices;

  const combinedRankPromise = combinedFolder
    ? getRankForFolder({
        agentId: params.agentId,
        year: params.year,
        serviceType: effectiveServiceType,
        folder: combinedFolder,
        accessibleAgentIds: params.accessibleAgentIds,
        allowedServiceTypes,
      })
    : Promise.resolve(null);
  const leaderRankPromise =
    leaderFolder && leaderFolder.id === combinedFolder?.id
      ? combinedRankPromise
      : leaderFolder
        ? getRankForFolder({
            agentId: params.agentId,
            year: params.year,
            serviceType: effectiveServiceType,
            folder: leaderFolder,
            accessibleAgentIds: params.accessibleAgentIds,
            allowedServiceTypes,
          })
        : Promise.resolve(null);
  const forecastPromise = generateSidakAgentForecast({
    request: {
      year: params.year,
      serviceType: effectiveServiceType,
      folderIds: combinedFolder ? [combinedFolder.id] : undefined,
      startMonth: 1,
      horizonMonths: 3,
    },
    accessibleAgentIds: params.accessibleAgentIds,
    allowedServiceTypes,
  }).then((forecastResponse) => {
    const entries = [
      ...forecastResponse.improvingAgents,
      ...forecastResponse.decliningAgents,
      ...forecastResponse.stableAgents,
      ...forecastResponse.watchlistAgents,
    ];
    return mapForecastEntry(
      entries.find((item) => item.agentId === params.agentId) ?? null,
    );
  });

  const [combinedRankResult, leaderRankResult, forecastResult] =
    await Promise.allSettled([
      combinedRankPromise,
      leaderRankPromise,
      forecastPromise,
    ]);

  return {
    context: {
      agentId: params.agentId,
      year: params.year,
      serviceType: effectiveServiceType,
      periodMode: "ytd",
    },
    combinedTeam: settledValue(combinedRankResult),
    leaderTeam: settledValue(leaderRankResult),
    forecast: settledValue(forecastResult),
  };
}
