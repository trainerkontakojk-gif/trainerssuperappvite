import { createServer } from "node:http";
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

const env = readLoopbackEnv();
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guarded: typeof fetch;
let providerOrigin = "";
let output: unknown;
const prompts: string[] = [];
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += String(chunk);
  prompts.push(body);
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      candidates: [
        {
          content: { role: "model", parts: [{ text: JSON.stringify(output) }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    }),
  );
});
test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guarded = globalThis.fetch;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Loopback provider unavailable");
  providerOrigin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "generativelanguage.googleapis.com")
      return guarded(new Request(providerOrigin + url.pathname, request));
    return guarded(request);
  };
  trainer = await createUserWithJwt(
    env,
    "trainer",
    `pdkt-review-${randomUUID()}`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.afterAll(async () => {
  globalThis.fetch = guarded;
  if (trainer) await createAdmin(env).auth.admin.deleteUser(trainer.userId);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("all-score explanations require reply evidence and recipient fallback respects direct OJK replies", async () => {
  const inbound = "Mohon OJK membantu memeriksa laporan saya.";
  const reply =
    "Yth. Kontak OJK 157, mohon periksa laporan saya. Terima kasih.";
  output = {
    score: 85,
    expectedAnswerAlignment: { category: "Sesuai", reason: "Jawaban mengikuti acuan." },
    scoreBreakdown: {
      recipientDirectionScore: 70,
      normativeResponseScore: 85,
      clarityScore: 90,
      typoScore: 90,
      templateComplianceScore: 90,
    },
    typos: [],
    clarityIssues: [],
    contentGaps: [],
    feedback: "Jawaban relevan, tetapi tindak lanjut belum lengkap.",
    annotations: [],
    consumerPoints: [
      {
        quote: inbound,
        summary: "Periksa laporan",
        status: "answered",
        reason: null,
        replyQuote: "mohon periksa laporan saya.",
      },
    ],
    edu: {
      dimensionTips: { clarity: "Ringkas pembuka." },
      dimensionExplanations: {
        recipientDirection: { reason: "r".repeat(2001), quote: "Terima kasih." },
        clarity: {
          reason: "Permintaan disampaikan dengan jelas. private-reference-sentinel",
          quote: "mohon periksa laporan saya.",
        },
        normative: {
          reason: "Alasan palsu tidak boleh diterima.",
          quote: "Kutipan yang tidak ada.",
        },
        typo: { reason: " ", quote: "Terima kasih." },
        template: { reason: "Terlalu panjang.", quote: "x".repeat(301) },
        unknown: { reason: "Dimensi tidak dikenal.", quote: "Terima kasih." },
      },
      actionItems: [],
    },
  };
  const response = await tnaApiRequest(
    app,
    "http://localhost/api/v1/pdkt/mailbox/evaluate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          scenarios: [
            {
              id: "s1",
              category: "Pengaduan",
              title: "Status laporan",
              description: inbound,
              expectedAnswer: "private-reference-sentinel",
              isActive: true,
            },
          ],
          consumerType: { id: "calm", name: "Tenang", description: "Tenang" },
          identity: {
            name: "Rina",
            email: "rina@mail.test",
            city: "Bandung",
            bodyName: "Rina",
          },
          enableImageGeneration: false,
          selectedModel: "gemini-3.8-flash",
          recipientContext: {
            primaryRecipientType: "ojk",
            primaryRecipientAddress: "konsumen@ojk.go.id",
            ccRecipients: [],
            replyIntent: "reply_to_ojk",
          },
        },
        emails: [
          {
            id: "inbound",
            from: "rina@mail.test",
            to: "konsumen@ojk.go.id",
            subject: "Status laporan",
            body: inbound,
            timestamp: new Date().toISOString(),
            isAgent: false,
          },
          {
            id: "reply",
            from: "agent@mail.test",
            to: "konsumen@ojk.go.id",
            subject: "Re: Status laporan",
            body: reply,
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
        ],
      }),
    },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("private-reference-sentinel");
  const result = body.data;
  expect(result.edu.dimensionExplanations).toEqual({
    clarity: {
      reason: "Permintaan disampaikan dengan jelas. inti jawaban yang diharapkan",
      quote: "mohon periksa laporan saya.",
    },
  });
  expect(result.edu.dimensionTips.clarity).toBe("Ringkas pembuka.");
  const recipient = result.edu.actionItems.find(
    (item: { dimension: string }) => item.dimension === "recipientDirection",
  );
  expect(recipient.text).toContain("OJK");
  expect(recipient.text).not.toContain("perusahaan terlapor");
  expect(prompts.join("\n")).toContain("dimensionExplanations");
});
