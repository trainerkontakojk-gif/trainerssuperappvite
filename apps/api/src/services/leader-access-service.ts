import { supabaseAdmin } from "../lib/supabase";

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
