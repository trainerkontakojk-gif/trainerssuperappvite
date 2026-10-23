import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import { createServer, type Server } from "node:http";
import { installLoopbackFetchGuard } from "./helpers/sidakRealBackend";
import { voiceAssessment } from "./helpers/telefunFixtures";

// Real score route, analysis, shared parser and usage logger. Only external
// database/storage/provider HTTP transports are fixtures. No live DB or AI.
const actorId = "10000000-0000-4000-8000-000000000042";
const sessionId = "20000000-0000-4000-8000-000000000042";
const messages = [
  {
    speaker: "consumer",
    text: "Kenapa tagihan saya belum berubah?",
    startMs: 0,
  },
  { speaker: "agent", text: "Saya akan memeriksa tagihan Ibu.", startMs: 1000 },
  { speaker: "agent", text: "Saya akan memeriksa tagihan Ibu.", startMs: 2000 },
  {
    speaker: "agent",
    text: "Untuk dapat bisa memeriksa, mohon nomor tiketnya.",
    startMs: 3000,
  },
  { speaker: "agent", text: "Mohon tunggu. Mohon tunggu.", startMs: 4000 },
];
let app: Hono;
let database: Server;
let guardedFetch: typeof fetch;
let row: Record<string, unknown>;
let rawNotes: Record<string, unknown>[];
let storedAssessment: Record<string, unknown> | undefined;
let prompt = "";
let responseSchema = "";
let usage: Record<string, unknown>[] = [];
let unknownRequests: string[] = [];
let coachingComplete = false;

const repetition = () => ({
  line: 3,
  quote: messages[2]!.text,
  category: "repetition",
  verdict: "fix",
  note: "Janji pemeriksaan diulang tanpa informasi baru.",
  example: "Mohon nomor tiketnya agar saya dapat memeriksa tagihan Ibu.",
  relatedLine: 2,
  relatedQuote: messages[1]!.text,
});

async function score(notes: Record<string, unknown>[]) {
  rawNotes = notes;
  storedAssessment = undefined;
  usage = [];
  unknownRequests = [];
  coachingComplete = false;
  row = {
    id: sessionId,
    user_id: actorId,
    status: "completed",
    scoring_status: "pending",
    scenario_title: "Tagihan uji",
    telefun_transport: "gemini-ws",
    agent_recording_path: `${actorId}/${sessionId}/agent.webm`,
    session_metrics: null,
    voice_assessment: null,
    messages,
  };
  const response = await app.request(`http://localhost/score/${sessionId}`, {
    method: "POST",
  });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  await expect.poll(() => coachingComplete).toBe(true);
  expect(unknownRequests).toEqual([]);
  return body.data.assessment;
}

