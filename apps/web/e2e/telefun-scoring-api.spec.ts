import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";
import { fetchOwnedTelefunQueueJobs } from "./helpers/telefunScoringQueueHarness";

/**
 * Telefun — `POST /telefun/score/:id` pada backend lokal sungguhan.
 *
 * JWT, Hono, PostgREST/RPC dan logging sungguhan; audio/provider adalah fixture
 * fail-closed. Transkripsi harus mendahului assessment; coaching tetap terpisah.
 */

const env = readLoopbackEnv();
const ns = `telefun-score-${randomUUID().slice(0, 8)}`;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
const providerCalls: { kind: string; prompt: string; payload: any }[] = [];
const sessionIds: string[] = [];
const claimTimeouts: number[] = [];
let segments: { startSec: number; endSec: number; text: string }[];
let transcriptionText: string | undefined;
let releaseCoaching: (() => void) | undefined;
let holdCoaching = false;
let coachingWrites = 0;
let providerScores = { rate: 9.9, fillers: 9.9 };
let abortAfterTranscription: AbortController | undefined;
const TRANSCRIPT_SEGMENTS = [
  {
    startSec: 1,
    endSec: 6,
    text: "Eh, selamat siang, saya hm dari OJK, anu saya cek gitu.",
  },
  {
    startSec: 20,
    endSec: 25,
    text: "Apa ya, eee, begitu hmm, emmm, eeeh, eh. [tidak jelas]",
  },
];

function providerResponse(text: string) {
  return Response.json({
    candidates: [
      { content: { role: "model", parts: [{ text }] }, finishReason: "STOP" },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
  });
}

async function createSession(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  sessionIds.push(id);
  const { error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      id,
      user_id: agent.userId,
      scenario_title: `${ns} transkripsi`,
      consumer_name: "Konsumen Uji",
      status: "completed",
      telefun_model_id: "gemini-3.8-live",
      telefun_transport: "gemini-live",
      scoring_status: "pending",
      recording_status: "ready",
      recording_error: null,
      recording_path: `${agent.userId}/${id}/full_call.webm`,
      agent_recording_path: `${agent.userId}/${id}/agent_only.webm`,
      recording_ready_at: new Date().toISOString(),
      duration_seconds: 300,
      messages: [],
      ...overrides,
    });
  expect(error).toBeNull();
  return id;
}

async function score(id: string) {
  return tnaApiRequest(app, `http://localhost/api/v1/telefun/score/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${agent.token}` },
  });
}

async function readSession(id: string) {
  const result = await createAdmin(env)
    .from("telefun_history")
    .select(
      "voice_assessment, score, scoring_status, scoring_last_error, scoring_next_attempt_at",
    )
    .eq("id", id)
    .single();
  expect(result.error).toBeNull();
  return result.data!;
}

async function usageLogs() {
  const result = await createAdmin(env)
    .from("ai_usage_logs")
    .select("action, user_id, model_id, input_tokens, output_tokens")
    .eq("user_id", agent.userId);
  expect(result.error).toBeNull();
  return result.data!;
}

const FEEDBACK =
  "Tempo bicara stabil dan jelas sehingga konsumen mudah mengikuti.";
