import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

/**
 * KETIK — isi instruksi konsumen AI yang dikirim server ke penyedia AI.
 * Real JWT, router Hono, dan database lokal; penyedia AI ditiru dan spec
 * membaca instruksi pada panggilan Gemini pertama sesi.
 */

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `ketik-prompt-${randomUUID().slice(0, 8)}`;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let guardedFetch: typeof fetch;
let instructions: string[] = [];
let reply = "Halo, mau tanya.";

async function api(path: string, method = "GET", body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

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
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "generativelanguage.googleapis.com") {
      const payload = JSON.parse(await new Request(input, init).text());
      const parts: Array<{ text?: string }> = [
        ...(payload.systemInstruction?.parts ?? []),
        ...(payload.contents ?? []).flatMap(
          (content: { parts?: Array<{ text?: string }> }) =>
            content.parts ?? [],
        ),
      ];
      instructions.push(parts.map((part) => part.text ?? "").join("\n"));
      return Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: reply }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    }
    return guardedFetch(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  if (!trainer) return;
  const admin = createAdmin(env);
  expect(
    (await admin.from("ai_usage_logs").delete().eq("user_id", trainer.userId))
      .error,
  ).toBeNull();
  expect((await admin.auth.admin.deleteUser(trainer.userId)).error).toBeNull();
});

/** Sesi baru dengan tipe konsumen ini dan satu skenario bawaan tanpa skrip. */
async function startSession(consumerTypeId: string) {
  const saved = await api("/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    activeConsumerTypeId: consumerTypeId,
    scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) => ({
      ...scenario,
      isActive: scenario.id === "pinjol",
    })),
    responsePacingMode: "training_fast",
  });
  expect(saved.status).toBe(200);
  const started = await api("/sessions", "POST", { requestId: randomUUID() });
  expect(started.status).toBe(200);
  const session = (await started.json()).data;
  expect(session.config.consumerType.id).toBe(consumerTypeId);
  return session;
}

async function sendTurn(
  sessionId: string,
  expectedVersion: number,
  text: string,
  awaitMore?: true,
) {
  const turn = await api(`/sessions/${sessionId}/turns`, "POST", {
    requestId: randomUUID(),
    expectedVersion,
    text,
    ...(awaitMore ? { awaitMore } : {}),
  });
  expect(turn.status).toBe(200);
  return (await turn.json()).data;
}

/** Instruksi untuk balasan pertama konsumen pada tipe ini. */
async function firstTurnInstruction(consumerTypeId: string): Promise<string> {
  const session = await startSession(consumerTypeId);
  instructions = [];
  await sendTurn(
    session.id,
    0,
    "Selamat siang, dengan Kontak OJK 157, ada yang bisa dibantu?",
  );
  expect(instructions).toHaveLength(1);
  return instructions[0];
}

