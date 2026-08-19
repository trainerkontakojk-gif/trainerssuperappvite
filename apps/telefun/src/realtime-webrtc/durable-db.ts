import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import {
  assertTelefunWebRtcModelId,
  type TelefunWebRtcModelId,
} from "./contracts.js";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export type AttemptState =
  | "claimed"
  | "brokered"
  | "sideband_connected"
  | "ending"
  | "ended";
export type AttemptOutcome =
  | "completed"
  | "failed"
  | "network_lost"
  | "orphaned";
export type UsageStatus = "pending" | "persisted" | "incomplete" | "failed";

export interface TelefunWebRtcOrphanCandidate {
  leaseId: string;
  attemptId: string;
  sessionId: string;
  userId: string;
  provider: "openai-webrtc";
  providerCallReference: string | null;
  sidebandConnected: boolean;
}

export interface WebRtcAttemptClaim {
  claimed: boolean;
  attemptId: string;
  finalizationKey: string;
  usageRequestId: `telefun-webrtc:${string}`;
  state: AttemptState;
  reason: string;
}

export interface TelefunWebRtcDb {
  claimAttempt(input: {
    sessionId: string;
    userId: string;
    attemptId: string;
    modelId: TelefunWebRtcModelId;
    transport: "openai-webrtc";
  }): Promise<WebRtcAttemptClaim>;
  getAttempt(
    sessionId: string,
    userId: string,
  ): Promise<{
    attemptId: string;
    finalizationKey: string;
    state: AttemptState;
    usageRequestId: string;
    providerCallIdHash: string | null;
    modelId: TelefunWebRtcModelId;
  } | null>;
  /** Atomically fails a still-active pre-created session only when no attempt exists. */
  failSessionWithoutAttempt?: (
    sessionId: string,
    userId: string,
  ) => Promise<{ applied: boolean; terminal: boolean; reason: string }>;
  bindProviderCall(
    attemptId: string,
    userId: string,
    callIdHash: string,
  ): Promise<{ accepted: boolean; state: AttemptState; reason: string }>;
  storeProviderCallReference?(input: {
    attemptId: string;
    userId: string;
    providerCallReferenceCiphertext: string;
  }): Promise<{ accepted: boolean; reason: string }>;
  markSidebandConnected(
    attemptId: string,
    userId: string,
  ): Promise<{ accepted: boolean; state: AttemptState; reason: string }>;
  checkpointTranscript(input: {
    attemptId: string;
    userId: string;
    sequence: number;
    dedupeKey: string;
    speaker: "agent" | "consumer";
    text: string;
    startMs: number;
    isPartial: boolean;
  }): Promise<{
    accepted: boolean;
    operation: string;
    checkpointSequence: number;
    reason: string;
  }>;
  beginFinalization(input: {
    attemptId: string;
    userId: string;
    finalizationKey: string;
    outcome: AttemptOutcome;
  }): Promise<{
    accepted: boolean;
    shouldFinalize: boolean;
    state: AttemptState;
    reason: string;
  }>;
  finalizeAttempt(input: {
    attemptId: string;
    userId: string;
    finalizationKey: string;
    outcome: AttemptOutcome;
    durationSeconds: number;
  }): Promise<{ applied: boolean; idempotent: boolean; reason: string }>;
  markUsage(input: {
    attemptId: string;
    userId: string;
    status: Exclude<UsageStatus, "pending">;
    error?: string;
  }): Promise<{
    applied: boolean;
    idempotent: boolean;
    usageRequestId: string;
    status: UsageStatus;
    reason: string;
  }>;
  acquireLease?(input: {
    userId: string;
    sessionId: string;
    attemptId: string;
    provider: "openai-webrtc";
    leaseTokenHash: string;
    ttlMs: number;
    maxUserSessions: number;
    maxProviderSessions: number;
  }): Promise<{
    granted: boolean;
    leaseId?: string;
    expiresAtMs?: number;
    activeCount: number;
    reason: string;
  }>;
  renewLease?(input: {
    leaseId: string;
    userId: string;
    sessionId: string;
    attemptId: string;
    leaseTokenHash: string;
    ttlMs: number;
  }): Promise<{ renewed: boolean; expiresAtMs?: number; reason: string }>;
  releaseLease?(input: {
    leaseId: string;
    userId: string;
    sessionId: string;
    attemptId: string;
    leaseTokenHash: string;
    outcome: AttemptOutcome;
  }): Promise<{ released: boolean; idempotent: boolean; reason: string }>;
  consumeRateLimit?(input: {
    scopeKey: string;
    userId: string;
    sessionId?: string;
    provider: "openai-webrtc" | "gemini-live" | "openai-websocket";
    windowSeconds: number;
    requestLimit: number;
  }): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: string;
    reason: string;
  }>;
  claimOrphans?(limit: number): Promise<TelefunWebRtcOrphanCandidate[]>;
  completeOrphan?(input: {
    leaseId: string;
    attemptId: string;
    outcome: "orphaned";
    providerClosed: boolean;
    sidebandClosed: boolean;
    errorCode?: string;
  }): Promise<void>;
  recordMetric?(input: {
    name:
      | "cost_reconciliation"
      | "sideband_disconnect"
      | "duplicate_write"
      | "missing_usage"
      | "orphan"
      | "session_cap";
    userIdHash?: string;
    sessionId?: string;
    attemptId?: string;
    provider?: "openai-webrtc";
    value?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ recorded: boolean; reason: string }>;
}

export interface TelefunWebRtcSupabaseClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): unknown;
}

export class WebRtcDurabilityError extends Error {
  readonly retryable = true;
  readonly operation: string;

  constructor(operation: string) {
    super("WebRTC durable persistence unavailable");
    this.name = "WebRtcDurabilityError";
    this.operation = operation;
  }
}

type DurableRow = Record<string, unknown>;
type DurableMetricName =
  | "cost_reconciliation"
  | "sideband_disconnect"
  | "duplicate_write"
  | "missing_usage"
  | "orphan"
  | "session_cap";
type DurableQuery = {
  select(columns: string): DurableQuery;
  eq(column: string, value: string): DurableQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
};

function isDurableRow(value: unknown): value is DurableRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstDurableRow(data: unknown): DurableRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return isDurableRow(first) ? first : null;
  }
  return isDurableRow(data) ? data : null;
}

function readRequiredString(
  row: DurableRow,
  key: string,
  maxLength = 256,
): string {
  const value = row[key];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  return value;
}

function readOptionalString(
  row: DurableRow,
  key: string,
  maxLength = 256,
): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  return value;
}

function readBoolean(row: DurableRow, key: string): boolean {
  if (typeof row[key] !== "boolean") {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  return row[key] as boolean;
}

function readInteger(row: DurableRow, key: string): number {
  const value = typeof row[key] === "string" ? Number(row[key]) : row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  return value;
}

function readTimestampMs(row: DurableRow, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new WebRtcDurabilityError(`invalid_${key}`);
  }
  return timestamp;
}

function readAttemptState(row: DurableRow): AttemptState {
  const value = row.state;
  if (
    value !== "claimed" &&
    value !== "brokered" &&
    value !== "sideband_connected" &&
    value !== "ending" &&
    value !== "ended"
  ) {
    throw new WebRtcDurabilityError("invalid_state");
  }
  return value;
}

function readAttemptStateOr(
  row: DurableRow,
  fallback: AttemptState,
): AttemptState {
  if (row.state === null || row.state === undefined) return fallback;
  return readAttemptState(row);
}

function readReason(row: DurableRow): string {
  const value = row.reason;
  return typeof value === "string" ? value.slice(0, 128) : "unknown";
}

async function callDurableRpc(
  client: TelefunWebRtcSupabaseClient,
  operation: string,
  functionName: string,
  args: Record<string, unknown>,
): Promise<DurableRow> {
  try {
    const { data, error } = await client.rpc(functionName, args);
    if (error) throw new WebRtcDurabilityError(operation);
    const row = firstDurableRow(data);
    if (!row) throw new WebRtcDurabilityError(operation);
    return row;
  } catch (error) {
    if (error instanceof WebRtcDurabilityError) throw error;
    throw new WebRtcDurabilityError(operation);
  }
}

function normalizeUsageStatus(value: unknown): UsageStatus {
  if (
    value === "pending" ||
    value === "persisted" ||
    value === "incomplete" ||
    value === "failed"
  ) {
    return value;
  }
  throw new WebRtcDurabilityError("invalid_usage_status");
}

function normalizeAttemptOutcome(value: unknown): AttemptOutcome {
  if (
    value === "completed" ||
    value === "failed" ||
    value === "network_lost" ||
    value === "orphaned"
  ) {
    return value;
  }
  throw new WebRtcDurabilityError("invalid_attempt_outcome");
}

