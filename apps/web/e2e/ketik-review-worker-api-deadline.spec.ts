import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { runSql } from "./helpers/sidakRealBackend";
import {
  env,
  db,
  trainer,
  guarded,
  suite,
  releaseProvider,
  worker,
  workerLog,
  setupKetikReviewWorkerSuite,
  teardownKetikReviewWorkerSuite,
  seedSession,
  request,
  job,
  embedded,
  spawnWorkerHost,
  startWorker,
  stopWorker,
  resetKetikReviewWorkerTest,
  cleanupKetikReviewWorkerTest,
} from "./helpers/ketikReviewWorkerApiHarness";

test.beforeAll(setupKetikReviewWorkerSuite);
test.afterAll(teardownKetikReviewWorkerSuite);
test.beforeEach(resetKetikReviewWorkerTest);
test.afterEach(cleanupKetikReviewWorkerTest);

// A separate, real PostgreSQL session blocks the first statement of settlement.
// No RPC/fetch mock: pg_stat_activity below must confirm the actual lock wait.
async function lockHistory(id: string) {
  const child = spawn(
    "psql",
    [env.dbUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += String(data);
  });
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  child.stdin.write(`BEGIN;
    SET LOCAL idle_in_transaction_session_timeout='30s';
    SELECT 1 FROM public.ketik_history WHERE id='${id}' FOR UPDATE;
    SELECT 'e2e-history-locked';\n`);
  const unlock = async () => {
    child.stdin.end("ROLLBACK;\n");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const code = await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Task lock session did not exit")),
            5000,
          );
        }),
      ]);
      expect(code).toBe(0);
    } finally {
      if (timer) clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  };
  try {
    await expect
      .poll(() => output.includes("e2e-history-locked"), { timeout: 5000 })
      .toBe(true);
    return unlock;
  } catch (error) {
    await unlock();
    throw error;
  }
}

const blockedSettlements = () =>
  Number(
    runSql(
      env,
      `
  SELECT count(*) FROM pg_stat_activity
  WHERE pid<>pg_backend_pid() AND wait_event_type='Lock'
    AND query LIKE '%settle_ketik_review%';
`,
    ),
  );

const healthUrl = () => {
  const port = workerLog.match(/"healthPort":(\d+)/)?.[1];
  expect(port).toBeTruthy();
  return `http://127.0.0.1:${port}/health`;
};

test("test-only deadline config rejects production and invalid values before worker startup", async () => {
  const cases: Record<string, string>[] = [
    {
      KETIK_REVIEW_WORKER_DEADLINE_MS: "1000",
      KETIK_E2E_CONFIG_NODE_ENV: "production",
    },
    { KETIK_REVIEW_WORKER_DEADLINE_MS: "0" },
    { KETIK_REVIEW_WORKER_DEADLINE_MS: "1.5" },
  ];
  for (const overrides of cases) {
    const child = spawnWorkerHost({
      KETIK_REVIEW_WORKER_ENABLED: "true",
      KETIK_REVIEW_WORKER_HEALTH_PORT: "0",
      ...overrides,
    });
    let log = "";
    child.stdout.on("data", (data) => {
      log += String(data);
    });
    child.stderr.on("data", (data) => {
      log += String(data);
    });
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    try {
      await expect.poll(() => child.exitCode, { timeout: 7000 }).toBe(1);
      expect(log).toContain("ketik_review_worker.config_rejected");
      expect(log).not.toContain('"event":"ketik_review_worker.started"');
      expect(log).not.toContain("[API] Server running");
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
    }
  }
});

