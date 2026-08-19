import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Captured serve() options so startHealthServer can be verified without
// binding a real port. Prefix "mock" is required by vi.mock hoisting.
const mockServeOptions: Array<Record<string, unknown>> = [];
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(
    (options: Record<string, unknown>, cb?: (info: { port: number; hostname?: string }) => void) => {
      mockServeOptions.push(options);
      cb?.({ port: options.port as number, hostname: options.hostname as string | undefined });
      return { close: vi.fn() };
    },
  ),
}));

import {
  aggregateQueueStats,
  createHealthApp,
  createRuntime,
  main,
  parseWorkerConfig,
  startHealthServer,
  type ScoringWorkerBoundary,
  type WorkerConfig,
  type WorkerHealthSnapshot,
} from "../workers/telefun-scoring-worker-runtime";
import type { ScoringJob, ScoringResult } from "../services/telefun-scoring-service";

const VALID_ENV: Record<string, string | undefined> = {
  TELEFUN_SCORING_WORKER_ENABLED: "true",
  TELEFUN_SCORING_WORKER_INTERVAL_MS: "30000",
  TELEFUN_SCORING_WORKER_BATCH_SIZE: "5",
  TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS: "120",
  TELEFUN_SCORING_WORKER_HEALTH_PORT: "9100",
  TELEFUN_INTERNAL_TOKEN: "secret-token",
};

const CONFIG: WorkerConfig = {
  enabled: true,
  intervalMs: 30000,
  batchSize: 5,
  claimTimeoutSeconds: 120,
  healthPort: null,
  internalToken: null,
};

function createBoundary(overrides: Partial<ScoringWorkerBoundary> = {}): ScoringWorkerBoundary {
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

// A sleep that yields to the event loop (like the production setTimeout-based
// sleep) instead of resolving purely on the microtask queue. A microtask-only
// loop starves vitest's timer-based vi.waitFor polling.
const immediateSleep = () => new Promise<void>((resolve) => setImmediate(resolve));

function throwingExit(exitCodeRef: { code: number | null }): (code: number) => never {
  return ((code: number): never => {
    exitCodeRef.code = code;
    throw new Error("process.exit");
  }) as (code: number) => never;
}

const HEALTHY_SNAPSHOT: WorkerHealthSnapshot = {
  enabled: true,
  loopAlive: true,
  lastSuccessfulPollAt: "2026-08-14T09:00:00.000Z",
  lastErrorClass: null,
  queue: { pending: 2, processing: 1, failed: 0 },
  oldestEligiblePendingAgeMs: 12000,
};

describe("parseWorkerConfig", () => {
  it("rejects disabled config (anything but exactly 'true') fail-fast", () => {
    for (const disabled of [undefined, "false", "0", "TRUE", "1", ""]) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_ENABLED: disabled });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("DISABLED");
    }
  });

  it("rejects missing or invalid interval (no silent default in the runtime)", () => {
    const invalidValues: Array<string | undefined> = [
      undefined,
      "",
      "abc",
      "0",
      "-5",
      "1.5",
      "999", // below 1000
      "600001", // above 600000
    ];
    for (const interval of invalidValues) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_INTERVAL_MS: interval });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_INTERVAL_MS");
    }
    const ok = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_INTERVAL_MS: "1000" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.intervalMs).toBe(1000);
    const okMax = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_INTERVAL_MS: "600000" });
    expect(okMax.ok).toBe(true);
  });

  it("rejects missing or out-of-range batch size", () => {
    for (const batch of [undefined, "", "abc", "0", "-1", "51"]) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_BATCH_SIZE: batch });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_BATCH_SIZE");
    }
    const ok = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_BATCH_SIZE: "50" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.batchSize).toBe(50);
  });

  it("defaults claim timeout to 120 and rejects invalid explicit values", () => {
    const ok = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS: undefined });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.claimTimeoutSeconds).toBe(120);

    for (const claim of ["0", "-1", "abc", "1.5"]) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS: claim });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_CLAIM_TIMEOUT_SECONDS");
    }
  });

  it("rejects invalid health ports and accepts valid ones", () => {
    for (const port of ["80", "1023", "65536", "abc", "0", "-1"]) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_HEALTH_PORT: port });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_HEALTH_PORT");
    }
    const ok = parseWorkerConfig({ ...VALID_ENV, TELEFUN_SCORING_WORKER_HEALTH_PORT: "9100" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.healthPort).toBe(9100);
  });

  it("does not require a token when the health server is disabled", () => {
    const result = parseWorkerConfig({
      ...VALID_ENV,
      TELEFUN_SCORING_WORKER_HEALTH_PORT: undefined,
      TELEFUN_INTERNAL_TOKEN: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.healthPort).toBeNull();
      expect(result.config.internalToken).toBeNull();
    }
  });

  it("requires TELEFUN_INTERNAL_TOKEN when the health server is enabled", () => {
    for (const token of [undefined, "", "   "]) {
      const result = parseWorkerConfig({ ...VALID_ENV, TELEFUN_INTERNAL_TOKEN: token });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("MISSING_INTERNAL_TOKEN");
    }
  });

  it("accepts a fully valid configuration", () => {
    const result = parseWorkerConfig(VALID_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual({
        enabled: true,
        intervalMs: 30000,
        batchSize: 5,
        claimTimeoutSeconds: 120,
        healthPort: 9100,
        internalToken: "secret-token",
      });
    }
  });
});