function readMetricName(value: unknown): DurableMetricName {
  if (
    value === "cost_reconciliation" ||
    value === "sideband_disconnect" ||
    value === "duplicate_write" ||
    value === "missing_usage" ||
    value === "orphan" ||
    value === "session_cap"
  ) {
    return value;
  }
  throw new WebRtcDurabilityError("invalid_metric_name");
}

export function createTelefunWebRtcDb(
  client: TelefunWebRtcSupabaseClient = admin as unknown as TelefunWebRtcSupabaseClient,
): TelefunWebRtcDb {
  return {
    async claimAttempt(input) {
      const row = await callDurableRpc(
        client,
        "claim_attempt",
        "claim_telefun_realtime_attempt",
        {
          p_session_id: input.sessionId,
          p_user_id: input.userId,
          p_attempt_id: input.attemptId,
          p_model_id: input.modelId,
          p_transport: input.transport,
        },
      );
      const claimed = readBoolean(row, "claimed");
      const reason = readReason(row);
      const attemptId = claimed
        ? readRequiredString(row, "attempt_id")
        : (readOptionalString(row, "attempt_id") ?? input.attemptId);
      const finalizationKey = claimed
        ? readRequiredString(row, "finalization_key")
        : (readOptionalString(row, "finalization_key") ?? "");
      const usageRequestId = claimed
        ? readRequiredString(row, "usage_request_id", 128)
        : (readOptionalString(row, "usage_request_id", 128) ??
          `telefun-webrtc:${input.attemptId}`);
      if (!usageRequestId.startsWith("telefun-webrtc:")) {
        throw new WebRtcDurabilityError("invalid_usage_request_id");
      }
      return {
        claimed,
        attemptId,
        finalizationKey,
        usageRequestId: usageRequestId as `telefun-webrtc:${string}`,
        state: readAttemptStateOr(
          row,
          reason === "attempt_exists_terminal" ? "ended" : "claimed",
        ),
        reason,
      };
    },

    async getAttempt(sessionId, userId) {
      try {
        const query = client.from("telefun_realtime_attempts") as DurableQuery;
        const { data, error } = await query
          .select(
            "id, finalization_key, state, usage_request_id, provider_call_id_hash, model_id",
          )
          .eq("session_id", sessionId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new WebRtcDurabilityError("get_attempt");
        const row = firstDurableRow(data);
        if (!row) return null;
        const providerCallIdHash = readOptionalString(
          row,
          "provider_call_id_hash",
          64,
        );
        if (providerCallIdHash && !/^[a-f0-9]{64}$/.test(providerCallIdHash)) {
          throw new WebRtcDurabilityError("invalid_provider_call_id_hash");
        }
        const usageRequestId = readRequiredString(row, "usage_request_id", 128);
        if (!usageRequestId.startsWith("telefun-webrtc:")) {
          throw new WebRtcDurabilityError("invalid_usage_request_id");
        }
        return {
          attemptId: readRequiredString(row, "id"),
          finalizationKey: readRequiredString(row, "finalization_key"),
          state: readAttemptState(row),
          usageRequestId,
          providerCallIdHash,
          modelId: assertTelefunWebRtcModelId(row.model_id),
        };
      } catch (error) {
        if (error instanceof WebRtcDurabilityError) throw error;
        throw new WebRtcDurabilityError("get_attempt");
      }
    },

    async failSessionWithoutAttempt(sessionId, userId) {
      const row = await callDurableRpc(
        client,
        "fail_session_without_attempt",
        "fail_telefun_realtime_session_without_attempt",
        {
          p_session_id: sessionId,
          p_user_id: userId,
        },
      );
      return {
        applied: readBoolean(row, "applied"),
        terminal: readBoolean(row, "terminal"),
        reason: readReason(row),
      };
    },

    async bindProviderCall(attemptId, userId, callIdHash) {
      const row = await callDurableRpc(
        client,
        "bind_provider_call",
        "bind_telefun_realtime_provider_call",
        {
          p_attempt_id: attemptId,
          p_user_id: userId,
          p_provider_call_id_hash: callIdHash,
        },
      );
      return {
        accepted: readBoolean(row, "accepted"),
        state: readAttemptStateOr(row, "ended"),
        reason: readReason(row),
      };
    },

    async storeProviderCallReference(input) {
      const row = await callDurableRpc(
        client,
        "store_provider_call_reference",
        "store_telefun_realtime_provider_call_reference",
        {
          p_attempt_id: input.attemptId,
          p_user_id: input.userId,
          p_provider_call_reference: input.providerCallReferenceCiphertext,
        },
      );
      return {
        accepted: readBoolean(row, "accepted"),
        reason: readReason(row),
      };
    },

    async markSidebandConnected(attemptId, userId) {
      const row = await callDurableRpc(
        client,
        "mark_sideband_connected",
        "mark_telefun_realtime_sideband_connected",
        { p_attempt_id: attemptId, p_user_id: userId },
      );
      return {
        accepted: readBoolean(row, "accepted"),
        state: readAttemptStateOr(row, "ended"),
        reason: readReason(row),
      };
    },

    async checkpointTranscript(input) {
      const row = await callDurableRpc(
        client,
        "checkpoint_transcript",
        "checkpoint_telefun_realtime_transcript",
        {
          p_attempt_id: input.attemptId,
          p_user_id: input.userId,
          p_sequence: input.sequence,
          p_dedupe_key: input.dedupeKey,
          p_speaker: input.speaker,
          p_text: input.text,
          p_start_ms: input.startMs,
          p_is_partial: input.isPartial,
        },
      );
      return {
        accepted: readBoolean(row, "accepted"),
        operation: readRequiredString(row, "operation", 32),
        checkpointSequence: readInteger(row, "checkpoint_sequence"),
        reason: readReason(row),
      };
    },

    async beginFinalization(input) {
      const row = await callDurableRpc(
        client,
        "begin_finalization",
        input.outcome === "completed" || input.outcome === "failed"
          ? "begin_telefun_realtime_finalization"
          : "begin_telefun_realtime_finalization_p5",
        {
          p_attempt_id: input.attemptId,
          p_user_id: input.userId,
          p_finalization_key: input.finalizationKey,
          p_requested_outcome: input.outcome,
        },
      );
      return {
        accepted: readBoolean(row, "accepted"),
        shouldFinalize: readBoolean(row, "should_finalize"),
        state: readAttemptStateOr(row, "ended"),
        reason: readReason(row),
      };
    },

    async finalizeAttempt(input) {
      const row = await callDurableRpc(
        client,
        "finalize_attempt",
        input.outcome === "completed" || input.outcome === "failed"
          ? "finalize_telefun_realtime_attempt"
          : "finalize_telefun_realtime_attempt_p5",
        {
          p_attempt_id: input.attemptId,
          p_user_id: input.userId,
          p_finalization_key: input.finalizationKey,
          p_final_outcome: input.outcome,
          p_duration_seconds: input.durationSeconds,
        },
      );
      return {
        applied: readBoolean(row, "applied"),
        idempotent: readBoolean(row, "idempotent"),
        reason: readReason(row),
      };
    },

    async markUsage(input) {
      const row = await callDurableRpc(
        client,
        "mark_usage",
        "mark_telefun_realtime_usage",
        {
          p_attempt_id: input.attemptId,
          p_user_id: input.userId,
          p_usage_status: input.status,
          p_error: input.error ?? null,
        },
      );
      const usageRequestId =
        readOptionalString(row, "usage_request_id", 128) ??
        `telefun-webrtc:${input.attemptId}`;
      if (!usageRequestId.startsWith("telefun-webrtc:")) {
        throw new WebRtcDurabilityError("invalid_usage_request_id");
      }
      return {
        applied: readBoolean(row, "applied"),
        idempotent: readBoolean(row, "idempotent"),
        usageRequestId,
        status: normalizeUsageStatus(row.usage_status),
        reason: readReason(row),
      };
    },

    async acquireLease(input) {
      const row = await callDurableRpc(
        client,
        "acquire_lease",
        "claim_telefun_realtime_lease",
        {
          p_user_id: input.userId,
          p_session_id: input.sessionId,
          p_attempt_id: input.attemptId,
          p_provider: input.provider,
          p_lease_token_hash: input.leaseTokenHash,
          p_ttl_ms: input.ttlMs,
          p_max_user_sessions: input.maxUserSessions,
          p_max_provider_sessions: input.maxProviderSessions,
        },
      );
      return {
        granted: readBoolean(row, "granted"),
        ...(row.lease_id === null || row.lease_id === undefined
          ? {}
          : { leaseId: readRequiredString(row, "lease_id") }),
        ...(row.expires_at === null || row.expires_at === undefined
          ? {}
          : { expiresAtMs: readTimestampMs(row, "expires_at") }),
        activeCount: readInteger(row, "active_count"),
        reason: readReason(row),
      };
    },

    async renewLease(input) {
      const row = await callDurableRpc(
        client,
        "renew_lease",
        "renew_telefun_realtime_lease",
        {
          p_lease_id: input.leaseId,
          p_user_id: input.userId,
          p_session_id: input.sessionId,
          p_attempt_id: input.attemptId,
          p_lease_token_hash: input.leaseTokenHash,
          p_ttl_ms: input.ttlMs,
        },
      );
      return {
        renewed: readBoolean(row, "renewed"),
        ...(row.expires_at === null || row.expires_at === undefined
          ? {}
          : { expiresAtMs: readTimestampMs(row, "expires_at") }),
        reason: readReason(row),
      };
    },

    async releaseLease(input) {
      const row = await callDurableRpc(
        client,
        "release_lease",
        "release_telefun_realtime_lease",
        {
          p_lease_id: input.leaseId,
          p_user_id: input.userId,
          p_session_id: input.sessionId,
          p_attempt_id: input.attemptId,
          p_lease_token_hash: input.leaseTokenHash,
          p_outcome: normalizeAttemptOutcome(input.outcome),
        },
      );
      return {
        released: readBoolean(row, "released"),
        idempotent: readBoolean(row, "idempotent"),
        reason: readReason(row),
      };
    },

    async consumeRateLimit(input) {
      const row = await callDurableRpc(
        client,
        "consume_rate_limit",
        "consume_telefun_realtime_rate_limit",
        {
          p_scope_key: input.scopeKey,
          p_user_id: input.userId,
          p_session_id: input.sessionId ?? null,
          p_provider: input.provider,
          p_window_seconds: input.windowSeconds,
          p_request_limit: input.requestLimit,
        },
      );
      return {
        allowed: readBoolean(row, "allowed"),
        remaining: readInteger(row, "remaining"),
        resetAt: readRequiredString(row, "reset_at", 64),
        reason: readReason(row),
      };
    },

    async claimOrphans(limit) {
      let data: unknown;
      let error: unknown;
      try {
        ({ data, error } = await client.rpc("claim_telefun_realtime_orphans", {
          p_limit: Math.max(1, Math.min(100, Math.floor(limit))),
        }));
      } catch {
        throw new WebRtcDurabilityError("claim_orphans");
      }
      if (error || !Array.isArray(data)) {
        throw new WebRtcDurabilityError("claim_orphans");
      }
      return data.map((value) => {
        if (!isDurableRow(value))
          throw new WebRtcDurabilityError("invalid_orphan");
        const provider = readRequiredString(value, "provider", 32);
        if (provider !== "openai-webrtc")
          throw new WebRtcDurabilityError("invalid_provider");
        const providerCallReference = readOptionalString(
          value,
          "provider_call_reference",
          16_384,
        );
        return {
          leaseId: readRequiredString(value, "lease_id"),
          attemptId: readRequiredString(value, "attempt_id"),
          sessionId: readRequiredString(value, "session_id"),
          userId: readRequiredString(value, "user_id"),
          provider,
          providerCallReference,
          sidebandConnected: readBoolean(value, "sideband_connected"),
        };
      });
    },

    async completeOrphan(input) {
      const row = await callDurableRpc(
        client,
        "complete_orphan",
        "complete_telefun_realtime_orphan",
        {
          p_lease_id: input.leaseId,
          p_attempt_id: input.attemptId,
          p_outcome: "orphaned",
          p_provider_closed: input.providerClosed,
          p_sideband_closed: input.sidebandClosed,
          p_error_code: input.errorCode ?? null,
        },
      );
      if (!readBoolean(row, "applied")) {
        throw new WebRtcDurabilityError("complete_orphan");
      }
    },

    async recordMetric(input) {
      const row = await callDurableRpc(
        client,
        "record_metric",
        "record_telefun_realtime_metric",
        {
          p_metric_name: readMetricName(input.name),
          p_provider: input.provider ?? "openai-webrtc",
          p_user_id_hash: input.userIdHash ?? null,
          p_session_id: input.sessionId ?? null,
          p_attempt_id: input.attemptId ?? null,
          p_value: input.value ?? null,
          p_metadata: input.metadata ?? {},
        },
      );
      return {
        recorded: readBoolean(row, "recorded"),
        reason: readReason(row),
      };
    },
  };
}
