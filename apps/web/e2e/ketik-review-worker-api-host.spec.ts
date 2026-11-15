import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runSql } from "./helpers/sidakRealBackend";
import {
  env,
  db,
  trainer,
  identities,
  agent,
  leader,
  admin,
  otherTrainer,
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

test("review authorization follows own account or the trainer assignment; public RPCs remain denied", async () => {
  const own = await seedSession(agent.userId);
  const team = await seedSession(leader.userId);
  const stranger = await seedSession(otherTrainer.userId);
  expect(
    (
      await db.from("ketik_configuration_assignments").insert({
        recipient_id: leader.userId,
        assigned_by: trainer.userId,
        source_configuration: {},
        source_settings_version: "absent",
      })
    ).error,
  ).toBeNull();
  try {
    expect((await request("/review", agent, { sessionId: own })).status).toBe(
      202,
    );
    expect((await request("/review", leader, { sessionId: team })).status).toBe(
      202,
    );
    const ownerClient = createClient(env.apiUrl, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${agent.token}` } },
      auth: { persistSession: false },
    });
    expect(
      (
        await ownerClient
          .from("ketik_review_jobs")
          .select("lease_token")
          .eq("session_id", own)
      ).error,
    ).not.toBeNull();
    const safeJob = await ownerClient
      .from("ketik_review_jobs")
      .select("status")
      .eq("session_id", own)
      .single();
    expect(safeJob.error).toBeNull();
    expect(safeJob.data?.status).toBe("queued");
    expect(
      (await request("/review", trainer, { sessionId: team })).status,
    ).toBe(202);
    expect((await request("/review", agent, { sessionId: team })).status).toBe(
      404,
    );
    expect(
      (await request("/review", otherTrainer, { sessionId: team })).status,
    ).toBe(404);
    expect(
      (await request("/review", trainer, { sessionId: stranger })).status,
    ).toBe(404);
    expect(
      (await request("/review", admin, { sessionId: stranger })).status,
    ).toBe(202);
    expect((await request(`/review/status/${team}`, otherTrainer)).status).toBe(
      404,
    );
    expect((await request(`/history/${team}`, trainer)).status).toBe(200);
    expect((await request(`/history/${team}`, agent)).status).toBe(404);
    expect(
      (
        await request("/review", trainer, {
          sessionId: team,
          workerId: "browser-forgery",
        })
      ).status,
    ).toBe(400);
    expect((await request("/worker", admin)).status).toBe(410);
    for (const identity of [...identities, null]) {
      const client = createClient(env.apiUrl, env.anonKey, {
        global: {
          headers: {
            ...(identity ? { Authorization: `Bearer ${identity.token}` } : {}),
          },
        },
        auth: { persistSession: false },
      });
      for (const [name, args] of [
        [
          "enqueue_ketik_review",
          { p_actor: trainer.userId, p_session: team, p_request: randomUUID() },
        ],
        ["claim_ketik_review", { p_worker: "forged", p_lease_seconds: 600 }],
        ["settle_ketik_review", { p_session: team, p_token: randomUUID() }],
        ["read_ketik_review", { p_actor: trainer.userId, p_session: team }],
        [
          "can_access_ketik_review",
          { p_actor: trainer.userId, p_session: team },
        ],
      ] as const)
        expect((await client.rpc(name, args)).error).not.toBeNull();
    }
    expect(
      (
        await db
          .from("ketik_configuration_assignments")
          .update({ assigned_by: otherTrainer.userId })
          .eq("recipient_id", leader.userId)
      ).error,
    ).toBeNull();
    expect((await request(`/review/status/${team}`, trainer)).status).toBe(404);
  } finally {
    await db
      .from("ketik_configuration_assignments")
      .delete()
      .eq("recipient_id", leader.userId);
  }
});

test("a live worker that loses its lease cannot publish a late successful response", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(1);
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  const claimed = await db.rpc("claim_ketik_review", {
    p_worker: "test-successor",
    p_lease_seconds: 600,
    p_session: id,
  });
  expect(claimed.error).toBeNull();
  expect(claimed.data.attempt).toBe(2);
  releaseProvider();
  suite.providerMode = "success";
  await expect
    .poll(() => workerLog.includes("ketik_review_worker.lease_lost"))
    .toBe(true);
  // Wait for the real old worker to finish its HTTP response and attempt fenced publication.
  await expect
    .poll(
      async () =>
        (
          await db
            .from("ai_usage_logs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", trainer.userId)
        ).count,
    )
    .toBeGreaterThan(0);
  expect(
    (await db.from("ketik_session_reviews").select("id").eq("session_id", id))
      .data,
  ).toEqual([]);
  expect((await job(id)).lease_token).toBe(claimed.data.token);
  await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: claimed.data.token,
    p_release: true,
  });
  await expect
    .poll(async () => (await job(id)).status, { timeout: 10_000 })
    .toBe("completed");
  expect((await job(id)).attempt_count).toBe(3);
});

test("polling is read-only for missing jobs, old queues, expired leases, and missing published results", async () => {
  const id = await seedSession();
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("pending");
  await db
    .from("ketik_history")
    .update({ review_status: "processing" })
    .eq("id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("processing");
  await request("/review", trainer, { sessionId: id });
  await db
    .from("ketik_review_jobs")
    .update({ updated_at: "2020-01-01T00:00:00Z" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("queued");
  const claimed = await db.rpc("claim_ketik_review", {
    p_worker: "null-lease-probe",
    p_lease_seconds: 600,
    p_session: id,
  });
  expect(claimed.error).toBeNull();
  await db
    .from("ketik_review_jobs")
    .update({ lease_expires_at: null })
    .eq("session_id", id);
  const missingExpiry = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: claimed.data.token,
    p_release: true,
  });
  expect(missingExpiry.error).toBeNull();
  expect(missingExpiry.data).toBe(false);
  await db
    .from("ketik_review_jobs")
    .update({ status: "processing", lease_expires_at: "2020-01-01T00:00:00Z" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("processing");
  expect((await job(id)).status).toBe("processing");
  await db
    .from("ketik_history")
    .update({ review_status: "completed", final_score: 80 })
    .eq("id", id);
  await db
    .from("ketik_review_jobs")
    .update({ status: "completed" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data,
  ).toMatchObject({ status: "failed", resultReady: false });
  expect((await job(id)).status).toBe("completed");
  const retry = await request("/review", trainer, {
    sessionId: id,
    requestId: randomUUID(),
  });
  expect(retry.status).toBe(202);
  expect((await job(id)).status).toBe("queued");
});

test("idle claims back off on the real database", async () => {
  const count = () =>
    Number(
      runSql(
        env,
        `SELECT coalesce(sum(calls),0) FROM pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS (%' AND query LIKE '%claim_ketik_review%';`,
      ),
    );
  const before = count();
  await startWorker({ KETIK_REVIEW_WORKER_IDLE_MAX_MS: "2000" });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  await stopWorker();
  const calls = count() - before;
  console.log(`idle claim count: ${calls}`);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(10);
});

test("enqueue wakes the local worker and cross-process enqueue remains bounded", async () => {
  test.setTimeout(40_000);
  suite.providerMode = "success";
  const id = await seedSession();
  const cap = embedded() ? 10_000 : 2_000;
  await startWorker({ KETIK_REVIEW_WORKER_IDLE_MAX_MS: String(cap) });
  await new Promise((resolve) => setTimeout(resolve, embedded() ? 9000 : 2500));
  const startedAt = Date.now();
  if (embedded()) {
    const port = workerLog.match(
      /Server running on http:\/\/localhost:(\d+)/,
    )?.[1];
    expect(port).toBeTruthy();
    const response = await guarded(
      `http://127.0.0.1:${port}/api/v1/ketik/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${trainer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: id }),
      },
    );
    expect(response.status).toBe(202);
  } else {
    expect((await request("/review", trainer, { sessionId: id })).status).toBe(
      202,
    );
  }
  await expect
    .poll(async () => (await job(id))?.status, {
      timeout: embedded() ? 2000 : cap + 3000,
      intervals: [50],
    })
    .toBe("completed");
  console.log(
    `${embedded() ? "local wake" : "cross-process"} latency: ${Date.now() - startedAt} ms`,
  );
  expect(suite.providerCalls).toBe(1);
  expect((await job(id)).attempt_count).toBe(1);
});

test("local enqueue during a cycle runs another cycle without waiting", async () => {
  test.skip(!embedded(), "The worker and enqueue must share the API process");
  test.setTimeout(30_000);
  const first = await seedSession();
  const second = await seedSession();
  expect((await request("/review", trainer, { sessionId: first })).status).toBe(
    202,
  );
  await startWorker({
    KETIK_REVIEW_WORKER_INTERVAL_MS: "5000",
    KETIK_REVIEW_WORKER_IDLE_MAX_MS: "10000",
  });
  await expect.poll(() => suite.providerCalls, { timeout: 10_000 }).toBe(1);
  const port = workerLog.match(
    /Server running on http:\/\/localhost:(\d+)/,
  )?.[1];
  expect(port).toBeTruthy();
  const response = await guarded(
    `http://127.0.0.1:${port}/api/v1/ketik/review`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId: second }),
    },
  );
  expect(response.status).toBe(202);
  suite.providerMode = "success";
  const startedAt = Date.now();
  releaseProvider();
  await expect
    .poll(async () => (await job(second))?.status, {
      timeout: 2000,
      intervals: [50],
    })
    .toBe("completed");
  console.log(`mid-cycle wake latency: ${Date.now() - startedAt} ms`);
  expect(suite.providerCalls).toBe(2);
  expect((await job(second)).attempt_count).toBe(1);
});

test("worker host refuses invalid activation and stays idle when disabled", async () => {
  // Disabled: the standalone entrypoint exits 1; the API keeps serving and claims nothing.
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  const cases: Record<string, string>[] = [
    { KETIK_REVIEW_WORKER_ENABLED: "false" },
    {
      KETIK_REVIEW_WORKER_ENABLED: "true",
      KETIK_REVIEW_WORKER_INTERVAL_MS: "-1",
    },
    {
      KETIK_REVIEW_WORKER_ENABLED: "true",
      KETIK_REVIEW_WORKER_INTERVAL_MS: "1000",
      KETIK_REVIEW_WORKER_IDLE_MAX_MS: "500",
    },
    {
      KETIK_REVIEW_WORKER_ENABLED: "true",
      KETIK_REVIEW_WORKER_IDLE_MAX_MS: "3000.5",
    },
  ];
  for (const overrides of cases) {
    const child = spawnWorkerHost(overrides);
    let log = "";
    child.stdout.on("data", (data) => {
      log += String(data);
    });
    child.stderr.on("data", (data) => {
      log += String(data);
    });
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", resolve),
    );
    try {
      if (embedded() && overrides.KETIK_REVIEW_WORKER_ENABLED === "false") {
        await expect
          .poll(() => log, { timeout: 15_000 })
          .toContain("[API] Server running");
        expect(log).toContain('"event":"ketik_review_worker.disabled"');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        expect((await job(id)).status).toBe("queued");
        expect((await job(id)).attempt_count).toBe(0);
        child.kill("SIGTERM");
        expect(await exit).toBe(0);
      } else {
        const code = await Promise.race([
          exit,
          new Promise<never>((_, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Worker host failed to stop")),
              15_000,
            );
            timer.unref();
          }),
        ]);
        expect(code).toBe(1);
        expect(log).toContain("ketik_review_worker.config_rejected");
        // Invalid config never reaches traffic in the API host.
        expect(log).not.toContain("[API] Server running");
      }
      expect(suite.providerCalls).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
  }
});

test("competing real database claims admit only one worker and release invalidates its token", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  expect(
    (
      await db.rpc("claim_ketik_review", {
        p_worker: "invalid-lease",
        p_lease_seconds: null,
        p_session: id,
      })
    ).error,
  ).not.toBeNull();
  const claims = await Promise.all(
    ["worker-a", "worker-b"].map((p_worker) =>
      db.rpc("claim_ketik_review", {
        p_worker,
        p_lease_seconds: 600,
        p_session: id,
      }),
    ),
  );
  expect(claims.every((claim) => claim.error === null)).toBe(true);
  const admitted = claims.map((claim) => claim.data).filter(Boolean);
  expect(admitted).toHaveLength(1);
  expect(admitted[0].status).toBe("processing");
  expect((await job(id)).attempt_count).toBe(1);
  expect(suite.providerCalls).toBe(0);
  expect(
    (
      await db.rpc("settle_ketik_review", {
        p_session: id,
        p_token: admitted[0].token,
        p_release: null,
      })
    ).error,
  ).not.toBeNull();
  const release = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: admitted[0].token,
    p_release: true,
  });
  expect(release.error).toBeNull();
  expect(release.data).toBe(true);
  expect(
    (
      await db.rpc("settle_ketik_review", {
        p_session: id,
        p_token: admitted[0].token,
        p_release: true,
      })
    ).data,
  ).toBe(false);
});

