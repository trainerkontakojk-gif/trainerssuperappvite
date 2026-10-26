import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS } from "@trainers/types";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import {
  telefunQueueAssessment as assessment,
  telefunQueueProviderResponse as providerResponse,
  cleanupTelefunQueueFixtures,
} from "./helpers/telefunScoringQueueFixtures";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  fetchOwnedTelefunQueueJobs,
  waitForGate,
  waitForTelefunQueueEnqueue,
} from "./helpers/telefunScoringQueueHarness";

/**
 * Telefun capture policy — real Hono, JWT, PostgREST/RPC and scoring worker on
 * disposable loopback Supabase. Storage is synthetic except for the explicitly
 * labelled byte-preservation case. Gemini uses a fail-closed HTTP fixture.
 */

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `telefun-capture-policy-${randomUUID().slice(0, 8)}`;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
let providerCalls = 0;
const storageFixtureRequests: string[] = [];
let providerGate: {
  entered: Promise<void>;
  signalEntered: () => void;
  response: Promise<void>;
  release: () => void;
} | null = null;
let storageGate: {
  path: string;
  entered: Promise<void>;
  signalEntered: () => void;
  response: Promise<void>;
  release: () => void;
} | null = null;
const sessionIds: string[] = [];
const storagePaths = new Set<string>();
const realStoragePaths = new Set<string>();
const createdStoragePaths: string[] = [];
const pendingWork = new Set<Promise<unknown>>();
let failedAdmissionRead: string | null = null;

function createProviderGate() {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  providerGate = { entered, signalEntered, response, release };
  return providerGate;
}

function createStorageDownloadGate(path: string) {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  storageGate = { path, entered, signalEntered, response, release };
  return storageGate;
}

function trackWork<T>(work: Promise<T>): Promise<T> {
  pendingWork.add(work);
  void work.then(
    () => pendingWork.delete(work),
    () => pendingWork.delete(work),
  );
  return work;
}

async function api(path: string, method = "GET", body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1/telefun${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createSession(
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  const { error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      id,
      user_id: trainer.userId,
      scenario_title: `${ns} ${label}`,
      consumer_name: "Konsumen Uji",
      status: "completed",
      telefun_model_id: "gemini-3.8-live",
      telefun_transport: "gemini-live",
      scoring_status: "pending",
      recording_status: "pending",
      messages: [],
      ...overrides,
    });
  expect(error, `insert ${label}`).toBeNull();
  sessionIds.push(id);
  return id;
}

function fullPath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/full_call.webm`;
}

function agentPath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/agent_only.webm`;
}

function fullSeekablePath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/full_call.seekable.webm`;
}

function agentSeekablePath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/agent_only.seekable.webm`;
}

function registerStoredRecording(path: string) {
  storagePaths.add(path);
}

async function finalizeCapture(
  sessionId: string,
  options: {
    captureStatus: "ready" | "failed";
    full?: boolean;
    agent?: boolean;
  },
) {
  const response = await api("/finalize-recording", "POST", {
    sessionId,
    captureStatus: options.captureStatus,
    ...(options.full ? { recordingPath: fullPath(sessionId) } : {}),
    ...(options.agent ? { agentRecordingPath: agentPath(sessionId) } : {}),
  });
  if (response.status === 200 && options.captureStatus === "ready") {
    await waitForTelefunQueueEnqueue(env, trainer.userId, sessionId);
  }
  return response;
}

async function readSession(sessionId: string) {
  const { data, error } = await createAdmin(env)
    .from("telefun_history")
    .select(
      "id, user_id, status, recording_status, recording_error, recording_path, agent_recording_path, recording_ready_at, scoring_status, scoring_ready_at, scoring_next_attempt_at, scoring_claim_token_hash, scoring_claim_owner, scoring_claimed_at, scoring_attempt_count, scoring_last_error, score, feedback, voice_assessment",
    )
    .eq("id", sessionId)
    .single();
  expect(error, `read ${sessionId}`).toBeNull();
  return data!;
}

