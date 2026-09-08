/**
 * Telefun Scoring Worker — production runtime
 *
 * Reusable scoring worker runtime. Owns everything the pure batch processor
 * (`telefun-scoring-worker.ts`) must not:
 *
 *  - fail-fast environment validation (disabled/invalid config exits non-zero
 *    with a structured log line; the old code silently no-oped);
 *  - the poll loop (one batch at a time — batches never overlap);
 *  - graceful shutdown (stop admission, abort the analysis boundary with a
 *    bounded deadline = claim timeout, then atomically release/reschedule the
 *    active claim to retryable state BEFORE exit; no late write, no double AI
 *    call — the reclaim guard in `complete_telefun_scoring` +
 *    `checkCachedAssessment` keep that invariant);
 *
 * The standalone process/health adapter lives in
 * `telefun-scoring-worker-entrypoint.ts`; embedded API startup imports this
 * file without acquiring process ownership, signal handlers, or a port.
 *
 * Env rules (exact names, fail-fast):
 *   TELEFUN_SCORING_WORKER_ENABLED            "true" enables; anything else exits non-zero
 *   TELEFUN_SCORING_WORKER_INTERVAL_MS        positive integer in 1000..600000 (required)
 *   TELEFUN_SCORING_WORKER_BATCH_SIZE         positive integer in 1..50 (required)
 *   TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS  positive integer (optional, default 300);
 *                                              also the shutdown deadline for an in-flight job
 *   TELEFUN_SCORING_WORKER_HEALTH_PORT        integer in 1024..65535 (optional; enables health)
 *   TELEFUN_INTERNAL_TOKEN                    required when the health server is enabled
 *
 * This file intentionally does NOT import `apps/api/src/lib/env.ts`; worker
 * env is parsed here only.
 */

import { createAdminClient } from "../lib/supabase";
import { processNextBatch, type ScoringWorkerDeps } from "./telefun-scoring-worker";
import * as scoringService from "../services/telefun-scoring-service";
import {
  TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
} from "../services/telefun-scoring-service";
import type { ScoringJob, ScoringResult } from "../services/telefun-scoring-service";
import type { VoiceQualityAssessment } from "@trainers/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TELEFUN_SCORING_WORKER_INTERVAL_MS_MIN = 1000;
export const TELEFUN_SCORING_WORKER_INTERVAL_MS_MAX = 600000;
export const TELEFUN_SCORING_WORKER_BATCH_SIZE_MIN = 1;
export const TELEFUN_SCORING_WORKER_BATCH_SIZE_MAX = 50;
export const TELEFUN_SCORING_WORKER_HEALTH_PORT_MIN = 1024;
export const TELEFUN_SCORING_WORKER_HEALTH_PORT_MAX = 65535;
export const TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_DEFAULT =
  TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS;
/** Hard floor: the lease must exceed the Gemini provider timeout (~180s) with
 *  margin, otherwise a slow job is reclaimed mid-call and billed twice.
 *  Explicit env values below this are rejected fail-fast. */
export const TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_MIN =
  TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS;

// ---------------------------------------------------------------------------
// Config parsing (fail-fast)
// ---------------------------------------------------------------------------

export type WorkerConfigErrorCode =
  | "DISABLED"
  | "INVALID_INTERVAL_MS"
  | "INVALID_BATCH_SIZE"
  | "INVALID_CLAIM_TIMEOUT_SECONDS"
  | "INVALID_HEALTH_PORT"
  | "MISSING_INTERNAL_TOKEN";

export interface WorkerConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  claimTimeoutSeconds: number;
  healthPort: number | null;
  internalToken: string | null;
}

export type WorkerConfigParseResult =
  | { ok: true; config: WorkerConfig }
  | { ok: false; code: WorkerConfigErrorCode; detail: string };

