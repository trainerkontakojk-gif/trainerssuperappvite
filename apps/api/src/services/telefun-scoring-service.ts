import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "../lib/supabase";
import {
  analyzeVoiceQuality,
  isTelefunWebRtcSeekableAgentPath,
} from "../lib/telefun-analysis";
import { isTelefunCaptureScoringReady } from "../lib/telefun-capture-readiness";
import {
  classifyScoringError,
  calculateNextAttemptAt,
  MAX_SCORING_ATTEMPTS,
  TransientScoringError,
} from "../lib/telefun-scoring-errors";
import {
  isRetiredTelefunOpenAiRealtimeSelection,
  TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS,
  parseVoiceQualityAssessment,
} from "@trainers/types";
import type { VoiceQualityAssessment } from "@trainers/types";
import { TELEFUN_OPENAI_SCORING_DISABLED_REASON } from "../lib/telefun-openai-assessment";

export interface ScoringJob {
  sessionId: string;
  userId: string;
  /** Fencing hash of the claim that owns this job (set by the claimer). */
  claimTokenHash?: string | null;
}

/** Shared claim lease: must exceed the provider timeout (gemini-3.8-flash
 *  timeoutMs = 180s) with margin, otherwise slow jobs get reclaimed mid-call
 *  and billed twice. */
export const TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS = 300;

/** Validate the lease at every TypeScript helper boundary, including callers
 * that bypass the environment parser. A shorter lease can reclaim a slow
 * provider call and admit duplicate billable work. */
export function validateScoringClaimTimeoutSeconds(
  timeoutSeconds: number,
): number {
  if (
    !Number.isFinite(timeoutSeconds) ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS
  ) {
    throw new RangeError(
      `Scoring claim timeout must be an integer >= ${TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS}`,
    );
  }
  return timeoutSeconds;
}

/** Default owner labels for claim observability. */
export const TELEFUN_SCORING_CLAIM_OWNER_WORKER = "scoring-worker";
export const TELEFUN_SCORING_CLAIM_OWNER_API_ROUTE = "api-route";

/** Generates a per-claim secret token; only the SHA-256 hash is persisted. */
export function newScoringClaim(): {
  claimToken: string;
  claimTokenHash: string;
} {
  const claimToken = randomUUID();
  const claimTokenHash = createHash("sha256").update(claimToken).digest("hex");
  return { claimToken, claimTokenHash };
}

export interface ScoringClaimResult {
  claimed: boolean;
  claimToken?: string;
  claimTokenHash?: string;
  session?: any;
}

export interface ScoringResult {
  success: boolean;
  status: "completed" | "failed" | "rescheduled";
  error?: string;
}

type ScoringStateSnapshot = {
  user_id: string | null;
  telefun_model_id: string | null;
  telefun_transport: string | null;
  status: string | null;
  recording_status: string | null;
  recording_error: string | null;
  recording_path: string | null;
  agent_recording_path: string | null;
  scoring_ready_at: string | null;
  scoring_status: string | null;
  scoring_next_attempt_at: string | null;
  score: number | null;
  voice_assessment: unknown;
};

export class ScoringNotReadyError extends Error {
  readonly code = "SCORING_NOT_READY";

  constructor() {
    super("SCORING_NOT_READY");
    this.name = "ScoringNotReadyError";
  }
}

export function isWebRtcScoringReady(
  state: Partial<ScoringStateSnapshot> | null | undefined,
  userId: string,
  sessionId: string,
): boolean {
  if (state?.telefun_transport !== "openai-webrtc") return true;
  return (
    isTelefunCaptureScoringReady(state, userId, sessionId) &&
    state.recording_path === `${userId}/${sessionId}/full_call.seekable.webm` &&
    state.scoring_ready_at != null &&
    isTelefunWebRtcSeekableAgentPath({
      path: state.agent_recording_path,
      userId,
      sessionId,
    })
  );
}

function isHistoricalOpenAiScoringModel(state: {
  telefun_model_id?: unknown;
  telefun_transport?: unknown;
}): boolean {
  return isRetiredTelefunOpenAiRealtimeSelection({
    modelId: state.telefun_model_id,
    transport: state.telefun_transport,
  });
}

