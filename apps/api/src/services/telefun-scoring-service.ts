import { createAdminClient } from "../lib/supabase";
import {
  analyzeVoiceQuality,
  isTelefunWebRtcSeekableAgentPath,
} from "../lib/telefun-analysis";
import {
  classifyScoringError,
  calculateNextAttemptAt,
  MAX_SCORING_ATTEMPTS,
  TransientScoringError,
} from "../lib/telefun-scoring-errors";
import { parseVoiceQualityAssessment } from "@trainers/types";
import type { VoiceQualityAssessment } from "@trainers/types";

export interface ScoringJob {
  sessionId: string;
  userId: string;
}

export interface ScoringResult {
  success: boolean;
  status: "completed" | "failed" | "rescheduled";
  error?: string;
}

type ScoringStateSnapshot = {
  telefun_transport: string | null;
  status: string | null;
  recording_status: string | null;
  recording_error: string | null;
  scoring_ready_at: string | null;
  agent_recording_path: string | null;
  scoring_status: string | null;
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
    state.status === "completed" &&
    (state.recording_status === "partial" || state.recording_status === "ready") &&
    state.recording_error == null &&
    state.scoring_ready_at != null &&
    isTelefunWebRtcSeekableAgentPath({
      path: state.agent_recording_path,
      userId,
      sessionId,
    })
  );
}

const SCORING_STATE_SELECT =
  "telefun_transport, status, recording_status, recording_error, scoring_ready_at, agent_recording_path, scoring_status, score, voice_assessment";

function readRpcBoolean(data: unknown): boolean | null {
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "boolean" ? value : null;
}

export async function claimJob(
  sessionId: string,
  timeoutSeconds: number = 120,
): Promise<{ claimed: boolean; session?: any }> {
  const adminClient = createAdminClient();
  const { data: claimed, error } = await adminClient.rpc(
    "claim_telefun_scoring",
    {
      p_session_id: sessionId,
      p_claim_timeout_seconds: timeoutSeconds,
    },
  );

  if (error) {
    return { claimed: false };
  }

  if (!claimed) {
    const { data: session } = await adminClient
      .from("telefun_history")
      .select("scoring_status, score, voice_assessment, scoring_next_attempt_at")
      .eq("id", sessionId)
      .maybeSingle();
    return { claimed: false, session };
  }

  return { claimed: true };
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

async function ensureFailed(sessionId: string, errorMsg: string): Promise<void> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("fail_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
  });
  if (error || data === false) {
    console.error("[Telefun Scoring] Failed to persist failed state");
  }
}

async function ensureRescheduled(
  sessionId: string,
  errorMsg: string,
  nextAttemptAt: Date,
): Promise<void> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("reschedule_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
    p_next_attempt_at: nextAttemptAt.toISOString(),
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

export async function persistScoringAssessment(
  sessionId: string,
  assessment: VoiceQualityAssessment,
  userId?: string,
): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("complete_telefun_scoring", {
    p_session_id: sessionId,
    p_score: assessment.overallScore,
    p_voice_assessment: assessment as unknown as Record<string, unknown>,
  });
  if (error) {
    throw new TransientScoringError(
      "Scoring result persistence unavailable",
      "SCORING_PERSISTENCE_UNAVAILABLE",
    );
  }

  const accepted = readRpcBoolean(data);
  if (accepted === true) return true;
  if (accepted === null) {
    throw new TransientScoringError(
      "Scoring result persistence unavailable",
      "SCORING_PERSISTENCE_UNAVAILABLE",
    );
  }

  const {
    data: current,
    error: readbackError,
  } = await adminClient
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
  if (current.telefun_transport === "openai-webrtc") {
    const ownedAgentPath = userId
      ? isWebRtcScoringReady(current, userId, sessionId)
      : current.status === "completed" &&
        (current.recording_status === "partial" ||
          current.recording_status === "ready") &&
        current.recording_error == null &&
        current.scoring_ready_at != null &&
        new RegExp(`^[^/]+/${sessionId}/agent_only\\.seekable\\.webm$`).test(
          current.agent_recording_path ?? "",
        );
    if (!ownedAgentPath) throw new ScoringNotReadyError();
  }
  return false;
}

export async function processScoringJob(
  job: ScoringJob,
): Promise<ScoringResult> {
  const adminClient = createAdminClient();

  try {
    const result = await analyzeVoiceQuality(job.sessionId, job.userId);

    if (result.success && result.assessment) {
      const persisted = await persistScoringAssessment(
        job.sessionId,
        result.assessment,
        job.userId,
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

    if (!session) {
      return { success: false, status: "failed", error: "Session not found" };
    }

    if (session.scoring_status === "completed") {
      return { success: true, status: "completed" };
    }

    if (
      session.telefun_transport === "openai-webrtc" &&
      !isWebRtcScoringReady(session, job.userId, job.sessionId)
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
      await ensureFailed(job.sessionId, errorMsg);
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
    await ensureRescheduled(job.sessionId, errorMsg, nextAttemptAt);

    return { success: false, status: "rescheduled", error: errorMsg };
  } catch (error: unknown) {
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
        current?.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(current, job.userId, job.sessionId)
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

    if (errorType === "permanent") {
      await ensureFailed(job.sessionId, errorMsg);
      return { success: false, status: "failed", error: errorMsg };
    }

    await ensureRescheduled(job.sessionId, errorMsg, calculateNextAttemptAt(1));
    return { success: false, status: "rescheduled", error: errorMsg };
  }
}

export async function fetchPendingJobs(
  limit: number = 5,
): Promise<ScoringJob[]> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await adminClient
    .from("telefun_history")
    .select(
      "id, user_id, status, telefun_transport, scoring_ready_at, agent_recording_path",
    )
    .in("scoring_status", ["pending", "failed", "processing"])
    .or(
      `scoring_next_attempt_at.lte.${now},scoring_next_attempt_at.is.null`,
    )
    // Keep not-ready WebRTC rows out of the worker query itself. The
    // application filter below additionally verifies the exact owned path.
    .or(
      "telefun_transport.is.null,telefun_transport.neq.openai-webrtc,and(telefun_transport.eq.openai-webrtc,status.eq.completed,scoring_ready_at.not.is.null,agent_recording_path.not.is.null)",
    )
    .order("scoring_next_attempt_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data || [])
    .filter((row: any) => {
      if (row.telefun_transport !== "openai-webrtc") return true;
      return (
        row.status === "completed" &&
        Boolean(row.scoring_ready_at) &&
        isTelefunWebRtcSeekableAgentPath({
          path: row.agent_recording_path,
          userId: row.user_id,
          sessionId: row.id,
        })
      );
    })
    .map((row: any) => ({
      sessionId: row.id,
      userId: row.user_id,
    }));
}
