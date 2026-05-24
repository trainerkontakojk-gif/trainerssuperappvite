import { supabaseAdmin } from "../lib/supabase";
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

// ── Activity Logging Helper ─────────────────────────────────
export async function logActivity(params: {
  userId: string;
  userName: string;
  action: string;
  module: string;
  type: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("activity_logs").insert({
    user_id: params.userId,
    user_name: params.userName,
    action: params.action,
    module: params.module,
    type: params.type,
  });
  if (error) {
    console.error("[AdminService] Failed to log activity:", error.message);
  }
}

// ── User Management ──────────────────────────────────────────
export async function getUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .is("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateUserStatus(
  userId: string,
  status: "approved" | "pending" | "rejected",
  callerId: string,
  callerEmail: string,
): Promise<void> {
  if (userId === callerId) {
    throw new Error(
      "Anda tidak dapat mengubah status akun Anda sendiri dari panel ini",
    );
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
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await logActivity({
    userId: callerId,
    userName: callerEmail,
    action: `Mengubah status user ${userId} menjadi ${dbStatus}`,
    module: "USER_MGMT",
    type: "update_status",
  });
}

export async function updateUserRole(
  userId: string,
  role: string,
  callerId: string,
  callerEmail: string,
  callerRole: string,
): Promise<void> {
  if (userId === callerId) {
    throw new Error(
      "Anda tidak dapat mengubah role akun Anda sendiri dari panel ini",
    );
  }

  // Trainer permissions: can only manage trainer, leader, agent (cannot promote to admin)
  if (callerRole === "trainer" && role === "admin") {
    throw new Error("Trainer tidak dapat memberikan role admin");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role: role.toLowerCase() })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await logActivity({
    userId: callerId,
    userName: callerEmail,
    action: `Mengubah role user ${userId} menjadi ${role}`,
    module: "USER_MGMT",
    type: "update_role",
  });
}

export async function deleteUser(
  userId: string,
  callerId: string,
  callerEmail: string,
  callerRole?: string,
): Promise<void> {
  if (userId === callerId) {
    throw new Error("Akun Anda sendiri tidak dapat dihapus dari panel ini");
  }

  // Trainer cannot delete admin accounts
  if (callerRole === "trainer") {
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (target?.role === "admin") {
      throw new Error("Anda tidak memiliki izin untuk menghapus akun admin");
    }
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_deleted: true })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await logActivity({
    userId: callerId,
    userName: callerEmail,
    action: `Menonaktifkan Pengguna ID: ${userId}`,
    module: "USER_MGMT",
    type: "delete",
  });
}

export async function resetUserPassword(
  userId: string,
  email: string,
  callerId: string,
  callerEmail: string,
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error) throw new Error(`Gagal generate link reset password: ${error.message}`);

  await logActivity({
    userId: callerId,
    userName: callerEmail,
    action: `Generate reset password untuk user ${userId} (${email})`,
    module: "USER_MGMT",
    type: "reset_password",
  });
}

// ── Access Groups ────────────────────────────────────────────
export async function getAccessGroups(): Promise<AccessGroupRow[]> {
  const { data, error } = await supabaseAdmin
    .from("access_groups")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const groupIds = (data || []).map((g) => g.id);
  if (groupIds.length === 0) return [];

  const { data: counts, error: countError } = await supabaseAdmin
    .from("access_group_items")
    .select("access_group_id")
    .in("access_group_id", groupIds);

  if (countError) throw new Error(countError.message);

  const countMap = new Map<string, number>();
  (counts || []).forEach((c) => {
    countMap.set(c.access_group_id, (countMap.get(c.access_group_id) || 0) + 1);
  });

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    scope_type: row.scope_type,
    is_active: row.is_active,
    created_at: row.created_at,
    item_count: countMap.get(row.id) || 0,
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
  const { data, error } = await supabaseAdmin
    .from("access_group_items")
    .select("*")
    .eq("access_group_id", groupId)
    .order("field_name")
    .order("field_value");

  if (error) throw new Error(error.message);
  return (data || []) as AccessGroupItemRow[];
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
  const { data, error } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama, tim, batch_name")
    .order("tim", { ascending: true })
    .order("nama", { ascending: true });

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

  if (error) {
    return {
      teams: [],
      services: VALID_SERVICES.map((srv) => ({
        value: srv,
        label: SERVICE_LABELS[srv] || srv,
      })),
      agentsByTeam: {},
    };
  }

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
  const uniqueAccessGroupIds = [
    ...new Set((accessGroupIds || []).filter(Boolean)),
  ];
  if (uniqueAccessGroupIds.length === 0) {
    throw new Error("Pilih minimal satu access group");
  }

  // Get request details
  const { data: request, error: reqError } = await supabaseAdmin
    .from("leader_access_requests")
    .select("id, status, leader_user_id")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();

  if (reqError || !request) {
    throw new Error("Request tidak ditemukan atau sudah diproses");
  }

  if (request.leader_user_id === reviewerId) {
    throw new Error("Anda tidak dapat menyetujui request akses milik sendiri");
  }

  const { data: activeGroups, error: groupError } = await supabaseAdmin
    .from("access_groups")
    .select("id")
    .in("id", uniqueAccessGroupIds)
    .eq("is_active", true);

  if (groupError) throw new Error("Gagal memvalidasi access group");
  if ((activeGroups || []).length !== uniqueAccessGroupIds.length) {
    throw new Error("Access group tidak valid atau sudah nonaktif");
  }

  const { error: updateError } = await supabaseAdmin
    .from("leader_access_requests")
    .update({ status: "approved", reviewed_by: reviewerId })
    .eq("id", requestId);

  if (updateError) throw new Error("Gagal menyetujui request");

  const groupRows = uniqueAccessGroupIds.map((groupId) => ({
    request_id: requestId,
    access_group_id: groupId,
  }));

  const { error: linkError } = await supabaseAdmin
    .from("leader_access_request_groups")
    .insert(groupRows);

  if (linkError) {
    // Rollback request status
    await supabaseAdmin
      .from("leader_access_requests")
      .update({ status: "pending", reviewed_by: null })
      .eq("id", requestId);
    throw new Error("Gagal menautkan access group");
  }
}

