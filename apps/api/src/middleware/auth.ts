import { Context, Next } from "hono";
import { createUserClient, supabaseAdmin } from "../lib/supabase";
import { normalizeAuthProfileStatus } from "../lib/profile";
import { endAllLogins } from "../services/end-all-logins";
import { User } from "@supabase/supabase-js";
import {
  accountExpiredMessage,
  isAccountExpired,
  normalizeRole,
  type UserProfile,
} from "@trainers/types";

export interface AuthProfile {
  status: string | null;
  role: UserProfile["role"];
  full_name: string | null;
  is_deleted: boolean | null;
  /** Last WIB day the account may be used; absent before its migration. */
  active_until?: string | null;
}

export type AuthVariables = {
  user: User;
  profile: AuthProfile;
  /** JWT mentah user, dipakai route yang butuh RLS aktif. */
  token: string;
};

function buildForbidden(code: string, message: string) {
  return {
    success: false,
    error: { code, message },
  };
}

export const authMiddleware = async (
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      },
      401,
    );
  }

  const token = authHeader.split(" ")[1];
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid token" },
      },
      401,
    );
  }

  const userClient = createUserClient(token);
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    // "*" so a database without active_until yet keeps signing users in.
    .select("*")
    .eq("id", user.id)
    .maybeSingle<AuthProfile>();

  if (profileError) {
    return c.json(
      buildForbidden(
        "PROFILE_ERROR",
        "Gagal memverifikasi profil Anda. Silakan coba lagi.",
      ),
      403,
    );
  }

  if (!profile) {
    return c.json(
      buildForbidden(
        "PROFILE_NOT_FOUND",
        "Profil tidak ditemukan. Silakan hubungi administrator.",
      ),
      403,
    );
  }

  if (profile.is_deleted) {
    return c.json(
      buildForbidden(
        "ACCOUNT_DELETED",
        "Akun Anda telah dinonaktifkan. Silakan hubungi administrator.",
      ),
      403,
    );
  }

  const normalizedStatus = normalizeAuthProfileStatus(profile.status);

  if (normalizedStatus === "pending") {
    return c.json(
      buildForbidden(
        "ACCOUNT_PENDING",
        "Akun Anda masih menunggu persetujuan administrator.",
      ),
      403,
    );
  }

  if (normalizedStatus !== "active") {
    return c.json(
      buildForbidden(
        "ACCOUNT_INACTIVE",
        "Akun Anda tidak aktif. Silakan hubungi administrator.",
      ),
      403,
    );
  }

  if (isAccountExpired(profile.active_until)) {
    // The first request after the last day also ends the other open logins.
    await endAllLogins(user.id).catch((revokeError: Error) =>
      console.error("[auth] ending expired logins failed", revokeError.message),
    );
    return c.json(
      buildForbidden(
        "ACCOUNT_EXPIRED",
        accountExpiredMessage(profile.active_until!),
      ),
      403,
    );
  }

  const role = normalizeRole(profile.role);
  if (!role)
    return c.json(
      buildForbidden("FORBIDDEN", "Anda tidak memiliki akses ke resource ini."),
      403,
    );
  c.set("user", user);
  c.set("profile", {
    status: profile.status,
    role,
    full_name: profile.full_name,
    is_deleted: profile.is_deleted,
    active_until: profile.active_until ?? null,
  });
  // Token disimpan agar route bisa membangun user client (RLS aktif).
  // Disimpan apa adanya — jangan pernah di-log.
  c.set("token", token);
  await next();
};
