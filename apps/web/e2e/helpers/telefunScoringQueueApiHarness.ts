// Shared by the telefun-scoring-queue-api-*.spec.ts files.
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./sidakRealBackend";
import {
  telefunQueueProviderResponse as providerResponse,
  cleanupTelefunQueueFixtures,
} from "./telefunScoringQueueFixtures";
import { tnaApiRequest } from "./tnaApi";
import {
  fetchOwnedTelefunQueueJobs,
  waitForGate,
  waitForTelefunQueueEnqueue,
} from "./telefunScoringQueueHarness";

export const env = readLoopbackEnv();

// ns, suite and the fixture collections below are re-initialised by
// setupTelefunScoringQueueSuite() so each spec file starts from the same state.
export let ns = "";

export let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;

export let app: Hono;

export let guardedFetch: typeof fetch;

export const suiteDefaults = () => ({
  providerCalls: 0,
  providerGate: null as {
    entered: Promise<void>;
    signalEntered: () => void;
    response: Promise<void>;
    release: () => void;
  } | null,
  storageGate: null as {
    path: string;
    entered: Promise<void>;
    signalEntered: () => void;
    response: Promise<void>;
    release: () => void;
  } | null,
  failedAdmissionRead: null as string | null,
  failedRetirementRpc: false,
  retirementRpcCalls: 0,
});

export const suite = suiteDefaults();

export const storageFixtureRequests: string[] = [];

export const sessionIds: string[] = [];

export const storagePaths = new Set<string>();

export const realStoragePaths = new Set<string>();

export const createdStoragePaths: string[] = [];

export const pendingWork = new Set<Promise<unknown>>();

export function createProviderGate() {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  suite.providerGate = { entered, signalEntered, response, release };
  return suite.providerGate;
}

export function createStorageDownloadGate(path: string) {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  suite.storageGate = { path, entered, signalEntered, response, release };
  return suite.storageGate;
}

export function trackWork<T>(work: Promise<T>): Promise<T> {
  pendingWork.add(work);
  void work.then(
    () => pendingWork.delete(work),
    () => pendingWork.delete(work),
  );
  return work;
}

export async function api(path: string, method = "GET", body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1/telefun${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function createSession(
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

export function fullPath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/full_call.webm`;
}

export function agentPath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/agent_only.webm`;
}

export function fullSeekablePath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/full_call.seekable.webm`;
}

export function agentSeekablePath(sessionId: string) {
  return `${trainer.userId}/${sessionId}/agent_only.seekable.webm`;
}

export function registerStoredRecording(path: string) {
  storagePaths.add(path);
}

export async function finalizeCapture(
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

export async function readSession(sessionId: string) {
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

export async function runOwnedQueueBatch(
  ids: string[],
  expectedIds: string[] | null = ids,
  batchSize = ids.length,
) {
  const service =
    await import("../../../api/src/services/telefun-scoring-service");
  const worker =
    await import("../../../api/src/workers/telefun-scoring-worker");
  return worker.processNextBatch(
    {
      // Scope the real queue SELECT before LIMIT, never its returned rows.
      // Claim, analysis and completion still use the real DB/service.
      fetchPendingJobs: (limit) =>
        fetchOwnedTelefunQueueJobs(
          env,
          trainer.userId,
          ids,
          expectedIds,
          service.fetchPendingJobs,
          limit,
        ),
      claimJob: service.claimJob,
      checkCachedAssessment: service.checkCachedAssessment,
      processScoringJob: service.processScoringJob,
      retireHistoricalOpenAiScoring: service.retireHistoricalOpenAiScoring,
    },
    { batchSize },
  );
}

export async function setupTelefunScoringQueueSuite() {
  // A failed setup must not make teardown delete the previous file's fixtures.
  trainer = undefined as unknown as typeof trainer;
  ns = `telefun-capture-policy-${randomUUID().slice(0, 8)}`;
  Object.assign(suite, suiteDefaults());
  storageFixtureRequests.length = 0;
  sessionIds.length = 0;
  storagePaths.clear();
  realStoragePaths.clear();
  createdStoragePaths.length = 0;
  pendingWork.clear();
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
      suite.providerCalls += 1;
      if (suite.providerGate) {
        suite.providerGate.signalEntered();
        await suite.providerGate.response;
      }
      const payload = await new Request(input, init).json();
      const prompt =
        payload.contents[0].parts.find((part: { text?: string }) => part.text)
          ?.text ?? "";
      return providerResponse(prompt);
    }
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/rpc/retire_telefun_openai_scoring"
    ) {
      suite.retirementRpcCalls += 1;
      if (suite.failedRetirementRpc) {
        return Response.json(
          { message: "Synthetic retirement persistence unavailable" },
          { status: 503 },
        );
      }
    }
    if (
      suite.failedAdmissionRead &&
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/telefun_history" &&
      url.searchParams.get("id") === `eq.${suite.failedAdmissionRead}` &&
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
        suite.storageGate?.path === objectPath
      ) {
        suite.storageGate.signalEntered();
        await suite.storageGate.response;
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
  app = (await import("../../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
}

export function resetTelefunScoringQueueTest() {
  suite.providerCalls = 0;
  suite.retirementRpcCalls = 0;
  storageFixtureRequests.length = 0;
  suite.providerGate = null;
  suite.storageGate = null;
  suite.failedAdmissionRead = null;
  suite.failedRetirementRpc = false;
}

export async function settleTelefunScoringQueueTest() {
  suite.providerGate?.release();
  suite.storageGate?.release();
  suite.failedAdmissionRead = null;
  suite.failedRetirementRpc = false;
  await waitForGate(
    Promise.allSettled([...pendingWork]).then(() => {}),
    "settling fixture-owned in-flight requests",
  );
  expect(pendingWork.size, "no request may outlive this test").toBe(0);
  suite.providerGate = null;
  suite.storageGate = null;
}

export async function teardownTelefunScoringQueueSuite() {
  suite.providerGate?.release();
  suite.storageGate?.release();
  if (guardedFetch) globalThis.fetch = guardedFetch;
  if (!trainer) return;
  await cleanupTelefunQueueFixtures(
    env,
    trainer.userId,
    sessionIds,
    createdStoragePaths,
  );
}
