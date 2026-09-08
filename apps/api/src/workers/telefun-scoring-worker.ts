/**
 * Telefun Scoring Worker — pure batch processor
 *
 * Fetches pending scoring jobs, claims and processes them, one batch at a
 * time. This module stays free of environment parsing, process signals, HTTP
 * and shutdown logic so it can be unit-tested directly; the executable
 * production runtime (env validation, poll loop, graceful shutdown, internal
 * health endpoint) lives in telefun-scoring-worker-runtime.ts and is started
 * via `pnpm start:telefun-scoring-worker`.
 *
 * Usage programmatically:
 *   import { processNextBatch } from "./workers/telefun-scoring-worker";
 *   await processNextBatch();
 *
 * Defaults (unit-harness only): batch size 5, claim timeout from the service
 * default. The runtime validates and supplies interval/batch/claim-timeout
 * from the environment instead.
 */

import {
  fetchPendingJobs,
  claimJob,
  checkCachedAssessment,
  processScoringJob,
} from "../services/telefun-scoring-service";
import type { ScoringJob, ScoringResult } from "../services/telefun-scoring-service";
import type { VoiceQualityAssessment } from "@trainers/types";

export type ScoringJobProcessor = (
  job: ScoringJob,
  signal?: AbortSignal,
) => Promise<ScoringResult>;

export interface ScoringWorkerDeps {
  fetchPendingJobs: (limit: number) => Promise<ScoringJob[]>;
  claimJob: (
    sessionId: string,
    timeoutSeconds?: number,
  ) => Promise<{ claimed: boolean; claimTokenHash?: string | null; session?: any }>;
  checkCachedAssessment: (sessionId: string) => Promise<VoiceQualityAssessment | null>;
  processScoringJob: ScoringJobProcessor;
  /** Atomic release of a just-won claim back to retryable state. Required
   *  when shutdown fires after claim but before provider admission, otherwise
   *  the row stays processing until the 300s lease expires. */
  releaseClaim?: (
    sessionId: string,
    error: string,
    nextAttemptAt: Date,
    claimTokenHash?: string | null,
  ) => Promise<boolean>;
}

export interface BatchProcessOptions {
  /** Abort signal owned by the runtime; checked between jobs to stop admission. */
  signal?: AbortSignal;
  /** Max jobs per batch (runtime validates it; default is the unit-harness value). */
  batchSize?: number;
}

export const DEFAULT_BATCH_SIZE = 5;

// The live service signature now accepts an optional AbortSignal (added by
// api-impl for the bounded-abort contract). Calling through the live binding
// keeps vi.spyOn-based test seams working.
function callScoringJobProcessor(
  job: ScoringJob,
  signal: AbortSignal | undefined,
): Promise<ScoringResult> {
  if (signal) return (processScoringJob as ScoringJobProcessor)(job, signal);
  return processScoringJob(job);
}

function defaultDeps(): ScoringWorkerDeps {
  return {
    fetchPendingJobs: (limit) => fetchPendingJobs(limit),
    claimJob: (sessionId) => claimJob(sessionId),
    checkCachedAssessment: (sessionId) => checkCachedAssessment(sessionId),
    processScoringJob: callScoringJobProcessor,
  };
}

export async function processNextBatch(
  deps: ScoringWorkerDeps = defaultDeps(),
  options: BatchProcessOptions = {},
): Promise<{
  processed: number;
  completed: number;
  failed: number;
  rescheduled: number;
}> {
  if (options.signal?.aborted) {
    return { processed: 0, completed: 0, failed: 0, rescheduled: 0 };
  }

  const jobs = await deps.fetchPendingJobs(options.batchSize ?? DEFAULT_BATCH_SIZE);
  const stats = { processed: 0, completed: 0, failed: 0, rescheduled: 0 };

  for (const job of jobs) {
    if (options.signal?.aborted) break;

    // Short-circuit completed cache BEFORE claim: a row that already has a
    // valid assessment needs no DB claim write, no token, and no provider
    // call. Claiming first would hold a token for work that is already done.
    const cachedBeforeClaim = await deps.checkCachedAssessment(job.sessionId);
    if (cachedBeforeClaim) {
      stats.completed++;
      continue;
    }

    if (options.signal?.aborted) break;

    const { claimed, claimTokenHash, session } = await deps.claimJob(job.sessionId);
    if (!claimed) {
      // Already completed or claimed by another worker
      if (session?.scoring_status === "completed") {
        stats.completed++;
      }
      continue;
    }
    // Thread the claim token so completion/failure/reschedule are fenced to
    // the claim owner; a superseded worker cannot overwrite the new claim.
    const claimedJob = claimTokenHash
      ? { ...job, claimTokenHash }
      : job;

    // Stop admission: never start a new AI call after the signal fired. A
    // claim won in this window must be released with its token so the row
    // returns to retryable state instead of idling until lease expiry.
    if (options.signal?.aborted) {
      if (deps.releaseClaim) {
        try {
          await deps.releaseClaim(
            job.sessionId,
            "worker shutdown: claim won before abort, released before provider admission",
            new Date(Date.now() + 30_000),
            claimTokenHash ?? null,
          );
        } catch {
          // Release is best-effort; the 300s lease remains the backstop.
        }
      }
      break;
    }

    if (options.signal?.aborted) break;

    const result = options.signal
      ? await deps.processScoringJob(claimedJob, options.signal)
      : await deps.processScoringJob(claimedJob);
    stats.processed++;
    if (result.status === "completed") stats.completed++;
    else if (result.status === "failed") stats.failed++;
    else if (result.status === "rescheduled") stats.rescheduled++;
  }

  return stats;
}