const ASPECT = {
  score: 8.3,
  verdict: "Baik sekali, konsisten",
  feedback: FEEDBACK,
};
/** Penilaian tersimpan yang lengkap: analisis suara memakai cache, tanpa AI. */
const CACHED_ASSESSMENT = {
  overallScore: 8.3,
  speakingRate: { ...ASPECT, wordsPerMinute: 140 },
  intonation: ASPECT,
  articulation: ASPECT,
  fillerWords: { ...ASPECT, count: 0, examples: [] },
  emotionalTone: { ...ASPECT, dominant: "tenang" },
  transcript: "Selamat siang, dengan layanan konsumen OJK.",
  highlights: [
    "Menyapa konsumen dengan ramah",
    "Mengonfirmasi data konsumen",
    "Menutup panggilan dengan sopan",
  ],
  strengths: ["Suara jelas sekali", "Tempo bicara stabil", "Nada tetap tenang"],
  holdManagement: null,
};

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    GEMINI_PROXY_URL: "",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "generativelanguage.googleapis.com") {
      const payload = await request.json();
      const parts = payload.contents[0].parts;
      const prompt = parts.find((p: { text?: string }) => p.text)?.text ?? "";
      const kind = prompt.includes("TUGAS: TRANSKRIPSI VERBATIM AGEN")
        ? "transcription"
        : parts.some((p: { inlineData?: unknown }) => p.inlineData)
          ? "assessment"
          : "coaching";
      providerCalls.push({ kind, prompt, payload });
      if (kind === "transcription") {
        abortAfterTranscription?.abort();
        return providerResponse(
          transcriptionText ?? JSON.stringify({ segments }),
        );
      }
      if (kind === "coaching") {
        if (holdCoaching)
          await new Promise<void>((resolve) => {
            releaseCoaching = resolve;
          });
        return providerResponse("[]");
      }
      return providerResponse(
        JSON.stringify({
          ...CACHED_ASSESSMENT,
          overallScore: 9.9,
          speakingRate: {
            ...ASPECT,
            score: providerScores.rate,
            wordsPerMinute: 999,
          },
          fillerWords: {
            ...ASPECT,
            score: providerScores.fillers,
            count: 99,
            examples: ["salah"],
          },
          transcript: "Transkrip model penilaian yang salah.",
        }),
      );
    }
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname.startsWith("/storage/v1/object/") &&
      request.method === "GET"
    ) {
      return new Response(Buffer.from("synthetic-agent-audio"), {
        headers: { "Content-Type": "audio/webm" },
      });
    }
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/rpc/claim_telefun_scoring"
    ) {
      claimTimeouts.push(
        (await request.clone().json()).p_claim_timeout_seconds,
      );
    }
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/rpc/upsert_telefun_coaching_summary"
    ) {
      const response = await guardedFetch(request);
      coachingWrites += 1;
      return response;
    }
    return guardedFetch(request);
  };
  agent = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.beforeEach(async () => {
  providerCalls.length = 0;
  claimTimeouts.length = 0;
  segments = structuredClone(TRANSCRIPT_SEGMENTS);
  transcriptionText = undefined;
  holdCoaching = false;
  coachingWrites = 0;
  providerScores = { rate: 9.9, fillers: 9.9 };
  abortAfterTranscription = undefined;
  releaseCoaching = undefined;
  const deleted = await createAdmin(env)
    .from("ai_usage_logs")
    .delete()
    .eq("user_id", agent.userId);
  expect(deleted.error).toBeNull();
});

test.afterEach(async () => {
  const expectedCoaching =
    providerCalls.filter((call) => call.kind === "assessment").length +
    (holdCoaching ? 1 : 0);
  // The response can return before the fire-and-forget coaching request starts.
  // Join its DB write as well as usage before deleting/resetting this run's data.
  await expect
    .poll(() => providerCalls.filter((call) => call.kind === "coaching").length)
    .toBe(expectedCoaching);
  releaseCoaching?.();
  await expect.poll(() => coachingWrites).toBe(expectedCoaching);
  await expect
    .poll(async () => (await usageLogs()).length)
    .toBe(providerCalls.length);
});

test.afterAll(async () => {
  if (guardedFetch) globalThis.fetch = guardedFetch;
  if (!agent) return;
  const admin = createAdmin(env);
  if (sessionIds.length > 0) {
    const deleted = await admin
      .from("telefun_history")
      .delete()
      .in("id", sessionIds);
    expect(deleted.error, "delete run scoring session").toBeNull();
    const remaining = await admin
      .from("telefun_history")
      .select("id")
      .in("id", sessionIds);
    expect(remaining.error, "read back deleted scoring session").toBeNull();
    expect(remaining.data).toEqual([]);
  }
  const deletedUsage = await admin
    .from("ai_usage_logs")
    .delete()
    .eq("user_id", agent.userId);
  expect(deletedUsage.error).toBeNull();
  const deletedUser = await admin.auth.admin.deleteUser(agent.userId);
  expect(deletedUser.error, "delete run scoring auth user").toBeNull();
});

test("the score returns without waiting for the coaching summary", async () => {
  holdCoaching = true;
  const id = randomUUID();
  sessionIds.push(id);
  const { data: row, error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      id,
      user_id: agent.userId,
      scenario_title: `${ns} skor`,
      consumer_name: "Konsumen Uji",
      status: "completed",
      scoring_status: "pending",
      recording_status: "ready",
      recording_error: null,
      recording_path: `${agent.userId}/${id}/full_call.webm`,
      agent_recording_path: `${agent.userId}/${id}/agent_only.webm`,
      recording_ready_at: new Date().toISOString(),
      voice_assessment: CACHED_ASSESSMENT,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  const response = await Promise.race([
    tnaApiRequest(app, `http://localhost/api/v1/telefun/score/${row!.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.token}` },
    }),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 10_000),
    ),
  ]);

  expect(response, "the score waited for the coaching AI call").not.toBe(
    "timeout",
  );
  if (response === "timeout") return;
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data: { score: number };
  };
  expect(body.data.score).toBe(8.3);
  // The coaching call was still started.
  await expect.poll(() => providerCalls.length).toBeGreaterThan(0);
});

