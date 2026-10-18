import {
  PRACTICE_MODULE_LABELS,
  type PracticeModule,
  type PracticeQuotaErrorCode,
} from "@trainers/types";
import { createAdminClient } from "../lib/supabase";

/**
 * Daily practice limits (plans/markdown/kontrol-user-fase-2.md). The database
 * function owns the rule: role rule or per-user override, WIB day, one row per
 * request key so a retry of the same request is never counted twice.
 */

type ConsumeResult = {
  allowed: boolean;
  reason: "counted" | "replayed" | "exhausted" | "not_allowed";
  limit?: number | null;
  used?: number;
};

export class PracticeQuotaError extends Error {
  constructor(
    readonly code: PracticeQuotaErrorCode,
    readonly status: 403 | 429,
    message: string,
  ) {
    super(message);
  }

  toBody() {
    return {
      success: false as const,
      error: { code: this.code, message: this.message },
    };
  }
}

/**
 * Counts one start, or throws PracticeQuotaError when the day's limit is used
 * up. Returns true when this call added the count (only then may the caller
 * give it back), false when the request key was already counted.
 */
export async function consumePracticeQuota(
  userId: string,
  module: PracticeModule,
  requestKey: string,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(
    "consume_practice_quota",
    { p_user_id: userId, p_module: module, p_request_key: requestKey },
  );
  if (error) throw error;
  const result = data as ConsumeResult;
  if (result.allowed) return result.reason === "counted";

  const label = PRACTICE_MODULE_LABELS[module];
  if (result.reason === "not_allowed")
    throw new PracticeQuotaError(
      "PRACTICE_NOT_ALLOWED",
      403,
      `${label} belum dibuka untuk akunmu. Hubungi trainer jika perlu.`,
    );
  throw new PracticeQuotaError(
    "PRACTICE_LIMIT_REACHED",
    429,
    `Batas latihan ${label} hari ini sudah habis (${result.used} dari ${result.limit}). Jatah baru mulai pukul 00.00 WIB.`,
  );
}

/** Gives back a start that failed before the person could use it. */
export async function refundPracticeQuota(
  userId: string,
  module: PracticeModule,
  requestKey: string,
): Promise<void> {
  const { error } = await createAdminClient().rpc("refund_practice_quota", {
    p_user_id: userId,
    p_module: module,
    p_request_key: requestKey,
  });
  // A failed refund must not hide the original failure from the caller.
  if (error)
    console.error("[PracticeQuota] Refund failed", {
      module,
      code: error.code,
    });
}

/**
 * PDKT counts each new email, and replies are free. An email that reached the
 * mailbox without being counted (inserted through a database function the
 * browser can call) is counted once, against the person answering it.
 */
export async function ensurePdktReplyCounted(
  actorId: string,
  mailboxId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("pdkt_mailbox_items")
    .select("id, created_by_user_id, client_request_id")
    .eq("id", mailboxId)
    .maybeSingle();
  if (error) throw error;
  // A missing email is reported by the reply itself.
  if (!item) return;

  const { count, error: usageError } = await admin
    .from("practice_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", item.created_by_user_id)
    .eq("module", "pdkt")
    .eq("request_key", item.client_request_id ?? `mailbox:${item.id}`)
    .is("refunded_at", null);
  if (usageError) throw usageError;
  if (count) return;

  await consumePracticeQuota(actorId, "pdkt", `mailbox:${item.id}`);
}