async function runOwnedQueueBatch(ids: string[], expectedIds = ids) {
  const service =
    await import("../../api/src/services/telefun-scoring-service");
  const worker = await import("../../api/src/workers/telefun-scoring-worker");
  return worker.processNextBatch(
    {
      // Scope the real queue SELECT before LIMIT, never its returned rows.
      // Claim, analysis and completion still use the real DB/service.
      fetchPendingJobs: () =>
        fetchOwnedTelefunQueueJobs(
          env,
          trainer.userId,
          ids,
          expectedIds,
          service.fetchPendingJobs,
        ),
      claimJob: service.claimJob,
      checkCachedAssessment: service.checkCachedAssessment,
      processScoringJob: service.processScoringJob,
    },
    { batchSize: ids.length },
  );
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    GEMINI_PROXY_URL: "",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input);
    const url = new URL(raw);
    if (url.hostname === "generativelanguage.googleapis.com") {
      providerCalls += 1;
      if (providerGate) {
        providerGate.signalEntered();
        await providerGate.response;
      }
      return providerResponse();
    }
    if (
      failedAdmissionRead &&
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/telefun_history" &&
      url.searchParams.get("id") === `eq.${failedAdmissionRead}` &&
      url.searchParams.get("select")?.includes("scoring_claim_token_hash")
    ) {
      // Only the final admission read is unavailable, after audio preparation.
      return Response.json(
        { message: "Synthetic admission read unavailable" },
        {
          status: 503,
        },
      );
    }
    if (
      url.hostname === new URL(env.apiUrl).hostname &&
      url.pathname.startsWith("/storage/v1/object")
    ) {
      const requestMethod =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      storageFixtureRequests.push(`${requestMethod} ${url.pathname}`);
      const objectPrefix = [
        "/storage/v1/object/telefun-recordings/",
        "/storage/v1/object/authenticated/telefun-recordings/",
        "/storage/v1/object/public/telefun-recordings/",
      ].find((prefix) => url.pathname.startsWith(prefix));
      const objectPath = objectPrefix
        ? decodeURIComponent(url.pathname.slice(objectPrefix.length))
        : "";
      if (objectPath && realStoragePaths.has(objectPath)) {
        return guardedFetch(input, init);
      }
      if (
        requestMethod === "GET" &&
        objectPath &&
        storageGate?.path === objectPath
      ) {
        storageGate.signalEntered();
        await storageGate.response;
      }
      if (
        requestMethod === "GET" &&
        objectPath &&
        storagePaths.has(objectPath)
      ) {
        return new Response(Buffer.from(`local synthetic ${objectPath}`), {
          status: 200,
          headers: { "Content-Type": "audio/webm" },
        });
      }
      return new Response(null, { status: 404 });
    }
    return guardedFetch(input, init);
  };

  trainer = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.beforeEach(() => {
  providerCalls = 0;
  storageFixtureRequests.length = 0;
  providerGate = null;
  storageGate = null;
  failedAdmissionRead = null;
});

test.afterEach(async () => {
  providerGate?.release();
  storageGate?.release();
  failedAdmissionRead = null;
  await waitForGate(
    Promise.allSettled([...pendingWork]).then(() => {}),
    "settling fixture-owned in-flight requests",
  );
  expect(pendingWork.size, "no request may outlive this test").toBe(0);
  providerGate = null;
  storageGate = null;
});

