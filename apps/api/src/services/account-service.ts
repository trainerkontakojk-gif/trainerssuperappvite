import { supabaseAdmin } from "../lib/supabase";
import { logActivity } from "./activity-log-service";

export async function revokeOwnSessions(params: {
  accessToken: string;
  userId: string;
  actorName: string;
}) {
  const { error } = await supabaseAdmin.auth.admin.signOut(
    params.accessToken,
    "global",
  );

  if (error) {
    console.error("[Account] revokeOwnSessions failed:", error);
    throw new Error("Gagal logout dari semua perangkat. Silakan coba lagi.");
  }

  await logActivity({
    user_id: params.userId,
    user_name: params.actorName,
    action: "Logout semua perangkat",
    module: "ACCOUNT",
    type: "logout_all_devices",
  });

  return { success: true as const };
}
