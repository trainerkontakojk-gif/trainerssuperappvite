import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import { createServer, type Server } from "node:http";
import { installLoopbackFetchGuard } from "./helpers/sidakRealBackend";

// Real PDKT Hono routes and email policy. Supabase is a local stub (this flow
// writes nothing) and the Gemini call is answered inside this worker, so the
// spec sees exactly the instruction the consumer AI receives.
test.describe.configure({ mode: "default" });

const actorId = "10000000-0000-4000-8000-000000000042";
let app: Hono;
let database: Server;
let guardedFetch: typeof globalThis.fetch;
let nextEmail: { subject: string; body: string } = { subject: "", body: "" };
let instructions: string[] = [];

const filler =
  "Saya juga sudah berusaha menghubungi mereka lewat aplikasi dan nomor yang tertera tetapi tidak pernah ada jawaban yang jelas sama sekali dari pihak mereka";

function paragraph(lead: string, words = 135): string {
  const text = `${lead} ${filler}`.split(" ");
  while (text.length < words) text.push(...filler.split(" "));
  return `${text.slice(0, words).join(" ")}.`;
}

function emailBody(parts: {
  greeting?: string;
  leads: string[];
  signoff?: string;
}) {
  return [
    parts.greeting,
    ...parts.leads.map((lead) => paragraph(lead)),
    parts.signoff,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function count(text: string, word: string): number {
  return text.match(new RegExp(`\\b${word}\\b`, "g"))?.length ?? 0;
}

async function startSession(input: {
  consumerTypeId: string;
  mentionPattern: "none" | "upfront" | "middle" | "late";
  identity?: { name: string; bodyName: string };
}) {
  instructions = [];
  const identity = input.identity ?? { name: "Budi Santoso", bodyName: "Budi" };
  const response = await app.request("http://local.test/v1/pdkt/session/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "pinjol",
      consumerTypeId: input.consumerTypeId,
      identity: {
        ...identity,
        email: "konsumen@mail.test",
        city: "Bandung",
      },
      enableImageGeneration: false,
      resolvedConsumerNameMentionPattern: input.mentionPattern,
      writingStyleMode: "training",
    }),
  });
  const json = (await response.json()) as {
    success: boolean;
    data?: { body: string };
    error?: unknown;
  };
  return { status: response.status, json, body: json.data?.body ?? "" };
}

test.beforeAll(async () => {
  database = createServer((req, res) => {
    // The daily PDKT limit is not under test here: every start is allowed.
    if (req.url?.startsWith("/rest/v1/rpc/consume_practice_quota")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ allowed: true, reason: "counted" }));
      return;
    }
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "E2E_DB_UNAVAILABLE", message: "stub" }));
  });
  await new Promise<void>((resolve) =>
    database.listen(0, "127.0.0.1", resolve),
  );
  const address = database.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local stub port");
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    VITE_SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-only",
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname !== "generativelanguage.googleapis.com")
      return guardedFetch(request);
    const payload = (await request.json()) as {
      systemInstruction?: { parts?: Array<{ text?: string }> };
    };
    instructions.push(payload.systemInstruction?.parts?.[0]?.text ?? "");
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: JSON.stringify(nextEmail) }],
          },
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

  const { pdkt } = await import("../../api/src/routes/pdkt");
  const mounted = new Hono<{
    Variables: { user: unknown; profile: unknown; token: string };
  }>();
  mounted.use("*", async (c, next) => {
    c.set("user", { id: actorId, email: "agent@local.test" });
    c.set("profile", { role: "agent", status: "active", full_name: "Agen" });
    c.set("token", "e2e-only");
    await next();
  });
  mounted.route("/v1/pdkt", pdkt as never);
  app = mounted as unknown as Hono;
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  await new Promise<void>((resolve, reject) =>
    database?.close((error) => (error ? reject(error) : resolve())),
  );
});

test("a consumer named Agus can write about August without failing the name check", async () => {
  nextEmail = {
    subject: "Tolong ditindak",
    body: emailBody({
      greeting: "Yth. Bapak/Ibu,",
      leads: [
        "Sejak tanggal 5 Agustus saya terus ditelepon penagih",
        "Kondisi ekonomi keluarga saya sedang sulit dan hasil tes saya positif",
        "Mereka mengirim pesan ke semua kontak saya",
        "Saya minta data saya dihapus",
      ],
      signoff: "Hormat saya,",
    }),
  };

  const result = await startSession({
    consumerTypeId: "marah",
    mentionPattern: "none",
    identity: { name: "Agus Setiawan", bodyName: "Agus" },
  });

  expect(result.status, JSON.stringify(result.json)).toBe(200);
  expect(result.body).toContain("5 Agustus");
  expect(instructions).toHaveLength(1);
});

