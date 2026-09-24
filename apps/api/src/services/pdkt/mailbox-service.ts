import { randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  mapSimulationSubjectRowToSnapshot,
  PdktMailboxItem,
  type PdktMailboxListItem,
  PdktMailboxBatch,
  PdktMailboxReply,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import {
  toPdktSimulationConfig,
  toPdktSimulationScenario,
} from "./scenario-projections";

const MAILBOX_MANAGER_ROLES = new Set(["admin", "trainer"]);

type BulkDeleteResult = {
  successCount: number;
  failureCount: number;
  errors: string[];
};

type StatusError = Error & { status: number };

function statusError(status: number, message: string): StatusError {
  const error = new Error(message) as StatusError;
  error.status = status;
  return error;
}

function throwMappedMailboxRpcError(
  error: { message?: string | null; code?: string | null } | null | undefined,
  fallbackMessage: string,
): never {
  const message = error?.message || fallbackMessage;
  const normalized = message.toLowerCase();
  const code = error?.code?.toUpperCase();
  if (
    code === "PGRST301" ||
    code === "401" ||
    normalized.includes("jwt expired")
  ) {
    throw statusError(401, "Sesi Anda telah berakhir. Silakan login kembali.");
  }
  if (code === "42501") {
    throw statusError(
      403,
      "Anda tidak memiliki izin untuk melakukan tindakan ini.",
    );
  }
  if (code === "PGRST116") {
    throw statusError(404, "Email mailbox tidak ditemukan.");
  }
  if (code === "23505") {
    throw statusError(409, "Data sudah ada, tidak dapat membuat duplikat.");
  }
  if (
    normalized.includes("duplicate key") ||
    normalized.includes("unique constraint") ||
    normalized.includes("conflict") ||
    normalized.includes("already exists")
  ) {
    throw statusError(
      409,
      normalized.includes("idempotency")
        ? "Idempotency key digunakan untuk target berbeda."
        : "Data sudah ada, tidak dapat membuat duplikat.",
    );
  }
  if (normalized.includes("participant reply requires")) {
    throw statusError(
      403,
      "Hanya admin/trainer yang dapat membalas email bertarget peserta.",
    );
  }
  if (normalized.includes("participant attribution requires")) {
    throw statusError(403, "Hanya admin/trainer yang dapat memilih peserta.");
  }
  if (
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("policy")
  ) {
    throw statusError(
      403,
      "Anda tidak memiliki izin untuk melakukan tindakan ini.",
    );
  }
  if (
    normalized.includes("mailbox item not found") ||
    normalized.includes("not_found")
  ) {
    throw statusError(404, "Email mailbox tidak ditemukan.");
  }
  if (normalized.includes("cannot reply to a deleted")) {
    throw statusError(409, "Email yang sudah dihapus tidak dapat dibalas.");
  }
  if (normalized.includes("validation_error")) {
    throw statusError(400, "Data mailbox tidak valid.");
  }
  console.error("[PDKT] Mailbox RPC failed:", error);
  throw statusError(500, fallbackMessage);
}

type BulkDeleteOutcome =
  | { status: "success" }
  | { status: "failure"; error: string };

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
 * The mailbox list is rendered as a text-only inbox. Inline base64 attachments
 * are stored duplicated across `inbound_email`, `emails_thread`,
 * `scenario_snapshot`, and `config_snapshot`; sending all copies slows (and can
 * break) opening the session. The detail endpoint returns them on demand.
 */
export function toMailboxListRow(
  row: Record<string, any>,
): PdktMailboxListItem {
  const listRow = { ...row };
  delete listRow.inbound_email;
  delete listRow.emails_thread;
  delete listRow.scenario_snapshot;
  delete listRow.config_snapshot;
  return listRow as PdktMailboxListItem;
}

type MailboxActor = { id: string; role: string };

// Keep the list query scalar-only. The four JSON snapshots contain duplicated
// inline base64 and are fetched exclusively through the detail endpoint.
const MAILBOX_LIST_COLUMNS = [
  "id",
  "user_id",
  "status",
  "created_at",
  "updated_at",
  "deleted_at",
  "replied_at",
  "sender_name",
  "sender_email",
  "subject",
  "snippet",
  "history_id",
  "last_activity_at",
  "created_by_user_id",
  "client_request_id",
  "share_batch_id",
  "is_shared_copy",
  "shared_at",
  "source_mailbox_item_id",
  "simulation_subject_type",
  "simulation_subject_peserta_id",
  "simulation_subject_name",
  "simulation_subject_batch_name",
  "simulation_subject_team",
].join(",");

/**
 * Resolve creator profiles in one batch and attach creator metadata plus
 * delete permission to every canonical mailbox row.
 */
async function decorateMailboxRows(
  rows: Array<Record<string, any>>,
  actor: MailboxActor,
): Promise<Array<Record<string, any>>> {
  if (rows.length === 0) return [];

  const creatorIds = Array.from(
    new Set(
      rows
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

  return rows.map((item: any) => {
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
      simulationSubject: mapSimulationSubjectRowToSnapshot(item),
    };
  });
}

/**
 * Fetch all active shared canonical mailbox items.
 * Aligned with shared mailbox policy: returns canonical rows (is_shared_copy=false/null),
 * status !== 'deleted', and appends creator profile metadata and delete permission.
 * Heavy JSON snapshots are omitted; use `fetchMailboxItemById` for the full row.
 */
export async function fetchMailboxItems(
  supabaseClient: SupabaseClient,
  actorOrId: string | { id: string; role: string },
): Promise<PdktMailboxListItem[]> {
  const actor =
    typeof actorOrId === "string"
      ? { id: actorOrId, role: "agent" }
      : actorOrId;

  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select(MAILBOX_LIST_COLUMNS)
    .neq("status", "deleted")
    .or("is_shared_copy.eq.false,is_shared_copy.is.null")
    .order("last_activity_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[PDKT] Mailbox fetch failed:", error);
    throw new Error("Gagal mengambil data mailbox.");
  }

  if (!data || data.length === 0) {
    return [];
  }

  const decorated = await decorateMailboxRows(data, actor);
  return decorated.map((item) => toMailboxListRow(item));
}

/**
 * Fetch a single active mailbox item with its inline attachments and thread.
 * Used to keep the list payload small while the detail pane stays complete.
 */
export async function fetchMailboxItemById(
  supabaseClient: SupabaseClient,
  actorOrId: string | { id: string; role: string },
  id: string,
): Promise<PdktMailboxItem | null> {
  const actor =
    typeof actorOrId === "string"
      ? { id: actorOrId, role: "agent" }
      : actorOrId;

  const { data, error } = await supabaseClient
    .from("pdkt_mailbox_items")
    .select("*")
    .eq("id", id)
    .neq("status", "deleted")
    .or("is_shared_copy.eq.false,is_shared_copy.is.null")
    .maybeSingle();

  if (error) {
    console.error("[PDKT] Mailbox item fetch failed:", error);
    throw new Error("Gagal mengambil data email.");
  }

  if (!data) return null;

  const [item] = await decorateMailboxRows([data], actor);
  if (!item) return null;

  return {
    ...item,
    scenario_snapshot: toPdktSimulationScenario(item.scenario_snapshot),
    config_snapshot: toPdktSimulationConfig(item.config_snapshot),
  } as PdktMailboxItem;
}

/**
 * Create a new mailbox item using the submit_pdkt_mailbox_batch RPC.
 * Supports idempotency via client_request_id.
 */
export type PdktMailboxWritePayload = PdktMailboxBatch & {
  /** Authoritative snapshot resolved by the API before generation/save. */
  simulationSubjectSnapshot?: SimulationSubjectSnapshot;
};

async function createPdktMailboxSubjectIntent(
  actorId: string,
  snapshot: SimulationSubjectSnapshot,
  clientRequestId: string,
): Promise<string> {
  if (
    snapshot.type !== "participant" ||
    !snapshot.participantId ||
    !snapshot.displayName?.trim()
  ) {
    throw statusError(400, "Snapshot peserta tidak valid.");
  }

  const token = randomUUID();
  const { error } = await supabaseAdmin
    .from("pdkt_mailbox_subject_intents")
    .insert({
      token,
      actor_id: actorId,
      subject_type: "participant",
      subject_peserta_id: snapshot.participantId,
      subject_name: snapshot.displayName,
      subject_batch_name: snapshot.batchName,
      subject_team: snapshot.team,
      client_request_id: clientRequestId,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

  if (error) {
    console.error("[PDKT] Failed to register subject snapshot intent:", error);
    throw statusError(503, "Gagal menyiapkan snapshot peserta.");
  }
  return token;
}

export async function createMailboxItem(
  supabaseClient: SupabaseClient,
  payload: PdktMailboxWritePayload,
  actorId?: string,
): Promise<string> {
  const subject = payload.simulationSubject ?? { type: "self" as const };
  if (
    payload.simulationSubjectSnapshot &&
    (payload.simulationSubjectSnapshot.type !== subject.type ||
      (payload.simulationSubjectSnapshot.type === "participant" &&
        (subject.type !== "participant" ||
          subject.participantId !==
            payload.simulationSubjectSnapshot.participantId)))
  ) {
    throw statusError(400, "Pilihan peserta tidak cocok dengan snapshot sesi.");
  }
  if (subject.type === "participant") {
    const clientRequestId = payload.client_request_id || `pdkt-${randomUUID()}`;
    const snapshot = payload.simulationSubjectSnapshot;
    let snapshotToken: string | null = null;
    if (snapshot?.type === "participant") {
      if (!actorId) {
        throw statusError(
          500,
          "Snapshot peserta harus dibuat melalui konteks terautentikasi.",
        );
      }
      // The intent is actor-bound by the authenticated RPC. The API caller
      // supplies the user JWT; the service role only registers the
      // already-resolved snapshot.
      snapshotToken = await createPdktMailboxSubjectIntent(
        actorId,
        snapshot,
        clientRequestId,
      );
    }
    const { data, error } = await supabaseClient.rpc(
      "submit_pdkt_mailbox_batch_with_subject",
      {
        p_client_request_id: clientRequestId,
        p_sender_name: payload.sender_name,
        p_sender_email: payload.sender_email,
        p_subject: payload.subject,
        p_snippet: payload.snippet,
        p_scenario_snapshot: payload.scenario_snapshot,
        p_config_snapshot: payload.config_snapshot,
        p_inbound_email: payload.inbound_email,
        p_subject_type: "participant",
        p_subject_peserta_id: subject.participantId,
        // Without an intent the RPC resolves the current participant row;
        // caller-controlled snapshot fields are never sent as authority.
        p_subject_name: snapshotToken ? (snapshot?.displayName ?? null) : null,
        p_subject_batch_name: snapshotToken
          ? (snapshot?.batchName ?? null)
          : null,
        p_subject_team: snapshotToken ? (snapshot?.team ?? null) : null,
        p_subject_snapshot_token: snapshotToken,
      },
    );
    if (error) {
      const msg = error.message || "";
      if (msg.includes("FORBIDDEN: participant attribution")) {
        throw statusError(
          403,
          "Hanya admin/trainer yang dapat memilih peserta.",
        );
      }
      if (
        msg.includes("NOT_FOUND: participant") ||
        msg.includes("NOT_FOUND: peserta")
      ) {
        throw statusError(404, "Peserta tidak ditemukan.");
      }
      if (msg.includes("VALIDATION_ERROR: participant")) {
        throw statusError(400, "Pilihan peserta tidak valid.");
      }
      throwMappedMailboxRpcError(error, "Gagal membuat item mailbox.");
    }
    return data;
  }
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
    throwMappedMailboxRpcError(error, "Gagal membuat item mailbox.");
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
    throw statusError(
      403,
      "Anda hanya dapat menghapus email yang Anda buat sendiri.",
    );
  }

  const { error: deleteError } = await supabaseClient.rpc(
    "soft_delete_pdkt_mailbox_item",
    {
      p_mailbox_id: id,
    },
  );

  if (deleteError) {
    throwMappedMailboxRpcError(deleteError, "Gagal menghapus item mailbox.");
  }
}

/**
 * Submit an agent reply and return the row-lock outcome from the database.
 * The outcome RPC is distinct from the legacy UUID RPC so direct callers keep
 * their existing contract while API retries can avoid duplicate evaluations.
 */
export async function submitMailboxReplyWithOutcome(
  supabaseClient: SupabaseClient,
  payload: PdktMailboxReply,
  _actorId?: string,
): Promise<{ historyId: string; created: boolean }> {
  const { data: outcome, error } = await supabaseClient.rpc(
    "submit_pdkt_mailbox_reply_with_outcome",
    {
      p_mailbox_id: payload.mailboxId,
      p_agent_reply: payload.reply,
      p_time_taken: payload.timeTaken,
    },
  );

  if (error) {
    throwMappedMailboxRpcError(error, "Gagal mengirim balasan mailbox.");
  }

  if (
    !outcome ||
    typeof outcome !== "object" ||
    typeof outcome.history_id !== "string" ||
    outcome.history_id.trim().length === 0 ||
    typeof outcome.created !== "boolean"
  ) {
    throw new Error("Gagal mengirim balasan mailbox.");
  }

  return { historyId: outcome.history_id, created: outcome.created };
}

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
    throwMappedMailboxRpcError(error, "Gagal mengirim balasan mailbox.");
  }
  if (typeof historyId !== "string" || historyId.trim().length === 0) {
    throw new Error("Gagal mengirim balasan mailbox.");
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
        console.error("[PDKT] Bulk mailbox delete failed:", deleteError);
        return {
          status: "failure",
          error: `Gagal menghapus email ${item.id}.`,
        };
      }

      return { status: "success" };
    } catch (error: unknown) {
      console.error("[PDKT] Bulk mailbox delete failed:", error);
      return {
        status: "failure",
        error: `Gagal menghapus email ${item.id}.`,
      };
    }
  });

  const settled = await Promise.allSettled(operations);
  const outcomes = settled.map((result, index): BulkDeleteOutcome => {
    if (result.status === "fulfilled") return result.value;

    return {
      status: "failure",
      error: `Gagal menghapus email ${ids[index]}.`,
    };
  });

  const errors = outcomes
    .filter(
      (outcome): outcome is Extract<BulkDeleteOutcome, { status: "failure" }> =>
        outcome.status === "failure",
    )
    .map((outcome) => outcome.error);

  return {
    successCount: outcomes.length - errors.length,
    failureCount: errors.length,
    errors,
  };
}
