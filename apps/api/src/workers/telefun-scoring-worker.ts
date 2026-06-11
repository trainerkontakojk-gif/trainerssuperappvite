/**
 * Telefun Scoring Worker
 *
 * Polls for pending scoring jobs, claims and processes them.
 * Designed to be run as a scheduled task (cron, Railway cron, node-cron).
 *
 * Usage via cron (every 30s):
 *   TELEFUN_SCORING_WORKER_ENABLED=true \
 *     npx tsx apps/api/src/workers/telefun-scoring-worker.ts
 *
 * Usage programmatically:
 *   import { processNextBatch } from "./workers/telefun-scoring-worker";
 *   await processNextBatch();
 *
 * Env vars:
 *   TELEFUN_SCORING_WORKER_INTERVAL_MS - Poll interval (default: 30000ms)
 *   TELEFUN_SCORING_WORKER_BATCH_SIZE  - Max jobs per batch (default: 5)
 *   TELEFUN_SCORING_WORKER_ENABLED     - Set "true" to enable
 */

import {
  fetchPendingJobs,
  claimJob,
  checkCachedAssessment,
  processScoringJob,
} from "../services/telefun-scoring-service";

const INTERVAL_MS = parseInt(
  process.env.TELEFUN_SCORING_WORKER_INTERVAL_MS || "30000",
  10,
);
const BATCH_SIZE = parseInt(
  process.env.TELEFUN_SCORING_WORKER_BATCH_SIZE || "5",
  10,
);
const ENABLED = process.env.TELEFUN_SCORING_WORKER_ENABLED === "true";

let shuttingDown = false;
let _running = false;

export async function processNextBatch(): Promise<{
  processed: number;
  completed: number;
  failed: number;
  rescheduled: number;
}> {
  if (shuttingDown) return { processed: 0, completed: 0, failed: 0, rescheduled: 0 };

  const jobs = await fetchPendingJobs(BATCH_SIZE);
  const stats = { processed: 0, completed: 0, failed: 0, rescheduled: 0 };

  for (const job of jobs) {
    if (shuttingDown) break;

    const { claimed, session } = await claimJob(job.sessionId);
    if (!claimed) {
      // Already completed or claimed by another worker
      if (session?.scoring_status === "completed") {
        stats.completed++;
      }
      continue;
    }

    // Check cached assessment before processing
    const cached = await checkCachedAssessment(job.sessionId);
    if (cached) {
      // Assessment already valid from a previous run or concurrent path
      stats.completed++;
      continue;
    }

    const result = await processScoringJob(job);
    stats.processed++;
    if (result.status === "completed") stats.completed++;
    else if (result.status === "failed") stats.failed++;
    else if (result.status === "rescheduled") stats.rescheduled++;
  }

  return stats;
}

async function runLoop(): Promise<void> {
  if (!ENABLED) {
    return;
  }

  _running = true;

  while (!shuttingDown) {
    try {
      const stats = await processNextBatch();
      if (stats.processed > 0) {
        console.log(
          `[TelefunWorker] Batch: ${stats.processed} processed, ${stats.completed} completed, ${stats.rescheduled} rescheduled, ${stats.failed} failed`,
        );
      }
    } catch (err) {
      console.error("[TelefunWorker] Error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  _running = false;
}

function handleShutdown(): void {
  shuttingDown = true;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("telefun-scoring-worker")) {
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
  runLoop().catch((err) => {
    console.error("[TelefunWorker] Fatal:", err);
    process.exit(1);
  });
}

export { runLoop };