export async function rejectLeaderRequest(
  requestId: string,
  note: string | undefined,
  reviewerId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("leader_access_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      review_note: note || null,
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) throw new Error("Gagal menolak request");
}

export async function revokeLeaderRequest(
  requestId: string,
  note: string | undefined,
  reviewerId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("leader_access_requests")
    .update({
      status: "revoked",
      reviewed_by: reviewerId,
      review_note: note || null,
    })
    .eq("id", requestId)
    .eq("status", "approved");

  if (error) throw new Error("Gagal mencabut akses");
}

export async function reassignLeaderRequestGroups(
  requestId: string,
  accessGroupIds: string[],
  reviewerId: string,
): Promise<void> {
  const uniqueAccessGroupIds = [
    ...new Set((accessGroupIds || []).filter(Boolean)),
  ];
  if (uniqueAccessGroupIds.length === 0) {
    throw new Error("Pilih minimal satu access group");
  }

  const { data: request, error: reqError } = await supabaseAdmin
    .from("leader_access_requests")
    .select("id, status, leader_user_id")
    .eq("id", requestId)
    .eq("status", "approved")
    .single();

  if (reqError || !request) {
    throw new Error("Akses tidak ditemukan atau tidak aktif");
  }

  if (request.leader_user_id === reviewerId) {
    throw new Error("Anda tidak dapat mengubah akses milik sendiri");
  }

  const { data: activeGroups, error: groupError } = await supabaseAdmin
    .from("access_groups")
    .select("id")
    .in("id", uniqueAccessGroupIds)
    .eq("is_active", true);

  if (groupError) throw new Error("Gagal memvalidasi access group");
  if ((activeGroups || []).length !== uniqueAccessGroupIds.length) {
    throw new Error("Access group tidak valid atau sudah nonaktif");
  }

  // Save existing links for rollback
  const { data: oldLinks, error: fetchError } = await supabaseAdmin
    .from("leader_access_request_groups")
    .select("access_group_id")
    .eq("request_id", requestId);

  if (fetchError) throw new Error("Gagal membaca access group lama");

  const oldGroupIds = (oldLinks || []).map((l: any) => l.access_group_id);

  // Re-verify request is still approved before mutating groups
  const { data: recheckReq, error: recheckError } = await supabaseAdmin
    .from("leader_access_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("status", "approved")
    .single();

  if (recheckError || !recheckReq) {
    throw new Error(
      "Akses sudah tidak aktif. Permintaan mungkin sudah dicabut.",
    );
  }

  // Clear existing links
  const { error: deleteError } = await supabaseAdmin
    .from("leader_access_request_groups")
    .delete()
    .eq("request_id", requestId);

  if (deleteError) throw new Error("Gagal menghapus access group lama");

  // Insert new links
  const groupRows = uniqueAccessGroupIds.map((groupId) => ({
    request_id: requestId,
    access_group_id: groupId,
  }));

  const { error: insertError } = await supabaseAdmin
    .from("leader_access_request_groups")
    .insert(groupRows);

  if (insertError) {
    // Rollback: restore old links
    await supabaseAdmin
      .from("leader_access_request_groups")
      .insert(oldGroupIds.map((gid: string) => ({
        request_id: requestId,
        access_group_id: gid,
      })));
    throw new Error("Gagal menyimpan access group baru. Perubahan dibatalkan.");
  }

  const { error: auditError } = await supabaseAdmin
    .from("leader_access_requests")
    .update({ reviewed_by: reviewerId })
    .eq("id", requestId)
    .eq("status", "approved");

  if (auditError) {
    console.error(
      "[AdminService] Warning: Failed to update reviewed_by audit field:",
      auditError.message,
    );
  }
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

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("activity_logs")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}
