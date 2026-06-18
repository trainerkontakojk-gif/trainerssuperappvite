import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import type { ServiceType } from "@trainers/types";

export type ApprovalStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export interface LeaderRequestRow {
  id: string;
  module: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LeaderAccessStatusItem {
  status: ApprovalStatus;
  module: string;
  created_at: string | null;
}

export interface LeaderScopeSnapshot {
  requestIds: string[];
  pesertaIds: string[];
  batchNames: string[];
  tims: string[];
  serviceTypes: ServiceType[];
}

export async function fetchLeaderModuleRequests(
  userId: string,
  module: string,
): Promise<LeaderRequestRow[]> {
  const { data } = await supabaseAdmin
    .from("leader_access_requests")
    .select("id, module, status, created_at, updated_at")
    .eq("leader_user_id", userId)
    .in("module", [module, "all"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as LeaderRequestRow[];
}

export function resolveEffectiveModuleStatus(
  rows: LeaderRequestRow[],
  module: string,
): ApprovalStatus {
  const hasApproved = rows.some(
    (r) =>
      r.status === "approved" &&
      (r.module === module || r.module === "all"),
  );
  if (hasApproved) return "approved";

  const hasPending = rows.some(
    (r) =>
      r.status === "pending" &&
      (r.module === module || r.module === "all"),
  );
  if (hasPending) return "pending";

  const terminalRow = rows.find(
    (r) =>
      (r.status === "rejected" || r.status === "revoked") &&
      (r.module === module || r.module === "all"),
  );
  if (terminalRow) return terminalRow.status as ApprovalStatus;

  return "none";
}

export function resolveEffectiveModuleCreatedAt(
  rows: LeaderRequestRow[],
  module: string,
  status: ApprovalStatus,
): string | null {
  if (status === "none") return null;

  const row = rows.find(
    (r) =>
      (r.module === module || r.module === "all") &&
      r.status === status,
  );
  return row?.created_at ?? null;
}

export async function getApprovedRequestIds(
  userId: string,
  module: string,
): Promise<string[]> {
  const rows = await fetchLeaderModuleRequests(userId, module);
  if (rows.length === 0) return [];

  const effectiveStatus = resolveEffectiveModuleStatus(rows, module);
  if (effectiveStatus !== "approved") return [];

  return rows
    .filter(
      (r) =>
        r.status === "approved" &&
        (r.module === module || r.module === "all"),
    )
    .map((r) => r.id);
}

export async function getLeaderScopeSnapshot(
  userId: string,
  module: string,
): Promise<LeaderScopeSnapshot> {
  const requestIds = await getApprovedRequestIds(userId, module);
  const empty: LeaderScopeSnapshot = {
    requestIds: [],
    pesertaIds: [],
    batchNames: [],
    tims: [],
    serviceTypes: [],
  };

  if (!requestIds || requestIds.length === 0) return empty;

  const { data: groupLinks } = await supabaseAdmin
    .from("leader_access_request_groups")
    .select("access_group_id")
    .in("request_id", requestIds);

  if (!groupLinks || groupLinks.length === 0) return { ...empty, requestIds };

  const groupIds = [...new Set(groupLinks.map((g) => g.access_group_id))];

  const items = await fetchAllPages<{ field_name: string; field_value: string }>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("access_group_items")
        .select("field_name, field_value")
        .in("access_group_id", groupIds)
        .eq("is_active", true)
        .order("access_group_id", { ascending: true })
        .order("field_name", { ascending: true })
        .order("field_value", { ascending: true })
        .range(from, to),
  });

  if (items.length === 0) return { ...empty, requestIds };

  const rawPesertaIds: string[] = [];
  const batchNames: string[] = [];
  const tims: string[] = [];
  const serviceTypes: string[] = [];

  for (const item of items) {
    if (item.field_name === "peserta_id") rawPesertaIds.push(item.field_value);
    else if (item.field_name === "batch_name") batchNames.push(item.field_value);
    else if (item.field_name === "tim") tims.push(item.field_value);
    else if (item.field_name === "service_type") serviceTypes.push(item.field_value);
  }

  const resolvedIds = [...rawPesertaIds];

  if (batchNames.length > 0) {
    const batchData = await fetchAllPages<{ id: string }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("id")
          .in("batch_name", batchNames)
          .order("id", { ascending: true })
          .range(from, to),
    });
    resolvedIds.push(...batchData.map((b) => b.id));
  }

  if (tims.length > 0) {
    const timData = await fetchAllPages<{ id: string }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("id")
          .in("tim", tims)
          .order("id", { ascending: true })
          .range(from, to),
    });
    resolvedIds.push(...timData.map((t) => t.id));
  }

  const validServiceTypes = serviceTypes.filter(
    (s): s is ServiceType =>
      ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].includes(s),
  );

  return {
    requestIds,
    pesertaIds: [...new Set(resolvedIds)],
    batchNames: [...new Set(batchNames)],
    tims: [...new Set(tims)],
    serviceTypes: [...new Set(validServiceTypes)],
  };
}