test("a name shown up front lands after the greeting and is not written twice", async () => {
  nextEmail = {
    subject: "",
    body: emailBody({
      greeting: "Yth. Bapak/Ibu Pengaduan,",
      leads: [
        "Saya Budi, saya kesal sekali karena terus ditagih",
        "Mereka menelepon kantor saya",
        "Saya tidak pernah meminjam",
        "Tolong hentikan semua ini",
      ],
      signoff: "Hormat saya,",
    }),
  };
  const named = await startSession({
    consumerTypeId: "marah",
    mentionPattern: "upfront",
  });
  expect(named.status, JSON.stringify(named.json)).toBe(200);
  expect(named.body.startsWith("Yth. Bapak/Ibu Pengaduan,")).toBe(true);
  expect(count(named.body, "Budi")).toBe(1);

  nextEmail = {
    ...nextEmail,
    body: nextEmail.body.replace("Saya Budi, saya", "Saya"),
  };
  const unnamed = await startSession({
    consumerTypeId: "marah",
    mentionPattern: "upfront",
  });
  expect(unnamed.status, JSON.stringify(unnamed.json)).toBe(200);
  expect(unnamed.body.startsWith("Yth. Bapak/Ibu Pengaduan,")).toBe(true);
  expect(count(unnamed.body, "Budi")).toBe(1);
});

test("a name shown late goes into the signature, with nothing after it", async () => {
  nextEmail = {
    subject: "",
    body: emailBody({
      greeting: "Yth. Bapak/Ibu,",
      leads: [
        "Saya terus ditagih padahal tidak pernah meminjam",
        "Mereka menelepon keluarga saya",
        "Saya sudah melapor ke aplikasinya",
        "Mohon dibantu secepatnya",
      ],
      signoff: "Hormat saya,",
    }),
  };

  const result = await startSession({
    consumerTypeId: "pasrah",
    mentionPattern: "late",
  });

  expect(result.status, JSON.stringify(result.json)).toBe(200);
  expect(result.body.endsWith("Hormat saya,\nBudi")).toBe(true);
  expect(count(result.body, "Budi")).toBe(1);

  // The AI signs with the full account name; the body keeps the short name.
  nextEmail = {
    ...nextEmail,
    body: `${nextEmail.body}\nBudi Santoso`,
  };
  const signed = await startSession({
    consumerTypeId: "pasrah",
    mentionPattern: "late",
  });
  expect(signed.status, JSON.stringify(signed.json)).toBe(200);
  expect(signed.body.endsWith("Hormat saya,\nBudi")).toBe(true);
  expect(signed.body).not.toContain("Santoso");
});

test("the consumer AI is told to stay in character, stay a layperson, and make the email hard to skim", async () => {
  nextEmail = {
    subject: "",
    body: emailBody({
      greeting: "Yth. Bapak/Ibu,",
      leads: ["Satu", "Dua", "Tiga", "Empat"],
      signoff: "Salam,",
    }),
  };

  for (const consumerTypeId of ["terburu-buru", "marah", "kritis"]) {
    const result = await startSession({
      consumerTypeId,
      mentionPattern: "none",
    });
    expect(result.status, JSON.stringify(result.json)).toBe(200);
    const [instruction] = instructions;

    // Long text for every type, rushed included.
    expect(instruction).toContain("500-1000 kata");
    // Personality is an instruction, written outside the data block.
    const persona = instruction.replace(
      /<generation_context_data>[\s\S]*<\/generation_context_data>/,
      "",
    );
    expect(persona).toContain(`KEPRIBADIAN (${consumerTypeId})`);
    // The consumer never supplies the right answer.
    expect(instruction).toContain("ORANG AWAM");
    // Reading challenge instead of one tidy topic per paragraph.
    expect(instruction).toContain("TANTANGAN MEMBACA");
    expect(instruction).toContain("lampiran");
    expect(instruction).not.toContain(
      "Setiap paragraf harus membahas aspek berbeda",
    );
  }
});
