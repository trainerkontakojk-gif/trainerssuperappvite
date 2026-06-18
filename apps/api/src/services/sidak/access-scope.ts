import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { getLeaderScopeSnapshot } from "../leader-access-service";
import { TRAINER_ROLES, LEADER_ROLES } from "./shared-constants";
import type { ServiceType } from "@trainers/types";

export interface SidakFilterScope {
  agentIds: string[];
  allowedFolders: { id: string; name: string }[];
  allowedServices: ServiceType[];
  serviceTypeLocked: boolean;
}

export async function getAccessibleAgentIds(
  userId: string,
  role: string,
): Promise<string[] | null> {
  if ((TRAINER_ROLES as readonly string[]).includes(role)) return null;

  if (role === "agent") {
    const { data } = await supabaseAdmin
      .from("profiler_peserta")
      .select("id")
      .eq("trainer_id", userId)
      .maybeSingle();
    return data ? [data.id] : [];
  }

  if ((LEADER_ROLES as readonly string[]).includes(role)) {
    const snapshot = await getLeaderScopeSnapshot(userId, "sidak");
    return snapshot.pesertaIds;
  }

  return [];
}

export async function getAccessibleSidakFilters(
  userId: string,
  role: string,
): Promise<SidakFilterScope | null> {
  if ((TRAINER_ROLES as readonly string[]).includes(role)) return null;

  if ((LEADER_ROLES as readonly string[]).includes(role)) {
    const snapshot = await getLeaderScopeSnapshot(userId, "sidak");

    if (snapshot.pesertaIds.length === 0) {
      return {
        agentIds: [],
        allowedFolders: [],
        allowedServices: snapshot.serviceTypes,
        serviceTypeLocked: snapshot.serviceTypes.length > 0,
      };
    }

    const batchRows = await fetchAllPages<{ batch_name: string | null }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("batch_name")
          .in("id", snapshot.pesertaIds)
          .order("batch_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    });
    const scopedBatches = [
      ...new Set(batchRows.map((r) => r.batch_name).filter(Boolean)),
    ] as string[];

    const folderRows =
      scopedBatches.length === 0
        ? []
        : await fetchAllPages<{ id: string; name: string }>({
            build: ({ from, to }) =>
              supabaseAdmin
                .from("profiler_folders")
                .select("id, name")
                .in("name", scopedBatches)
                .order("name")
                .order("id", { ascending: true })
                .range(from, to),
          });

    return {
      agentIds: snapshot.pesertaIds,
      allowedFolders: folderRows.map((f: any) => ({
        id: f.id,
        name: f.name,
      })),
      allowedServices: snapshot.serviceTypes,
      serviceTypeLocked: snapshot.serviceTypes.length > 0,
    };
  }

  return {
    agentIds: [],
    allowedFolders: [],
    allowedServices: [],
    serviceTypeLocked: false,
  };
}

export async function getFolderNamesByIds(
  folderIds: string[],
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("name")
    .in("id", folderIds);
  return [...new Set((data ?? []).map((f) => f.name))].filter(Boolean);
}

export async function getFoldersByIds(
  folderIds: string[],
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("id, name")
    .in("id", folderIds)
    .order("name");
  return (data ?? []).map((f: any) => ({ id: f.id, name: f.name }));
}

export async function getAllFolders(): Promise<{ id: string; name: string }[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("id, name")
    .order("name");
  return data ?? [];
}

export async function getAgentsByFolder(
  folder: string,
  filterScope: SidakFilterScope | null,
): Promise<{ id: string; nama: string }[]> {
  const { data } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama")
    .eq("batch_name", folder)
    .order("nama");
  let result = data ?? [];
  if (filterScope && filterScope.agentIds.length > 0) {
    const idSet = new Set(filterScope.agentIds);
    result = result.filter((a: any) => idSet.has(a.id));
  }
  return result;
}
