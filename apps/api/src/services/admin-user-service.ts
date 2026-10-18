import type {
  LinkedAccountSummary,
  LinkedPesertaSummary,
  ManagedUser,
  ManagedUserDetail,
  PesertaLinkOption,
  Role,
} from "@trainers/types";
import { formatWibDay, normalizeRole, wibToday } from "@trainers/types";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import { logActivity } from "./activity-log-service";

/**
 * Account detail, account-to-participant links, and password reset for the
 * user management pages. Every mutation goes through assertManageableTarget
 * so the "not yourself, trainer never touches admin" rule lives in one place.
 */

const errorStatus = {
  SELF: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  PESERTA_NOT_FOUND: 404,
  PESERTA_TAKEN: 409,
  NO_EMAIL: 400,
  RESET_FAILED: 502,
  NOT_PENDING: 409,
  ADMIN_ROLE: 403,
  NOT_LIMITED_ROLE: 400,
  PAST_END_DATE: 400,
  NOT_ACTIVE: 409,
} as const;

const errorMessage: Record<keyof typeof errorStatus, string> = {
  SELF: "Akun Anda sendiri tidak bisa diubah dari halaman ini.",
  NOT_FOUND: "Pengguna tidak ditemukan.",
  FORBIDDEN: "Trainer tidak dapat mengubah akun admin.",
  PESERTA_NOT_FOUND: "Peserta KTP tidak ditemukan.",
  PESERTA_TAKEN:
    "Peserta ini sudah tertaut ke akun lain. Lepas tautannya dulu.",
  NO_EMAIL: "Akun ini tidak punya email.",
  RESET_FAILED: "Email reset password gagal dikirim. Coba lagi nanti.",
  NOT_PENDING: "Akun ini sudah tidak menunggu persetujuan.",
  ADMIN_ROLE: "Trainer tidak dapat memberikan role admin.",
  NOT_LIMITED_ROLE:
    "Trainer dan admin selalu tanpa batas latihan, jadi tidak perlu pengecualian.",
  PAST_END_DATE: "Tanggal berakhir sudah lewat. Pilih hari ini atau sesudahnya.",
  NOT_ACTIVE: "Hanya akun yang aktif yang bisa ditangguhkan.",
};

export class AdminUserError extends Error {
  readonly status;
  constructor(readonly code: keyof typeof errorStatus) {
    super(errorMessage[code]);
    this.name = "AdminUserError";
    this.status = errorStatus[code];
  }
}

export type AdminActor = { id: string; email: string; role: Role | null };

type TargetProfile = Pick<
  ManagedUser,
  "id" | "email" | "full_name" | "role" | "status" | "created_at" | "active_until"
>;

const PESERTA_SUMMARY = "id, nama, batch_name, tim";

function displayName(profile: { full_name: string | null; email: string }) {
  return profile.full_name?.trim() || profile.email;
}

async function getActiveProfile(userId: string): Promise<TargetProfile> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    // "*" so a database without active_until yet still loads the account.
    .select("*")
    .eq("id", userId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminUserError("NOT_FOUND");
  const { id, email, full_name, role, status, created_at, active_until } =
    data as TargetProfile;
  return {
    id,
    email,
    full_name,
    role,
    status,
    created_at,
    active_until: active_until ?? null,
  };
}

/** Loads the target and enforces who may change it. */
export async function assertManageableTarget(
  actor: AdminActor,
  userId: string,
): Promise<TargetProfile> {
  if (userId === actor.id) throw new AdminUserError("SELF");
  const target = await getActiveProfile(userId);
  if (normalizeRole(target.role) === "admin" && actor.role !== "admin")
    throw new AdminUserError("FORBIDDEN");
  return target;
}

export async function getLinkedPesertaByAccount(): Promise<
  Map<string, ManagedUser["linked_peserta"]>
> {
  const rows = await fetchAllPages<
    LinkedPesertaSummary & { akun_id: string }
  >({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_peserta")
        .select(`${PESERTA_SUMMARY}, akun_id`)
        .not("akun_id", "is", null)
        .order("id")
        .range(from, to),
  });
  return new Map(rows.map(({ akun_id, ...peserta }) => [akun_id, peserta]));
}

