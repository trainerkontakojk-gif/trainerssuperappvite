import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS } from "@trainers/types";
import { createAdmin } from "./helpers/sidakRealBackend";
import { telefunQueueAssessment as assessment } from "./helpers/telefunScoringQueueFixtures";
import { fetchOwnedTelefunQueueJobs } from "./helpers/telefunScoringQueueHarness";
import {
  env,
  trainer,
  suite,
  storageFixtureRequests,
  api,
  createSession,
  fullPath,
  agentPath,
  registerStoredRecording,
  finalizeCapture,
  readSession,
  runOwnedQueueBatch,
  setupTelefunScoringQueueSuite,
  resetTelefunScoringQueueTest,
  settleTelefunScoringQueueTest,
  teardownTelefunScoringQueueSuite,
} from "./helpers/telefunScoringQueueApiHarness";

/**
 * Telefun capture policy — real Hono, JWT, PostgREST/RPC and scoring worker on
 * disposable loopback Supabase. Storage is synthetic except for the explicitly
 * labelled byte-preservation case. Gemini uses a fail-closed HTTP fixture.
 */

test.describe.configure({ mode: "serial" });

test.beforeAll(setupTelefunScoringQueueSuite);

test.beforeEach(resetTelefunScoringQueueTest);

test.afterEach(settleTelefunScoringQueueTest);

test.afterAll(teardownTelefunScoringQueueSuite);

