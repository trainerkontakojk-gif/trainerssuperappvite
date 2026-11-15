import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS } from "@trainers/types";
import { TELEFUN_OPENAI_SCORING_DISABLED_REASON } from "../../api/src/lib/telefun-openai-assessment";
import { createAdmin } from "./helpers/sidakRealBackend";
import { telefunQueueAssessment as assessment } from "./helpers/telefunScoringQueueFixtures";
import {
  env,
  trainer,
  suite,
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

/**
 * Retirement coverage reuses the loopback DB, egress guard, and provider/Storage
 * fixture lifecycle from `helpers/telefunScoringQueueApiHarness.ts` instead of
 * duplicating process-wide integration setup.
 */
test("worker retires old terminal jobs so valid Gemini eventually scores", async () => {
  test.setTimeout(90_000);
  const batchSize = 2;
  const pendingRetiredId = await createSession(
    "retired pending with failed capture",
    {
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: null,
      scoring_status: "pending",
      recording_status: "failed",
      recording_error: "historical recording unavailable",
    },
  );
  const firstRetryId = await createSession("retired due retry openai-audio", {
    status: "failed",
    telefun_model_id: "legacy-openai-audio",
    telefun_transport: "openai-audio",
    scoring_status: "failed",
    scoring_next_attempt_at: "2000-01-01T00:00:00.000Z",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const secondRetryId = await createSession(
    "unknown retired prefix without capture",
    {
      telefun_model_id: "gpt-realtime-unknown-historical",
      telefun_transport: null,
      scoring_status: "failed",
      scoring_next_attempt_at: "2000-02-01T00:00:00.000Z",
      recording_status: "pending",
      recording_error: null,
    },
  );
  const webRtcRetryId = await createSession(
    "retired transport-only WebRTC due retry",
    {
      telefun_model_id: "legacy-openai-webrtc",
      telefun_transport: "openai-webrtc",
      scoring_status: "failed",
      scoring_next_attempt_at: "2000-03-01T00:00:00.000Z",
      recording_status: "failed",
      recording_error: "historical recording unavailable",
    },
  );
  const historicalIds = [
    pendingRetiredId,
    firstRetryId,
    secondRetryId,
    webRtcRetryId,
  ];
  const geminiId = await createSession(
    "valid Gemini behind retirement backlog",
    { scoring_status: "failed" },
  );
  registerStoredRecording(fullPath(geminiId));
  registerStoredRecording(agentPath(geminiId));
  expect(
    (
      await finalizeCapture(geminiId, {
        captureStatus: "ready",
        full: true,
        agent: true,
      })
    ).status,
  ).toBe(200);
  const dueGemini = await createAdmin(env)
    .from("telefun_history")
    .update({ scoring_next_attempt_at: "2000-04-01T00:00:00.000Z" })
    .eq("id", geminiId)
    .eq("user_id", trainer.userId)
    .select("id");
  expect(dueGemini.error).toBeNull();
  expect(dueGemini.data).toEqual([{ id: geminiId }]);

  const fixtureIds = [...historicalIds, geminiId];
  const before = await Promise.all(historicalIds.map(readSession));
  for (let batch = 0; batch < historicalIds.length + 1; batch += 1) {
    const [retiredStates, geminiState] = await Promise.all([
      Promise.all(historicalIds.map(readSession)),
      readSession(geminiId),
    ]);
    if (
      retiredStates.every(
        (state) =>
          state.scoring_status === "failed" &&
          state.scoring_next_attempt_at === null &&
          state.scoring_last_error === TELEFUN_OPENAI_SCORING_DISABLED_REASON,
      ) &&
      geminiState.scoring_status === "completed"
    ) {
      break;
    }
    await runOwnedQueueBatch(fixtureIds, null, batchSize);
  }

  const after = await Promise.all(historicalIds.map(readSession));
  for (const [index, state] of after.entries()) {
    expect(state.scoring_status, state.id).toBe("failed");
    expect(state.scoring_last_error, state.id).toBe(
      TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    );
    expect(state.scoring_next_attempt_at, state.id).toBeNull();
    expect(state.scoring_claim_token_hash, state.id).toBeNull();
    expect(state.scoring_claim_owner, state.id).toBeNull();
    expect(state.scoring_claimed_at, state.id).toBeNull();
    expect(state.scoring_attempt_count, state.id).toBe(
      before[index]!.scoring_attempt_count,
    );
    expect(state.recording_status, state.id).toBe(
      before[index]!.recording_status,
    );
    expect(state.recording_path, state.id).toBe(before[index]!.recording_path);
    expect(state.agent_recording_path, state.id).toBe(
      before[index]!.agent_recording_path,
    );
    expect(state.score, state.id).toBe(before[index]!.score);
    expect(state.voice_assessment, state.id).toEqual(
      before[index]!.voice_assessment,
    );
  }
  expect(await readSession(geminiId)).toMatchObject({
    scoring_status: "completed",
    score: 8.4,
    voice_assessment: { overallScore: 8.4 },
  });
  expect(
    suite.providerCalls,
    "only the valid Gemini control may reach the provider (transcription + assessment)",
  ).toBe(2);
});

test("manual score durably retires uncached terminal history with 410", async () => {
  const id = await createSession("manual terminal retirement", {
    telefun_model_id: "gpt-realtime-2.1-mini",
    telefun_transport: "openai-webrtc",
    scoring_status: "pending",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const before = await readSession(id);

  const response = await api(`/score/${id}`, "POST", {});
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(410);
  expect(body).toMatchObject({
    success: false,
    error: {
      code: "TELEFUN_OPENAI_SCORING_DISABLED",
      message: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    },
  });
  expect(await readSession(id)).toMatchObject({
    scoring_status: "failed",
    scoring_last_error: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    scoring_next_attempt_at: null,
    scoring_claim_token_hash: null,
    scoring_claim_owner: null,
    scoring_claimed_at: null,
    score: before.score,
    voice_assessment: before.voice_assessment,
  });
  expect(suite.providerCalls).toBe(0);
});

test("manual score fails closed when retirement persistence is unavailable", async () => {
  const id = await createSession("manual retirement RPC unavailable", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-audio",
    scoring_status: "pending",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const before = await readSession(id);
  suite.failedRetirementRpc = true;

  const response = await api(`/score/${id}`, "POST", {});
  const body = await response.json();
  suite.failedRetirementRpc = false;
  expect(response.status, JSON.stringify(body)).toBe(503);
  expect(body.error.code).toBe("SCORING_STATE_UNAVAILABLE");
  expect(await readSession(id)).toEqual(before);
  expect(suite.providerCalls).toBe(0);
});

test("manual score preserves a cached retired assessment unchanged", async () => {
  const historicalAssessment = { ...assessment, overallScore: 4.1 };
  const id = await createSession("cached retired historical assessment", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-audio",
    scoring_status: "completed",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
    score: historicalAssessment.overallScore,
    feedback: "Penilaian historis yang harus tetap utuh.",
    voice_assessment: historicalAssessment,
  });
  const before = await readSession(id);

  const response = await api(`/score/${id}`, "POST", {});
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.cached).toBe(true);
  expect(body.data.assessment).toEqual(before.voice_assessment);
  expect(await readSession(id)).toEqual(before);
  expect(suite.providerCalls).toBe(0);
});

test("manual score returns 410 for malformed completed retired cache without mutation", async () => {
  for (const voiceAssessment of [{ overallScore: "invalid" }, null]) {
    const id = await createSession("malformed completed retired cache", {
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
      scoring_status: "completed",
      recording_status: "failed",
      recording_error: "historical recording unavailable",
      score: 4.1,
      voice_assessment: voiceAssessment,
    });
    const before = await readSession(id);
    suite.failedRetirementRpc = true;

    const response = await api(`/score/${id}`, "POST", {});
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(410);
    expect(body.error.code).toBe("TELEFUN_OPENAI_SCORING_DISABLED");
    expect(await readSession(id)).toEqual(before);
  }
  expect(
    suite.retirementRpcCalls,
    "completed history must not invoke retirement",
  ).toBe(0);
  expect(suite.providerCalls).toBe(0);
});

test("retirement RPC denies users and preserves claim, retry, cache, and active fences", async () => {
  test.setTimeout(90_000);
  const admin = createAdmin(env);
  const wrongRoleId = await createSession("retirement RPC wrong role", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-audio",
    scoring_status: "pending",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const wrongRoleBefore = await readSession(wrongRoleId);
  const anonClient = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
  });
  const userClient = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${trainer.token}` } },
  });
  for (const [role, client] of [
    ["anon", anonClient],
    ["authenticated", userClient],
  ] as const) {
    const denied = await client.rpc("retire_telefun_openai_scoring", {
      p_session_id: wrongRoleId,
    });
    expect(denied.error?.code, role).toBe("42501");
    expect(await readSession(wrongRoleId)).toEqual(wrongRoleBefore);
  }

  const activeClaimId = await createSession("retirement RPC live claim", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-webrtc",
    scoring_status: "processing",
    scoring_claimed_at: new Date().toISOString(),
    scoring_claim_token_hash: randomUUID().replaceAll("-", ""),
    scoring_claim_owner: "active-retirement-fence-e2e",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const activeClaimBefore = await readSession(activeClaimId);
  const activeClaimResult = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: activeClaimId,
  });
  expect(activeClaimResult.error).toBeNull();
  expect(activeClaimResult.data).toBe(false);
  expect(await readSession(activeClaimId)).toEqual(activeClaimBefore);

  const staleToken = randomUUID().replaceAll("-", "");
  const staleClaimId = await createSession("retirement RPC stale claim", {
    telefun_model_id: "gpt-realtime-2.1-mini",
    telefun_transport: "openai-webrtc",
    scoring_status: "processing",
    scoring_claimed_at: new Date(Date.now() - 600_000).toISOString(),
    scoring_claim_token_hash: staleToken,
    scoring_claim_owner: "stale-retirement-fence-e2e",
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const staleResult = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: staleClaimId,
  });
  expect(staleResult.error).toBeNull();
  expect(staleResult.data).toBe(true);
  expect(await readSession(staleClaimId)).toMatchObject({
    scoring_status: "failed",
    scoring_last_error: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
    scoring_next_attempt_at: null,
    scoring_claimed_at: null,
    scoring_claim_token_hash: null,
    scoring_claim_owner: null,
  });
  const retiredBeforeRepeat = await readSession(staleClaimId);
  const repeatedRetirement = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: staleClaimId,
  });
  expect(repeatedRetirement.error).toBeNull();
  expect(repeatedRetirement.data).toBe(true);
  expect(await readSession(staleClaimId)).toEqual(retiredBeforeRepeat);
  const staleCompletion = await admin.rpc("complete_telefun_scoring", {
    p_session_id: staleClaimId,
    p_score: assessment.overallScore,
    p_voice_assessment: assessment,
    p_claim_token_hash: staleToken,
  });
  expect(staleCompletion.error).toBeNull();
  expect(staleCompletion.data).toBe(false);

  for (const model of TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS) {
    const id = await createSession(`retirement RPC known model ${model.id}`, {
      telefun_model_id: model.id,
      telefun_transport: null,
      scoring_status: "pending",
      recording_status: "failed",
      recording_error: "historical recording unavailable",
    });
    const result = await admin.rpc("retire_telefun_openai_scoring", {
      p_session_id: id,
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    expect(await readSession(id)).toMatchObject({
      scoring_status: "failed",
      scoring_last_error: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
      scoring_next_attempt_at: null,
    });
  }

  const futureRetryId = await createSession("retirement RPC future retry", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-audio",
    scoring_status: "failed",
    scoring_next_attempt_at: new Date(Date.now() + 600_000).toISOString(),
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const futureRetryBefore = await readSession(futureRetryId);
  const futureRetryResult = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: futureRetryId,
  });
  expect(futureRetryResult.error).toBeNull();
  expect(futureRetryResult.data).toBe(false);
  expect(await readSession(futureRetryId)).toEqual(futureRetryBefore);

  const cachedId = await createSession("retirement RPC cached assessment", {
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-audio",
    scoring_status: "completed",
    score: assessment.overallScore,
    voice_assessment: assessment,
    recording_status: "failed",
    recording_error: "historical recording unavailable",
  });
  const cachedBefore = await readSession(cachedId);
  const cachedResult = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: cachedId,
  });
  expect(cachedResult.error).toBeNull();
  expect(cachedResult.data).toBe(false);
  expect(await readSession(cachedId)).toEqual(cachedBefore);
  const matchingSnapshot = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: cachedId,
    p_expected_scoring_status: "completed",
    p_expected_voice_assessment: cachedBefore.voice_assessment,
  });
  expect(matchingSnapshot.error).toBeNull();
  expect(matchingSnapshot.data).toBe(false);
  expect(await readSession(cachedId)).toEqual(cachedBefore);

  const geminiId = await createSession("retirement RPC non-retired row", {
    telefun_model_id: "gemini-3.8-live",
    telefun_transport: "gemini-live",
    scoring_status: "pending",
    recording_status: "failed",
    recording_error: "capture failed",
  });
  const geminiBefore = await readSession(geminiId);
  const geminiResult = await admin.rpc("retire_telefun_openai_scoring", {
    p_session_id: geminiId,
  });
  expect(geminiResult.error).toBeNull();
  expect(geminiResult.data).toBe(false);
  expect(await readSession(geminiId)).toEqual(geminiBefore);

  for (const status of ["active", "pending"] as const) {
    const id = await createSession(`active historical WebRTC ${status}`, {
      status,
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
      scoring_status: "pending",
      recording_status: "failed",
      recording_error: "historical recording unavailable",
    });
    const before = await readSession(id);
    const response = await api(`/score/${id}`, "POST", {});
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SCORING_NOT_READY");
    expect(await readSession(id)).toEqual(before);
    const nonterminalResult = await admin.rpc("retire_telefun_openai_scoring", {
      p_session_id: id,
    });
    expect(nonterminalResult.error).toBeNull();
    expect(nonterminalResult.data).toBe(false);
    expect(await readSession(id)).toEqual(before);
  }
  expect(suite.providerCalls).toBe(0);
});