test.afterAll(async () => {
  providerGate?.release();
  storageGate?.release();
  if (guardedFetch) globalThis.fetch = guardedFetch;
  if (!trainer) return;
  await cleanupTelefunQueueFixtures(
    env,
    trainer.userId,
    sessionIds,
    createdStoragePaths,
  );
});

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
  expect(providerCalls).toBe(0);

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
  expect(providerCalls).toBe(0);
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
  expect(providerCalls).toBe(0);
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
    JSON.stringify({ result, providerCalls, storageFixtureRequests }),
  ).toMatchObject({
    processed: 1,
    completed: 1,
    failed: 0,
  });
  expect(providerCalls).toBe(1);
  const scored = await readSession(id);
  expect(scored.recording_status).toBe("uploaded");
  expect(scored.recording_path).toBe(fullPath(id));
  expect(scored.agent_recording_path).toBe(agentPath(id));
  expect(scored.scoring_status).toBe("completed");
  expect(scored.score).toBe(8.3);
  expect(scored.voice_assessment).toMatchObject({ overallScore: 8.3 });
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
  expect(providerCalls).toBe(1);
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
  expect(providerCalls).toBe(0);
});

test("capture failure fences an in-flight provider result without erasing existing recordings", async () => {
  test.setTimeout(60_000);
  const id = await createSession("failure races a claimed job");
  registerStoredRecording(fullPath(id));
  registerStoredRecording(agentPath(id));
  const finalized = await finalizeCapture(id, {
    captureStatus: "ready",
    full: true,
    agent: true,
  });
  expect(finalized.status).toBe(200);

  const gate = createProviderGate();
  const workerPromise = trackWork(runOwnedQueueBatch([id]));
  await waitForGate(gate.entered, "in-flight worker provider", workerPromise);
  expect(providerCalls).toBe(1);
  const claimed = await readSession(id);
  expect(claimed.scoring_status).toBe("processing");
  expect(claimed.scoring_claim_token_hash).toBeTruthy();

  const failed = await finalizeCapture(id, {
    captureStatus: "failed",
    full: true,
    agent: false,
  });
  expect(failed.status).toBe(200);
  const failedState = await readSession(id);
  expect(failedState.recording_status).toBe("failed");
  expect(failedState.scoring_status).toBe("failed");
  expect(failedState.scoring_claim_token_hash).toBeNull();
  expect(failedState.recording_path).toBe(fullPath(id));
  expect(failedState.agent_recording_path).toBe(agentPath(id));

  gate.release();
  providerGate = null;
  const result = await workerPromise;
  expect(result).toMatchObject({ processed: 1, completed: 0, failed: 1 });
  const finalState = await readSession(id);
  expect(finalState.scoring_status).toBe("failed");
  expect(finalState.score).toBeNull();
  expect(finalState.voice_assessment).toBeNull();
  expect(finalState.scoring_next_attempt_at).toBeNull();
  expect(providerCalls).toBe(1);
});

test("capture failure during Storage preparation blocks provider admission on worker, manual score, and rerun", async () => {
  test.setTimeout(90_000);
  const entries = ["worker", "manual", "rerun"] as const;

  for (const entry of entries) {
    const id = await createSession(`${entry} preparation race`);
    if (entry === "rerun") {
      const { error } = await createAdmin(env)
        .from("telefun_history")
        .update({
          scoring_status: "completed",
          recording_status: "ready",
          recording_path: fullPath(id),
          agent_recording_path: agentPath(id),
          recording_ready_at: new Date().toISOString(),
          scoring_ready_at: new Date().toISOString(),
          score: assessment.overallScore,
          voice_assessment: assessment,
        })
        .eq("id", id);
      expect(error, `prepare rerun session ${id}`).toBeNull();
    } else {
      const ready = await finalizeCapture(id, {
        captureStatus: "ready",
        full: true,
        agent: true,
      });
      expect(ready.status, `prepare ${entry} session`).toBe(200);
    }
    registerStoredRecording(fullPath(id));
    registerStoredRecording(agentPath(id));

    const gate = createStorageDownloadGate(agentPath(id));
    const admitted = trackWork<unknown>(
      entry === "worker"
        ? runOwnedQueueBatch([id])
        : api(
            entry === "manual" ? `/score/${id}` : `/score/${id}/rerun`,
            "POST",
            {},
          ),
    );
    await waitForGate(gate.entered, `${entry} Storage download`, admitted);
    expect(providerCalls, `${entry} before failed-capture transition`).toBe(0);

    const failed = await finalizeCapture(id, {
      captureStatus: "failed",
      full: true,
      agent: false,
    });
    expect(failed.status, `latch failure for ${entry}`).toBe(200);
    gate.release();
    storageGate = null;
    await admitted;

    const finalState = await readSession(id);
    expect(finalState.recording_status, entry).toBe("failed");
    expect(finalState.scoring_claim_token_hash, entry).toBeNull();
    expect(providerCalls, `${entry} provider calls`).toBe(0);
  }
});