function parsePositiveInt(
  raw: string | undefined,
  name: string,
  code: WorkerConfigErrorCode,
): { ok: true; value: number } | { ok: false; code: WorkerConfigErrorCode; detail: string } {
  if (raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code,
      detail: `${name} is required (got ${raw === undefined ? "unset" : "empty"})`,
    };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return { ok: false, code, detail: `${name} must be a positive integer (got "${raw}")` };
  }
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, code, detail: `${name} must be a positive integer (got "${raw}")` };
  }
  return { ok: true, value };
}

export function parseWorkerConfig(
  env: Record<string, string | undefined>,
): WorkerConfigParseResult {
  const enabled = env.TELEFUN_SCORING_WORKER_ENABLED === "true";
  if (!enabled) {
    return {
      ok: false,
      code: "DISABLED",
      detail: `TELEFUN_SCORING_WORKER_ENABLED must be exactly "true" (got ${
        env.TELEFUN_SCORING_WORKER_ENABLED === undefined ? "unset" : `"${env.TELEFUN_SCORING_WORKER_ENABLED}"`
      })`,
    };
  }

  const interval = parsePositiveInt(
    env.TELEFUN_SCORING_WORKER_INTERVAL_MS,
    "TELEFUN_SCORING_WORKER_INTERVAL_MS",
    "INVALID_INTERVAL_MS",
  );
  if (!interval.ok) return interval;
  if (
    interval.value < TELEFUN_SCORING_WORKER_INTERVAL_MS_MIN ||
    interval.value > TELEFUN_SCORING_WORKER_INTERVAL_MS_MAX
  ) {
    return {
      ok: false,
      code: "INVALID_INTERVAL_MS",
      detail: `TELEFUN_SCORING_WORKER_INTERVAL_MS must be in ${TELEFUN_SCORING_WORKER_INTERVAL_MS_MIN}..${TELEFUN_SCORING_WORKER_INTERVAL_MS_MAX} (got "${env.TELEFUN_SCORING_WORKER_INTERVAL_MS}")`,
    };
  }

  const batch = parsePositiveInt(
    env.TELEFUN_SCORING_WORKER_BATCH_SIZE,
    "TELEFUN_SCORING_WORKER_BATCH_SIZE",
    "INVALID_BATCH_SIZE",
  );
  if (!batch.ok) return batch;
  if (
    batch.value < TELEFUN_SCORING_WORKER_BATCH_SIZE_MIN ||
    batch.value > TELEFUN_SCORING_WORKER_BATCH_SIZE_MAX
  ) {
    return {
      ok: false,
      code: "INVALID_BATCH_SIZE",
      detail: `TELEFUN_SCORING_WORKER_BATCH_SIZE must be in ${TELEFUN_SCORING_WORKER_BATCH_SIZE_MIN}..${TELEFUN_SCORING_WORKER_BATCH_SIZE_MAX} (got "${env.TELEFUN_SCORING_WORKER_BATCH_SIZE}")`,
    };
  }

  let claimTimeoutSeconds = TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_DEFAULT;
  const rawClaim = env.TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS;
  if (rawClaim !== undefined && rawClaim.trim() !== "") {
    const claim = parsePositiveInt(
      rawClaim,
      "TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS",
      "INVALID_CLAIM_TIMEOUT_SECONDS",
    );
    if (!claim.ok) return claim;
    if (claim.value < TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_MIN) {
      return {
        ok: false,
        code: "INVALID_CLAIM_TIMEOUT_SECONDS",
        detail: `TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS must be >= ${TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_MIN} (provider timeout margin; got "${rawClaim}")`,
      };
    }
    claimTimeoutSeconds = claim.value;
  }

  let healthPort: number | null = null;
  const rawPort = env.TELEFUN_SCORING_WORKER_HEALTH_PORT;
  if (rawPort !== undefined && rawPort.trim() !== "") {
    const port = parsePositiveInt(
      rawPort,
      "TELEFUN_SCORING_WORKER_HEALTH_PORT",
      "INVALID_HEALTH_PORT",
    );
    if (!port.ok) return port;
    if (
      port.value < TELEFUN_SCORING_WORKER_HEALTH_PORT_MIN ||
      port.value > TELEFUN_SCORING_WORKER_HEALTH_PORT_MAX
    ) {
      return {
        ok: false,
        code: "INVALID_HEALTH_PORT",
        detail: `TELEFUN_SCORING_WORKER_HEALTH_PORT must be in ${TELEFUN_SCORING_WORKER_HEALTH_PORT_MIN}..${TELEFUN_SCORING_WORKER_HEALTH_PORT_MAX} (got "${rawPort}")`,
      };
    }
    healthPort = port.value;
  }

  let internalToken: string | null = null;
  if (healthPort !== null) {
    const token = env.TELEFUN_INTERNAL_TOKEN;
    if (token === undefined || token.trim() === "") {
      return {
        ok: false,
        code: "MISSING_INTERNAL_TOKEN",
        detail:
          "TELEFUN_INTERNAL_TOKEN is required when TELEFUN_SCORING_WORKER_HEALTH_PORT is set",
      };
    }
    internalToken = token;
  }

  return {
    ok: true,
    config: {
      enabled: true,
      intervalMs: interval.value,
      batchSize: batch.value,
      claimTimeoutSeconds,
      healthPort,
      internalToken,
    },
  };
}

