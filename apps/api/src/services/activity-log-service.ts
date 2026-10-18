import { supabaseAdmin } from "../lib/supabase";

export async function logActivity(params: {
  user_id: string;
  user_name: string;
  action: string;
  module: string;
  type: string;
  /** Account the change was made to, shown on its user page. */
  target_user_id?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("activity_logs").insert({
    user_id: params.user_id,
    user_name: params.user_name,
    action: params.action,
    module: params.module,
    type: params.type,
    target_user_id: params.target_user_id ?? null,
  });

  if (error) {
    console.error("[ActivityLog] Failed to insert activity log:", error);
  }
}