test("provider admission fails closed when its claim changes or its final read fails during Storage preparation", async () => {
  test.setTimeout(60_000);
  for (const fault of ["claim-changed", "read-unavailable"] as const) {
    const id = await createSession(fault);
    expect(
      (
        await finalizeCapture(id, {
          captureStatus: "ready",
          full: true,
          agent: true,
        })
      ).status,
    ).toBe(200);
    registerStoredRecording(agentPath(id));
    const gate = createStorageDownloadGate(agentPath(id));
    const work = trackWork(runOwnedQueueBatch([id]));
    await waitForGate(gate.entered, fault, work);
    const active = await readSession(id);
    expect(active.scoring_status).toBe("processing");
    expect(active.scoring_claim_token_hash).toBeTruthy();
    if (fault === "claim-changed") {
      const replaced = await createAdmin(env)
        .from("telefun_history")
        .update({
          scoring_claim_token_hash: randomUUID().replaceAll("-", ""),
        })
        .eq("id", id);
      expect(replaced.error).toBeNull();
    } else {
      failedAdmissionRead = id;
    }
    gate.release();
    await work;
    failedAdmissionRead = null;
    storageGate = null;
    expect(providerCalls, fault).toBe(0);
    const state = await readSession(id);
    expect(state.score, fault).toBeNull();
    expect(state.voice_assessment, fault).toBeNull();
    expect(state.scoring_status, fault).not.toBe("completed");
  }
});

test("capture failure fences provider results already in flight on manual score and rerun", async () => {
  test.setTimeout(60_000);
  const historicalAssessment = { ...assessment, overallScore: 4.1 };
  for (const entry of ["manual", "rerun"] as const) {
    const id = await createSession(`${entry} provider race`);
    const prepared = await createAdmin(env)
      .from("telefun_history")
      .update({
        recording_status: "ready",
        recording_path: fullPath(id),
        agent_recording_path: agentPath(id),
        recording_ready_at: new Date().toISOString(),
        scoring_ready_at: new Date().toISOString(),
        ...(entry === "rerun"
          ? {
              scoring_status: "completed",
              score: historicalAssessment.overallScore,
              voice_assessment: historicalAssessment,
            }
          : {}),
      })
      .eq("id", id);
    expect(prepared.error).toBeNull();
    registerStoredRecording(agentPath(id));
    const before = await readSession(id);
    const callsBefore = providerCalls;
    const gate = createProviderGate();
    const request = trackWork(
      api(
        entry === "manual" ? `/score/${id}` : `/score/${id}/rerun`,
        "POST",
        {},
      ),
    );
    await waitForGate(gate.entered, `${entry} in-flight provider`, request);
    const active = await readSession(id);
    expect(active.scoring_status).toBe("processing");
    expect(active.scoring_claim_token_hash).toBeTruthy();
    expect(
      (
        await finalizeCapture(id, {
          captureStatus: "failed",
          full: true,
          agent: false,
        })
      ).status,
    ).toBe(200);
    const latched = await readSession(id);
    expect(latched.recording_status).toBe("failed");
    expect(latched.scoring_claim_token_hash).toBeNull();
    gate.release();
    const response = await request;
    providerGate = null;
    expect(response.status, entry).toBe(entry === "manual" ? 409 : 502);
    const after = await readSession(id);
    expect(after.recording_status).toBe("failed");
    expect(after.scoring_claim_token_hash).toBeNull();
    expect(after.score, "late result must not replace the prior value").toBe(
      before.score,
    );
    expect(after.voice_assessment).toEqual(before.voice_assessment);
    expect(after.scoring_status).toBe(
      entry === "manual" ? "failed" : "completed",
    );
    expect(
      providerCalls,
      "no coaching or extra scoring after rejected completion",
    ).toBe(callsBefore + 1);
  }
});

