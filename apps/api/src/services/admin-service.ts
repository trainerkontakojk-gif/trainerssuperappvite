import { transitionLeaderAccess } from "./leader-access-transitions";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import { logActivity } from "./activity-log-service";
import {
  AdminUserError,
  assertManageableTarget,
  getLinkedPesertaByAccount,
  linkUserPeserta,
  setActiveUntil,
  type AdminActor,
} from "./admin-user-service";
import { getActiveOverridesByUser } from "./practice-limits-service";
import { endAllLogins } from "./end-all-logins";
import {
  fetchLeaderModuleRequests,
  resolveEffectiveModuleStatus,
  resolveEffectiveModuleCreatedAt,
} from "./leader-access-service";
import { wibToday } from "@trainers/types";
import type {
  ManagedUser,
  PendingLeaderRequest,
  ApprovedLeaderAccess,
  AccessGroupRow,
  AccessGroupItemRow,
  AccessScopeOptions,
  ActivityLog,
  AccessScopeAgentOption,
} from "@trainers/types";

// ── User Management ──────────────────────────────────────────
async function getTargetUserRole(user_id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return typeof data?.role === "string" ? data.role.toLowerCase() : null;
}

export async function getUsers(): Promise<ManagedUser[]> {
  const PAGE_SIZE = 1000;
  const allData: ManagedUser[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .is("is_deleted", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...(data as ManagedUser[]));
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
  }
  const [linked, overrides] = await Promise.all([
    getLinkedPesertaByAccount(),
    getActiveOverridesByUser(),
  ]);
  return allData.map((user) => ({
    ...user,
    linked_peserta: linked.get(user.id) ?? null,
    practice_overrides: overrides.get(user.id) ?? [],
  }));
}

const ROLE_RANK: Record<string, number> = {
  agent: 0,
  leader: 1,
  trainer: 2,
  admin: 3,
};

const ENDED_LOGINS = "; semua login-nya diakhiri";

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  pending: "Menunggu",
  inactive: "Nonaktif",
};

async function targetLabel(user_id: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", user_id)
    .maybeSingle();
  return data?.full_name?.trim() || data?.email || user_id;
}

export async function updateUserStatus(
  user_id: string,
  status: "approved" | "pending" | "rejected",
  callerId: string,
  callerEmail: string,
  callerRole?: string,
): Promise<void> {
  if (user_id === callerId) {
    throw new Error(
      "Anda tidak dapat mengubah status akun Anda sendiri dari panel ini",
    );
  }

  if (callerRole === "trainer") {
    const targetRole = await getTargetUserRole(user_id);
    if (targetRole === "admin") {
      throw new Error("Trainer tidak dapat mengubah akun admin");
    }
  }

  const normalizedStatus = status.toLowerCase();
  const dbStatus =
    normalizedStatus === "approved"
      ? "active"
      : normalizedStatus === "rejected"
        ? "inactive"
        : normalizedStatus;
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ status: dbStatus })
    .eq("id", user_id);

  if (error) throw new Error(error.message);
  const endsLogins = dbStatus !== "active";
  if (endsLogins) await endAllLogins(user_id);

  await logActivity({
    user_id: callerId,
    user_name: callerEmail,
    action: `Mengubah status ${await targetLabel(user_id)} menjadi ${STATUS_LABEL[dbStatus] ?? dbStatus}${endsLogins ? ENDED_LOGINS : ""}`,
    module: "USER_MGMT",
    type: "update_status",
    target_user_id: user_id,
  });
}

export async function updateUserRole(
  user_id: string,
  role: string,
  callerId: string,
  callerEmail: string,
  callerRole: string,
): Promise<void> {
  if (user_id === callerId) {
    throw new Error(
      "Anda tidak dapat mengubah role akun Anda sendiri dari panel ini",
    );
  }

  const normalizedRole = role.toLowerCase();

  // Trainer permissions: can only manage trainer, leader, agent (cannot promote to admin)
  if (callerRole === "trainer" && normalizedRole === "admin") {
    throw new Error("Trainer tidak dapat memberikan role admin");
  }

  const targetRole = await getTargetUserRole(user_id);
  if (callerRole === "trainer" && targetRole === "admin") {
    throw new Error("Trainer tidak dapat mengubah akun admin");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role: normalizedRole })
    .eq("id", user_id);

  if (error) throw new Error(error.message);
  const demoted =
    (ROLE_RANK[normalizedRole] ?? 0) < (ROLE_RANK[targetRole ?? ""] ?? 0);
  if (demoted) await endAllLogins(user_id);

  await logActivity({
    user_id: callerId,
    user_name: callerEmail,
    action: `Mengubah role ${await targetLabel(user_id)} menjadi ${normalizedRole}${demoted ? ENDED_LOGINS : ""}`,
    module: "USER_MGMT",
    type: "update_role",
    target_user_id: user_id,
  });
}