test("deadline release timeout degrades health and completes another job while PostgreSQL is still blocked", async () => {
  const first = await seedSession();
  const second = await seedSession();
  expect((await request("/review", trainer, { sessionId: first })).status).toBe(
    202,
  );
  await startWorker({
    KETIK_REVIEW_WORKER_DEADLINE_MS: "4000",
    KETIK_REVIEW_WORKER_INTERVAL_MS: "2000",
  });
  await expect.poll(() => suite.providerCalls).toBe(1);
  const old = await job(first);
  let unlock: (() => Promise<void>) | undefined = await lockHistory(first);
  try {
    suite.providerMode = "success"; // The original request remains held; later requests succeed.
    expect(
      (await request("/review", trainer, { sessionId: second })).status,
    ).toBe(202);
    await expect
      .poll(blockedSettlements, { timeout: 7000, intervals: [50] })
      .toBeGreaterThan(0);
    let sawDegraded = false;
    await expect
      .poll(
        async () => {
          if (!embedded()) {
            const response = await guarded(healthUrl());
            const health = await response.json();
            if (
              response.status === 503 &&
              health.errorClass === "ReleaseTimeout"
            ) {
              sawDegraded = true;
              expect(health).toMatchObject({
                loopAlive: true,
                stopping: false,
                active: false,
              });
            }
          }
          return (await job(second)).status;
        },
        {
          timeout: 7000,
          intervals: [50],
          message:
            "The second job must complete before the first history lock is released",
        },
      )
      .toBe("completed");
    expect(workerLog).toContain(
      '"event":"ketik_review_worker.deadline_release_timeout"',
    );
    expect(blockedSettlements()).toBeGreaterThan(0);
    expect(await job(first)).toMatchObject({
      status: "processing",
      attempt_count: 1,
      lease_token: old.lease_token,
    });
    expect(
      (
        await db
          .from("ketik_session_reviews")
          .select("id")
          .eq("session_id", first)
      ).data,
    ).toEqual([]);
    if (!embedded()) {
      expect(sawDegraded).toBe(true);
      const response = await guarded(healthUrl());
      expect(response.status).toBe(200);
      expect((await response.json()).errorClass).toBeNull();
    }

    // Let the late release hit an expired lease. The original provider output
    // must also be fenced; a subsequent real claim is allowed to recover it.
    expect(
      (
        await db
          .from("ketik_review_jobs")
          .update({ lease_expires_at: "2020-01-01T00:00:00Z" })
          .eq("session_id", first)
      ).error,
    ).toBeNull();
    await unlock();
    unlock = undefined;
    releaseProvider();
    await expect
      .poll(() =>
        workerLog.includes('"event":"ketik_review_worker.lease_lost"'),
      )
      .toBe(true);
    await expect
      .poll(async () => (await job(first)).status, { timeout: 10_000 })
      .toBe("completed");
    expect((await job(first)).attempt_count).toBe(2);
    expect(
      (
        await db
          .from("ketik_session_reviews")
          .select("id")
          .eq("session_id", first)
      ).data,
    ).toHaveLength(1);
    await test.info().attach("bounded-release-evidence", {
      body: JSON.stringify({
        secondCompletedWhileLocked: true,
        sawDegraded: embedded() ? "standalone-only" : sawDegraded,
        lateProviderFenced: true,
        workerLog,
      }),
      contentType: "application/json",
    });
  } finally {
    await unlock?.();
    suite.providerMode = "success";
    releaseProvider();
    await stopWorker();
  }
});

test("shutdown after an earlier claim release timeout exits cleanly with no active claim", async () => {
  const first = await seedSession();
  expect((await request("/review", trainer, { sessionId: first })).status).toBe(
    202,
  );
  await startWorker({
    KETIK_REVIEW_WORKER_DEADLINE_MS: "1000",
    KETIK_REVIEW_WORKER_INTERVAL_MS: "5000",
  });
  await expect.poll(() => suite.providerCalls).toBe(1);
  const old = await job(first);
  const child = worker!;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  const unlock = await lockHistory(first);
  try {
    await expect
      .poll(blockedSettlements, { timeout: 5000, intervals: [50] })
      .toBe(1);
    await expect
      .poll(
        () =>
          workerLog.includes("ketik_review_worker.deadline_release_timeout"),
        { timeout: 5000, intervals: [50] },
      )
      .toBe(true);
    if (!embedded()) {
      const response = await guarded(healthUrl());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        active: false,
        errorClass: "ReleaseTimeout",
      });
    }
    child.kill("SIGTERM");
    await expect.poll(() => child.exitCode, { timeout: 5000 }).toBe(0);
    await exited;
    expect(workerLog).not.toContain(
      "ketik_review_worker.shutdown_claim_fenced",
    );
    expect(workerLog).not.toContain(
      "ketik_review_worker.shutdown_recovery_deferred",
    );
    expect(await job(first)).toMatchObject({
      status: "processing",
      attempt_count: 1,
      lease_token: old.lease_token,
    });
    await test.info().attach("earlier-timeout-shutdown-evidence", {
      body: JSON.stringify({ exitCode: child.exitCode, workerLog }),
      contentType: "application/json",
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
    await unlock();
    suite.providerMode = "success";
    releaseProvider();
    await stopWorker();
  }
});