test("failure after remux accepts only the raw sibling, preserves seekable Storage bytes, and fences the old claim", async () => {
  test.setTimeout(45_000);
  const id = await createSession("remuxed failure sibling");
  const admin = createAdmin(env);
  const paths = [fullSeekablePath(id), agentSeekablePath(id)];
  const bytes = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x54, 0x45, 0x4c, 0x45,
  ]);

  for (const path of paths) {
    realStoragePaths.add(path);
    createdStoragePaths.push(path);
    const uploaded = await admin.storage
      .from("telefun-recordings")
      .upload(path, bytes, { contentType: "audio/webm", upsert: false });
    expect(uploaded.error, `upload local Storage fixture ${path}`).toBeNull();
    const downloaded = await admin.storage
      .from("telefun-recordings")
      .download(path);
    expect(
      downloaded.error,
      `download local Storage fixture ${path}`,
    ).toBeNull();
    expect(
      Array.from(new Uint8Array(await downloaded.data!.arrayBuffer())),
      `byte-preserving Storage round trip ${path}`,
    ).toEqual(Array.from(bytes));
  }

  const uploaded = await admin.rpc("mark_telefun_recording_uploaded", {
    p_session_id: id,
    p_user_id: trainer.userId,
    p_recording_path: fullPath(id),
    p_agent_recording_path: agentPath(id),
    p_capture_status: "ready",
  });
  expect(uploaded.error).toBeNull();
  expect(
    (Array.isArray(uploaded.data) ? uploaded.data[0] : uploaded.data)?.applied,
  ).toBe(true);
  const readied = await admin.rpc("mark_telefun_recording_ready", {
    p_session_id: id,
    p_user_id: trainer.userId,
    p_recording_path: fullSeekablePath(id),
    p_agent_recording_path: agentSeekablePath(id),
  });
  expect(readied.error).toBeNull();
  expect(
    (Array.isArray(readied.data) ? readied.data[0] : readied.data)?.applied,
  ).toBe(true);
  const claimTokenHash = randomUUID().replaceAll("-", "");
  const claimed = await admin.rpc("claim_telefun_scoring", {
    p_session_id: id,
    p_claim_timeout_seconds: 300,
    p_claim_token_hash: claimTokenHash,
    p_claim_owner: "telefun-remux-failure-e2e",
  });
  expect(claimed.error).toBeNull();
  expect(claimed.data).toBe(true);

  const beforeFailure = await readSession(id);
  // Do not relax the namespace, track identity or successful-upload path policy
  // merely to accept a delayed failure for the same raw/seekable track.
  for (const invalid of [
    { args: { p_user_id: randomUUID() }, reason: "not_owner" },
    {
      args: { p_recording_path: `${randomUUID()}/${id}/full_call.webm` },
      reason: "invalid_recording_path",
    },
    {
      args: { p_recording_path: agentPath(id) },
      reason: "invalid_recording_path",
    },
    {
      args: { p_agent_recording_path: fullPath(id) },
      reason: "invalid_recording_path",
    },
    {
      args: { p_recording_path: `${trainer.userId}/${id}/full_call.ogg` },
      reason: "path_conflict",
    },
    { args: { p_capture_status: "ready" }, reason: "path_conflict" },
  ]) {
    const rejected = await admin.rpc("mark_telefun_recording_uploaded", {
      p_session_id: id,
      p_user_id: trainer.userId,
      p_recording_path: fullPath(id),
      p_agent_recording_path: agentPath(id),
      p_capture_status: "failed",
      ...invalid.args,
    });
    expect(rejected.error).toBeNull();
    expect(
      Array.isArray(rejected.data) ? rejected.data[0] : rejected.data,
    ).toMatchObject({
      applied: false,
      reason: invalid.reason,
    });
    expect(await readSession(id), invalid.reason).toEqual(beforeFailure);
  }

  const failed = await admin.rpc("mark_telefun_recording_uploaded", {
    p_session_id: id,
    p_user_id: trainer.userId,
    p_recording_path: fullPath(id),
    p_agent_recording_path: agentPath(id),
    p_capture_status: "failed",
  });
  expect(failed.error).toBeNull();
  expect(
    Array.isArray(failed.data) ? failed.data[0] : failed.data,
  ).toMatchObject({
    applied: true,
    recording_status: "failed",
    reason: "capture_failed",
  });

  const state = await readSession(id);
  expect(state.recording_path).toBe(fullSeekablePath(id));
  expect(state.agent_recording_path).toBe(agentSeekablePath(id));
  expect(state.scoring_status).toBe("failed");
  expect(state.scoring_claim_token_hash).toBeNull();
  const staleCompletion = await admin.rpc("complete_telefun_scoring", {
    p_session_id: id,
    p_score: assessment.overallScore,
    p_voice_assessment: assessment,
    p_claim_token_hash: claimTokenHash,
  });
  expect(staleCompletion.error).toBeNull();
  expect(staleCompletion.data).toBe(false);
  for (const path of paths) {
    const downloaded = await admin.storage
      .from("telefun-recordings")
      .download(path);
    expect(
      downloaded.error,
      `failed latch preserves Storage object ${path}`,
    ).toBeNull();
    expect(
      Array.from(new Uint8Array(await downloaded.data!.arrayBuffer())),
    ).toEqual(Array.from(bytes));
  }
  expect(providerCalls).toBe(0);
});

