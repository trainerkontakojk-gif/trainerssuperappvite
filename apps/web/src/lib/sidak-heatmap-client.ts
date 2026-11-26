import { sidakHeatmapClient } from "./api/rpc-client";
import { unwrapResponse } from "./api";
import type {
  ServiceType,
  SidakHeatmapCountBy,
  SidakHeatmapMode,
  SidakHeatmapResponse,
  SidakHeatmapTimeProfileResponse,
} from "@trainers/types";

export interface HeatmapFilters {
  year: number;
  countBy: SidakHeatmapCountBy;
  serviceType?: ServiceType;
  agentId?: string;
  folderIds?: string[];
  startMonth?: number;
  endMonth?: number;
}

function buildHeatmapQuery(params: HeatmapFilters) {
  return {
    year: String(params.year),
    count_by: params.countBy,
    service_type: params.serviceType,
    agent_id: params.agentId,
    folder_ids: params.folderIds?.length
      ? params.folderIds.join(",")
      : undefined,
    start_month:
      params.startMonth === undefined ? undefined : String(params.startMonth),
    end_month:
      params.endMonth === undefined ? undefined : String(params.endMonth),
  };
}

export async function fetchSidakHeatmap(
  params: HeatmapFilters & { mode: SidakHeatmapMode; signal?: AbortSignal },
): Promise<SidakHeatmapResponse> {
  return unwrapResponse(
    await sidakHeatmapClient.heatmap.$get(
      { query: { ...buildHeatmapQuery(params), mode: params.mode } },
      { init: { signal: params.signal } },
    ),
  );
}

export async function fetchSidakHeatmapTimeProfile(
  params: HeatmapFilters & { signal: AbortSignal },
): Promise<SidakHeatmapTimeProfileResponse> {
  return unwrapResponse(
    await sidakHeatmapClient.heatmap["time-profile"].$get(
      { query: buildHeatmapQuery(params) },
      { init: { signal: params.signal } },
    ),
  );
}
