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
  ) => Promise<{ claimed: boolean; session?: any }>;
  checkCachedAssessment: (sessionId: string) => Promise<VoiceQualityAssessment | null>;
  processScoringJob: ScoringJobProcessor;
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

    const { claimed, session } = await deps.claimJob(job.sessionId);
    if (!claimed) {
      // Already completed or claimed by another worker
      if (session?.scoring_status === "completed") {
        stats.completed++;
      }
      continue;
    }

    // Stop admission: never start a new AI call after the signal fired.
    if (options.signal?.aborted) break;

    // Check cached assessment before processing
    const cached = await deps.checkCachedAssessment(job.sessionId);
    if (cached) {
      // Assessment already valid from a previous run or concurrent path
      stats.completed++;
      continue;
    }

    if (options.signal?.aborted) break;

    const result = options.signal
      ? await deps.processScoringJob(job, options.signal)
      : await deps.processScoringJob(job);
    stats.processed++;
    if (result.status === "completed") stats.completed++;
    else if (result.status === "failed") stats.failed++;
    else if (result.status === "rescheduled") stats.rescheduled++;
  }

  return stats;
}
