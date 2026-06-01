import { SupabaseClient } from "@supabase/supabase-js";
import {
  PdktMailboxItem,
  PdktMailboxBatch,
  PdktMailboxReply,
} from "@trainers/types";

/**
 * Fetch all active mailbox items for a specific user.
 * Aligned with Vite schema: uses status !== 'deleted' and last_activity_at ordering.
 */
export async function fetchMailboxItems(
  supabaseClient: SupabaseClient,
  userId: string,
): Promise<PdktMailboxItem[]> {
  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Gagal mengambil data mailbox.");
  }

  if (!data || data.length === 0) {
    console.warn(
      "[PDKT] Empty mailbox for user:",
      userId,
      "- verify RLS policies, user_id mismatch, or data existence",
    );
  }

  return data as PdktMailboxItem[];
}

/**
 * Create a new mailbox item using the submit_pdkt_mailbox_batch RPC.
 * Supports idempotency via client_request_id.
 */
export async function createMailboxItem(
  supabaseClient: SupabaseClient,
  payload: PdktMailboxBatch,
): Promise<string> {
  const { data, error } = await supabaseClient.rpc(
    "submit_pdkt_mailbox_batch",
    {
      p_client_request_id: payload.client_request_id || null,
      p_sender_name: payload.sender_name,
      p_sender_email: payload.sender_email,
      p_subject: payload.subject,
      p_snippet: payload.snippet,
      p_scenario_snapshot: payload.scenario_snapshot,
      p_config_snapshot: payload.config_snapshot,
      p_inbound_email: payload.inbound_email,
    },
  );

  if (error) {
    throw new Error(error.message || "Gagal membuat item mailbox.");
  }

  return data;
}

/**
 * Soft delete a mailbox item by updating status to 'deleted'.
 */
export async function softDeleteMailboxItem(
  supabaseClient: SupabaseClient,
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message || "Gagal menghapus item mailbox.");
  }
}

/**
 * Submit an agent reply to a mailbox item using the submit_pdkt_mailbox_reply RPC.
 * Returns the history_id for evaluation polling.
 */
export async function submitMailboxReply(
  supabaseClient: SupabaseClient,
  payload: PdktMailboxReply,
): Promise<string> {
  const { data: historyId, error } = await supabaseClient.rpc(
    "submit_pdkt_mailbox_reply",
    {
      p_mailbox_id: payload.mailboxId,
      p_agent_reply: payload.reply,
      p_time_taken: payload.timeTaken,
    },
  );

  if (error) {
    throw new Error(error.message || "Gagal mengirim balasan mailbox.");
  }

  return historyId;
}
