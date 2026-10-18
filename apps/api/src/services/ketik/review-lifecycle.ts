import { randomUUID } from "node:crypto";
import {
  KETIK_ERROR_MESSAGES,
  KETIK_RERUN_LIMIT,
  type KetikReviewAccepted,
  type KetikReviewStatus,
  type KetikReviewDetail,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import { processKetikReviewJob } from "./review-processor";
import { KETIK_REVIEW_MODELS, resolveModelProvider } from "../../lib/ai-models";

// Gemini can retry the developer-instruction incompatibility once, then OpenAI.
export const KETIK_REVIEW_LEASE_SECONDS = Math.max(
  600,
  Math.ceil(
    ((resolveModelProvider(KETIK_REVIEW_MODELS.primary).timeoutMs ?? 180_000) *
      2 +
      (resolveModelProvider(KETIK_REVIEW_MODELS.fallback).timeoutMs ??
        120_000)) /
      1000,
  ) + 120,
);
export interface KetikReviewClaim {
  status: "processing";
  sessionId: string;
  token: string;
  attempt: number;
}
export type KetikClaimOutcome =
  KetikReviewClaim | { status: "failed"; sessionId: string } | null;
export async function enqueueKetikReview(
  sessionId: string,
  actorId: string,
  requestId: string,
  rerun: boolean,
): Promise<KetikReviewAccepted> {
  const { data, error } = await createAdminClient().rpc(
    "enqueue_ketik_review",
    {
      p_actor: actorId,
      p_session: sessionId,
      p_request: requestId,
      p_rerun: rerun,
    },
  );
  if (error) throw error;
  return data as KetikReviewAccepted;
}
export async function triggerKetikAIReview(sessionId: string, userId: string) {
  return enqueueKetikReview(sessionId, userId, randomUUID(), false);
}
export async function claimKetikReview(
  workerId: string,
  sessionId?: string,
): Promise<KetikClaimOutcome> {
  const { data, error } = await createAdminClient().rpc("claim_ketik_review", {
    p_worker: workerId,
    p_lease_seconds: KETIK_REVIEW_LEASE_SECONDS,
    p_session: sessionId ?? null,
  });
  if (error) throw error;
  return data as KetikClaimOutcome;
}
export async function releaseKetikReview(
  claim: KetikReviewClaim,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("settle_ketik_review", {
    p_session: claim.sessionId,
    p_token: claim.token,
    p_release: true,
  });
  if (error) throw error;
  return data === true;
}
export async function processClaimedKetikReview(claim: KetikReviewClaim) {
  try {
    return await processKetikReviewJob(claim.sessionId, claim.token);
  } catch (error) {
    console.error("[KETIK] Review attempt failed", {
      errorClass: error instanceof Error ? error.name : "Unknown",
    });
    const { error: settleError } = await createAdminClient().rpc(
      "settle_ketik_review",
      { p_session: claim.sessionId, p_token: claim.token },
    );
    if (settleError) throw settleError;
    return {
      status: "failed" as const,
      error: KETIK_ERROR_MESSAGES.REVIEW_FAILED,
    };
  }
}
export async function claimAndProcessKetikReviewJob(
  sessionId: string,
  workerId = "backend-worker",
) {
  const claim = await claimKetikReview(workerId, sessionId);
  if (!claim) return { status: "processing" as const };
  return claim.status === "failed" ? claim : processClaimedKetikReview(claim);
}
export async function processOldestQueuedJob(workerId = "backend-worker") {
  const claim = await claimKetikReview(workerId);
  if (!claim) return { status: "no_jobs" as const };
  return claim.status === "failed" ? claim : processClaimedKetikReview(claim);
}
export async function getKetikReviewStatus(
  sessionId: string,
  actorId: string,
  actorRole: string,
): Promise<KetikReviewStatus | null> {
  const { data, error } = await createAdminClient().rpc("read_ketik_review", {
    p_actor: actorId,
    p_session: sessionId,
  });
  if (error) throw error;
  if (!data) return null;
  const { history, job, review } = data;
  const resultReady = history.review_status === "completed" && Boolean(review);
  const scores: KetikReviewDetail["scores"] | null = resultReady
    ? {
        final: history.final_score,
        empathy: history.empathy_score,
        probing: history.probing_score,
        resolution: history.resolution_score ?? undefined,
        typo: history.typo_score,
        compliance: history.compliance_score,
      }
    : null;
  const missingResult =
    (history.review_status === "completed" || job?.status === "completed") &&
    !resultReady;
  return {
    status: missingResult
      ? "failed"
      : (job?.status ??
        (resultReady
          ? "completed"
          : history.review_status === "failed"
            ? "failed"
            : history.review_status === "processing"
              ? "processing"
              : "pending")),
    resultReady,
    scores,
    previousKept: resultReady && job?.status === "failed",
    rerunsLeft:
      actorRole === "agent" || actorRole === "leader"
        ? Math.max(0, KETIK_RERUN_LIMIT - (history.rerun_count ?? 0))
        : null,
    ...(job?.status === "failed" || missingResult
      ? { errorMessage: KETIK_ERROR_MESSAGES.REVIEW_FAILED }
      : {}),
  };
}