const SCORING_STATE_SELECT =
  "user_id, telefun_model_id, telefun_transport, status, recording_status, recording_error, recording_path, agent_recording_path, scoring_ready_at, scoring_status, scoring_next_attempt_at, score, voice_assessment";

function readRpcBoolean(data: unknown): boolean | null {
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "boolean" ? value : null;
}

export async function claimJob(
  sessionId: string,
  timeoutSeconds: number = TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
  owner: string = TELEFUN_SCORING_CLAIM_OWNER_WORKER,
): Promise<ScoringClaimResult> {
  validateScoringClaimTimeoutSeconds(timeoutSeconds);
  const adminClient = createAdminClient();
  const { claimToken, claimTokenHash } = newScoringClaim();
  const { data: claimed, error } = await adminClient.rpc(
    "claim_telefun_scoring",
    {
      p_session_id: sessionId,
      p_claim_timeout_seconds: timeoutSeconds,
      p_claim_token_hash: claimTokenHash,
      p_claim_owner: owner,
    },
  );

  if (error) {
    return { claimed: false };
  }

  if (!claimed) {
    const { data: session } = await adminClient
      .from("telefun_history")
      .select(
        "scoring_status, score, voice_assessment, scoring_next_attempt_at",
      )
      .eq("id", sessionId)
      .maybeSingle();
    return { claimed: false, session };
  }

  return { claimed: true, claimToken, claimTokenHash };
}

export async function checkCachedAssessment(
  sessionId: string,
): Promise<VoiceQualityAssessment | null> {
  const adminClient = createAdminClient();
  const { data: row } = await adminClient
    .from("telefun_history")
    .select("voice_assessment, score, scoring_status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!row || row.scoring_status !== "completed") return null;

  if (row.voice_assessment) {
    return parseVoiceQualityAssessment(row.voice_assessment);
  }
  return null;
}

async function ensureFailed(
  sessionId: string,
  errorMsg: string,
  claimTokenHash?: string | null,
): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("fail_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
    p_claim_token_hash: claimTokenHash ?? null,
  });
  if (error || data === false) {
    console.error("[Telefun Scoring] Failed to persist failed state");
    return false;
  }
  return true;
}

/**
 * The fail RPC atomically records the permanent terminal state and clears any
 * retry eligibility. Do not append a best-effort update: a post-failure error
 * must never resurrect this retired job through the transient catch path.
 */
export async function permanentlyFailRetiredOpenAiScoring(
  sessionId: string,
  claimTokenHash?: string | null,
): Promise<boolean> {
  return ensureFailed(
    sessionId,
    TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    claimTokenHash,
  );
}

async function ensureRescheduled(
  sessionId: string,
  errorMsg: string,
  nextAttemptAt: Date,
  claimTokenHash?: string | null,
): Promise<void> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("reschedule_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
    p_next_attempt_at: nextAttemptAt.toISOString(),
    p_claim_token_hash: claimTokenHash ?? null,
  });
  if (error || data === false) {
    console.error("[Telefun Scoring] Failed to persist retry state");
  }
}

export async function enqueueScoring(sessionId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("enqueue_telefun_scoring", {
    p_session_id: sessionId,
  });
  if (error) {
    return false;
  }
  return data !== false;
}

export async function failScoringJob(
  sessionId: string,
  errorMsg: string,
  claimTokenHash?: string | null,
): Promise<boolean> {
  return ensureFailed(sessionId, errorMsg, claimTokenHash);
}

export async function completeScoringAssessment(
  sessionId: string,
  assessment: VoiceQualityAssessment,
  claimTokenHash?: string | null,
): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("complete_telefun_scoring", {
    p_session_id: sessionId,
    p_score: assessment.overallScore,
    p_voice_assessment: assessment as unknown as Record<string, unknown>,
    p_claim_token_hash: claimTokenHash ?? null,
  });
  if (error) {
    throw new TransientScoringError(
      "Scoring result persistence unavailable",
      "SCORING_PERSISTENCE_UNAVAILABLE",
    );
  }
  const accepted = readRpcBoolean(data);
  if (accepted === null) {
    throw new TransientScoringError(
      "Scoring result persistence unavailable",
      "SCORING_PERSISTENCE_UNAVAILABLE",
    );
  }
  return accepted;
}

