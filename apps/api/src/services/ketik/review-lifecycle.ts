import { createAdminClient } from "../../lib/supabase";
import { processKetikReviewJob } from "./review-processor";

export async function triggerKetikAIReview(
  sessionId: string,
  userId: string,
): Promise<any> {
  const adminClient = createAdminClient();
  let canMarkFailed = false;

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("ketik_history")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      console.error(
        `[triggerKetikAIReview] Session not found or unauthorized: ${sessionId}`,
      );
      throw new Error("Session not found or unauthorized");
    }

    canMarkFailed = true;

    if (session.review_status === "completed") {
      return { status: "skipped" };
    }

    const { data: existingJob } = await adminClient
      .from("ketik_review_jobs")
      .select("id, status")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!existingJob) {
      const { error: insertError } = await adminClient
        .from("ketik_review_jobs")
        .insert({
          session_id: sessionId,
          status: "queued",
          lease_owner: null,
          lease_expires_at: null,
          error_message: null,
        });

      // Duplicate insert race: treat as idempotent success
      if (insertError) {
        if ((insertError as { code?: string }).code !== "23505") {
          throw insertError;
        }
      }
    } else if (existingJob.status === "completed" || existingJob.status === "processing") {
      return { status: existingJob.status === "completed" ? "skipped" : "processing" };
    }

    await adminClient
      .from("ketik_history")
      .update({ review_status: "pending" })
      .eq("id", sessionId);

    return { status: "queued" };
  } catch (error) {
    console.error(`[triggerKetikAIReview] Error for session ${sessionId}:`, error);
    if (canMarkFailed) {
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    }
    throw error;
  }
}

export async function claimAndProcessKetikReviewJob(
  sessionId: string,
  workerId: string = "system-auto",
): Promise<any> {
  const adminClient = createAdminClient();

  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from("ketik_review_jobs")
    .update({
      status: "processing",
      lease_owner: workerId,
      lease_expires_at: leaseExpiresAt,
      error_message: null,
    })
    .eq("session_id", sessionId)
    .or(
      `status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`,
    )
    .select("id, attempt_count");

  if (claimError) throw claimError;

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from("ketik_review_jobs")
      .select("status")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!current) return { status: "skipped" };
    if (current.status === "completed") return { status: "completed" };
    if (current.status === "failed")
      return { status: "failed", error: "Job previously failed" };
    return { status: "processing" };
  }

  const nextAttempt = (claimed[0].attempt_count || 0) + 1;
  if (nextAttempt > 3) {
    await adminClient
      .from("ketik_review_jobs")
      .update({
        status: "failed",
        error_message: "Max attempts reached",
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq("session_id", sessionId);
    await adminClient
      .from("ketik_history")
      .update({ review_status: "failed" })
      .eq("id", sessionId);
    return { status: "failed", error: "Max attempts reached" };
  }

  await adminClient
    .from("ketik_review_jobs")
    .update({ attempt_count: nextAttempt })
    .eq("session_id", sessionId);

  try {
    return await processKetikReviewJob(sessionId, workerId);
  } catch (error: any) {
    const error_message =
      error instanceof Error ? error.message : "Unknown processing error";
    await adminClient
      .from("ketik_review_jobs")
      .update({
        status: "failed",
        error_message,
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq("session_id", sessionId);
    await adminClient
      .from("ketik_history")
      .update({ review_status: "failed" })
      .eq("id", sessionId);
    return { status: "failed", error: error_message };
  }
}

export async function getKetikReviewStatus(
  sessionId: string,
  userId: string,
): Promise<any> {
  const adminClient = createAdminClient();

  const { data: history, error } = await adminClient
    .from("ketik_history")
    .select(
      "review_status, final_score, empathy_score, probing_score, typo_score, compliance_score",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !history) return null;

  let status = history.review_status || "pending";
  let resultReady = false;
  let scores = null;
  let errorMessage: string | undefined = undefined;

  if (status === "completed") {
    // Auto-heal check: verify review row actually exists
    const { data: review, error: reviewError } = await adminClient
      .from("ketik_session_reviews")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!review || reviewError) {
      status = "failed";
      errorMessage = "Hasil analisis tidak ditemukan. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
      await adminClient
        .from("ketik_review_jobs")
        .update({ status: "failed", error_message: errorMessage })
        .eq("session_id", sessionId);
    } else {
      resultReady = true;
      scores = {
        final: history.final_score,
        empathy: history.empathy_score,
        probing: history.probing_score,
        typo: history.typo_score,
        compliance: history.compliance_score,
      };
    }
  }

  // Reconcile with job status when history is not terminal
  if (status !== "completed" && status !== "failed") {
    const { data: job } = await adminClient
      .from("ketik_review_jobs")
      .select("status, lease_expires_at, error_message, updated_at")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!job) {
      // No job at all — mark failed so UI can retry
      status = "failed";
      errorMessage = "Pekerjaan analisis tidak ditemukan. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    } else if (job.status === "failed") {
      status = "failed";
      errorMessage = job.error_message || "Analisis AI gagal diproses. Silakan jalankan ulang.";
      await adminClient
        .from("ketik_history")
        .update({ review_status: "failed" })
        .eq("id", sessionId);
    } else if (job.status === "processing") {
      // Check if lease has expired (with 30s grace period)
      const gracePeriodMs = 30_000;
      const now = new Date();
      const leaseExpired =
        job.lease_expires_at &&
        new Date(job.lease_expires_at).getTime() + gracePeriodMs < now.getTime();
      if (leaseExpired) {
        // Stale processing — mark failed to enable retry
        status = "failed";
        errorMessage = "Analisis AI melebihi batas waktu. Silakan jalankan ulang.";
        await adminClient
          .from("ketik_review_jobs")
          .update({
            status: "failed",
            error_message: "Processing timeout — lease expired",
          })
          .eq("session_id", sessionId);
        await adminClient
          .from("ketik_history")
          .update({ review_status: "failed" })
          .eq("id", sessionId);
      } else {
        status = "processing";
      }
    } else if (job.status === "queued") {
      // Check if queued too long (5 min TTL)
      const queueTTL = 5 * 60 * 1000;
      if (
        job.updated_at &&
        new Date().getTime() - new Date(job.updated_at).getTime() > queueTTL
      ) {
        status = "failed";
        errorMessage = "Analisis AI terlalu lama mengantre. Silakan jalankan ulang.";
        await adminClient
          .from("ketik_review_jobs")
          .update({
            status: "failed",
            error_message: "Queue timeout — no worker picked up the job",
          })
          .eq("session_id", sessionId);
        await adminClient
          .from("ketik_history")
          .update({ review_status: "failed" })
          .eq("id", sessionId);
      } else {
        status = "processing";
      }
    }
  }

  // Queue lifecycle is internal; UI should treat queued as processing.
  if (status === "queued") {
    status = "processing";
  }

  return { status, resultReady, scores, errorMessage };
}

export async function processOldestQueuedJob(
  workerId: string = "daemon-worker",
): Promise<any> {
  const adminClient = createAdminClient();

  const nowIso = new Date().toISOString();

  // Find oldest queued or stale processing job
  const { data: job, error } = await adminClient
    .from("ketik_review_jobs")
    .select("session_id")
    .or(
      `status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`,
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !job) return { status: "no_jobs" };

  return await claimAndProcessKetikReviewJob(job.session_id, workerId);
}
