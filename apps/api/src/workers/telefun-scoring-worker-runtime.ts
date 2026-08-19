/**
 * Telefun Scoring Worker — production runtime
 *
 * Executable entrypoint for the scoring worker service. Owns everything the
 * pure batch processor (`telefun-scoring-worker.ts`) must not:
 *
 *  - fail-fast environment validation (disabled/invalid config exits non-zero
 *    with a structured log line; the old code silently no-oped);
 *  - the poll loop (one batch at a time — batches never overlap);
 *  - graceful shutdown (stop admission, abort the analysis boundary with a
 *    bounded deadline = claim timeout, then atomically release/reschedule the
 *    active claim to retryable state BEFORE exit; no late write, no double AI
 *    call — the reclaim guard in `complete_telefun_scoring` +
 *    `checkCachedAssessment` keep that invariant);
 *  - the internal health HTTP server bound to 127.0.0.1, protected by the
 *    shared `TELEFUN_INTERNAL_TOKEN` middleware, non-billable, never opening
 *    a provider connection and never processing jobs.
 *
 * Start:
 *   TELEFUN_SCORING_WORKER_ENABLED=true \
 *   TELEFUN_SCORING_WORKER_INTERVAL_MS=30000 \
 *   TELEFUN_SCORING_WORKER_BATCH_SIZE=5 \
 *   TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS=120 \
 *   TELEFUN_SCORING_WORKER_HEALTH_PORT=9100 \
 *   TELEFUN_INTERNAL_TOKEN=<shared-server-secret> \
 *   pnpm --filter @trainers/api start:telefun-scoring-worker
 *
 * Env rules (exact names, fail-fast):
 *   TELEFUN_SCORING_WORKER_ENABLED            "true" enables; anything else exits non-zero
 *   TELEFUN_SCORING_WORKER_INTERVAL_MS        positive integer in 1000..600000 (required)
 *   TELEFUN_SCORING_WORKER_BATCH_SIZE         positive integer in 1..50 (required)
 *   TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS  positive integer (optional, default 120);
 *                                              also the shutdown deadline for an in-flight job
 *   TELEFUN_SCORING_WORKER_HEALTH_PORT        integer in 1024..65535 (optional; enables health)
 *   TELEFUN_INTERNAL_TOKEN                    required when the health server is enabled
 *
 * This file intentionally does NOT import `apps/api/src/lib/env.ts`; worker
 * env is parsed here only.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createAdminClient } from "../lib/supabase";
import { processNextBatch, type ScoringWorkerDeps } from "./telefun-scoring-worker";
import * as scoringService from "../services/telefun-scoring-service";
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
export const TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS_DEFAULT = 120;
/** Internal health server binds to loopback by default; deployments may
 *  override with the Railway private-network address. Never `PORT`. */
