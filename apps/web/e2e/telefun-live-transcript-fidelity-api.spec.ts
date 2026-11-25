import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { createRequire } from "node:module";
import { connect as connectTcp, type Socket } from "node:net";
import { expect, test } from "@playwright/test";
import { DEFAULT_TELEFUN_LIVE_MODEL_ID } from "@trainers/types";
import { bootLocalService } from "./helpers/bootLocalService";

// Real Telefun server, fake Gemini Live. The fake speaks TLS as
// generativelanguage.googleapis.com behind the GEMINI_PROXY_URL tunnel, with a
// throwaway certificate trusted only by the spawned server.
const require = createRequire(
  new URL("../../telefun/package.json", import.meta.url),
);
const { WebSocket, WebSocketServer } =
  require("ws") as typeof import("../../telefun/node_modules/@types/ws");
const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "http://127.0.0.1:3005";
const GEMINI_HOST = "generativelanguage.googleapis.com";

// Incremental Gemini transcription chunks for two turns. The agent repeats
// "Halo?" and a chunk (" H") equals the start of the text so far; the
// consumer lane carries stage directions, ASR tags and control markers.
const UPSTREAM_SCRIPT = [
  { inputTranscription: { text: "Halo?" } },
  { inputTranscription: { text: " Halo?" } },
  { inputTranscription: { text: " H" } },
  { inputTranscription: { text: "ari ini saya bantu cek SLIK-nya." } },
  { inputTranscription: { text: " <noise>" } },
  { outputTranscription: { text: "(teri" } },
  { outputTranscription: { text: "sak) Mbak, saya " } },
  { outputTranscription: { text: "*menghela napas* sudah bayar" } },
  { outputTranscription: { text: " tapi masih ditagih." } },
  {
    outputTranscription: {
      text: " [TELEFUN_CONTROL:TONE] Ketus, tidak sabar, nada tinggi.",
    },
  },
  { turnComplete: true },
  { inputTranscription: { text: "Mohon ditunggu sebentar, Bu." } },
  { outputTranscription: { text: "Telefun control tone, " } },
  { outputTranscription: { text: "suara bergetar. Iya, saya tunggu." } },
  { turnComplete: true },
].map((serverContent) => ({ serverContent }));

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

function issueCertificate(dir: string) {
  mkdirSync(dir, { recursive: true });
  const key = `${dir}/gemini-key.pem`;
  const cert = `${dir}/gemini-cert.pem`;
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${GEMINI_HOST}`,
      "-addext",
      `subjectAltName=DNS:${GEMINI_HOST}`,
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { stdio: "pipe" },
  );
  return { key, cert };
}

async function fixtures(certDir: string) {
  const { key, cert } = issueCertificate(certDir);
  const setups: Record<string, any>[] = [];
  const gemini = createTlsServer({
    key: readFileSync(key),
    cert: readFileSync(cert),
  });
  const upstream = new WebSocketServer({ server: gemini });
  upstream.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (!message.setup) return;
      setups.push(message.setup);
      socket.send(JSON.stringify({ setupComplete: {} }));
      for (const step of UPSTREAM_SCRIPT) socket.send(JSON.stringify(step));
    });
  });
  const geminiPort = await listen(gemini);

  const tunnels: string[] = [];
  // CONNECT tunnels leave the HTTP server's connection tracking, so
  // closeAllConnections() cannot end them; destroy them explicitly.
  const tunnelSockets = new Set<Socket>();
  const proxy = createServer((_req, res) => res.writeHead(500).end());
  proxy.on("connect", (req, client: Socket, head) => {
    tunnels.push(req.url ?? "");
    const target = connectTcp(geminiPort, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) target.write(head);
      target.pipe(client);
      client.pipe(target);
    });
    tunnelSockets.add(client).add(target);
    target.on("error", () => client.destroy());
    client.on("error", () => target.destroy());
  });
  const proxyPort = await listen(proxy);

  const saved: Record<string, any>[] = [];
  const unexpected: string[] = [];
  const supabase = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://stub").pathname;
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && path === "/auth/v1/user") {
        res.end(
          JSON.stringify({
            id: USER,
            email: "e2e@example.invalid",
            aud: "authenticated",
          }),
        );
      } else if (req.method === "GET" && path === "/rest/v1/profiles") {
        res.end(
          JSON.stringify({
            id: USER,
            role: "agent",
            status: "active",
            is_deleted: false,
          }),
        );
      } else if (req.method === "GET" && path === "/rest/v1/telefun_history") {
        res.end(JSON.stringify({ id: SESSION }));
      } else if (
        req.method === "PATCH" &&
        path === "/rest/v1/telefun_history"
      ) {
        saved.push(JSON.parse(body));
        res.writeHead(204).end();
      } else {
        unexpected.push(`${req.method} ${path}`);
        res
          .writeHead(500)
          .end(JSON.stringify({ message: "Unexpected stub request" }));
      }
    });
  });
  const supabasePort = await listen(supabase);

  return {
    cert,
    setups,
    tunnels,
    saved,
    unexpected,
    proxyUrl: `http://127.0.0.1:${proxyPort}`,
    supabaseUrl: `http://127.0.0.1:${supabasePort}`,
    async close() {
      for (const socket of tunnelSockets) socket.destroy();
      for (const client of upstream.clients) client.terminate();
      upstream.close();
      for (const server of [gemini, proxy, supabase]) await close(server);
    },
  };
}