test.beforeAll(async () => {
  database = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const payload = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    const reply = (data: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && url.pathname === "/rest/v1/telefun_history")
      return reply([row]);
    if (
      req.method === "GET" &&
      url.pathname.startsWith("/storage/v1/object/")
    ) {
      res.writeHead(200, { "content-type": "audio/webm" });
      res.end(Buffer.from("local-audio-fixture"));
      return;
    }
    if (url.pathname === "/rest/v1/rpc/claim_telefun_scoring")
      return reply(true);
    if (url.pathname === "/rest/v1/rpc/complete_telefun_scoring") {
      storedAssessment = payload.p_voice_assessment;
      row.voice_assessment = storedAssessment;
      row.scoring_status = "completed";
      return reply(true);
    }
    if (url.pathname === "/rest/v1/rpc/upsert_telefun_coaching_summary") {
      coachingComplete = true;
      return reply(true);
    }
    if (
      req.method === "GET" &&
      [
        "/rest/v1/ai_pricing_settings",
        "/rest/v1/ai_pricing_schedule",
        "/rest/v1/ai_billing_settings",
      ].includes(url.pathname)
    )
      return reply([]);
    if (req.method === "POST" && url.pathname === "/rest/v1/ai_usage_logs") {
      usage.push(payload);
      return reply(null);
    }
    unknownRequests.push(`${req.method} ${url.pathname}`);
    res.writeHead(500);
    res.end("Unmocked local boundary");
  });
  await new Promise<void>((resolve) =>
    database.listen(0, "127.0.0.1", resolve),
  );
  const address = database.address();
  if (!address || typeof address === "string")
    throw new Error("No local fixture port");
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    VITE_SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-only",
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
    GEMINI_PROXY_URL: "",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname !== "generativelanguage.googleapis.com")
      return guardedFetch(request);
    const payload = await request.json();
    const isAssessment = payload.contents[0].parts.some(
      (p: { inlineData?: unknown }) => p.inlineData,
    );
    let result: unknown = [];
    if (isAssessment) {
      prompt = payload.contents[0].parts.find(
        (p: { text?: string }) => p.text,
      ).text;
      responseSchema = JSON.stringify(payload.generationConfig.responseSchema);
      result = {
        ...voiceAssessment(),
        caseCore: "Tagihan belum berubah.",
        consumerPoints: [],
        agentNotes: rawNotes,
      };
    }
    return Response.json({
      candidates: [
        {
          content: { role: "model", parts: [{ text: JSON.stringify(result) }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });
  };
  const { scoreRecording } =
    await import("../../api/src/routes/telefun/recording-scoring");
  const mounted = new Hono();
  mounted.use("*", async (c, next) => {
    c.set("user" as never, { id: actorId } as never);
    await next();
  });
  mounted.post("/score/:id", scoreRecording as never);
  app = mounted;
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  await new Promise<void>((resolve, reject) =>
    database?.close((error) => (error ? reject(error) : resolve())),
  );
});

test("scoring persists categorized repetition with both quotes and effectiveness without changing the score", async () => {
  const assessment = await score([
    repetition(),
    {
      line: 4,
      quote: "Untuk dapat bisa memeriksa",
      category: "effectiveness",
      verdict: "fix",
      note: "Dapat dan bisa menyampaikan makna yang sama.",
      example: "Untuk memeriksa, mohon nomor tiketnya.",
      relatedLine: null,
      relatedQuote: null,
    },
  ]);
  const notes = assessment.contentReview.agentNotes;
  expect(notes[0]).toMatchObject({
    category: "repetition",
    startMs: 2000,
    startOffset: 0,
    comparison: {
      startMs: 1000,
      quote: "Saya akan memeriksa tagihan Ibu",
      startOffset: 0,
    },
  });
  expect(notes[1]).toMatchObject({
    category: "effectiveness",
    quote: "Untuk dapat bisa memeriksa",
  });
  expect(storedAssessment).toEqual(assessment);
  expect(assessment.overallScore).toBe(7.6);
  expect(prompt).toContain("konfirmasi");
  expect(prompt).toContain("repetition");
  expect(prompt).toContain("effectiveness");
  expect(responseSchema).toContain("relatedQuote");
  expect(usage).toHaveLength(2); // Existing assessment + coaching; no extra AI call.
  expect(usage.every((log) => log.user_id === actorId)).toBe(true);
});

// Characterization of the evidence boundary through the same HTTP flow: the
// new category may not manufacture a pair from absent/forward/wrong-speaker text.
test("invalid repetition evidence is discarded while necessary confirmation and legacy notes survive", async () => {
  const legacy = {
    line: 4,
    quote: "mohon nomor tiketnya",
    verdict: "good",
    note: "Catatan lama tanpa kategori.",
    example: null,
  };
  const confirmation = {
    ...legacy,
    category: "confirmation",
    note: "Konfirmasi nomor tiket diperlukan untuk pemeriksaan.",
  };
  const assessment = await score([
    { ...repetition(), relatedLine: null, relatedQuote: null },
    { ...repetition(), relatedLine: 1, relatedQuote: messages[0]!.text },
    { ...repetition(), relatedLine: 4, relatedQuote: "mohon nomor tiketnya" },
    { ...repetition(), line: 1 },
    { ...repetition(), line: 2, relatedLine: 2 },
    { ...repetition(), relatedLine: 999 },
    { ...repetition(), relatedQuote: "ucapan yang tidak ada" },
    { ...repetition(), quote: "cuplikan buatan" },
    { ...repetition(), category: "intonation" },
    { ...repetition(), example: null },
    legacy,
    confirmation,
  ]);
  expect(assessment.contentReview.agentNotes).toHaveLength(2);
  expect(assessment.contentReview.agentNotes[0].category).toBeUndefined();
  expect(assessment.contentReview.agentNotes[1]).toMatchObject({
    category: "confirmation",
    verdict: "good",
  });
  expect(
    assessment.contentReview.agentNotes.every(
      (note: { comparison?: unknown }) => !note.comparison,
    ),
  ).toBe(true);
  expect(assessment.overallScore).toBe(7.6);
});

test("same-line repetitions retain distinct exact offsets and the stored note list is bounded at sixteen", async () => {
  const sameLine = {
    ...repetition(),
    line: 5,
    quote: "Mohon tunggu",
    relatedLine: 5,
    relatedQuote: "Mohon tunggu",
  };
  const categories = [
    "effectiveness",
    "clarity",
    "empathy",
    "politeness",
    "accuracy",
    "confirmation",
  ];
  const assessment = await score([
    sameLine,
    ...Array.from({ length: 16 }, (_, index) => ({
      line: 2,
      quote: "Saya akan memeriksa",
      category: categories[index % categories.length],
      verdict: "good",
      note: `Observasi kontekstual ${index + 1}.`,
      example: null,
    })),
  ]);
  const notes = assessment.contentReview.agentNotes;
  expect(notes).toHaveLength(16);
  expect(notes[0]).toMatchObject({
    category: "repetition",
    startMs: 4000,
    startOffset: 14,
    comparison: { startMs: 4000, startOffset: 0 },
  });
  for (const category of categories)
    expect(
      notes.some((note: { category: string }) => note.category === category),
    ).toBe(true);
  expect(storedAssessment).toEqual(assessment);
});
