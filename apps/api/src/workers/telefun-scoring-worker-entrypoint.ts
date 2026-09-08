/**
 * Standalone compatibility adapter for the Telefun scoring worker.
 *
 * The API embeds the reusable runtime directly. This file owns the optional
 * standalone process concerns that must never be acquired by that embedded
 * path: process signals, exit codes, and the internal health port.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  createDefaultBoundary,
  createRuntime,
  parseWorkerConfig,
  type ScoringWorkerBoundary,
  type WorkerConfig,
  type WorkerHealthSnapshot,
} from "./telefun-scoring-worker-runtime";

/** Internal health server binds to loopback; it never uses the API `PORT`. */
export const HEALTH_HOST = "127.0.0.1";

/** Picks only bounded fields; identifiers, paths, prompts, secrets, and raw
 * errors never cross the standalone health boundary. */
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

/** Internal, non-billable health app for the deprecated rollout fallback. */
export function createHealthApp(
  snapshot: () => WorkerHealthSnapshot,
  internalToken: string,
): Hono {
  const app = new Hono();
  app.use("/health", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const provided = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : "";
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
  host?: string;
}

export function startHealthServer(options: HealthServerOptions): { close(): void } {
  const host = options.host ?? HEALTH_HOST;
  const app = createHealthApp(options.snapshot, options.token);
  const server = serve(
    { fetch: app.fetch, port: options.port, hostname: host },
    (info) => {
      options.log(
        `[TelefunWorker] health server listening on http://${info.address ?? host}:${info.port}`,
      );
    },
  );
  return { close: () => server.close() };
}

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
  const config: WorkerConfig = parsed.config;

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

const isStandaloneEntrypoint =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].includes("telefun-scoring-worker-entrypoint");

if (isStandaloneEntrypoint) {
  main();
}