/** Everything on the user page except practice limits (added by the route). */
export async function getUserDetail(
  userId: string,
): Promise<Omit<ManagedUserDetail, "practice_limits">> {
  const profile = await getActiveProfile(userId);
  const [authUser, peserta, assignment, leaderRequests, history] =
    await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin
        .from("profiler_peserta")
        .select(`${PESERTA_SUMMARY}, jabatan, nik_ojk`)
        .eq("akun_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("ketik_configuration_assignments")
        .select("assigned_at, assigned_by")
        .eq("recipient_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("leader_access_requests")
        .select(
          "module, updated_at, leader_access_request_groups(access_groups(name))",
        )
        .eq("leader_user_id", userId)
        .eq("status", "approved")
        .order("module"),
      supabaseAdmin
        .from("activity_logs")
        .select("id, created_at, user_name, action")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  for (const result of [peserta, assignment, leaderRequests, history])
    if (result.error) throw result.error;

  // assigned_by references auth.users, so PostgREST cannot embed the profile.
  let assigner: { full_name: string | null; email: string } | null = null;
  if (assignment.data) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", assignment.data.assigned_by)
      .maybeSingle();
    if (error) throw error;
    assigner = data;
  }
  type LeaderRow = {
    module: string;
    updated_at: string | null;
    leader_access_request_groups: { access_groups: { name: string } | null }[];
  };

  return {
    user: {
      ...profile,
      is_deleted: false,
      last_sign_in_at: authUser.data.user?.last_sign_in_at ?? null,
    },
    peserta: peserta.data ?? null,
    ketik_assignment: assignment.data
      ? {
          assigned_at: assignment.data.assigned_at,
          assigned_by_name: assigner ? displayName(assigner) : null,
        }
      : null,
    leader_access: ((leaderRequests.data ?? []) as unknown as LeaderRow[]).map(
      (row) => ({
        module: row.module,
        approved_at: row.updated_at,
        group_names: row.leader_access_request_groups
          .map((link) => link.access_groups?.name)
          .filter((name): name is string => Boolean(name)),
      }),
    ),
    history: (history.data ?? []).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      actor_name: row.user_name,
      action: row.action,
    })),
  };
}

const OPTION_LIMIT = 20;

