import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { getLeaderScopeSnapshot } from "../leader-access-service";
import { TRAINER_ROLES, LEADER_ROLES } from "./shared-constants";
import type { ServiceType } from "@trainers/types";

export interface SidakFolderRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface SidakFilterScope {
  agentIds: string[];
  allowedFolders: SidakFolderRow[];
  allowedServices: ServiceType[];
  serviceTypeLocked: boolean;
}

function dedupeFolderRows(folders: SidakFolderRow[]): SidakFolderRow[] {
  const deduped = new Map<string, SidakFolderRow>();

  for (const folder of folders) {
    if (!folder.id || !folder.name) continue;
    deduped.set(folder.id, folder);
  }

  return [...deduped.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "id", {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

async function getFolderRowsByNames(
  folderNames: string[],
): Promise<SidakFolderRow[]> {
  if (folderNames.length === 0) return [];

  const rows = await fetchAllPages<SidakFolderRow>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_folders")
        .select("id, name, parent_id")
        .in("name", folderNames)
        .order("name")
        .order("id", { ascending: true })
        .range(from, to),
  });

  return dedupeFolderRows(rows);
}

async function getChildFolderRowsByParentIds(
  parentIds: string[],
): Promise<SidakFolderRow[]> {
  if (parentIds.length === 0) return [];

  const rows = await fetchAllPages<SidakFolderRow>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_folders")
        .select("id, name, parent_id")
        .in("parent_id", parentIds)
        .order("name")
        .order("id", { ascending: true })
        .range(from, to),
  });

  return dedupeFolderRows(rows);
}

async function getParentFolderRows(
  folders: SidakFolderRow[],
): Promise<SidakFolderRow[]> {
  const parentIds = [...new Set(folders.map((folder) => folder.parent_id).filter(Boolean))];
  if (parentIds.length === 0) return [];

  const parents = await fetchAllPages<SidakFolderRow>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_folders")
        .select("id, name, parent_id")
        .in("id", parentIds)
        .order("name")
        .order("id", { ascending: true })
        .range(from, to),
  });

  return dedupeFolderRows(parents);
}

async function expandFoldersWithParents(
  folders: SidakFolderRow[],
): Promise<SidakFolderRow[]> {
  const parents = await getParentFolderRows(folders);
  return dedupeFolderRows([...parents, ...folders]);
}

async function resolveFolderNamesFromFolderRows(
  folders: SidakFolderRow[],
): Promise<string[]> {
  if (folders.length === 0) return [];

  const parentFolders = folders.filter((folder) => !folder.parent_id);
  const selectedChildren = folders.filter((folder) => folder.parent_id);
  const childFolders = await getChildFolderRowsByParentIds(
    parentFolders.map((folder) => folder.id),
  );

  const names = [
    ...selectedChildren.map((folder) => folder.name),
    ...parentFolders.flatMap((folder) => {
      const childrenForParent = childFolders.filter(
        (child) => child.parent_id === folder.id,
      );
      return childrenForParent.length > 0
        ? childrenForParent.map((child) => child.name)
        : [folder.name];
    }),
  ];

  return [...new Set(names.filter(Boolean))];
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
      ...new Set(batchRows.map((row) => row.batch_name).filter(Boolean)),
    ] as string[];

    const batchFolders = await getFolderRowsByNames(scopedBatches);
    const allowedFolders = await expandFoldersWithParents(batchFolders);

    return {
      agentIds: snapshot.pesertaIds,
      allowedFolders,
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

export async function resolveFolderFiltersByIds(
  folderIds: string[],
): Promise<{
  selectedFolders: SidakFolderRow[];
  filterNames: string[];
}> {
  const selectedFolders = await getFoldersByIds(folderIds);
  const filterNames = await resolveFolderNamesFromFolderRows(selectedFolders);

  return {
    selectedFolders,
    filterNames,
  };
}

export async function getFolderNamesByIds(
  folderIds: string[],
): Promise<string[]> {
  const { filterNames } = await resolveFolderFiltersByIds(folderIds);
  return filterNames;
}

export async function getFoldersByIds(
  folderIds: string[],
): Promise<SidakFolderRow[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("id, name, parent_id")
    .in("id", folderIds)
    .order("name");

  return dedupeFolderRows(data ?? []);
}

export async function getAllFolders(): Promise<SidakFolderRow[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("id, name, parent_id")
    .order("name");

  return dedupeFolderRows(data ?? []);
}

export async function getAgentsByFolder(
  folder: string,
  filterScope: SidakFilterScope | null,
): Promise<{ id: string; nama: string }[]> {
  const scopedFolderRows = await getFolderRowsByNames([folder]);
  const folderNames =
    scopedFolderRows.length > 0
      ? await resolveFolderNamesFromFolderRows(scopedFolderRows)
      : [folder];

  const { data } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama")
    .in("batch_name", folderNames)
    .order("nama");
  let result = data ?? [];
  if (filterScope && filterScope.agentIds.length > 0) {
    const idSet = new Set(filterScope.agentIds);
    result = result.filter((agent: any) => idSet.has(agent.id));
  }
  return result;
}
