import { supabaseAdmin } from "../lib/supabase";
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
  const { data, error } = await supabaseAdmin
    .from("leader_access_requests")
    .select("id, module, status, created_at, updated_at")
    .eq("leader_user_id", userId)
    .in("module", [module, "all"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

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
  const empty: LeaderScopeSnapshot = {
    requestIds: [],
    pesertaIds: [],
    batchNames: [],
    tims: [],
    serviceTypes: [],
  };

  const { data, error } = await supabaseAdmin.rpc(
    "get_leader_scope_snapshot",
    {
      p_leader_user_id: userId,
      p_module: module,
    },
  );

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return empty;

  return {
    requestIds: row.request_ids ?? [],
    pesertaIds: row.peserta_ids ?? [],
    batchNames: row.batch_names ?? [],
    tims: row.tims ?? [],
    serviceTypes: (row.service_types ?? []).filter(
      (s: string): s is ServiceType =>
        ["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].includes(s),
    ),
  };
}