test("a failed required track cannot enter direct scoring or the durable queue", async () => {
  test.setTimeout(60_000);
  const cases = [
    { label: "full-call failed, agent preserved", full: false, agent: true },
    { label: "agent failed, full-call preserved", full: true, agent: false },
    { label: "both tracks failed", full: false, agent: false },
  ];
  const failedIds: string[] = [];

  for (const capture of cases) {
    const id = await createSession(capture.label);
    failedIds.push(id);
    if (capture.full) registerStoredRecording(fullPath(id));
    if (capture.agent) registerStoredRecording(agentPath(id));

    const finalized = await finalizeCapture(id, {
      captureStatus: "failed",
      full: capture.full,
      agent: capture.agent,
    });
    expect(finalized.status, capture.label).toBe(200);

    const state = await readSession(id);
    expect(state.recording_status).toBe("failed");
    expect(state.recording_error).toBe("Recording capture failed");
    expect(state.scoring_status).toBe("failed");
    expect(state.scoring_ready_at).toBeNull();
    expect(state.scoring_next_attempt_at).toBeNull();
    expect(state.recording_path).toBe(capture.full ? fullPath(id) : null);
    expect(state.agent_recording_path).toBe(
      capture.agent ? agentPath(id) : null,
    );

    const queued = await createAdmin(env).rpc("enqueue_telefun_scoring", {
      p_session_id: id,
    });
    expect(queued.error).toBeNull();
    expect(queued.data).toBe(false);
    const claimed = await createAdmin(env).rpc("claim_telefun_scoring", {
      p_session_id: id,
      p_claim_timeout_seconds: 300,
      p_claim_token_hash: randomUUID().replaceAll("-", ""),
      p_claim_owner: "telefun-capture-policy-e2e",
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toBe(false);
    const legacyClaimed = await createAdmin(env).rpc("claim_telefun_scoring", {
      p_session_id: id,
      p_claim_timeout_seconds: 300,
    });
    expect(legacyClaimed.error).toBeNull();
    expect(legacyClaimed.data).toBe(false);

    const direct = await api(`/score/${id}`, "POST", {});
    expect(direct.status, capture.label).toBe(409);
    expect((await direct.json()).error.code).toBe("SCORING_NOT_READY");
    const rerun = await api(`/score/${id}/rerun`, "POST", {});
    expect(rerun.status, `${capture.label}: rerun`).toBe(409);

    const forgedScore = await api(`/sessions/${id}`, "PATCH", {
      score: 9.9,
      feedback: "nilai buatan",
    });
    expect(forgedScore.status).toBe(409);
    expect((await readSession(id)).score).toBeNull();
  }

  const worker = await runOwnedQueueBatch(failedIds, []);
  expect(worker.processed).toBe(0);
  expect(suite.providerCalls).toBe(0);

  // Late upload/readiness callbacks cannot clear the durable failed-capture latch.
  const id = failedIds[0]!;
  const lateUpload = await createAdmin(env).rpc(
    "mark_telefun_recording_uploaded",
    {
      p_session_id: id,
      p_user_id: trainer.userId,
      p_recording_path: fullPath(id),
      p_agent_recording_path: agentPath(id),
      p_capture_status: "ready",
    },
  );
  expect(lateUpload.error).toBeNull();
  expect(
    Array.isArray(lateUpload.data)
      ? lateUpload.data[0]?.applied
      : lateUpload.data?.applied,
  ).toBe(false);
  const lateReady = await createAdmin(env).rpc("mark_telefun_recording_ready", {
    p_session_id: id,
    p_user_id: trainer.userId,
    p_recording_path: `${trainer.userId}/${id}/full_call.seekable.webm`,
    p_agent_recording_path: `${trainer.userId}/${id}/agent_only.seekable.webm`,
  });
  expect(lateReady.error).toBeNull();
  expect(
    Array.isArray(lateReady.data)
      ? lateReady.data[0]?.applied
      : lateReady.data?.applied,
  ).toBe(false);
  expect((await readSession(id)).recording_status).toBe("failed");
  expect(suite.providerCalls).toBe(0);
});

test("failed captures deny stale reclaim, both completion overloads, and direct service processing", async () => {
  const service =
    await import("../../api/src/services/telefun-scoring-service");
  const admin = createAdmin(env);
  for (const tokenized of [true, false]) {
    const oldHash = tokenized ? randomUUID().replaceAll("-", "") : null;
    const id = await createSession(
      `stale failed ${tokenized ? "tokenized" : "legacy"}`,
      {
        recording_status: "failed",
        recording_error: "Recording capture failed",
        scoring_status: "processing",
        scoring_claimed_at: new Date(Date.now() - 600_000).toISOString(),
        scoring_claim_token_hash: oldHash,
        scoring_claim_owner: tokenized ? "stale-e2e" : "legacy-scoring-worker",
      },
    );
    // Both owned paths exist: the failure latch, not missing audio, must deny work.
    const bound = await admin
      .from("telefun_history")
      .update({
        recording_path: fullPath(id),
        agent_recording_path: agentPath(id),
      })
      .eq("id", id);
    expect(bound.error).toBeNull();
    registerStoredRecording(fullPath(id));
    registerStoredRecording(agentPath(id));
    const before = await readSession(id);

    for (const claimArgs of [
      { p_session_id: id, p_claim_timeout_seconds: 300 },
      {
        p_session_id: id,
        p_claim_timeout_seconds: 300,
        p_claim_token_hash: randomUUID().replaceAll("-", ""),
        p_claim_owner: "new-e2e",
      },
    ]) {
      const result = await admin.rpc("claim_telefun_scoring", claimArgs);
      expect(result.error).toBeNull();
      expect(
        result.data,
        "stale processing must not bypass failed capture",
      ).toBe(false);
    }
    for (const completionArgs of [
      { p_session_id: id, p_score: 9.9, p_voice_assessment: assessment },
      {
        p_session_id: id,
        p_score: 9.9,
        p_voice_assessment: assessment,
        p_claim_token_hash: oldHash ?? "not-the-legacy-claim",
      },
    ]) {
      const result = await admin.rpc(
        "complete_telefun_scoring",
        completionArgs,
      );
      expect(result.error).toBeNull();
      expect(
        result.data,
        "even a matching stale claim cannot complete failed capture",
      ).toBe(false);
    }
    const direct = await service.processScoringJob({
      sessionId: id,
      userId: trainer.userId,
      claimTokenHash: oldHash,
    });
    expect(direct).toMatchObject({
      success: false,
      status: "failed",
      error: "SCORING_NOT_READY",
    });
    expect(
      await readSession(id),
      "denied calls must not mutate the failed row",
    ).toEqual(before);
  }
  expect(storageFixtureRequests).toEqual([]);
  expect(suite.providerCalls).toBe(0);
});

test("a valid two-track capture is claimed and completed by the real worker", async () => {
  test.setTimeout(60_000);
  const id = await createSession("positive two-track control", {
    scoring_status: "failed",
  });
  registerStoredRecording(fullPath(id));
  registerStoredRecording(agentPath(id));

  const finalized = await finalizeCapture(id, {
    captureStatus: "ready",
    full: true,
    agent: true,
  });
  expect(finalized.status).toBe(200);

  const result = await runOwnedQueueBatch([id]);
  expect(
    result,
    JSON.stringify({
      result,
      providerCalls: suite.providerCalls,
      storageFixtureRequests,
    }),
  ).toMatchObject({
    processed: 1,
    completed: 1,
    failed: 0,
  });
  expect(suite.providerCalls).toBe(2);
  const scored = await readSession(id);
  expect(scored.recording_status).toBe("uploaded");
  expect(scored.recording_path).toBe(fullPath(id));
  expect(scored.agent_recording_path).toBe(agentPath(id));
  expect(scored.scoring_status).toBe("completed");
  expect(scored.score).toBe(8.4);
  expect(scored.voice_assessment).toMatchObject({ overallScore: 8.4 });
});

test("failed captures ahead of a due job cannot starve the unscoped production queue", async () => {
  test.setTimeout(60_000);
  const batchSize = 2;
  const blockedIds: string[] = [];
  for (let i = 0; i <= batchSize; i += 1) {
    for (const state of [
      { recording_status: "failed", recording_error: null },
      { recording_status: "uploaded", recording_error: "capture failed" },
      {
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
        recording_status: "failed",
      },
    ]) {
      blockedIds.push(
        await createSession(`starvation blocker ${i}`, {
          ...state,
          scoring_status: "failed",
          scoring_next_attempt_at: null,
        }),
      );
    }
  }
  const id = await createSession("starvation valid due control");
  registerStoredRecording(fullPath(id));
  registerStoredRecording(agentPath(id));
  expect(
    (
      await finalizeCapture(id, {
        captureStatus: "ready",
        full: true,
        agent: true,
      })
    ).status,
  ).toBe(200);
  const scheduled = await createAdmin(env)
    .from("telefun_history")
    .update({ scoring_next_attempt_at: "0001-01-01T00:00:00.000Z" })
    .eq("id", id)
    .eq("user_id", trainer.userId)
    .select("id");
  expect(scheduled.error).toBeNull();
  expect(scheduled.data).toEqual([{ id }]);
  const before = await Promise.all(blockedIds.map(readSession));
  const service =
    await import("../../api/src/services/telefun-scoring-service");
  const worker = await import("../../api/src/workers/telefun-scoring-worker");
  const result = await worker.processNextBatch(
    {
      ...service,
      fetchPendingJobs: async (limit) => {
        // Unmodified production SQL, without ID/owner scope or larger LIMIT.
        const jobs = await service.fetchPendingJobs(limit);
        const returnedIds = jobs.map((job) => job.sessionId);
        expect(
          returnedIds,
          "global queue must return the due control",
        ).toContain(id);
        expect(
          returnedIds.filter((value) => blockedIds.includes(value)),
        ).toEqual([]);
        return jobs;
      },
      // Observe the global query without claiming/modifying other users' work.
      claimJob: (sessionId, timeout) =>
        sessionId === id
          ? service.claimJob(sessionId, timeout)
          : Promise.resolve({ claimed: false }),
      checkCachedAssessment: (sessionId) =>
        sessionId === id
          ? service.checkCachedAssessment(sessionId)
          : Promise.resolve(null),
      processScoringJob: (job, signal) => {
        expect(job.sessionId, "only the run-owned control may be scored").toBe(
          id,
        );
        return service.processScoringJob(job, signal);
      },
    },
    { batchSize },
  );
  expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0 });
  expect(suite.providerCalls).toBe(2);
  expect((await readSession(id)).scoring_status).toBe("completed");
  expect(await Promise.all(blockedIds.map(readSession))).toEqual(before);
  // afterAll deletes only sessionIds/user/Storage created by this run and
  // requires zero-row readback; no old queue row is deleted or changed.
});