// ---------------------------------------------------------------------------
// Service boundary (dependency-injected so the runtime stays testable and
// independent of the live service shape; api-impl may make fetchPendingJobs
// throw on DB error — the runtime surfaces that as degraded).
// ---------------------------------------------------------------------------

export interface QueueStats {
  pending: number;
  processing: number;
  failed: number;
  oldestEligiblePendingAgeMs: number | null;
}

export interface ScoringWorkerBoundary {
  fetchPendingJobs(limit: number): Promise<ScoringJob[]>;
  claimJob(
    sessionId: string,
    timeoutSeconds: number,
  ): Promise<{ claimed: boolean; claimTokenHash?: string | null; session?: any }>;
  checkCachedAssessment(sessionId: string): Promise<VoiceQualityAssessment | null>;
  processScoringJob(job: ScoringJob, signal?: AbortSignal): Promise<ScoringResult>;
  /** Atomic release/reschedule of an active claim back to retryable state
   *  (`reschedule_telefun_scoring`); returns true when accepted. */
  releaseClaim(sessionId: string, error: string, nextAttemptAt: Date, claimTokenHash?: string | null): Promise<boolean>;
  /** Aggregate queue counts + oldest eligible pending age (no identifiers). */
  fetchQueueStats(): Promise<QueueStats>;
}

export function aggregateQueueStats(
  rows: Array<Record<string, unknown>>,
  nowMs: number,
): QueueStats {
  const counts = { pending: 0, processing: 0, failed: 0 };
  let oldestEligiblePendingAgeMs: number | null = null;

  for (const row of rows) {
    const status = row.scoring_status;
    if (status === "pending") counts.pending++;
    else if (status === "processing") counts.processing++;
    else if (status === "failed") counts.failed++;

    if (status !== "pending") continue;
    const nextAttempt =
      typeof row.scoring_next_attempt_at === "string"
        ? Date.parse(row.scoring_next_attempt_at)
        : NaN;
    const eligible = Number.isNaN(nextAttempt) || nextAttempt <= nowMs;
    if (!eligible) continue;

    const readyRaw =
      typeof row.scoring_ready_at === "string" ? Date.parse(row.scoring_ready_at) : NaN;
    const createdRaw =
      typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
    const readyMs = Number.isNaN(readyRaw)
      ? Number.isNaN(createdRaw)
        ? null
        : createdRaw
      : readyRaw;
    if (readyMs === null) continue;

    const age = Math.max(0, nowMs - readyMs);
    oldestEligiblePendingAgeMs =
      oldestEligiblePendingAgeMs === null
        ? age
        : Math.max(oldestEligiblePendingAgeMs, age);
  }

  return { ...counts, oldestEligiblePendingAgeMs };
}