/**
 * Approves a pending account in one step: role first (so a refused role
 * changes nothing), then the optional participant link and last day, then
 * the status.
 */
export async function approveUser(
  actor: AdminActor,
  userId: string,
  role: string,
  pesertaId: string | null,
  activeUntil: string | null = null,
): Promise<void> {
  if (activeUntil && activeUntil < wibToday())
    throw new AdminUserError("PAST_END_DATE");
  const target = await assertManageableTarget(actor, userId);
  if (target.status !== "pending") throw new AdminUserError("NOT_PENDING");
  if (role === "admin" && actor.role !== "admin")
    throw new AdminUserError("ADMIN_ROLE");
  if (target.role !== role)
    await updateUserRole(userId, role, actor.id, actor.email, actor.role ?? "");
  if (pesertaId) await linkUserPeserta(actor, userId, pesertaId);
  // Before the status, so the account is never active without its last day.
  if (activeUntil) await setActiveUntil(actor, userId, activeUntil);
  await updateUserStatus(
    userId,
    "approved",
    actor.id,
    actor.email,
    actor.role ?? "",
  );
}

export async function deleteUser(
  user_id: string,
  callerId: string,
  callerEmail: string,
  callerRole?: string,
): Promise<void> {
  if (user_id === callerId) {
    throw new Error("Akun Anda sendiri tidak dapat dihapus dari panel ini");
  }

  // Trainer cannot delete admin accounts
  if (callerRole === "trainer") {
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user_id)
      .single();
    if (target?.role === "admin") {
      throw new Error("Anda tidak memiliki izin untuk menghapus akun admin");
    }
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_deleted: true })
    .eq("id", user_id);

  if (error) throw new Error(error.message);

  // A deleted account keeps no participant, so the participant can be relinked.
  const { error: unlinkError } = await supabaseAdmin
    .from("profiler_peserta")
    .update({ akun_id: null })
    .eq("akun_id", user_id);
  if (unlinkError) throw new Error(unlinkError.message);
  await endAllLogins(user_id);

  await logActivity({
    user_id: callerId,
    user_name: callerEmail,
    action: `Menghapus pengguna ${await targetLabel(user_id)}${ENDED_LOGINS}`,
    module: "USER_MGMT",
    type: "delete",
    target_user_id: user_id,
  });
}

// ── Access Groups ────────────────────────────────────────────
export async function getAccessGroups(): Promise<AccessGroupRow[]> {
  const { data, error } = await supabaseAdmin
    .from("v_access_groups_with_item_counts")
    .select(
      "id, name, description, scope_type, is_active, created_at, item_count",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...row,
    item_count: Number(row.item_count ?? 0),
  }));
}

export async function createAccessGroup(
  name: string,
  description?: string,
): Promise<AccessGroupRow> {
  const { data, error } = await supabaseAdmin
    .from("access_groups")
    .insert({ name, description: description || null })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { ...data, item_count: 0 };
}

export async function updateAccessGroup(
  id: string,
  updates: { name?: string; description?: string; is_active?: boolean },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("access_groups")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getAccessGroupItems(
  groupId: string,
): Promise<AccessGroupItemRow[]> {
  const PAGE_SIZE = 1000;
  const allData: AccessGroupItemRow[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from("access_group_items")
      .select("*")
      .eq("access_group_id", groupId)
      .order("field_name")
      .order("field_value")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...(data as AccessGroupItemRow[]));
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
  }
  return allData;
}