test("angry consumer: no helper role, no hints, gradual disclosure and hard de-escalation", async () => {
  const prompt = await firstTurnInstruction("marah");

  // Konsumen bukan penolong agen.
  expect(prompt).not.toMatch(/fokuslah membantu agen/i);
  expect(prompt).not.toContain("tetap tanggapi agen");
  // Konsumen tidak tahu jawaban benar dan tidak memberi petunjuk.
  expect(prompt).toContain("POSISI KONSUMEN");
  expect(prompt).toContain("Jangan pernah mengoreksi agen");
  expect(prompt).not.toContain("kanal pelaporan");
  // Info dibuka bertahap walau skenario tanpa skrip.
  expect(prompt).not.toContain("SKRIP PERCAKAPAN");
  expect(prompt).toContain("BUKA INFORMASI BERTAHAP");
  expect(prompt).not.toMatch(/WAJIB menjelaskan masalah/);
  // Marah: satu batas tegas, empati template tidak meredakan.
  expect(prompt).toContain("BATAS SATU-SATUNYA");
  expect(prompt).toContain("Empati template");
  expect(prompt).toContain("CONTOH GAYA CHAT");
  expect(prompt).not.toMatch(/jawab dengan sopan/i);
  expect(prompt).not.toMatch(/terlalu teatrikal, dramatis/);
  // Skenario bawaan membawa latar belakang.
  expect(prompt).toContain("dua minggu");
  // Cek pemahaman ("sudah jelas?") dijawab jujur sesuai tipe.
  expect(prompt).toContain("CEK PEMAHAMAN");
  expect(prompt).toContain("Kok buru-buru");
  // Ekspresif: lo/gue, logat sesuai kota, ekspresi tulisan; percaya bukan berarti reda.
  expect(prompt).toContain("GAYA BAHASA DAN EKSPRESI");
  expect(prompt).toContain("lo/gue");
  expect(prompt).toContain("identity.city");
  expect(prompt).toContain("huruf kapital");
  expect(prompt).toContain("tidak langsung membuat emosimu reda");
  // Larangan typo dan konsistensi identitas tetap.
  expect(prompt).toContain("jangan sengaja membuat typo");
  expect(prompt).toContain("JANGAN MENGARANG DATA BARU");
});

test("friendly consumer keeps calm etiquette and no anger rules", async () => {
  const prompt = await firstTurnInstruction("ramah");

  expect(prompt).toContain("POSISI KONSUMEN");
  expect(prompt).toContain("BUKA INFORMASI BERTAHAP");
  expect(prompt).not.toContain("BATAS SATU-SATUNYA");
  // Tipe tenang tidak lagi dilarang berekspresi, tetapi typo tetap dilarang.
  expect(prompt).not.toMatch(/teatrikal/);
  expect(prompt).toContain("GAYA BAHASA DAN EKSPRESI");
  expect(prompt).toContain("jangan sengaja membuat typo");
  expect(prompt).toContain("CONTOH GAYA CHAT");
});

test("agent messages sent back to back get one consumer reply that reads them all", async () => {
  const session = await startSession("ramah");
  const explanation =
    "Baik Ibu, untuk pinjol ilegal silakan simpan bukti ancaman dan jangan transfer apa pun.";
  const checkIn = "Apakah informasinya sudah cukup jelas, Ibu?";
  instructions = [];
  const waiting = await sendTurn(session.id, 0, explanation, true);
  // Pesan agen tersimpan tanpa balasan AI, dan chat tidak ditutup.
  expect(instructions).toHaveLength(0);
  expect(waiting.consumerClosed).toBe(false);
  expect(waiting.messages.at(-1)).toMatchObject({
    sender: "agent",
    text: explanation,
  });
  const replied = await sendTurn(session.id, waiting.version, checkIn);
  expect(instructions).toHaveLength(1);
  expect(instructions[0]).toContain(explanation);
  expect(instructions[0]).toContain(checkIn);
  expect(instructions[0]).toContain("BEBERAPA PESAN AGEN");
  expect(
    replied.messages.map((m: { sender: string }) => m.sender).slice(-3),
  ).toEqual(["agent", "agent", "consumer"]);
});