export function createDefaultBoundary(): ScoringWorkerBoundary {
  return {
    fetchPendingJobs: (limit) => scoringService.fetchPendingJobs(limit),
    claimJob: (sessionId, timeoutSeconds) => scoringService.claimJob(sessionId, timeoutSeconds),
    checkCachedAssessment: (sessionId) => scoringService.checkCachedAssessment(sessionId),
    processScoringJob: (job, signal) =>
      (scoringService.processScoringJob as (job: ScoringJob, signal?: AbortSignal) => Promise<ScoringResult>)(
        job,
        signal,
      ),
    releaseClaim: async (sessionId, error, nextAttemptAt, claimTokenHash) => {
      const adminClient = createAdminClient();
      const { data, error: rpcError } = await adminClient.rpc("reschedule_telefun_scoring", {
        p_session_id: sessionId,
        p_error: error,
        p_next_attempt_at: nextAttemptAt.toISOString(),
        p_claim_token_hash: claimTokenHash ?? null,
      });
      if (rpcError || data === false) return false;
      return true;
    },
    fetchQueueStats: async () => {
      const adminClient = createAdminClient();
      const { data, error } = await adminClient
        .from("telefun_history")
        .select("scoring_status, scoring_next_attempt_at, scoring_ready_at, created_at")
        .in("scoring_status", ["pending", "processing", "failed"]);
      if (error) throw error;
      return aggregateQueueStats((data ?? []) as Array<Record<string, unknown>>, Date.now());
    },
  };
}

// ---------------------------------------------------------------------------
// Health snapshot
// ---------------------------------------------------------------------------

export interface WorkerHealthSnapshot {
  enabled: boolean;
  loopAlive: boolean;
  lastSuccessfulPollAt: string | null;
  lastErrorClass: string | null;
  queue: { pending: number; processing: number; failed: number } | null;
  oldestEligiblePendingAgeMs: number | null;
}

// ---------------------------------------------------------------------------
// Runtime (loop + graceful shutdown)
// ---------------------------------------------------------------------------

export interface RuntimeOptions {
  config: WorkerConfig;
  boundary: ScoringWorkerBoundary;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface ScoringWorkerRuntime {
  start(): void;
  /** Graceful shutdown: stop admission, abort the analysis signal, bounded
   *  wait (deadline = claim timeout), then atomic release BEFORE resolving. */
  shutdown(): Promise<void>;
  awaitLoop(): Promise<void>;
  getHealthSnapshot(): WorkerHealthSnapshot;
}

export function errorClass(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "PostgrestError") return "DatabaseError";
    if (err.name && err.name !== "Error") return err.name;
    if (err.constructor?.name && err.constructor.name !== "Error") return err.constructor.name;
  }
  return "Error";
}

type SleepPromise = Promise<void> & { cancel?: () => void };

interface ActiveJobContext {
  job: ScoringJob;
  promise: Promise<ScoringResult>;
  result: ScoringResult | null;
  rejected: boolean;
}

/**
 * The production loop owns its timers, so cancellation must wake the loop and
 * clear the native handle. Test-provided sleeps remain plain promises and are
 * still supported; they simply opt out of cancellation when they do not
 * expose a `cancel` method.
 */
function createCancellableSleep(ms: number): SleepPromise {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveSleep!: () => void;
  let settled = false;
  const promise = new Promise<void>((resolve) => {
    resolveSleep = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      resolve();
    };
    timer = setTimeout(resolveSleep, ms);
  }) as SleepPromise;
  promise.cancel = resolveSleep;
  return promise;
}

function cancelSleep(sleep: Promise<void> | null): void {
  (sleep as SleepPromise | null)?.cancel?.();
}