test("health becomes degraded when active work exceeds its lease-age bound", async () => {
  test.skip(
    embedded(),
    "The embedded worker has no loopback health server; the API's /health covers the process.",
  );
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => suite.providerCalls).toBe(1);
  const port = Number(workerLog.match(/"healthPort":(\d+)/)?.[1]);
  expect((await guarded(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  worker?.kill("SIGUSR2");
  await expect
    .poll(async () => (await guarded(`http://127.0.0.1:${port}/health`)).status)
    .toBe(503);
});

test("migration rollback refuses live jobs, preserves published data, and reapply restores protected RPCs", async () => {
  const id = await seedSession(trainer.userId, true);
  await request("/review", trainer, { sessionId: id, rerun: true });
  const rollback = readFileSync(
    fileURLToPath(
      new URL(
        "../../../supabase/rollbacks/rollback_20261016000935_ketik_durable_review_worker.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  let refused = false;
  try {
    runSql(env, rollback);
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ status: "failed" })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  runSql(env, rollback);
  expect(
    (await db.from("ketik_history").select("final_score").eq("id", id).single())
      .data?.final_score,
  ).toBe(60);
  expect(
    (
      await db.rpc("enqueue_ketik_review", {
        p_actor: trainer.userId,
        p_session: id,
        p_request: randomUUID(),
      })
    ).error,
  ).not.toBeNull();
  // Reapply the worker migration and every later one that redefines its RPCs,
  // so the database ends at HEAD and a rerun of this spec stays meaningful.
  for (const migration of [
    "20261016000935_ketik_durable_review_worker.sql",
    "20261017150000_ketik_settle_review_drop_legacy_results.sql",
    "20261018200000_user_controls.sql",
  ])
    runSql(
      env,
      readFileSync(
        fileURLToPath(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
        ),
        "utf8",
      ),
    );
  // DDL notifications are asynchronous/coalesced. Require stable API readiness after both commits.
  let ready = 0;
  await expect
    .poll(
      async () => {
        const response = await request(`/review/status/${id}`);
        const body = await response.json();
        ready =
          response.status === 200 && body.data?.resultReady === true
            ? ready + 1
            : 0;
        return ready;
      },
      { timeout: 5000, intervals: [100, 250, 500] },
    )
    .toBeGreaterThanOrEqual(3);
});
