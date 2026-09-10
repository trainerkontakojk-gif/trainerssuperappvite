import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @hono/node-server so no real port is bound. The mock close invokes
// its callback like node:http Server.close(cb) does.
const mockClose = vi.fn((cb?: (err?: Error) => void) => cb?.());
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(
    (
      _options: Record<string, unknown>,
      cb?: (info: { port: number; hostname?: string }) => void,
    ) => {
      cb?.({ port: 3000 });
      return { close: mockClose };
    },
  ),
}));

import { startEmbeddedTelefunScoringWorker } from "../workers/telefun-scoring-worker-runtime";
import { startApiRuntime } from "../api-runtime";
import type { ScoringWorkerBoundary } from "../workers/telefun-scoring-worker-runtime";
import type { ScoringJob, ScoringResult } from "../services/telefun-scoring-service";

const VALID_ENV: Record<string, string | undefined> = {
  TELEFUN_SCORING_WORKER_ENABLED: "true",
  TELEFUN_SCORING_WORKER_INTERVAL_MS: "1000",
  TELEFUN_SCORING_WORKER_BATCH_SIZE: "5",
};

function createBoundary(
  overrides: Partial<ScoringWorkerBoundary> = {},
): ScoringWorkerBoundary {
  return {
    fetchPendingJobs: vi.fn(async () => [] as ScoringJob[]),
    claimJob: vi.fn(async (_sessionId: string, _timeoutSeconds: number) => ({ claimed: true })),
    checkCachedAssessment: vi.fn(async () => null),
    processScoringJob: vi.fn(
      async (_job: ScoringJob, _signal?: AbortSignal): Promise<ScoringResult> => ({
        success: true,
        status: "completed",
      }),
    ),
    releaseClaim: vi.fn(async (_sessionId: string, _error: string, _nextAttemptAt: Date) => true),
    fetchQueueStats: vi.fn(async () => ({
      pending: 0,
      processing: 0,
      failed: 0,
      oldestEligiblePendingAgeMs: null,
    })),
    ...overrides,
  };
}

const immediateSleep = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("startEmbeddedTelefunScoringWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the poll loop after env validation when enabled", async () => {
    const boundary = createBoundary();
    const log = vi.fn();
    const handle = startEmbeddedTelefunScoringWorker({
      env: VALID_ENV,
      boundary,
      log,
      sleep: immediateSleep,
    });
    expect(handle.started).toBe(true);
    // Let the loop tick at least once (interval 30ms + immediate sleeps).
    await vi.waitFor(() => {
      expect(boundary.fetchPendingJobs).toHaveBeenCalled();
    });
    if (handle.started) await handle.shutdown();
  });

  it("returns disabled without throwing when ENABLED is unset, keeping API alive", () => {
    const boundary = createBoundary();
    const log = vi.fn();
    const handle = startEmbeddedTelefunScoringWorker({ env: {}, boundary, log });
    expect(handle.started).toBe(false);
    expect(boundary.fetchPendingJobs).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("telefun_scoring_worker.disabled"),
    );
  });

  it("throws when explicitly enabled but config is invalid (fail API startup)", () => {
    const boundary = createBoundary();
    expect(() =>
      startEmbeddedTelefunScoringWorker({
        env: { ...VALID_ENV, TELEFUN_SCORING_WORKER_INTERVAL_MS: "nan" },
        boundary,
        log: vi.fn(),
      }),
    ).toThrow();
    expect(boundary.fetchPendingJobs).not.toHaveBeenCalled();
  });
});

describe("startApiRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function startRuntime(processEnv: Record<string, string | undefined>) {
    const signals: Array<() => void> = [];
    const exitCodes: number[] = [];
    const app = { fetch: vi.fn() };
    const runtime = startApiRuntime({
      app: app as unknown as { fetch: (req: Request) => Response | Promise<Response> },
      port: 3000,
      processEnv,
      log: vi.fn(),
      sleep: immediateSleep,
      boundary: createBoundary(),
      onSignal: (_signal: "SIGTERM" | "SIGINT", handler: () => void) => {
        signals.push(handler);
      },
      setExitCode: (code: number) => {
        exitCodes.push(code);
      },
      subjectIntentCleanup: { stop: vi.fn() },
    });
    return { runtime, signals, exitCodes };
  }

  it("starts HTTP + worker when enabled, shutdown runs worker first then closes HTTP once", async () => {
    const { runtime, signals, exitCodes } = startRuntime(VALID_ENV);
    expect(signals.length).toBe(2);

    const workerShutdown = vi.spyOn(runtime.worker!, "shutdown");
    signals[0]();
    await runtime.shutdownSettled();
    expect(workerShutdown).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(exitCodes).toEqual([0]);

    // Second signal must not double-shutdown.
    signals[1]();
    await immediateSleep();
    expect(workerShutdown).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP alive without worker when disabled", () => {
    const { runtime } = startRuntime({});
    expect(runtime.worker).toBeNull();
  });
});
