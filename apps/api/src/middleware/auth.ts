import { Context, Next } from "hono";
import { createUserClient, supabaseAdmin } from "../lib/supabase";
import { normalizeAuthProfileStatus } from "../lib/profile";
import { User } from "@supabase/supabase-js";
import { normalizeRole, type UserProfile } from "@trainers/types";

export interface AuthProfile {
  status: string | null;
  role: UserProfile["role"];
  full_name: string | null;
  is_deleted: boolean | null;
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
    .select("status, role, full_name, is_deleted")
    .eq("id", user.id)
    .maybeSingle();

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

  const role = normalizeRole(profile.role);
  if (!role)
    return c.json(
      buildForbidden("FORBIDDEN", "Anda tidak memiliki akses ke resource ini."),
      403,
    );
  c.set("user", user);
  c.set("profile", { ...profile, role });
  // Token disimpan agar route bisa membangun user client (RLS aktif).
  // Disimpan apa adanya — jangan pernah di-log.
  c.set("token", token);
  await next();
};