describe("main fail-fast", () => {
  it("exits non-zero with a structured log when the worker is disabled (kill switch)", () => {
    const logs: string[] = [];
    const exitCode = { code: null as number | null };
    expect(() =>
      main({
        env: { ...VALID_ENV, TELEFUN_SCORING_WORKER_ENABLED: "false" },
        log: (line) => logs.push(line),
        exit: throwingExit(exitCode),
        onSignal: () => {},
      }),
    ).toThrow("process.exit");
    expect(exitCode.code).toBe(1);
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0]);
    expect(line.event).toBe("telefun_scoring_worker.config_rejected");
    expect(line.code).toBe("DISABLED");
  });

  it("exits non-zero on an invalid poll interval", () => {
    const logs: string[] = [];
    const exitCode = { code: null as number | null };
    expect(() =>
      main({
        env: { ...VALID_ENV, TELEFUN_SCORING_WORKER_INTERVAL_MS: "not-a-number" },
        log: (line) => logs.push(line),
        exit: throwingExit(exitCode),
        onSignal: () => {},
      }),
    ).toThrow("process.exit");
    expect(exitCode.code).toBe(1);
    const line = JSON.parse(logs[0]);
    expect(line.event).toBe("telefun_scoring_worker.config_rejected");
    expect(line.code).toBe("INVALID_INTERVAL_MS");
  });

  it("exits non-zero when the health server is enabled without a token", () => {
    const logs: string[] = [];
    const exitCode = { code: null as number | null };
    expect(() =>
      main({
        env: { ...VALID_ENV, TELEFUN_INTERNAL_TOKEN: undefined },
        log: (line) => logs.push(line),
        exit: throwingExit(exitCode),
        onSignal: () => {},
      }),
    ).toThrow("process.exit");
    expect(exitCode.code).toBe(1);
    const line = JSON.parse(logs[0]);
    expect(line.code).toBe("MISSING_INTERNAL_TOKEN");
  });

  it("starts the loop and exits 0 after a graceful signal shutdown", async () => {
    const logs: string[] = [];
    const exitCode = { code: null as number | null };
    const exit = ((code: number) => {
      exitCode.code = code;
    }) as unknown as (code: number) => never;
    let handler: (() => void) | null = null;
    const boundary = createBoundary();
    main({
      env: { ...VALID_ENV, TELEFUN_SCORING_WORKER_HEALTH_PORT: undefined, TELEFUN_INTERNAL_TOKEN: undefined },
      boundary,
      log: (line) => logs.push(line),
      exit,
      onSignal: (h) => {
        handler = h;
      },
      sleep: vi.fn(immediateSleep),
    });

    expect(JSON.parse(logs[0]).event).toBe("telefun_scoring_worker.started");
    await vi.waitFor(() => expect(boundary.fetchPendingJobs).toHaveBeenCalled());

    expect(handler).not.toBeNull();
    handler!();
    await vi.waitFor(() => expect(exitCode.code).toBe(0));
    expect(logs.some((l) => JSON.parse(l).event === "telefun_scoring_worker.shutdown_started")).toBe(true);
  });
});