test("pre-limit retirement filters preserve historical terminal capture bypass", async () => {
  const ids: string[] = [];
  const expected: string[] = [];
  const historicalModelIds = TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS.map(
    (model) => model.id,
  );
  expect(
    historicalModelIds.some((id) => id.includes(".")),
    "catalog must exercise a dotted ID through nested PostgREST filters",
  ).toBe(true);
  for (const modelId of [
    ...historicalModelIds,
    "gpt-realtime-unknown-historical",
  ]) {
    for (const [label, state, eligible] of [
      [
        "terminal pending",
        { status: "completed", scoring_status: "pending" },
        true,
      ],
      [
        "scheduled failure",
        {
          status: "failed",
          scoring_status: "failed",
          scoring_next_attempt_at: "2000-01-01T00:00:00Z",
        },
        true,
      ],
      [
        "permanent failure",
        { status: "failed", scoring_status: "failed" },
        false,
      ],
      ["nonterminal", { status: "active", scoring_status: "pending" }, false],
    ] as const) {
      const id = await createSession(`historical queue ${modelId} ${label}`, {
        telefun_model_id: modelId,
        telefun_transport: null,
        recording_status: "failed",
        recording_error: "historical recording unavailable",
        scoring_next_attempt_at: null,
        ...state,
      });
      ids.push(id);
      if (eligible) expected.push(id);
    }
  }
  const service =
    await import("../../api/src/services/telefun-scoring-service");
  await fetchOwnedTelefunQueueJobs(
    env,
    trainer.userId,
    ids,
    expected,
    service.fetchPendingJobs,
  );
  expect(suite.providerCalls).toBe(0);
});
