import { SupabaseClient } from "@supabase/supabase-js";
import {
  PdktMailboxItem,
  PdktMailboxBatch,
  PdktMailboxReply,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";

const MAILBOX_MANAGER_ROLES = new Set(["admin", "trainer"]);

type BulkDeleteResult = {
  successCount: number;
  failureCount: number;
  errors: string[];
};

type BulkDeleteOutcome =
  | { status: "success" }
  | { status: "failure"; error: string };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Checks if an actor can delete a mailbox item.
 */
export function canDeletePdktMailboxItem(
  actor: { id: string; role?: string | null },
  item: { created_by_user_id?: string | null; user_id?: string | null },
): boolean {
  const role = (actor.role || "").toLowerCase().trim();
  const creatorId = item.created_by_user_id || item.user_id;
  return MAILBOX_MANAGER_ROLES.has(role) || creatorId === actor.id;
}

/**
 * Fetch all active shared canonical mailbox items.
 * Aligned with shared mailbox policy: returns canonical rows (is_shared_copy=false/null),
 * status !== 'deleted', and appends creator profile metadata and delete permission.
 */
export async function fetchMailboxItems(
  supabaseClient: SupabaseClient,
  actorOrId: string | { id: string; role: string },
): Promise<PdktMailboxItem[]> {
  const actor =
    typeof actorOrId === "string"
      ? { id: actorOrId, role: "agent" }
      : actorOrId;

  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("*")
    .neq("status", "deleted")
    .or("is_shared_copy.eq.false,is_shared_copy.is.null")
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Gagal mengambil data mailbox.");
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Batch query to resolve creator profile details (name and role)
  const creatorIds = Array.from(
    new Set(
      data
        .map((item: any) => item.created_by_user_id || item.user_id)
        .filter(Boolean),
    ),
  ) as string[];

  const profilesMap = new Map<
    string,
    { id: string; full_name: string; role: string }
  >();

  if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", creatorIds);

    if (!profilesError && profiles) {
      for (const p of profiles) {
        profilesMap.set(p.id, p);
      }
    }
  }

  // Map canonical items with creator summary and permissions
  return data.map((item: any) => {
    const creatorId = item.created_by_user_id || item.user_id;
    const profile = profilesMap.get(creatorId);

    const created_by_user = {
      id: creatorId || null,
      full_name: profile ? profile.full_name : "User Lama",
      role: profile ? profile.role : null,
      is_current_user: creatorId === actor.id,
    };

    const permissions = {
      can_delete: canDeletePdktMailboxItem(actor, item),
    };

    return {
      ...item,
      created_by_user,
      permissions,
    } as PdktMailboxItem;
  });
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
 * Controlled via RPC + policy check in service layer.
 */
export async function softDeleteMailboxItem(
  supabaseClient: SupabaseClient,
  id: string,
  actorOrId: string | { id: string; role: string },
): Promise<void> {
  const actor =
    typeof actorOrId === "string"
      ? { id: actorOrId, role: "agent" }
      : actorOrId;

  const { data: item, error: fetchError } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("user_id, created_by_user_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !item) {
    throw new Error("Item mailbox tidak ditemukan.");
  }

  if (!canDeletePdktMailboxItem(actor, item)) {
    const err = new Error("Anda hanya dapat menghapus email yang Anda buat sendiri.");
    (err as any).status = 403;
    throw err;
  }

  const { error: deleteError } = await supabaseClient.rpc(
    "soft_delete_pdkt_mailbox_item",
    {
      p_mailbox_id: id,
    },
  );

  if (deleteError) {
    throw new Error(deleteError.message || "Gagal menghapus item mailbox.");
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

/**
 * Bulk soft delete mailbox items by updating status to 'deleted'.
 * Controlled via RPC + policy check in service layer.
 */
export async function bulkSoftDeleteMailboxItems(
  supabaseClient: SupabaseClient,
  ids: string[],
  actorOrId: string | { id: string; role: string },
): Promise<BulkDeleteResult> {
  const actor =
    typeof actorOrId === "string"
      ? { id: actorOrId, role: "agent" }
      : actorOrId;

  if (ids.length === 0) {
    return { successCount: 0, failureCount: 0, errors: [] };
  }

  const { data: items, error: fetchError } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("id, user_id, created_by_user_id")
    .in("id", ids);

  if (fetchError || !items) {
    throw new Error("Gagal mengambil data email untuk dihapus.");
  }

  const itemById = new Map(items.map((item) => [item.id, item]));

  const operations = ids.map(async (id): Promise<BulkDeleteOutcome> => {
    const item = itemById.get(id);
    if (!item) {
      return {
        status: "failure",
        error: `Email dengan ID ${id} tidak ditemukan.`,
      };
    }

    if (!canDeletePdktMailboxItem(actor, item)) {
      return {
        status: "failure",
        error: `Email dengan ID ${item.id} tidak diizinkan untuk dihapus oleh Anda.`,
      };
    }

    try {
      const { error: deleteError } = await supabaseClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        {
          p_mailbox_id: item.id,
        },
      );

      if (deleteError) {
        return {
          status: "failure",
          error: `Gagal menghapus email ${item.id}: ${deleteError.message}`,
        };
      }

      return { status: "success" };
    } catch (error: unknown) {
      return {
        status: "failure",
        error: `Gagal menghapus email ${item.id}: ${getErrorMessage(error)}`,
      };
    }
  });

  const settled = await Promise.allSettled(operations);
  const outcomes = settled.map((result, index): BulkDeleteOutcome => {
    if (result.status === "fulfilled") return result.value;

    return {
      status: "failure",
      error: `Gagal menghapus email ${ids[index]}: ${getErrorMessage(result.reason)}`,
    };
  });

  const errors = outcomes
    .filter((outcome): outcome is Extract<BulkDeleteOutcome, { status: "failure" }> => outcome.status === "failure")
    .map((outcome) => outcome.error);

  return {
    successCount: outcomes.length - errors.length,
    failureCount: errors.length,
    errors,
  };
}