test("new scoring transcribes first and persists computed speech facts and clamped scores", async () => {
  const id = await createSession();
  const response = await score(id);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  await expect.poll(() => providerCalls.length).toBe(3); // transcription, assessment, async coaching
  expect(providerCalls.map((c) => c.kind)).toEqual([
    "transcription",
    "assessment",
    "coaching",
  ]);
  // Two serial 180s provider budgets must fit inside the actual RPC claim lease.
  expect(claimTimeouts[0]).toBeGreaterThan(360);
  for (const call of providerCalls.slice(0, 2)) {
    expect(
      call.payload.contents[0].parts.some(
        (p: { inlineData?: unknown }) => p.inlineData,
      ),
    ).toBe(true);
    expect(call.payload.generationConfig).not.toHaveProperty("temperature");
  }
  expect(
    providerCalls[0]!.payload.generationConfig.thinkingConfig.thinkingLevel,
  ).toBe("LOW");
  const transcript = TRANSCRIPT_SEGMENTS.map((s) => s.text).join(" ");
  const assessmentCall = providerCalls[1]!;
  expect(assessmentCall.prompt).toContain(transcript);
  expect(assessmentCall.prompt).toContain('"wordsPerMinute":114');
  expect(assessmentCall.prompt).toContain('"fillerCount":10');
  expect(assessmentCall.prompt).toContain('"speakingSeconds":10');
  expect(assessmentCall.prompt).not.toContain(
    "TRANSKRIP VERBATIM LENGKAP 100%",
  );
  const stored = await readSession(id);
  expect(stored.scoring_status).toBe("completed");
  expect(stored.voice_assessment).toEqual(body.data.assessment);
  expect(stored.voice_assessment).toMatchObject({
    transcript,
    speakingRate: { wordsPerMinute: 114, score: 6 },
    fillerWords: {
      count: 10,
      score: 3,
      examples: [
        "Eh",
        "hm",
        "anu",
        "gitu",
        "Apa ya",
        "eee",
        "hmm",
        "emmm",
        "eeeh",
        "eh",
      ],
    },
    overallScore: 6.8,
  });
  const metrics = stored.voice_assessment.communicationProfile.metrics;
  expect(
    metrics.find((m: { key: string }) => m.key === "speakingRate"),
  ).toMatchObject({ rawValue: 114, score: 6 });
  expect(
    metrics.find((m: { key: string }) => m.key === "fillers"),
  ).toMatchObject({ rawValue: 10, score: 3 });
  const logs = await usageLogs();
  expect(
    logs
      .filter((l) => l.action !== "coaching_summary")
      .map((l) => l.action)
      .sort(),
  ).toEqual(["voice_assessment", "voice_transcription"]);
  expect(
    logs.every(
      (l) =>
        l.model_id === "gemini-3.8-flash" &&
        l.user_id === agent.userId &&
        l.input_tokens === 10 &&
        l.output_tokens === 5,
    ),
  ).toBe(true);
  const { getUsageActionDefinition } =
    await import("../../api/src/lib/ai-usage-categories");
  expect(getUsageActionDefinition("voice_transcription")).toMatchObject({
    category: "review",
    itemKey: "telefun_assessment",
  });
});

test("cached historical scoring remains unchanged without any provider request", async () => {
  const id = await createSession({
    scoring_status: "completed",
    score: 8.3,
    voice_assessment: CACHED_ASSESSMENT,
  });
  const response = await score(id);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.cached).toBe(true);
  expect(body.data.assessment).toEqual(CACHED_ASSESSMENT);
  expect((await readSession(id)).voice_assessment).toEqual(CACHED_ASSESSMENT);
  expect(providerCalls).toEqual([]);
  expect(await usageLogs()).toEqual([]);
});