test("a completed historical assessment remains readable but cannot be rerun after capture failure", async () => {
  test.setTimeout(60_000);
  const id = await createSession("historical completed result", {
    scoring_status: "completed",
    recording_status: "ready",
    score: assessment.overallScore,
    feedback: "Penilaian terdahulu yang tersimpan.",
    voice_assessment: assessment,
  });
  // Bind both pre-existing recordings to this owner/session before the
  // capture transition; completed evidence itself remains unchanged.
  const { error: bindPathsError } = await createAdmin(env)
    .from("telefun_history")
    .update({
      recording_path: fullPath(id),
      agent_recording_path: agentPath(id),
    })
    .eq("id", id);
  expect(bindPathsError).toBeNull();
  registerStoredRecording(fullPath(id));
  registerStoredRecording(agentPath(id));

  const before = await readSession(id);
  const finalized = await finalizeCapture(id, {
    captureStatus: "failed",
    full: true,
    agent: false,
  });
  expect(finalized.status).toBe(200);
  const after = await readSession(id);
  expect(after.scoring_status).toBe("completed");
  expect(after.score).toBe(before.score);
  expect(after.voice_assessment).toEqual(before.voice_assessment);
  expect(after.recording_path).toBe(fullPath(id));
  expect(after.agent_recording_path).toBe(agentPath(id));

  const cached = await api(`/score/${id}`, "POST", {});
  const cachedBody = await cached.json();
  expect(cached.status, JSON.stringify(cachedBody)).toBe(200);
  expect(cachedBody.cached).toBe(true);
  const rerun = await api(`/score/${id}/rerun`, "POST", {});
  expect(rerun.status).toBe(409);
  expect((await readSession(id)).scoring_status).toBe("completed");
  expect(providerCalls).toBe(0);
});