export function createRuntime(options: RuntimeOptions): ScoringWorkerRuntime {
  const { config, boundary } = options;
  const sleep = options.sleep ?? createCancellableSleep;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((line: string) => console.log(line));

  const abortController = new AbortController();

  const state = {
    shuttingDown: false,
    loopAlive: false,
    lastSuccessfulPollAt: null as string | null,
    lastErrorClass: null as string | null,
    pollErrorClass: null as string | null,
    batchErrorClass: null as string | null,
    queue: null as QueueStats | null,
    activeContext: null as ActiveJobContext | null,
    pollPromise: null as Promise<void> | null,
    loopSleep: null as Promise<void> | null,
    shutdownPromise: null as Promise<void> | null,
  };

  // Batch-processor deps wired to the injected boundary. The claim timeout is
  // applied here so the pure batch processor keeps its one-arg claim seam.
  const deps: ScoringWorkerDeps = {
    fetchPendingJobs: (limit) => boundary.fetchPendingJobs(limit),
    claimJob: (sessionId) => boundary.claimJob(sessionId, config.claimTimeoutSeconds),
    checkCachedAssessment: (sessionId) => boundary.checkCachedAssessment(sessionId),
    releaseClaim: (sessionId, error, nextAttemptAt, claimTokenHash) =>
      boundary.releaseClaim(sessionId, error, nextAttemptAt, claimTokenHash),
    processScoringJob: (job, signal) => {
      const promise = boundary.processScoringJob(job, signal ?? abortController.signal);
      const context: ActiveJobContext = {
        job,
        promise,
        result: null,
        rejected: false,
      };
      state.activeContext = context;
      promise.then(
        (result) => {
          context.result = result;
          // A settled normal result has completed its own persistence path.
          // Clear it before the batch can admit a later claim, so a shutdown
          // deadline for that later claim cannot release the earlier job.
          if (
            state.activeContext === context &&
            !(result.status === "rescheduled" && result.error === "Scoring aborted")
          ) {
            state.activeContext = null;
          }
        },
        () => {
          context.rejected = true;
        },
      );
      return promise;
    },
  };

  async function pollOnce(): Promise<void> {
    let jobs: ScoringJob[] = [];
    try {
      // One queue fetch per tick (paired with the health aggregates); the
      // batch processor consumes the prefetched list.
      const [fetched, queue] = await Promise.all([
        boundary.fetchPendingJobs(config.batchSize),
        boundary.fetchQueueStats(),
      ]);
      jobs = fetched;
      state.queue = queue;
    } catch (err) {
      // DB queue errors surface as degraded — never as healthy/empty. The
      // poll timestamp stays stale so no-poll alerts fire.
      const nextErrorClass = errorClass(err);
      if (state.pollErrorClass !== nextErrorClass) {
        log(
          JSON.stringify({
            event: "telefun_scoring_worker.poll_failed",
            errorClass: nextErrorClass,
          }),
        );
      }
      state.pollErrorClass = nextErrorClass;
      state.lastErrorClass = state.batchErrorClass ?? state.pollErrorClass;
      return;
    }
    state.lastSuccessfulPollAt = now().toISOString();

    try {
      const stats = await processNextBatch(
        { ...deps, fetchPendingJobs: async () => jobs },
        { signal: abortController.signal, batchSize: config.batchSize },
      );
      if (stats.processed > 0) {
        log(
          `[TelefunWorker] Batch: ${stats.processed} processed, ${stats.completed} completed, ${stats.rescheduled} rescheduled, ${stats.failed} failed`,
        );
      }
      // Queue fetch success alone does not recover a failed cycle. Emit the
      // recovery transition only after the entire batch has completed.
      if (state.pollErrorClass !== null || state.batchErrorClass !== null) {
        log(
          JSON.stringify({
            event: "telefun_scoring_worker.poll_recovered",
          }),
        );
        state.pollErrorClass = null;
        state.batchErrorClass = null;
        state.lastErrorClass = null;
      }
    } catch (err) {
      const nextErrorClass = errorClass(err);
      if (state.batchErrorClass !== nextErrorClass) {
        log(
          JSON.stringify({
            event: "telefun_scoring_worker.batch_failed",
            errorClass: nextErrorClass,
          }),
        );
      }
      state.batchErrorClass = nextErrorClass;
      state.lastErrorClass = state.batchErrorClass ?? state.pollErrorClass;
    } finally {
      state.activeContext = null;
    }
  }

  async function loop(): Promise<void> {
    state.loopAlive = true;
    try {
      while (!state.shuttingDown) {
        const pollPromise = pollOnce();
        state.pollPromise = pollPromise;
        try {
          await pollPromise;
        } finally {
          if (state.pollPromise === pollPromise) state.pollPromise = null;
        }
        if (state.shuttingDown) break;
        const loopSleep = sleep(config.intervalMs);
        state.loopSleep = loopSleep;
        try {
          await loopSleep;
        } finally {
          if (state.loopSleep === loopSleep) state.loopSleep = null;
        }
      }
    } finally {
      state.loopAlive = false;
    }
  }

  async function shutdown(): Promise<void> {
    if (state.shutdownPromise) return state.shutdownPromise;
    state.shutdownPromise = (async () => {
      state.shuttingDown = true;
      abortController.abort();
      cancelSleep(state.loopSleep);

      const activeContext = state.activeContext;
      const job = activeContext?.job;
      const inFlight = activeContext?.promise;
      const pollPromise = state.pollPromise;
      const deadlineMs = config.claimTimeoutSeconds * 1000;
      let settled = true;

      // `pollPromise` includes fetch, claim, and the batch processor. Waiting
      // for it lets a claim RPC that was already admitted finish and release
      // its token before shutdown resolves. A hung RPC is bounded by the
      // lease deadline and leaves an explicit recovery log for the lease.
      const pendingWork = pollPromise ?? inFlight;
      if (pendingWork) {
        const deadlineSleep = sleep(deadlineMs);
        settled = await Promise.race([
          pendingWork.then(
            () => true,
            () => true,
          ),
          deadlineSleep.then(() => false),
        ]);
        if (settled) cancelSleep(deadlineSleep);
      }

      const abortResult =
        activeContext?.result?.status === "rescheduled" &&
        activeContext.result.error === "Scoring aborted";
      const releaseOwnedClaim =
        !settled || Boolean(activeContext?.rejected) || abortResult;

      if (job && inFlight && releaseOwnedClaim) {
        // A normal completed/failed/retried result already owns its own
        // persistence outcome. Release only when shutdown owns the claim:
        // abort sentinel, rejected processing, or an expired deadline.
        const nextAttemptAt = new Date(now().getTime() + deadlineMs);
        let releaseOutcome:
          | { kind: "settled"; accepted: boolean }
          | { kind: "rejected"; error: unknown }
          | { kind: "timeout" };
        try {
          const releasePromise = Promise.resolve(
            job.claimTokenHash
              ? boundary.releaseClaim(
                  job.sessionId,
                  settled
                    ? "worker shutdown: active claim settled after abort"
                    : "worker shutdown: analysis did not settle within claim timeout",
                  nextAttemptAt,
                  job.claimTokenHash,
                )
              : boundary.releaseClaim(
                  job.sessionId,
                  settled
                    ? "worker shutdown: active claim settled after abort"
                    : "worker shutdown: analysis did not settle within claim timeout",
                  nextAttemptAt,
                ),
          );
          const releaseDeadline = sleep(deadlineMs);
          releaseOutcome = await Promise.race([
            releasePromise.then(
              (accepted) => ({ kind: "settled" as const, accepted }),
              (error) => ({ kind: "rejected" as const, error }),
            ),
            releaseDeadline.then(() => ({ kind: "timeout" as const })),
          ]);
          cancelSleep(releaseDeadline);
        } catch (err) {
          releaseOutcome = { kind: "rejected", error: err };
        }

        if (releaseOutcome.kind === "timeout") {
          // The database lease is now the recovery backstop. Do not keep API
          // shutdown hostage to an unresponsive Supabase RPC, and never issue
          // a second release attempt after this point.
          log(
            JSON.stringify({
              event: "telefun_scoring_worker.claim_release_deferred",
              leaseSeconds: config.claimTimeoutSeconds,
            }),
          );
          return;
        }

        if (releaseOutcome.kind === "rejected") {
          log(
            JSON.stringify({
              event: "telefun_scoring_worker.claim_release_failed",
              errorClass: errorClass(releaseOutcome.error),
            }),
          );
        }
        const released =
          releaseOutcome.kind === "settled" && releaseOutcome.accepted;
        log(
          JSON.stringify({
            event: released
              ? "telefun_scoring_worker.claim_released"
              : "telefun_scoring_worker.claim_release_skipped",
            nextAttemptAt: nextAttemptAt.toISOString(),
          }),
        );
      } else if (!settled && pendingWork) {
        log(
          JSON.stringify({
            event: "telefun_scoring_worker.shutdown_recovery_deferred",
            leaseSeconds: config.claimTimeoutSeconds,
          }),
        );
      }
    })();
    return state.shutdownPromise;
  }

  function getHealthSnapshot(): WorkerHealthSnapshot {
    return {
      enabled: config.enabled,
      loopAlive: state.loopAlive,
      lastSuccessfulPollAt: state.lastSuccessfulPollAt,
      lastErrorClass: state.lastErrorClass,
      queue:
        state.queue === null
          ? null
          : {
              pending: state.queue.pending,
              processing: state.queue.processing,
              failed: state.queue.failed,
            },
      oldestEligiblePendingAgeMs: state.queue?.oldestEligiblePendingAgeMs ?? null,
    };
  }

  let loopPromise: Promise<void> | null = null;

  return {
    start() {
      loopPromise = loop();
    },
    shutdown,
    async awaitLoop() {
      if (loopPromise) await loopPromise;
    },
    getHealthSnapshot,
  };
}