export async function addAccessGroupItem(
  groupId: string,
  fieldName: string,
  fieldValue: string,
): Promise<AccessGroupItemRow> {
  const { data, error } = await supabaseAdmin
    .from("access_group_items")
    .insert({
      access_group_id: groupId,
      field_name: fieldName,
      field_value: fieldValue,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as AccessGroupItemRow;
}

export async function removeAccessGroupItem(itemId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("access_group_items")
    .delete()
    .eq("id", itemId);

  if (error) throw new Error(error.message);
}

export async function getAccessScopeOptions(): Promise<AccessScopeOptions> {
  const data = await fetchAllPages<any>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_peserta")
        .select("id, nama, tim, batch_name")
        .order("tim", { ascending: true })
        .order("nama", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  });

  const VALID_SERVICES = [
    "call",
    "chat",
    "email",
    "cso",
    "pencatatan",
    "bko",
    "slik",
  ];
  const SERVICE_LABELS: Record<string, string> = {
    call: "Call/Voice",
    chat: "Chat/WhatsApp",
    email: "Email/Laporan",
    cso: "CSO/Walk-In",
    pencatatan: "Pencatatan Mandiri",
    bko: "BKO/Backoffice",
    slik: "SLIK Checking",
  };

  const teamSet = new Set<string>();
  const agentsByTeam: Record<string, AccessScopeAgentOption[]> = {};

  (data || []).forEach((row) => {
    const team = row.tim?.trim();
    if (!team) return;

    teamSet.add(team);
    if (!agentsByTeam[team]) {
      agentsByTeam[team] = [];
    }
    agentsByTeam[team].push({
      id: row.id,
      name: row.nama || "Tanpa Nama",
      team,
      batch_name: row.batch_name,
    });
  });

  return {
    teams: [...teamSet].sort((a, b) => a.localeCompare(b)),
    services: VALID_SERVICES.map((srv) => ({
      value: srv,
      label: SERVICE_LABELS[srv] || srv,
    })),
    agentsByTeam,
  };
}

// ── Leader Access Requests ───────────────────────────────────
export async function getPendingLeaderRequests(): Promise<
  PendingLeaderRequest[]
> {
  const { data, error } = await supabaseAdmin
    .from("leader_access_requests")
    .select(
      `
      id,
      leader_user_id,
      module,
      status,
      created_at,
      profiles:leader_user_id (full_name, email)
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    id: row.id,
    leader_user_id: row.leader_user_id,
    leader_name: row.profiles?.full_name ?? "Unknown",
    leader_email: row.profiles?.email ?? "",
    module: row.module,
    created_at: row.created_at,
    status: row.status,
  }));
}

export async function getApprovedLeaderRequests(): Promise<
  ApprovedLeaderAccess[]
> {
  const { data: requests, error } = await supabaseAdmin
    .from("leader_access_requests")
    .select(
      `
      id,
      leader_user_id,
      module,
      status,
      updated_at,
      profiles:leader_user_id (full_name, email)
    `,
    )
    .eq("status", "approved")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!requests || requests.length === 0) return [];

  const requestIds = requests.map((r) => r.id);
  const { data: joinRows } = await supabaseAdmin
    .from("leader_access_request_groups")
    .select("request_id, access_group_id")
    .in("request_id", requestIds);

  const { data: allGroups } = await supabaseAdmin
    .from("access_groups")
    .select("id, name")
    .eq("is_active", true);

  const groupNameMap = new Map<string, string>();
  (allGroups || []).forEach((g) => groupNameMap.set(g.id, g.name));

  const requestGroupMap = new Map<string, string[]>();
  const requestGroupIdMap = new Map<string, string[]>();

  (joinRows || []).forEach((j) => {
    const name = groupNameMap.get(j.access_group_id);
    if (name) {
      const existing = requestGroupMap.get(j.request_id) || [];
      existing.push(name);
      requestGroupMap.set(j.request_id, existing);

      const existingIds = requestGroupIdMap.get(j.request_id) || [];
      existingIds.push(j.access_group_id);
      requestGroupIdMap.set(j.request_id, existingIds);
    }
  });

  return requests.map((row: any) => ({
    id: row.id,
    leader_user_id: row.leader_user_id,
    leader_name: row.profiles?.full_name ?? "Unknown",
    leader_email: row.profiles?.email ?? "",
    module: row.module,
    access_group_ids: requestGroupIdMap.get(row.id) || [],
    access_group_names: requestGroupMap.get(row.id) || [],
    approved_at: row.updated_at,
  }));
}

export async function approveLeaderRequest(
  requestId: string,
  accessGroupIds: string[],
  reviewerId: string,
): Promise<void> {
  await transitionLeaderAccess(
    requestId,
    reviewerId,
    "approve",
    accessGroupIds,
  );
}

export async function rejectLeaderRequest(
  requestId: string,
  note: string | undefined,
  reviewerId: string,
): Promise<void> {
  await transitionLeaderAccess(requestId, reviewerId, "reject", null, note);
}

export async function revokeLeaderRequest(
  requestId: string,
  note: string | undefined,
  reviewerId: string,
): Promise<void> {
  await transitionLeaderAccess(requestId, reviewerId, "revoke", null, note);
}

export async function reassignLeaderRequestGroups(
  requestId: string,
  accessGroupIds: string[],
  reviewerId: string,
): Promise<void> {
  await transitionLeaderAccess(requestId, reviewerId, "groups", accessGroupIds);
}

// ── Activity Logs ────────────────────────────────────────────
export async function getActivityLogs(): Promise<ActivityLog[]> {
  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface LeaderAccessStatusItem {
  status: "none" | "pending" | "approved" | "rejected" | "revoked";
  module: string;
  created_at: string | null;
}

export async function getLeaderAccessStatus(
  userId: string,
): Promise<Record<string, LeaderAccessStatusItem>> {
  const modules = ["ktp", "sidak"] as const;
  const result: Record<string, LeaderAccessStatusItem> = {};

  for (const mod of modules) {
    const rows = await fetchLeaderModuleRequests(userId, mod);
    const status = resolveEffectiveModuleStatus(rows, mod);
    result[mod] = {
      status,
      module: mod,
      created_at: resolveEffectiveModuleCreatedAt(rows, mod, status),
    };
  }

  return result;
}
