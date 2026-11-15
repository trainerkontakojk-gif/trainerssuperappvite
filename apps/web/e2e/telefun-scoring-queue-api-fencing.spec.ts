import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAdmin } from "./helpers/sidakRealBackend";
import { telefunQueueAssessment as assessment } from "./helpers/telefunScoringQueueFixtures";
import { waitForGate } from "./helpers/telefunScoringQueueHarness";
import {
  env,
  trainer,
  suite,
  realStoragePaths,
  createdStoragePaths,
  createProviderGate,
  createStorageDownloadGate,
  trackWork,
  api,
  createSession,
  fullPath,
  agentPath,
  fullSeekablePath,
  agentSeekablePath,
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
  expect(suite.providerCalls).toBe(1);
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
  suite.providerGate = null;
  const result = await workerPromise;
  expect(result).toMatchObject({ processed: 1, completed: 0, failed: 1 });
  const finalState = await readSession(id);
  expect(finalState.scoring_status).toBe("failed");
  expect(finalState.score).toBeNull();
  expect(finalState.voice_assessment).toBeNull();
  expect(finalState.scoring_next_attempt_at).toBeNull();
  expect(suite.providerCalls).toBe(1);
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
    expect(
      suite.providerCalls,
      `${entry} before failed-capture transition`,
    ).toBe(0);

    const failed = await finalizeCapture(id, {
      captureStatus: "failed",
      full: true,
      agent: false,
    });
    expect(failed.status, `latch failure for ${entry}`).toBe(200);
    gate.release();
    suite.storageGate = null;
    await admitted;

    const finalState = await readSession(id);
    expect(finalState.recording_status, entry).toBe("failed");
    expect(finalState.scoring_claim_token_hash, entry).toBeNull();
    expect(suite.providerCalls, `${entry} provider calls`).toBe(0);
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
      suite.failedAdmissionRead = id;
    }
    gate.release();
    await work;
    suite.failedAdmissionRead = null;
    suite.storageGate = null;
    expect(suite.providerCalls, fault).toBe(0);
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
    const callsBefore = suite.providerCalls;
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
    suite.providerGate = null;
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
      suite.providerCalls,
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
  expect(suite.providerCalls).toBe(0);
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
  expect(suite.providerCalls).toBe(0);
});