async function runCall(url: string) {
  const ws = new WebSocket(url.replace("http:", "ws:") + "/ws", {
    origin: ORIGIN,
  });
  const received: Record<string, any>[] = [];
  ws.on("message", (raw) => received.push(JSON.parse(String(raw))));
  try {
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        type: "authenticate",
        token: "e2e",
        sessionId: SESSION,
      }),
    );
    await expect
      .poll(() => received.some((m) => m.type === "auth_ok"))
      .toBe(true);
    ws.send(
      JSON.stringify({
        type: "telefun_session_configure",
        modelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
        transport: "gemini-live",
        voice: "Kore",
        instructions: "Latihan lokal.",
        inputAudio: { format: "pcm16", sampleRate: 16000 },
        responsePacingMode: "realistic",
      }),
    );
    await expect
      .poll(() => received.some((m) => m.type === "telefun_session_configured"))
      .toBe(true);
    ws.send(JSON.stringify({ setup: {} }));
    await expect
      .poll(() => received.filter((m) => m.serverContent?.turnComplete).length)
      .toBe(2);
  } finally {
    const closed = once(ws, "close");
    ws.close(1000);
    await closed;
  }
}

test("Telefun menyimpan transkrip Gemini Live utuh, berpetunjuk bahasa, tanpa bocoran arahan", async ({
  baseURL: _baseURL,
}, testInfo) => {
  const local = await fixtures(testInfo.outputDir);
  const app = bootLocalService("telefun", local.supabaseUrl, {
    GEMINI_PROXY_URL: local.proxyUrl,
    NODE_EXTRA_CA_CERTS: local.cert,
  });
  try {
    await runCall(await app.url());

    // Language hints reach Gemini on both transcription lanes.
    expect(local.tunnels).toEqual([`${GEMINI_HOST}:443`]);
    expect(local.setups).toHaveLength(1);
    for (const lane of [
      "inputAudioTranscription",
      "outputAudioTranscription",
    ]) {
      expect(local.setups[0]![lane].languageCodes).toEqual(["id-ID", "en-US"]);
      expect(local.setups[0]![lane].customVocabulary).toEqual(
        expect.arrayContaining(["OJK", "SLIK", "pinjol", "157"]),
      );
    }

    // Incremental chunks are kept whole; directions and ASR tags are dropped.
    await expect
      .poll(() => local.saved.find((row) => Array.isArray(row.messages)))
      .toBeTruthy();
    const row = local.saved.find((r) => Array.isArray(r.messages))!;
    expect(
      row.messages.map((m: { speaker: string; text: string }) => ({
        speaker: m.speaker,
        text: m.text,
      })),
    ).toEqual([
      {
        speaker: "agent",
        text: "Halo? Halo? Hari ini saya bantu cek SLIK-nya.",
      },
      {
        speaker: "consumer",
        text: "Mbak, saya sudah bayar tapi masih ditagih.",
      },
      { speaker: "agent", text: "Mohon ditunggu sebentar, Bu." },
      { speaker: "consumer", text: "Iya, saya tunggu." },
    ]);

    // Each cleanup is observable in the server log, without transcript text.
    const log = app.log();
    expect(log).toContain("[Telefun] Transcript sanitized");
    expect(log).toMatch(/controlMarker/);
    expect(log).toMatch(/stageDirection/);
    expect(log).toMatch(/noiseTag/);
    for (const leaked of ["Mbak", "terisak", "Ketus", "SLIK-nya"])
      expect(log).not.toContain(leaked);
    expect(local.unexpected).toEqual([]);
    expect(log).not.toMatch(/Uncaught|Unhandled Rejection/);
  } finally {
    await app.close();
    await testInfo.attach("service-log", {
      body: app.log(),
      contentType: "text/plain",
    });
    await local.close();
  }
});
