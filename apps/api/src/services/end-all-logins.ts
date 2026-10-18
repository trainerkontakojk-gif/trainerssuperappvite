import { supabaseAdmin } from "../lib/supabase";

/**
 * Ends every open login of an account, on every device. Used when it can no
 * longer sign in (suspended, rejected, deleted, past its masa aktif) or loses
 * access (lower role).
 */
export async function endAllLogins(user_id: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("revoke_user_sessions", {
    p_user: user_id,
  });
  if (error)
    throw new Error(
      "Perubahan tersimpan, tetapi login yang masih terbuka belum bisa diakhiri. Coba simpan sekali lagi.",
    );
}
