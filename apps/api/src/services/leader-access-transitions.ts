import { supabaseAdmin } from "../lib/supabase";

export type LeaderAccessAction = "approve" | "reject" | "revoke" | "groups";

export class LeaderAccessTransitionError extends Error {
  constructor(
    message: string,
    readonly code:
      "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SERVER_ERROR",
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

const FAILURES = {
  LEADER_ACCESS_INVALID_ACTION: [
    "Aksi akses tidak dikenal.",
    "BAD_REQUEST",
    400,
  ],
  LEADER_ACCESS_INVALID_GROUPS: [
    "Pilih grup akses yang masih aktif.",
    "BAD_REQUEST",
    400,
  ],
  LEADER_ACCESS_FORBIDDEN: [
    "Akun ini tidak dapat mengubah akses leader.",
    "FORBIDDEN",
    403,
  ],
  LEADER_ACCESS_SELF_REVIEW: [
    "Akses milik sendiri tidak dapat disetujui atau diubah.",
    "FORBIDDEN",
    403,
  ],
  LEADER_ACCESS_NOT_FOUND: [
    "Permintaan akses tidak ditemukan.",
    "NOT_FOUND",
    404,
  ],
  LEADER_ACCESS_CONFLICT: [
    "Permintaan akses sudah berubah. Muat ulang lalu coba lagi.",
    "CONFLICT",
    409,
  ],
} as const;

export async function transitionLeaderAccess(
  requestId: string,
  reviewerId: string,
  action: LeaderAccessAction,
  groupIds: string[] | null = null,
  note?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("transition_leader_access", {
    p_request_id: requestId,
    p_reviewer_id: reviewerId,
    p_action: action,
    p_group_ids: groupIds,
    p_note: note || null,
  });
  if (!error) return;
  if (error.code === "P0001" && Object.hasOwn(FAILURES, error.message)) {
    const [message, code, status] =
      FAILURES[error.message as keyof typeof FAILURES];
    throw new LeaderAccessTransitionError(message, code, status);
  }
  throw new LeaderAccessTransitionError(
    "Perubahan akses belum tersimpan. Coba lagi beberapa saat lagi.",
    "SERVER_ERROR",
    500,
  );
}
