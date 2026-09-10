/**
 * API runtime — owns the HTTP server AND the embedded Telefun scoring worker
 * in a single process (option B: no standalone scoring-worker service).
 *
 * Startup order: HTTP listen first (after `env` was validated by the
 * entrypoint), then the embedded worker once iff
 * TELEFUN_SCORING_WORKER_ENABLED === "true". Disabled/unset worker config
 * keeps the API alive and only logs. Explicitly-enabled-but-invalid worker
 * config throws before traffic is accepted.
 *
 * Shutdown order: worker shutdown first, then HTTP close, then exit code 0.
 * A second signal never double-shuts-down.
 */

import { serve } from "@hono/node-server";
import {
  startEmbeddedTelefunScoringWorker,
  parseWorkerConfig,
  type ScoringWorkerBoundary,
  type ScoringWorkerRuntime,
} from "./workers/telefun-scoring-worker-runtime";
import {
  startPdktMailboxSubjectIntentCleanup,
  type PdktMailboxSubjectIntentCleanupHandle,
} from "./services/pdkt/mailbox-subject-intent-cleanup";

type ServeFetch = Parameters<typeof serve>[0]["fetch"];

export interface ApiRuntimeOptions {
  app: { fetch: ServeFetch };
  port: number;
  processEnv?: Record<string, string | undefined>;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  boundary?: ScoringWorkerBoundary;
  listen?: (
    fetch: ServeFetch,
    port: number,
    onListening: (info: { port: number }) => void,
  ) => { close: (cb?: (err?: Error) => void) => void };
  onSignal?: (signal: "SIGTERM" | "SIGINT", handler: () => void) => void;
  setExitCode?: (code: number) => void;
  subjectIntentCleanup?: PdktMailboxSubjectIntentCleanupHandle;
}

export interface ApiRuntime {
  worker: ScoringWorkerRuntime | null;
  /** Resolves immediately when no shutdown was triggered, else when the
   *  triggered shutdown fully settles. */
  shutdownSettled: () => Promise<void>;
}

export function startApiRuntime(options: ApiRuntimeOptions): ApiRuntime {
  const log = options.log ?? ((line: string) => console.log(line));
  const processEnv = options.processEnv ?? (process.env as Record<string, string | undefined>);
  const workerConfig = parseWorkerConfig(processEnv);
  if (!workerConfig.ok && workerConfig.code !== "DISABLED") {
    throw new Error(
      `telefun_scoring_worker.config_rejected: ${workerConfig.code} — ${workerConfig.detail}`,
    );
  }
  const listen =
    options.listen ??
    ((fetch: ServeFetch, port: number, onListening: (info: { port: number }) => void) =>
      serve({ fetch, port }, onListening));

  const server = listen(options.app.fetch, options.port, (info) => {
    log(`[API] Server running on http://localhost:${info.port}`);
  });

  const subjectIntentCleanup =
    options.subjectIntentCleanup ?? startPdktMailboxSubjectIntentCleanup();

  const handle = startEmbeddedTelefunScoringWorker({
    env: processEnv,
    boundary: options.boundary,
    log,
    sleep: options.sleep,
    now: options.now,
  });
  const worker = handle.started ? handle.runtime : null;

  const setExitCode =
    options.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });

  let shutdownPromise: Promise<void> | null = null;
  let shutdownStarted = false;
  async function shutdown(): Promise<void> {
    subjectIntentCleanup.stop();
    if (worker) await worker.shutdown();
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
    setExitCode(0);
  }
  function trigger(): Promise<void> {
    if (!shutdownStarted) {
      shutdownStarted = true;
      shutdownPromise = shutdown();
    }
    return shutdownPromise as Promise<void>;
  }

  const onSignal =
    options.onSignal ??
    ((signal: "SIGTERM" | "SIGINT", handler: () => void) => {
      process.once(signal, handler);
    });
  onSignal("SIGTERM", () => void trigger());
  onSignal("SIGINT", () => void trigger());

  return {
    worker,
    shutdownSettled: () => shutdownPromise ?? Promise.resolve(),
  };
}