test("a healthy deadline release invalidates its token and late provider output cannot publish", async () => {
  const first = await seedSession();
  const second = await seedSession();
  expect((await request("/review", trainer, { sessionId: first })).status).toBe(
    202,
  );
  await startWorker({ KETIK_REVIEW_WORKER_DEADLINE_MS: "1000" });
  await expect.poll(() => suite.providerCalls).toBe(1);
  const old = await job(first);
  suite.providerMode = "success";
  expect(
    (await request("/review", trainer, { sessionId: second })).status,
  ).toBe(202);
  await expect
    .poll(async () => (await job(second)).status, { timeout: 7000 })
    .toBe("completed");
  expect(workerLog).toContain(
    '"event":"ketik_review_worker.deadline_released"',
  );
  expect(workerLog).not.toContain("deadline_release_timeout");
  expect(
    await db.rpc("settle_ketik_review", {
      p_session: first,
      p_token: old.lease_token,
      p_release: true,
    }),
  ).toMatchObject({ error: null, data: false });
  releaseProvider();
  await expect
    .poll(() => workerLog.includes('"event":"ketik_review_worker.lease_lost"'))
    .toBe(true);
  await expect
    .poll(async () => (await job(first)).status, { timeout: 10_000 })
    .toBe("completed");
  expect((await job(first)).attempt_count).toBe(2);
  if (!embedded()) expect((await guarded(healthUrl())).status).toBe(200);
});

for (const duringDeadlineRelease of [false, true]) {
  test(`shutdown bounds blocked release during ${duringDeadlineRelease ? "deadline release" : "provider processing"}`, async () => {
    const first = await seedSession();
    expect(
      (await request("/review", trainer, { sessionId: first })).status,
    ).toBe(202);
    await startWorker(
      duringDeadlineRelease
        ? {
            KETIK_REVIEW_WORKER_DEADLINE_MS: "1500",
            KETIK_REVIEW_WORKER_SHUTDOWN_MS: "1500",
          }
        : {},
    );
    await expect.poll(() => suite.providerCalls).toBe(1);
    const old = await job(first);
    const child = worker!;
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    let unlock: (() => Promise<void>) | undefined = await lockHistory(first);
    try {
      if (duringDeadlineRelease)
        await expect
          .poll(blockedSettlements, { timeout: 5000, intervals: [50] })
          .toBe(1);
      const began = Date.now();
      child.kill("SIGTERM");
      await expect
        .poll(
          async () => {
            // Shutdown must join a pending deadline release, not issue another RPC.
            expect(blockedSettlements()).toBeLessThanOrEqual(1);
            return child.exitCode;
          },
          { timeout: 5000, intervals: [50] },
        )
        .toBe(1);
      await exited;
      expect(Date.now() - began).toBeLessThan(5000);
      expect(workerLog).toContain(
        "ketik_review_worker.shutdown_recovery_deferred",
      );
      expect(workerLog).not.toContain(
        "ketik_review_worker.shutdown_claim_fenced",
      );
      expect(await job(first)).toMatchObject({
        status: "processing",
        attempt_count: 1,
        lease_token: old.lease_token,
      });
      expect(
        (
          await db
            .from("ketik_review_jobs")
            .update({ lease_expires_at: "2020-01-01T00:00:00Z" })
            .eq("session_id", first)
        ).error,
      ).toBeNull();
      await unlock();
      unlock = undefined;
      suite.providerMode = "success";
      releaseProvider();
      await startWorker();
      await expect
        .poll(async () => (await job(first)).status, { timeout: 10_000 })
        .toBe("completed");
      expect((await job(first)).attempt_count).toBe(2);
    } finally {
      await unlock?.();
      suite.providerMode = "success";
      releaseProvider();
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
      await stopWorker();
    }
  });
}