export async function persistScoringAssessment(
  sessionId: string,
  assessment: VoiceQualityAssessment,
  userId?: string,
  claimTokenHash?: string | null,
): Promise<boolean> {
  const adminClient = createAdminClient();
  const accepted = await completeScoringAssessment(
    sessionId,
    assessment,
    claimTokenHash,
  );
  if (accepted) return true;

  const { data: current, error: readbackError } = await adminClient
    .from("telefun_history")
    .select(SCORING_STATE_SELECT)
    .eq("id", sessionId)
    .maybeSingle();

  if (readbackError || !current) {
    throw new TransientScoringError(
      "Scoring result persistence unavailable",
      "SCORING_PERSISTENCE_UNAVAILABLE",
    );
  }
  if (current.scoring_status === "completed") return true;
  const captureOwnerId = userId ?? current.user_id;
  if (
    !captureOwnerId ||
    !isTelefunCaptureScoringReady(current, captureOwnerId, sessionId)
  ) {
    throw new ScoringNotReadyError();
  }
  if (
    current.telefun_transport === "openai-webrtc" &&
    !isWebRtcScoringReady(current, captureOwnerId, sessionId)
  ) {
    throw new ScoringNotReadyError();
  }
  return false;
}

export async function processScoringJob(
  job: ScoringJob,
  signal?: AbortSignal,
): Promise<ScoringResult> {
  const adminClient = createAdminClient();
  const claimTokenHash = job.claimTokenHash ?? null;

  try {
    if (signal?.aborted) {
      // Bounded abort: stop admission before the provider boundary. The
      // caller (worker runtime) releases/reschedules the claim atomically.
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }

    const { data: initialState } = await adminClient
      .from("telefun_history")
      .select(SCORING_STATE_SELECT)
      .eq("id", job.sessionId)
      .maybeSingle();
    if (signal?.aborted) {
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }
    if (initialState && isHistoricalOpenAiScoringModel(initialState)) {
      if (parseVoiceQualityAssessment(initialState.voice_assessment)) {
        return { success: true, status: "completed" };
      }
      if (
        initialState.telefun_transport === "openai-webrtc" &&
        (initialState.status === "active" || initialState.status === "pending")
      ) {
        return {
          success: false,
          status: "failed",
          error: "SCORING_NOT_READY",
        };
      }
      if (
        !(await permanentlyFailRetiredOpenAiScoring(
          job.sessionId,
          claimTokenHash,
        ))
      ) {
        throw new TransientScoringError(
          "Scoring result persistence unavailable",
          "SCORING_PERSISTENCE_UNAVAILABLE",
        );
      }
      return {
        success: false,
        status: "failed",
        error: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
      };
    }
    if (
      initialState &&
      !isTelefunCaptureScoringReady(initialState, job.userId, job.sessionId)
    ) {
      return { success: false, status: "failed", error: "SCORING_NOT_READY" };
    }
    const result = await analyzeVoiceQuality(
      job.sessionId,
      job.userId,
      signal,
      { claimTokenHash },
    );

    if (signal?.aborted) {
      // Bounded abort: a late provider result must not be persisted (no late
      // write). The claim stays processing and is released/rescheduled by the
      // caller or reclaimed after the stale-claim timeout.
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }

    if (result.success && result.assessment) {
      const persisted = await persistScoringAssessment(
        job.sessionId,
        result.assessment,
        job.userId,
        claimTokenHash,
      );
      if (!persisted) {
        throw new TransientScoringError(
          "Scoring result persistence unavailable",
          "SCORING_PERSISTENCE_UNAVAILABLE",
        );
      }
      return { success: true, status: "completed" };
    }

    const { data: session } = await adminClient
      .from("telefun_history")
      .select(`${SCORING_STATE_SELECT}, scoring_attempt_count`)
      .eq("id", job.sessionId)
      .maybeSingle();

    if (signal?.aborted) {
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }

    if (!session) {
      return { success: false, status: "failed", error: "Session not found" };
    }

    if (session.scoring_status === "completed") {
      return { success: true, status: "completed" };
    }

    if (
      !isTelefunCaptureScoringReady(session, job.userId, job.sessionId) ||
      (session.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(session, job.userId, job.sessionId))
    ) {
      return {
        success: false,
        status: "failed",
        error: "SCORING_NOT_READY",
      };
    }

    const errorMsg = result.error || "Unknown error";
    const errorType = classifyScoringError(errorMsg);
    const attemptCount = session.scoring_attempt_count || 0;

    if (errorType === "permanent" || attemptCount >= MAX_SCORING_ATTEMPTS) {
      if (signal?.aborted) {
        return {
          success: false,
          status: "rescheduled",
          error: "Scoring aborted",
        };
      }
      await ensureFailed(job.sessionId, errorMsg, claimTokenHash);
      return {
        success: false,
        status: "failed",
        error:
          attemptCount >= MAX_SCORING_ATTEMPTS
            ? `Max attempts (${MAX_SCORING_ATTEMPTS}) reached: ${errorMsg}`
            : errorMsg,
      };
    }

    const nextAttemptAt = calculateNextAttemptAt(attemptCount);
    if (signal?.aborted) {
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }
    await ensureRescheduled(
      job.sessionId,
      errorMsg,
      nextAttemptAt,
      claimTokenHash,
    );

    return { success: false, status: "rescheduled", error: errorMsg };
  } catch (error: unknown) {
    if (signal?.aborted) {
      // Bounded abort: never write a failure/retry state for an aborted job;
      // the shutdown path owns the atomic release.
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }

    if (error instanceof ScoringNotReadyError) {
      return {
        success: false,
        status: "failed",
        error: error.code,
      };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorType = classifyScoringError(error);

    // Do not replace a failed-capture latch with a generic provider error when
    // an exception races the recording transition.
    try {
      const { data: current, error: stateError } = await adminClient
        .from("telefun_history")
        .select(SCORING_STATE_SELECT)
        .eq("id", job.sessionId)
        .maybeSingle();
      if (
        !stateError &&
        current &&
        (!isTelefunCaptureScoringReady(current, job.userId, job.sessionId) ||
          (current.telefun_transport === "openai-webrtc" &&
            !isWebRtcScoringReady(current, job.userId, job.sessionId)))
      ) {
        return {
          success: false,
          status: "failed",
          error: "SCORING_NOT_READY",
        };
      }
    } catch (_stateError: unknown) {
      // Preserve the existing bounded retry/error path when the diagnostic
      // read itself is unavailable.
    }

    if (signal?.aborted) {
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }

    if (errorType === "permanent") {
      if (signal?.aborted) {
        return {
          success: false,
          status: "rescheduled",
          error: "Scoring aborted",
        };
      }
      await ensureFailed(job.sessionId, errorMsg, claimTokenHash);
      return { success: false, status: "failed", error: errorMsg };
    }

    if (signal?.aborted) {
      return {
        success: false,
        status: "rescheduled",
        error: "Scoring aborted",
      };
    }
    await ensureRescheduled(
      job.sessionId,
      errorMsg,
      calculateNextAttemptAt(1),
      claimTokenHash,
    );
    return { success: false, status: "rescheduled", error: errorMsg };
  }
}

export async function fetchPendingJobs(
  limit: number = 5,
): Promise<ScoringJob[]> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // Match the historical detector, including unknown old GPT model IDs.
  // NULLs belong to the active branch; SQL NOT alone would discard them.
  // Raw logical filters require quoted values for PostgREST punctuation.
  // JSON string quoting also escapes embedded double quotes/backslashes.
  const historicalIds = TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS.map((model) =>
    JSON.stringify(model.id),
  ).join(",");
  const retired = `or(telefun_transport.in.(openai-audio,openai-webrtc),telefun_model_id.in.(${historicalIds}),telefun_model_id.like.gpt-realtime-*)`;
  const active = `and(or(telefun_transport.is.null,telefun_transport.not.in.(openai-audio,openai-webrtc)),or(telefun_model_id.is.null,and(telefun_model_id.not.in.(${historicalIds}),telefun_model_id.not.like.gpt-realtime-*)))`;
  // Failed captures and terminal retired failures must not consume the page.
  // Preserve historical terminal rows' intentional capture-readiness bypass.
  const eligible = `or(and(${retired},status.in.(completed,failed),or(scoring_status.neq.failed,scoring_next_attempt_at.not.is.null)),and(${active},or(recording_status.is.null,recording_status.neq.failed),recording_error.is.null))`;

  const { data, error } = await adminClient
    .from("telefun_history")
    .select(
      "id, user_id, status, telefun_model_id, telefun_transport, recording_status, recording_error, recording_path, agent_recording_path, scoring_status, scoring_next_attempt_at, scoring_ready_at",
    )
    .in("scoring_status", ["pending", "failed", "processing"])
    .or(
      `and(or(scoring_next_attempt_at.lte.${now},scoring_next_attempt_at.is.null),${eligible})`,
    )
    .order("scoring_next_attempt_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || [])
    .filter((row: any) => {
      const isRetired = isHistoricalOpenAiScoringModel(row);
      if (isRetired) {
        // A permanently failed retired row has no retry schedule and must not
        // be claimed again. Terminal historical WebRTC rows intentionally
        // bypass the retired-provider seekable artifact gate.
        if (
          row.scoring_status === "failed" &&
          row.scoring_next_attempt_at == null
        ) {
          return false;
        }
        return row.status === "completed" || row.status === "failed";
      }
      if (!isTelefunCaptureScoringReady(row, row.user_id, row.id)) return false;
      if (row.telefun_transport !== "openai-webrtc") return true;
      return isWebRtcScoringReady(row, row.user_id, row.id);
    })
    .map((row: any) => ({
      sessionId: row.id,
      userId: row.user_id,
    }));
}

export const TELEFUN_SCORING_CLAIM_OWNER_RERUN = "api-route-rerun";

/**
 * Membuka hasil yang sudah selesai untuk Telaah ulang: `completed` →
 * `processing` dengan klaim bertoken baru, bersyarat pada status supaya dua
 * permintaan bersamaan tidak sama-sama jalan. Skor dan penilaian lama tidak
 * dihapus; RPC `complete_telefun_scoring` menggantinya bila AI berhasil.
 * Mengembalikan hash klaim, atau `null` bila sesi tidak dalam keadaan selesai.
 */
export async function claimCompletedScoringForRerun(
  sessionId: string,
): Promise<string | null> {
  const adminClient = createAdminClient();
  const { claimTokenHash } = newScoringClaim();
  const { data, error } = await adminClient
    .from("telefun_history")
    .update({
      scoring_status: "processing",
      scoring_claimed_at: new Date().toISOString(),
      scoring_claim_token_hash: claimTokenHash,
      scoring_claim_owner: TELEFUN_SCORING_CLAIM_OWNER_RERUN,
      scoring_last_error: null,
      scoring_next_attempt_at: null,
    })
    .eq("id", sessionId)
    .eq("status", "completed")
    .in("recording_status", ["uploaded", "partial", "ready"])
    .is("recording_error", null)
    .not("recording_path", "is", null)
    .not("agent_recording_path", "is", null)
    .eq("scoring_status", "completed")
    .select("id");
  if (error) throw error;
  return data && data.length > 0 ? claimTokenHash : null;
}

/**
 * Telaah ulang gagal: sesi kembali `completed` dengan hasil lama, hanya bila
 * klaim ini masih pemiliknya. Bila pemulihan gagal, pekerja scoring mengambil
 * klaim basi itu dan menyelesaikannya dari hasil lama yang tersimpan.
 */
export async function restoreScoringAfterFailedRerun(
  sessionId: string,
  claimTokenHash: string,
): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("telefun_history")
    .update({
      scoring_status: "completed",
      scoring_claim_token_hash: null,
      scoring_claim_owner: null,
    })
    .eq("id", sessionId)
    .eq("scoring_status", "processing")
    .eq("scoring_claim_token_hash", claimTokenHash)
    .select("id");
  if (error) return false;
  return Boolean(data && data.length > 0);
}