describe("runtime loop", () => {
  it("surfaces queue DB errors as degraded, never as healthy/empty", async () => {
    const dbError = new Error("relation telefun_history does not exist");
    dbError.name = "DatabaseError";
    const fetchPendingJobs = vi.fn(async () => {
      throw dbError;
    });
    const boundary = createBoundary({ fetchPendingJobs });
    const runtime = createRuntime({ config: CONFIG, boundary, sleep: vi.fn(immediateSleep) });

    runtime.start();
    await vi.waitFor(() => expect(runtime.getHealthSnapshot().lastErrorClass).toBe("DatabaseError"));
    // polling continues despite the DB error
    await vi.waitFor(() => expect(fetchPendingJobs.mock.calls.length).toBeGreaterThanOrEqual(3));

    const degraded = runtime.getHealthSnapshot();
    expect(degraded.enabled).toBe(true);
    expect(degraded.loopAlive).toBe(true);
    expect(degraded.lastSuccessfulPollAt).toBeNull();
    expect(degraded.lastErrorClass).toBe("DatabaseError");
    expect(degraded.queue).toBeNull();
    expect(degraded.oldestEligiblePendingAgeMs).toBeNull();

    await runtime.shutdown();
    await runtime.awaitLoop();
    expect(runtime.getHealthSnapshot().loopAlive).toBe(false);
  });

  it("recovers to healthy once the queue query succeeds again", async () => {
    let calls = 0;
    const dbError = new Error("db down");
    dbError.name = "DatabaseError";
    const fetchPendingJobs = vi.fn(async () => {
      calls++;
      if (calls <= 2) throw dbError;
      return [];
    });
    const boundary = createBoundary({
      fetchPendingJobs,
      fetchQueueStats: vi.fn(async () => ({ pending: 1, processing: 0, failed: 2, oldestEligiblePendingAgeMs: 5000 })),
    });
    const runtime = createRuntime({ config: CONFIG, boundary, sleep: vi.fn(immediateSleep) });

    runtime.start();
    await vi.waitFor(() =>
      expect(runtime.getHealthSnapshot().lastSuccessfulPollAt).not.toBeNull(),
    );

    const healthy = runtime.getHealthSnapshot();
    expect(healthy.lastErrorClass).toBeNull();
    expect(healthy.lastSuccessfulPollAt).not.toBeNull();
    expect(healthy.queue).toEqual({ pending: 1, processing: 0, failed: 2 });
    expect(healthy.oldestEligiblePendingAgeMs).toBe(5000);

    await runtime.shutdown();
    await runtime.awaitLoop();
  });

  it("never overlaps batches (next poll starts only after the previous completes)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let releaseFetch: (() => void) | null = null;
    const fetchPendingJobs = vi.fn(() => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise<ScoringJob[]>((resolve) => {
        releaseFetch = () => {
          concurrent--;
          resolve([]);
        };
      });
    });
    const boundary = createBoundary({ fetchPendingJobs });
    const runtime = createRuntime({ config: CONFIG, boundary, sleep: vi.fn(async () => {}) });

    runtime.start();
    await vi.waitFor(() => expect(fetchPendingJobs).toHaveBeenCalledTimes(1));
    expect(maxConcurrent).toBe(1);

    // Complete the first poll: a second poll starts only after it completes.
    releaseFetch!();
    await vi.waitFor(() => expect(fetchPendingJobs).toHaveBeenCalledTimes(2));
    expect(maxConcurrent).toBe(1);

    // While the second poll is in flight, no third poll may start.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchPendingJobs).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);

    await runtime.shutdown();
    releaseFetch!();
    await runtime.awaitLoop();
    expect(fetchPendingJobs).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it("stops admission: no new polls or claims after the shutdown signal between polls", async () => {
    const sleepState: { resolveSleep: (() => void) | null } = {
      resolveSleep: null,
    };
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => (sleepState.resolveSleep = resolve)),
    );
    const fetchPendingJobs = vi.fn(async () => []);
    const claimJob = vi.fn(async () => ({ claimed: true }));
    const boundary = createBoundary({ fetchPendingJobs, claimJob });
    const runtime = createRuntime({ config: CONFIG, boundary, sleep });

    runtime.start();
    await vi.waitFor(() => expect(fetchPendingJobs).toHaveBeenCalledTimes(1));

    await runtime.shutdown();
    // The loop may break on the shutdown flag before ever sleeping, so the
    // resolver can legitimately be null — release it only when set.
    sleepState.resolveSleep?.();
    await runtime.awaitLoop();

    expect(fetchPendingJobs).toHaveBeenCalledTimes(1);
    expect(claimJob).not.toHaveBeenCalled();
    expect(runtime.getHealthSnapshot().loopAlive).toBe(false);
  });

  it("passes the configured claim timeout to claimJob", async () => {
    const claimJob = vi.fn(async (_id: string) => ({ claimed: true }));
    const boundary = createBoundary({
      claimJob,
      fetchPendingJobs: vi.fn(async () => [{ sessionId: "s1", userId: "u1" }]),
    });
    const runtime = createRuntime({
      config: { ...CONFIG, claimTimeoutSeconds: 42 },
      boundary,
      sleep: vi.fn(immediateSleep),
    });

    runtime.start();
    await vi.waitFor(() => expect(claimJob).toHaveBeenCalledWith("s1", 42));

    await runtime.shutdown();
    await runtime.awaitLoop();
  });

  it("SIGTERM mid-analysis: aborts the signal, waits bounded (claim timeout), releases the claim atomically, then stops without a second AI call or late actions", async () => {
    let resolveLate!: (result: ScoringResult) => void;
    const lateResult = new Promise<ScoringResult>((resolve) => (resolveLate = resolve));
    let capturedSignal: AbortSignal | undefined;
    const processScoringJob = vi.fn(async (_job: ScoringJob, signal?: AbortSignal) => {
      capturedSignal = signal;
      return lateResult;
    });
    const releaseClaim = vi.fn(async (_id: string, _error: string, _nextAttemptAt: Date) => true);
    const claimJob = vi.fn(async (_id: string, _timeout: number) => ({ claimed: true }));
    const boundary = createBoundary({
      processScoringJob,
      releaseClaim,
      claimJob,
      fetchPendingJobs: vi.fn(async () => [{ sessionId: "s1", userId: "u1" }]),
    });
    const sleep = vi.fn(immediateSleep);
    const runtime = createRuntime({ config: { ...CONFIG, claimTimeoutSeconds: 5 }, boundary, sleep });

    runtime.start();
    await vi.waitFor(() => expect(processScoringJob).toHaveBeenCalledTimes(1));
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    await runtime.shutdown();

    // 1. Abort signal fired at the analysis boundary.
    expect(capturedSignal!.aborted).toBe(true);
    // 2. Bounded wait used the claim timeout as the deadline.
    expect(sleep).toHaveBeenCalledWith(5000);
    // 3. Atomic release to retryable state BEFORE shutdown resolves.
    expect(releaseClaim).toHaveBeenCalledTimes(1);
    expect(releaseClaim).toHaveBeenCalledWith("s1", expect.any(String), expect.any(Date));
    const nextAttemptAt = releaseClaim.mock.calls[0][2] as Date;
    expect(nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    // 4. No second AI call, no second claim.
    expect(processScoringJob).toHaveBeenCalledTimes(1);
    expect(claimJob).toHaveBeenCalledTimes(1);

    // 5. Late provider result arrives AFTER release: the runtime performs no
    //    late actions (no write, no re-claim, no re-release). The DB-level
    //    no-late-write guard lives in complete_telefun_scoring (api-impl).
    resolveLate({ success: true, status: "completed" });
    await runtime.awaitLoop();
    expect(processScoringJob).toHaveBeenCalledTimes(1);
    expect(claimJob).toHaveBeenCalledTimes(1);
    expect(releaseClaim).toHaveBeenCalledTimes(1);
    expect(runtime.getHealthSnapshot().loopAlive).toBe(false);
  });

  it("does not release the claim when the in-flight job settles before the deadline", async () => {
    let resolveJob!: (result: ScoringResult) => void;
    const processScoringJob = vi.fn(
      (_job: ScoringJob, _signal?: AbortSignal) =>
        new Promise<ScoringResult>((resolve) => (resolveJob = resolve)),
    );
    const releaseClaim = vi.fn(async () => true);
    const boundary = createBoundary({
      processScoringJob,
      releaseClaim,
      fetchPendingJobs: vi.fn(async () => [{ sessionId: "s1", userId: "u1" }]),
    });
    const sleep = vi.fn(() => new Promise<void>(() => {})); // deadline never elapses
    const runtime = createRuntime({ config: { ...CONFIG, claimTimeoutSeconds: 5 }, boundary, sleep });

    runtime.start();
    await vi.waitFor(() => expect(processScoringJob).toHaveBeenCalledTimes(1));

    const shutdownPromise = runtime.shutdown();
    // The job settles before the deadline elapses.
    resolveJob({ success: true, status: "completed" });
    await shutdownPromise;
    await runtime.awaitLoop();

    expect(releaseClaim).not.toHaveBeenCalled();
  });
});