/** PostgREST `or` filters are comma separated, so strip filter syntax. */
function searchTerm(raw: string): string {
  return raw
    .replace(/[%,()*"\\]/g, " ")
    .trim()
    .slice(0, 80);
}

export async function getPesertaLinkOptions(
  query: string,
  userId: string | null,
): Promise<PesertaLinkOption[]> {
  const account = userId ? await getActiveProfile(userId) : null;
  const term = searchTerm(query);
  let request = supabaseAdmin
    .from("profiler_peserta")
    .select(
      `${PESERTA_SUMMARY}, email_ojk, akun:profiles!akun_id(id, full_name, email)`,
    )
    .order("nama")
    .order("id")
    .limit(OPTION_LIMIT);
  if (term)
    request = request.or(`nama.ilike.%${term}%,email_ojk.ilike.%${term}%`);
  else if (account?.email)
    // ilike for case only: escape the LIKE wildcards an email can contain.
    request = request.ilike("email_ojk", account.email.replace(/[\\%_]/g, "\\$&"));
  const { data, error } = await request;
  if (error) throw error;

  const accountEmail = account?.email?.trim().toLowerCase() ?? "";
  type OptionRow = {
    id: string;
    nama: string;
    batch_name: string | null;
    tim: string | null;
    email_ojk: string | null;
    akun: { id: string; full_name: string | null; email: string } | null;
  };
  return ((data ?? []) as unknown as OptionRow[])
    .map(({ email_ojk, akun, ...peserta }) => ({
      ...peserta,
      linked_user: akun,
      email_match:
        Boolean(accountEmail) &&
        email_ojk?.trim().toLowerCase() === accountEmail,
    }))
    .sort((a, b) => Number(b.email_match) - Number(a.email_match));
}

export async function linkUserPeserta(
  actor: AdminActor,
  userId: string,
  pesertaId: string,
): Promise<void> {
  const target = await assertManageableTarget(actor, userId);
  const { data: peserta, error } = await supabaseAdmin
    .from("profiler_peserta")
    .select("id, nama, batch_name, akun_id")
    .eq("id", pesertaId)
    .maybeSingle();
  if (error) throw error;
  if (!peserta) throw new AdminUserError("PESERTA_NOT_FOUND");
  if (peserta.akun_id === userId) return;
  if (peserta.akun_id) throw new AdminUserError("PESERTA_TAKEN");
  const { data: outcome, error: linkError } = await supabaseAdmin.rpc(
    "link_profiler_peserta_account",
    { p_akun_id: userId, p_peserta_id: pesertaId },
  );
  if (linkError) throw linkError;
  if (outcome === "not_found") throw new AdminUserError("PESERTA_NOT_FOUND");
  if (outcome === "taken") throw new AdminUserError("PESERTA_TAKEN");
  if (outcome === "unchanged") return;

  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Menautkan akun ${displayName(target)} ke peserta ${peserta.nama}${peserta.batch_name ? ` (${peserta.batch_name})` : ""}`,
    module: "USER_MGMT",
    type: "link_peserta",
  });
}

export async function unlinkUserPeserta(
  actor: AdminActor,
  userId: string,
): Promise<void> {
  const target = await assertManageableTarget(actor, userId);
  const { data, error } = await supabaseAdmin
    .from("profiler_peserta")
    .update({ akun_id: null })
    .eq("akun_id", userId)
    .select("nama");
  if (error) throw error;
  if (!data?.length) return;
  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Melepas tautan akun ${displayName(target)} dari peserta ${data[0]!.nama}`,
    module: "USER_MGMT",
    type: "unlink_peserta",
  });
}

/**
 * Sets the last WIB day an account may be used (null = no limit). The auth
 * middleware refuses the account after that day, so extending an expired
 * account lets it back in without approving it again.
 */
export async function setActiveUntil(
  actor: AdminActor,
  userId: string,
  day: string | null,
): Promise<void> {
  if (day && day < wibToday()) throw new AdminUserError("PAST_END_DATE");
  const target = await assertManageableTarget(actor, userId);
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ active_until: day })
    .eq("id", userId);
  if (error) throw error;
  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Mengubah masa aktif ${displayName(target)} menjadi ${day ? `sampai ${formatWibDay(day)}` : "tanpa batas waktu"}`,
    module: "USER_MGMT",
    type: "active_until",
  });
}

/**
 * Sends the recovery email to the address stored on the account. The browser
 * never supplies the address, so a reset cannot be redirected to someone else.
 */
export async function sendPasswordReset(
  actor: AdminActor,
  userId: string,
  redirectTo: string | null,
): Promise<{ email: string }> {
  const target = await assertManageableTarget(actor, userId);
  if (!target.email) throw new AdminUserError("NO_EMAIL");
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
    target.email,
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) {
    console.error("[admin] reset password email failed", error.message);
    throw new AdminUserError("RESET_FAILED");
  }
  await logActivity({
    user_id: actor.id,
    user_name: actor.email,
    target_user_id: userId,
    action: `Mengirim email reset password ke ${target.email}`,
    module: "USER_MGMT",
    type: "reset_password",
  });
  return { email: target.email };
}

/** Linked account of a KTP participant, for the profile page. */
export async function getPesertaAccount(
  pesertaId: string,
): Promise<LinkedAccountSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("profiler_peserta")
    .select(
      "akun:profiles!akun_id(id, full_name, email, role, status, is_deleted)",
    )
    .eq("id", pesertaId)
    .maybeSingle();
  if (error) throw error;
  const akun = data?.akun as unknown as
    (LinkedAccountSummary & { is_deleted: boolean }) | null;
  if (!akun || akun.is_deleted) return null;
  const { is_deleted: _deleted, ...summary } = akun;
  return summary;
}