export const HEALTH_HOST = "127.0.0.1";

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
  ): Promise<{ claimed: boolean; session?: any }>;
  checkCachedAssessment(sessionId: string): Promise<VoiceQualityAssessment | null>;
  processScoringJob(job: ScoringJob, signal?: AbortSignal): Promise<ScoringResult>;
  /** Atomic release/reschedule of an active claim back to retryable state
   *  (`reschedule_telefun_scoring`); returns true when accepted. */
  releaseClaim(sessionId: string, error: string, nextAttemptAt: Date): Promise<boolean>;
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
    releaseClaim: async (sessionId, error, nextAttemptAt) => {
      const adminClient = createAdminClient();
      const { data, error: rpcError } = await adminClient.rpc("reschedule_telefun_scoring", {
        p_session_id: sessionId,
        p_error: error,
        p_next_attempt_at: nextAttemptAt.toISOString(),
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
// Health snapshot + HTTP endpoint
// ---------------------------------------------------------------------------

export interface WorkerHealthSnapshot {
  enabled: boolean;
  loopAlive: boolean;
  lastSuccessfulPollAt: string | null;
  lastErrorClass: string | null;
  queue: { pending: number; processing: number; failed: number } | null;
  oldestEligiblePendingAgeMs: number | null;
}

/** Picks ONLY the bounded contract fields — never identifiers, paths,
 *  prompts, secrets, or raw error messages. */
export function toHealthPayload(snapshot: WorkerHealthSnapshot): Record<string, unknown> {
  return {
    enabled: snapshot.enabled,
    loopAlive: snapshot.loopAlive,
    lastSuccessfulPollAt: snapshot.lastSuccessfulPollAt,
    lastErrorClass: snapshot.lastErrorClass,
    queue:
      snapshot.queue === null
        ? null
        : {
            pending: snapshot.queue.pending,
            processing: snapshot.queue.processing,
            failed: snapshot.queue.failed,
          },
    oldestEligiblePendingAgeMs: snapshot.oldestEligiblePendingAgeMs,
  };
}

function safeEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Internal health app: `Authorization: Bearer <TELEFUN_INTERNAL_TOKEN>`
 *  (constant-time comparison). Non-billable, never opens a provider
 *  connection, never processes jobs. */
export function createHealthApp(
  snapshot: () => WorkerHealthSnapshot,
  internalToken: string,
): Hono {
  const app = new Hono();
  app.use("/health", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!safeEqual(provided, internalToken)) {
      return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
    }
    await next();
  });
  app.get("/health", (c) => c.json(toHealthPayload(snapshot())));
  return app;
}

export interface HealthServerOptions {
  port: number;
  token: string;
  snapshot: () => WorkerHealthSnapshot;
  log: (line: string) => void;
  /** Loopback by default; deployment binds the Railway private address. */
  host?: string;
}

export function startHealthServer(options: HealthServerOptions): { close(): void } {
  const host = options.host ?? HEALTH_HOST;
  const app = createHealthApp(options.snapshot, options.token);
  const server = serve({ fetch: app.fetch, port: options.port, hostname: host }, (info) => {
    options.log(
      `[TelefunWorker] health server listening on http://${info.address ?? host}:${info.port}`,
    );
  });
  return { close: () => server.close() };
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

export function createRuntime(options: RuntimeOptions): ScoringWorkerRuntime {
  const { config, boundary } = options;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((line: string) => console.log(line));

  const abortController = new AbortController();

  const state = {
    shuttingDown: false,
    loopAlive: false,
    lastSuccessfulPollAt: null as string | null,
    lastErrorClass: null as string | null,
    queue: null as QueueStats | null,
    activeJob: null as ScoringJob | null,
    inFlight: null as Promise<unknown> | null,
  };

  // Batch-processor deps wired to the injected boundary. The claim timeout is
  // applied here so the pure batch processor keeps its one-arg claim seam.
  const deps: ScoringWorkerDeps = {
    fetchPendingJobs: (limit) => boundary.fetchPendingJobs(limit),
    claimJob: (sessionId) => boundary.claimJob(sessionId, config.claimTimeoutSeconds),
    checkCachedAssessment: (sessionId) => boundary.checkCachedAssessment(sessionId),
    processScoringJob: (job, signal) => {
      state.activeJob = job;
      const promise = boundary.processScoringJob(job, signal ?? abortController.signal);
      state.inFlight = promise;
      const clear = () => {
        if (state.activeJob === job) state.activeJob = null;
        if (state.inFlight === promise) state.inFlight = null;
      };
      promise.then(clear, clear);
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
      state.lastErrorClass = errorClass(err);
      return;
    }
    state.lastSuccessfulPollAt = now().toISOString();
    state.lastErrorClass = null;

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
    } catch (err) {
      state.lastErrorClass = errorClass(err);
    }
  }

  async function loop(): Promise<void> {
    state.loopAlive = true;
    while (!state.shuttingDown) {
      await pollOnce();
      if (state.shuttingDown) break;
      await sleep(config.intervalMs);
    }
    state.loopAlive = false;
  }

  async function shutdown(): Promise<void> {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    abortController.abort();

    const job = state.activeJob;
    const inFlight = state.inFlight;
    if (job && inFlight) {
      const deadlineMs = config.claimTimeoutSeconds * 1000;
      const settled = await Promise.race([
        inFlight.then(
          () => true,
          () => true,
        ),
        sleep(deadlineMs).then(() => false),
      ]);
      if (!settled) {
        // Deadline expired before the job settled: atomically release the
        // active claim back to retryable state BEFORE exit. The late provider
        // result cannot persist (complete_telefun_scoring rejects when the
        // row is no longer processing) and we never re-run the job.
        const nextAttemptAt = new Date(now().getTime() + deadlineMs);
        let released = false;
        try {
          released = await boundary.releaseClaim(
            job.sessionId,
            "worker shutdown: analysis did not settle within claim timeout",
            nextAttemptAt,
          );
        } catch (err) {
          log(
            JSON.stringify({
              event: "telefun_scoring_worker.claim_release_failed",
              errorClass: errorClass(err),
            }),
          );
        }
        log(
          JSON.stringify({
            event: released
              ? "telefun_scoring_worker.claim_released"
              : "telefun_scoring_worker.claim_release_skipped",
            nextAttemptAt: nextAttemptAt.toISOString(),
          }),
        );
      }
    }
    state.loopAlive = false;
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
// Entrypoint
// ---------------------------------------------------------------------------

export interface MainOptions {
  env?: Record<string, string | undefined>;
  boundary?: ScoringWorkerBoundary;
  exit?: (code: number) => never;
  log?: (line: string) => void;
  onSignal?: (handler: () => void) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export function main(options: MainOptions = {}): void {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  const log = options.log ?? ((line: string) => console.error(line));
  const onSignal =
    options.onSignal ??
    ((handler: () => void) => {
      process.on("SIGTERM", handler);
      process.on("SIGINT", handler);
    });

  const parsed = parseWorkerConfig(env);
  if (!parsed.ok) {
    log(
      JSON.stringify({
        event: "telefun_scoring_worker.config_rejected",
        code: parsed.code,
        detail: parsed.detail,
      }),
    );
    exit(1);
    return;
  }
  const config = parsed.config;

  log(
    JSON.stringify({
      event: "telefun_scoring_worker.started",
      intervalMs: config.intervalMs,
      batchSize: config.batchSize,
      claimTimeoutSeconds: config.claimTimeoutSeconds,
      healthPort: config.healthPort,
    }),
  );

  const runtime = createRuntime({
    config,
    boundary: options.boundary ?? createDefaultBoundary(),
    sleep: options.sleep,
    now: options.now,
    log,
  });

  let shutdownStarted = false;
  onSignal(() => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    log(JSON.stringify({ event: "telefun_scoring_worker.shutdown_started" }));
    void runtime.shutdown().then(() => {
      log(JSON.stringify({ event: "telefun_scoring_worker.shutdown_complete" }));
      exit(0);
    });
  });

  if (config.healthPort !== null && config.internalToken !== null) {
    startHealthServer({
      port: config.healthPort,
      token: config.internalToken,
      snapshot: () => runtime.getHealthSnapshot(),
      log,
    });
  }

  runtime.start();
}

const isRuntimeEntrypoint =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].includes("telefun-scoring-worker-runtime");

if (isRuntimeEntrypoint) {
  main();
}