for (const invalid of [
  {
    name: "malformed JSON",
    text: "{rusak",
    error: "Transkrip rekaman agen gagal dibuat.",
  },
  {
    name: "empty segments",
    text: JSON.stringify({ segments: [] }),
    error: "Transkrip rekaman agen gagal dibuat.",
  },
  {
    name: "reversed interval",
    text: JSON.stringify({
      segments: [{ startSec: 10, endSec: 2, text: "eh" }],
    }),
    error: "Transkrip rekaman agen gagal dibuat.",
  },
  {
    name: "overlapping intervals",
    text: JSON.stringify({
      segments: [
        { startSec: 0, endSec: 10, text: "halo" },
        { startSec: 9, endSec: 12, text: "eh" },
      ],
    }),
    error: "Transkrip rekaman agen gagal dibuat.",
  },
  {
    name: "short speech",
    text: JSON.stringify({
      segments: [{ startSec: 0, endSec: 4, text: "eh halo" }],
    }),
    error:
      "Rekaman bicara agen terlalu pendek untuk dinilai (minimal 5 detik).",
  },
]) {
  test(`transcription failure: ${invalid.name} stops assessment and retains retry state`, async () => {
    transcriptionText = invalid.text;
    const id = await createSession();
    const response = await score(id);
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe(
      "Gagal melakukan analisis suara.",
    );
    expect(providerCalls.map((c) => c.kind)).toEqual(["transcription"]);
    const stored = await readSession(id);
    expect(stored.voice_assessment).toBeNull();
    expect(stored.score).toBeNull();
    expect(stored.scoring_status).toBe("failed");
    expect(stored.scoring_last_error).toBe(invalid.error);
    // Manual failures have a null retry date: production treats null as due.
    // Prove actual queue eligibility rather than requiring worker-only backoff.
    const service =
      await import("../../api/src/services/telefun-scoring-service");
    const queued = await fetchOwnedTelefunQueueJobs(
      env,
      agent.userId,
      [id],
      [id],
      service.fetchPendingJobs,
    );
    expect(queued.map((job) => job.sessionId)).toEqual([id]);
    if (invalid.name === "malformed JSON") {
      const worker =
        await import("../../api/src/workers/telefun-scoring-worker");
      const result = await worker.processNextBatch(
        {
          ...service,
          fetchPendingJobs: (limit) =>
            fetchOwnedTelefunQueueJobs(
              env,
              agent.userId,
              [id],
              [id],
              service.fetchPendingJobs,
              limit,
            ),
        },
        { batchSize: 1 },
      );
      expect(result).toMatchObject({
        processed: 1,
        rescheduled: 1,
        completed: 0,
      });
      expect((await readSession(id)).scoring_next_attempt_at).not.toBeNull();
      expect(providerCalls.map((call) => call.kind)).toEqual([
        "transcription",
        "transcription",
      ]);
      // Advance only this fixture's due date, not the provider/backoff clock.
      const due = await createAdmin(env)
        .from("telefun_history")
        .update({
          scoring_next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq("id", id)
        .eq("user_id", agent.userId);
      expect(due.error).toBeNull();
      const exhausted = await worker.processNextBatch(
        {
          ...service,
          fetchPendingJobs: (limit) =>
            fetchOwnedTelefunQueueJobs(
              env,
              agent.userId,
              [id],
              [id],
              service.fetchPendingJobs,
              limit,
            ),
        },
        { batchSize: 1 },
      );
      expect(exhausted).toMatchObject({
        processed: 1,
        failed: 1,
        rescheduled: 0,
      });
      const stopped = await worker.processNextBatch(
        {
          ...service,
          fetchPendingJobs: (limit) =>
            fetchOwnedTelefunQueueJobs(
              env,
              agent.userId,
              [id],
              [],
              service.fetchPendingJobs,
              limit,
            ),
        },
        { batchSize: 1 },
      );
      expect(stopped).toMatchObject({ processed: 0, completed: 0 });
      expect(providerCalls.map((call) => call.kind)).toEqual([
        "transcription",
        "transcription",
        "transcription",
      ]);
      // Explicit user retry remains available even when automatic retry stops.
      transcriptionText = undefined;
      const manualRetry = await score(id);
      expect(manualRetry.status).toBe(200);
      expect((await readSession(id)).scoring_status).toBe("completed");
    }
  });
}

test("rubric boundaries use counted words and fillers, including exactly six and hold normalization", async () => {
  for (const boundary of [
    { wpm: 119, fillers: 0, rateScore: 6, fillerScore: 9.9 },
    { wpm: 120, fillers: 1, rateScore: 8, fillerScore: 8 },
    { wpm: 129, fillers: 2, rateScore: 8, fillerScore: 8 },
    { wpm: 130, fillers: 3, rateScore: 9.9, fillerScore: 6 },
    { wpm: 150, fillers: 6, rateScore: 9.9, fillerScore: 6 },
    { wpm: 151, fillers: 7, rateScore: 8, fillerScore: 3 },
    { wpm: 165, fillers: 0, rateScore: 8, fillerScore: 9.9 },
    { wpm: 166, fillers: 0, rateScore: 6, fillerScore: 9.9 },
  ]) {
    // 60 seconds of agent speech; the 300-second call duration is irrelevant.
    segments = [
      {
        startSec: 0,
        endSec: 60,
        text: [
          ...Array<string>(boundary.fillers).fill("eh"),
          ...Array<string>(boundary.wpm - boundary.fillers).fill("layanan"),
        ].join(" "),
      },
    ];
    const id = await createSession({
      session_metrics: {
        hold: {
          intervals: [{ sequence: 1, startedAtMs: 1000, endedAtMs: 2000 }],
        },
      },
    });
    const response = await score(id);
    const body = await response.json();
    expect(response.status, JSON.stringify(boundary)).toBe(200);
    const assessment = body.data.assessment;
    expect(assessment.speakingRate).toMatchObject({
      wordsPerMinute: boundary.wpm,
      score: boundary.rateScore,
    });
    expect(assessment.fillerWords).toMatchObject({
      count: boundary.fillers,
      score: boundary.fillerScore,
      examples: boundary.fillers ? ["eh"] : [],
    });
    const expected =
      Math.round(
        ((boundary.rateScore + boundary.fillerScore + 8.3 * 3 + 10) / 6) * 10,
      ) / 10;
    expect(assessment.overallScore).toBe(expected);
    await expect
      .poll(async () => (await usageLogs()).length)
      .toBe(providerCalls.length);
  }
});

test("fresh rerun replaces old transcript and clamps low provider scores upward", async () => {
  providerScores = { rate: 0, fillers: 0 };
  segments = [
    {
      startSec: 0,
      endSec: 6,
      text: Array<string>(14).fill("layanan").join(" "),
    },
  ];
  const id = await createSession({
    scoring_status: "completed",
    score: 8.3,
    voice_assessment: CACHED_ASSESSMENT,
  });
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/telefun/score/${id}/rerun`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.token}` },
    },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.data.assessment).toMatchObject({
    transcript: segments[0]!.text,
    speakingRate: { wordsPerMinute: 140, score: 9 },
    fillerWords: { count: 0, examples: [], score: 9 },
    overallScore: 8.6,
  });
  expect((await readSession(id)).voice_assessment).toEqual(
    body.data.assessment,
  );
  await expect.poll(() => providerCalls.length).toBe(3);
  expect(providerCalls.map((call) => call.kind)).toEqual([
    "transcription",
    "assessment",
    "coaching",
  ]);
});