// ---------------------------------------------------------------------------
// Embedded worker (for in-process use by apps/api — option B, no standalone
// service). Unlike main(): never calls process.exit, never registers process
// signals, never starts a second health server. DISABLED config returns
// { started: false } so the API stays alive; any other invalid config
// throws so API startup fails fast before accepting traffic.
// ---------------------------------------------------------------------------

export interface EmbeddedWorkerOptions {
  env: Record<string, string | undefined>;
  boundary?: ScoringWorkerBoundary;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export type EmbeddedWorkerHandle =
  | { started: true; runtime: ScoringWorkerRuntime; shutdown: () => Promise<void> }
  | { started: false };

export function startEmbeddedTelefunScoringWorker(
  options: EmbeddedWorkerOptions,
): EmbeddedWorkerHandle {
  const log = options.log ?? ((line: string) => console.log(line));
  const parsed = parseWorkerConfig(options.env);
  if (!parsed.ok) {
    if (parsed.code === "DISABLED") {
      log(JSON.stringify({ event: "telefun_scoring_worker.disabled" }));
      return { started: false };
    }
    throw new Error(
      `telefun_scoring_worker.config_rejected: ${parsed.code} — ${parsed.detail}`,
    );
  }
  const runtime = createRuntime({
    config: parsed.config,
    boundary: options.boundary ?? createDefaultBoundary(),
    sleep: options.sleep,
    now: options.now,
    log,
  });
  log(
    JSON.stringify({
      event: "telefun_scoring_worker.embedded_started",
      enabled: parsed.config.enabled,
      intervalMs: parsed.config.intervalMs,
      batchSize: parsed.config.batchSize,
      claimTimeoutSeconds: parsed.config.claimTimeoutSeconds,
    }),
  );
  runtime.start();
  return { started: true, runtime, shutdown: () => runtime.shutdown() };
}