describe("health endpoint", () => {
  it("returns 401 without a token and with a wrong token", async () => {
    const app = createHealthApp(() => HEALTHY_SNAPSHOT, "s3cret");
    expect((await app.request("/health")).status).toBe(401);
    expect(
      (await app.request("/health", { headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(401);
    expect(
      (await app.request("/health", { headers: { "x-internal-token": "s3cret" } })).status,
    ).toBe(401);
  });

  it("returns 200 with the bearer token and only the bounded payload fields", async () => {
    const app = createHealthApp(() => HEALTHY_SNAPSHOT, "s3cret");
    const res = await app.request("/health", { headers: { authorization: "Bearer s3cret" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "enabled",
      "lastErrorClass",
      "lastSuccessfulPollAt",
      "loopAlive",
      "oldestEligiblePendingAgeMs",
      "queue",
    ]);
    expect(Object.keys((body as { queue: Record<string, unknown> }).queue).sort()).toEqual([
      "failed",
      "pending",
      "processing",
    ]);
    expect(body).toEqual(HEALTHY_SNAPSHOT);
  });

  it("returns ONLY the bounded fields even if internal state carries identifiers, secrets, or paths", async () => {
    const planted = {
      ...HEALTHY_SNAPSHOT,
      sessionId: "11111111-2222-3333-4444-555555555555",
      userId: "u1",
      agentRecordingPath: "u1/11111111-2222-3333-4444-555555555555/agent_only.seekable.webm",
      prompt: "top-secret-prompt",
      lastError: "raw db error: password=abc123",
      internalToken: "s3cret",
    } as unknown as WorkerHealthSnapshot;
    const app = createHealthApp(() => planted, "s3cret");
    const res = await app.request("/health", { headers: { authorization: "Bearer s3cret" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "enabled",
      "lastErrorClass",
      "lastSuccessfulPollAt",
      "loopAlive",
      "oldestEligiblePendingAgeMs",
      "queue",
    ]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(raw).not.toContain("top-secret-prompt");
    expect(raw).not.toContain("password=abc123");
    expect(raw).not.toContain("agent_only");
  });

  it("reports degraded DB state with the error CLASS only, never the raw message", async () => {
    const dbError = new Error("db unreachable: password=hunter2 host=db.internal:5432");
    dbError.name = "DatabaseError";
    const boundary = createBoundary({
      fetchPendingJobs: vi.fn(async () => {
        throw dbError;
      }),
    });
    const runtime = createRuntime({ config: CONFIG, boundary, sleep: vi.fn(immediateSleep) });
    runtime.start();
    await vi.waitFor(() => expect(runtime.getHealthSnapshot().lastErrorClass).toBe("DatabaseError"));

    const app = createHealthApp(() => runtime.getHealthSnapshot(), "s3cret");
    const res = await app.request("/health", { headers: { authorization: "Bearer s3cret" } });
    const body = await res.json();
    expect(body.lastErrorClass).toBe("DatabaseError");
    expect(body.queue).toBeNull();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("db.internal");

    await runtime.shutdown();
    await runtime.awaitLoop();
  });

  it("binds the health server to 127.0.0.1 on the configured port", () => {
    mockServeOptions.length = 0;
    startHealthServer({
      port: 9100,
      token: "t",
      snapshot: () => HEALTHY_SNAPSHOT,
      log: () => {},
    });
    expect(mockServeOptions).toHaveLength(1);
    expect(mockServeOptions[0]).toMatchObject({ port: 9100, hostname: "127.0.0.1" });
  });
});

describe("queue stats aggregation", () => {
  it("aggregates counts and the oldest eligible pending age without identifiers", () => {
    const stats = aggregateQueueStats(
      [
        // eligible (next_attempt_at null): age 0
        {
          scoring_status: "pending",
          scoring_next_attempt_at: null,
          scoring_ready_at: "2026-08-14T09:00:00.000Z",
          created_at: "2026-08-14T08:59:00.000Z",
        },
        // eligible (next_attempt_at due): age 120_000ms
        {
          scoring_status: "pending",
          scoring_next_attempt_at: "2026-08-14T08:59:30.000Z",
          scoring_ready_at: "2026-08-14T08:58:00.000Z",
          created_at: "2026-08-14T08:58:00.000Z",
        },
        // not eligible yet (next_attempt_at in the future)
        {
          scoring_status: "pending",
          scoring_next_attempt_at: "2026-08-14T10:00:00.000Z",
          scoring_ready_at: "2026-08-14T08:57:00.000Z",
          created_at: "2026-08-14T08:57:00.000Z",
        },
        { scoring_status: "processing", scoring_next_attempt_at: null, scoring_ready_at: null, created_at: null },
        { scoring_status: "failed", scoring_next_attempt_at: null, scoring_ready_at: null, created_at: null },
        { scoring_status: "completed", scoring_next_attempt_at: null, scoring_ready_at: null, created_at: null },
      ],
      Date.parse("2026-08-14T09:00:00.000Z"),
    );
    expect(stats.pending).toBe(3);
    expect(stats.processing).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.oldestEligiblePendingAgeMs).toBe(120000);
  });
});

describe("process separation", () => {
  it("keeps the worker out of the API web process (index.ts must not import the worker)", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const indexSource = readFileSync(path.resolve(here, "../index.ts"), "utf8");
    expect(indexSource).not.toMatch(/telefun-scoring-worker/);
    expect(indexSource).not.toMatch(/workers\//);
  });
});
