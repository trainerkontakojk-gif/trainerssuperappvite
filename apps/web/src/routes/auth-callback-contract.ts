import type { UserProfile } from "@trainers/types";

export function getAuthCallbackDestination(
  profile: Pick<UserProfile, "status"> | null,
): "/dashboard" | "/waiting-approval" {
  return profile?.status === "active" ? "/dashboard" : "/waiting-approval";
}

export function getAuthCallbackError(
  error: Error | null,
  session: { user: { id: string } } | null,
): string | null {
  if (error) {
    return "Login Google gagal diselesaikan. Silakan kembali dan coba lagi.";
  }
  if (!session) {
    return "Sesi login Google tidak ditemukan. Silakan kembali dan coba lagi.";
  }
  return null;
}