test("filler examples retain actual spellings but are capped at ten unique matches", async () => {
  const examples = [
    "eh",
    "eeh",
    "eeeh",
    "hm",
    "hmm",
    "hmmm",
    "em",
    "emm",
    "emmm",
    "anu",
    "gitu",
    "apa ya",
    "eee",
  ];
  segments = [{ startSec: 0, endSec: 10, text: examples.join(", ") + ", eh." }];
  const response = await score(await createSession());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.assessment.fillerWords).toMatchObject({
    count: 14,
    examples: examples.slice(0, 10),
    score: 3,
  });
});

test("outside-range rate keeps severe scores but never falls between rubric bands", async () => {
  segments = [
    {
      startSec: 0,
      endSec: 60,
      text: Array<string>(90).fill("layanan").join(" "),
    },
  ];
  for (const [raw, expected] of [
    [2, 2],
    [3.5, 4],
  ]) {
    providerScores.rate = raw!;
    const response = await score(await createSession());
    expect(response.status).toBe(200);
    expect((await response.json()).data.assessment.speakingRate.score).toBe(
      expected,
    );
  }
});

test("worker abort during transcription does not admit assessment or persist guessed results", async () => {
  const id = await createSession();
  const controller = new AbortController();
  abortAfterTranscription = controller;
  const service =
    await import("../../api/src/services/telefun-scoring-service");
  const worker = await import("../../api/src/workers/telefun-scoring-worker");
  const result = await worker.processNextBatch(
    {
      ...service,
      fetchPendingJobs: (limit) =>
        fetchOwnedTelefunQueueJobs(
          env,
          agent.userId,
          [id],
          [id],
          service.fetchPendingJobs,
          limit,
        ),
    },
    { batchSize: 1, signal: controller.signal },
  );
  expect(result).toMatchObject({ processed: 1, rescheduled: 1, completed: 0 });
  expect(providerCalls.map((call) => call.kind)).toEqual(["transcription"]);
  expect((await readSession(id)).voice_assessment).toBeNull();
});
