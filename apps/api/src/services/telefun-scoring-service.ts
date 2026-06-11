import { createAdminClient } from "../lib/supabase";
import { analyzeVoiceQuality } from "../lib/telefun-analysis";
import {
  classifyScoringError,
  calculateNextAttemptAt,
  MAX_SCORING_ATTEMPTS,
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
  await adminClient.rpc("fail_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
  });
}

async function ensureRescheduled(
  sessionId: string,
  errorMsg: string,
  nextAttemptAt: Date,
): Promise<void> {
  const adminClient = createAdminClient();
  await adminClient.rpc("reschedule_telefun_scoring", {
    p_session_id: sessionId,
    p_error: errorMsg,
    p_next_attempt_at: nextAttemptAt.toISOString(),
  });
}

export async function enqueueScoring(sessionId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("enqueue_telefun_scoring", {
    p_session_id: sessionId,
  });
  if (error) {
    return false;
  }
  return !!data;
}

export async function processScoringJob(
  job: ScoringJob,
): Promise<ScoringResult> {
  const adminClient = createAdminClient();

  try {
    const result = await analyzeVoiceQuality(job.sessionId, job.userId);

    if (result.success && result.assessment) {
      return { success: true, status: "completed" };
    }

    const { data: session } = await adminClient
      .from("telefun_history")
      .select("scoring_status, scoring_attempt_count")
      .eq("id", job.sessionId)
      .maybeSingle();

    if (!session) {
      return { success: false, status: "failed", error: "Session not found" };
    }

    if (session.scoring_status === "completed") {
      return { success: true, status: "completed" };
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorType = classifyScoringError(error);

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
    .select("id, user_id")
    .in("scoring_status", ["pending", "failed"])
    .or(
      `scoring_next_attempt_at.lte.${now},scoring_next_attempt_at.is.null`,
    )
    .order("scoring_next_attempt_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data || []).map((row: any) => ({
    sessionId: row.id,
    userId: row.user_id,
  }));
}
