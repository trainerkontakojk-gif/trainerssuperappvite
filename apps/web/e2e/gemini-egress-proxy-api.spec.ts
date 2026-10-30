import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { DEFAULT_TELEFUN_LIVE_MODEL_ID } from "@trainers/types";
import {
  bootLocalService,
  type LocalService,
} from "./helpers/bootLocalService";

const require = createRequire(
  new URL("../../telefun/package.json", import.meta.url),
);
const { WebSocket } =
  require("ws") as typeof import("../../telefun/node_modules/@types/ws");
const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "http://127.0.0.1:3005";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function fixtures(service: LocalService) {
  const targets: string[] = [];
  const requests: string[] = [];
  const unexpected: string[] = [];
  const proxy = createServer((_req, res) => res.writeHead(500).end());
  proxy.on("connect", (req, socket) => {
    targets.push(req.url ?? "");
    socket.end(
      "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
  });
  const supabase = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://stub").pathname;
    requests.push(`${req.method} ${path}`);
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
          role: service === "api" ? "trainer" : "agent",
          status: "active",
          is_deleted: false,
        }),
      );
    } else if (req.method === "GET" && path === "/rest/v1/telefun_history") {
      res.end(
        JSON.stringify({
          id: SESSION,
          user_id: USER,
          agent_recording_path: "e2e.webm",
        }),
      );
    } else if (
      req.method === "GET" &&
      path === "/storage/v1/object/telefun-recordings/e2e.webm"
    ) {
      res.setHeader("Content-Type", "audio/webm");
      res.end(Buffer.from("local-e2e-audio"));
    } else if (
      req.method === "POST" &&
      path === "/rest/v1/rpc/cleanup_pdkt_mailbox_subject_intents"
    ) {
      res.end("0");
    } else if (req.method === "PATCH" && path === "/rest/v1/telefun_history") {
      res.writeHead(204).end();
    } else {
      unexpected.push(`${req.method} ${path}`);
      res
        .writeHead(500)
        .end(JSON.stringify({ message: "Unexpected stub request" }));
    }
  });
  const proxyUrl = await listen(proxy);
  const supabaseUrl = await listen(supabase);
  return {
    targets,
    requests,
    unexpected,
    proxyUrl,
    supabaseUrl,
    async close() {
      for (const server of [proxy, supabase]) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
      }
    },
  };
}

function boot(service: LocalService, supabaseUrl: string, proxyUrl?: string) {
  return bootLocalService(
    service,
    supabaseUrl,
    proxyUrl === undefined ? {} : { GEMINI_PROXY_URL: proxyUrl },
  );
}

async function telefunCall(url: string) {
  const ws = new WebSocket(url.replace("http:", "ws:") + "/ws", {
    origin: ORIGIN,
  });
  try {
    const closed = once(ws, "close");
    await once(ws, "open");
    const authenticated = once(ws, "message");
    ws.send(
      JSON.stringify({
        type: "authenticate",
        token: "e2e",
        sessionId: SESSION,
      }),
    );
    expect(JSON.parse(String((await authenticated)[0]))).toMatchObject({
      type: "auth_ok",
      sessionId: SESSION,
    });
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
    const [code] = await closed;
    expect(code).toBe(1011);
  } finally {
    ws.terminate();
  }
}

for (const service of ["api", "telefun"] as const) {
  for (const mode of ["proxy", "empty", "unset"] as const) {
    test(`${service}: Gemini ${mode}, Supabase tetap langsung, kegagalan tidak fallback`, async ({
      baseURL: _baseURL,
    }, testInfo) => {
      const local = await fixtures(service);
      const app = boot(
        service,
        local.supabaseUrl,
        mode === "proxy"
          ? local.proxyUrl.replace(
              "http://",
              "http://proxy-user:proxy-password@",
            )
          : mode === "empty"
            ? ""
            : undefined,
      );
      try {
        const url = await app.url();
        if (service === "telefun") {
          await telefunCall(url);
          expect((await fetch(`${url}/health`)).status).toBe(200);
        } else {
          const response = await fetch(
            `${url}/api/v1/telefun/annotations/generate/${SESSION}`,
            {
              method: "POST",
              headers: { Authorization: "Bearer e2e", Origin: ORIGIN },
              signal: AbortSignal.timeout(15000),
            },
          );
          expect(await response.json()).toMatchObject({
            success: false,
            error: {
              code: "NO_ANNOTATIONS",
              message: "AI tidak menghasilkan anotasi.",
            },
          });
          expect(response.status).toBe(500);
          expect((await fetch(`${url}/api/health`)).status).toBe(200);
          expect(local.requests).toContain(
            "GET /storage/v1/object/telefun-recordings/e2e.webm",
          );
        }
        expect(local.requests).toContain("GET /auth/v1/user");
        expect(local.requests).toContain("GET /rest/v1/profiles");
        expect(local.requests).toContain("GET /rest/v1/telefun_history");
        expect(local.unexpected).toEqual([]);
        const expectedConnects = service === "telefun" ? 4 : 1;
        expect(local.targets).toEqual(
          mode === "proxy"
            ? Array(expectedConnects).fill(
                "generativelanguage.googleapis.com:443",
              )
            : [],
        );
        if (mode === "proxy") {
          expect(app.log()).not.toContain("egress-denied");
        } else {
          expect(app.log()).toContain("egress-denied");
        }
        for (const secret of [
          "e2e-gemini-secret",
          "proxy-user",
          "proxy-password",
        ])
          expect(app.log()).not.toContain(secret);
        expect(app.log()).not.toMatch(/Uncaught|Unhandled Rejection/);
        expect(app.child.exitCode).toBeNull();
      } finally {
        await app.close();
        await testInfo.attach("service-log", {
          body: app.log(),
          contentType: "text/plain",
        });
        await testInfo.attach("connect-targets", {
          body: JSON.stringify(local.targets),
          contentType: "application/json",
        });
        await local.close();
      }
    });
  }

  for (const value of [
    "not-a-url",
    "socks5://proxy-user:proxy-password@127.0.0.1:9",
    "http://proxy-user:proxy-password@[",
  ]) {
    test(`${service}: invalid proxy ${value.split(":")[0]} fails before egress`, async ({
      baseURL: _baseURL,
    }, testInfo) => {
      const local = await fixtures(service);
      const app = boot(service, local.supabaseUrl, value);
      try {
        await expect.poll(() => app.child.exitCode, { timeout: 15000 }).toBe(1);
        expect(app.log()).toContain("GEMINI_PROXY_URL");
        expect(app.log()).not.toContain("egress-denied");
        expect(app.log()).not.toContain("e2e-listening");
        for (const secret of [
          "e2e-gemini-secret",
          "proxy-user",
          "proxy-password",
        ])
          expect(app.log()).not.toContain(secret);
        expect(local.targets).toEqual([]);
        expect(local.requests).toEqual([]);
      } finally {
        await app.close();
        await testInfo.attach("service-log", {
          body: app.log(),
          contentType: "text/plain",
        });
        await local.close();
      }
    });
  }
}