test("scenario attachments are offered with their descriptions and say when to send them", async () => {
  const saved = await api("/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    activeConsumerTypeId: "ramah",
    scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) =>
      scenario.id === "pinjol"
        ? {
            ...scenario,
            images: ["https://img.test/a.png", "https://img.test/b.png"],
            imageAlts: [
              "Tangkapan layar ancaman penagih di WhatsApp",
              "Bukti transfer cicilan ke rekening pinjol",
            ],
          }
        : { ...scenario, isActive: false },
    ),
    responsePacingMode: "training_fast",
  });
  expect(saved.status).toBe(200);
  const started = await api("/sessions", "POST", { requestId: randomUUID() });
  expect(started.status).toBe(200);
  const session = (await started.json()).data;
  instructions = [];
  await sendTurn(session.id, 0, "Boleh kirim bukti ancamannya, Ibu?");
  expect(instructions).toHaveLength(1);
  const prompt = instructions[0];
  // Each attachment is offered by index with its description.
  expect(prompt).toContain(
    'Indeks 0: "Tangkapan layar ancaman penagih di WhatsApp"',
  );
  expect(prompt).toContain(
    'Indeks 1: "Bukti transfer cicilan ke rekening pinjol"',
  );
  // The instruction says when an attachment belongs in the chat.
  expect(prompt).toContain("KAPAN MENGIRIM LAMPIRAN");
  expect(prompt).toMatch(/agen meminta bukti/i);
  // Attachments go out proactively; gradual disclosure no longer holds them back.
  expect(prompt).toContain("tanpa menunggu diminta");
  expect(prompt).not.toMatch(/kronologi, bukti\)/);
  expect(prompt).toContain("Lampiran gambar tidak ikut aturan bertahap ini");
  expect(prompt).toContain("sesuai keterangannya");
  expect(prompt).toContain("Setiap lampiran cukup dikirim sekali");
  expect(prompt).toContain("[SEND_IMAGE: indeks]");
});

/** Sesi pinjol dengan dua lampiran berketerangan. */
async function startAttachmentSession() {
  const saved = await api("/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    activeConsumerTypeId: "ramah",
    scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) =>
      scenario.id === "pinjol"
        ? {
            ...scenario,
            images: ["https://img.test/a.png", "https://img.test/b.png"],
            imageAlts: [
              "Tangkapan layar ancaman penagih di WhatsApp",
              "Bukti transfer cicilan ke rekening pinjol",
            ],
          }
        : { ...scenario, isActive: false },
    ),
    responsePacingMode: "training_fast",
  });
  expect(saved.status).toBe(200);
  const started = await api("/sessions", "POST", { requestId: randomUUID() });
  expect(started.status).toBe(200);
  return (await started.json()).data;
}

const consumerTexts = (messages: Array<{ sender: string; text: string }>) =>
  messages.filter((m) => m.sender === "consumer").map((m) => m.text);

test("backend sends the matching attachment when the agent asks for proof and the AI forgot", async () => {
  const session = await startAttachmentSession();
  reply = "Ada kak, sebentar ya";
  try {
    const data = await sendTurn(
      session.id,
      0,
      "Boleh kirim bukti ancamannya, Ibu?",
    );
    expect(consumerTexts(data.messages)).toEqual([
      "Ada kak, sebentar ya",
      "[SEND_IMAGE: 0]",
    ]);
  } finally {
    reply = "Halo, mau tanya.";
  }
});

test("backend sends an attachment once the consumer tells what it shows, and never twice", async () => {
  const session = await startAttachmentSession();
  try {
    reply = "Saya sudah transfer cicilan ke rekening mereka tapi tetap ditagih";
    const first = await sendTurn(
      session.id,
      0,
      "Kronologinya bagaimana, Ibu?",
    );
    expect(consumerTexts(first.messages)).toEqual([
      "Saya sudah transfer cicilan ke rekening mereka tapi tetap ditagih",
      "[SEND_IMAGE: 1]",
    ]);

    reply = "Iya kak, transfer cicilan itu sudah lunas";
    const second = await sendTurn(
      session.id,
      first.version,
      "Transfernya kapan, Ibu?",
    );
    expect(consumerTexts(second.messages).slice(2)).toEqual([
      "Iya kak, transfer cicilan itu sudah lunas",
    ]);

    // A plain reply with no proof request and no matching topic stays as is.
    reply = "Halo, mau tanya.";
    const third = await sendTurn(session.id, second.version, "Baik, Ibu.");
    expect(consumerTexts(third.messages).at(-1)).toBe("Halo, mau tanya.");
    expect(consumerTexts(third.messages)).toHaveLength(4);
  } finally {
    reply = "Halo, mau tanya.";
  }
});
