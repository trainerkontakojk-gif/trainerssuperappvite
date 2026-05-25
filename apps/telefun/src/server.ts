import { createServer } from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { env } from "./env.js";
import { verifyToken } from "./auth.js";
import {
  parseUsageMetadata,
  mergeSnapshot,
  flushLiveUsage,
  type LiveUsageSnapshot,
} from "./usage.js";
import { createSession, updateSession, getOwnedSessionId } from "./db.js";
import { SilenceDetector, UtteranceBuffer } from "./silence.js";
import { TurnManager, TurnState } from "./turn-taking.js";
import {
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  hasGeminiSetupComplete,
} from "./server-protocol.js";

process.on("uncaughtException", (err) =>
  console.error("[Telefun] Uncaught:", err),
);
process.on("unhandledRejection", (reason) =>
  console.error("[Telefun] Unhandled Rejection:", reason),
);

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

function normalizeOrigin(raw: string): string {
  try {
    return `${new URL(raw).protocol}//${new URL(raw).host}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

const allowedOrigins =
  env.ALLOWED_ORIGINS === "*"
    ? []
    : env.ALLOWED_ORIGINS.split(",")
        .map((o) => normalizeOrigin(o.trim()))
        .filter(Boolean);

const MAX_RECONNECT_ATTEMPTS = 3;

function connectGemini(): WebSocket {
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
  return new WebSocket(geminiUrl);
}

wss.on("connection", async (ws, req) => {
  const pendingMessages: string[] = [];
  const transcriptMessages: {
    role: string;
    text: string;
    timestamp: number;
  }[] = [];
  let geminiWs: WebSocket | null = null;
  let isGeminiOpen = false;
  let authed = false;
  let userId = "";
  let sessionId = "";
  const callStartedAt = Date.now();
  const requestId = `telefun-live-${randomUUID()}`;
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  let usageSnapshot: LiveUsageSnapshot | null = null;
  let usageFlushed = false;
  let activeModelId = "gemini-3.1-flash-live-preview";
  let reconnectAttempts = 0;
  let geminiSetupComplete = false;
  const postSetupQueue: string[] = [];

  const silence = new SilenceDetector(5000);
  const utteranceBuffer = new UtteranceBuffer(500, 1000);
  const turnManager = new TurnManager();

  const flushUsage = async () => {
    if (usageFlushed || !authed || !usageSnapshot) return;
    usageFlushed = true;
    await flushLiveUsage(requestId, userId, usageSnapshot, activeModelId);
  };

  const saveAndCloseSession = async (status: string) => {
    const duration = Math.floor((Date.now() - callStartedAt) / 1000);
    if (sessionId) {
      await updateSession(sessionId, {
        status,
        duration_seconds: duration,
        messages: transcriptMessages as unknown[],
      });
    }
  };

  const sendToGemini = (raw: string) => {
    if (geminiWs && isGeminiOpen && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(raw);
    } else {
      pendingMessages.push(raw);
    }
  };

  const setupGeminiWs = () => {
    geminiWs = connectGemini();

    geminiWs.on("open", () => {
      isGeminiOpen = true;
      reconnectAttempts = 0;
      console.log("[Telefun] Gemini Live connected");
      while (pendingMessages.length > 0) {
        const msg = pendingMessages.shift();
        if (msg) {
          try {
            const parsed = JSON.parse(msg);
            if (isGeminiSetupMessage(parsed) || geminiSetupComplete) {
              geminiWs!.send(msg);
            } else {
              postSetupQueue.push(msg);
            }
          } catch {
            geminiWs!.send(msg);
          }
        }
      }
    });

    geminiWs.on("message", (data) => {
      const raw = data.toString();

      if (raw.includes('"usageMetadata"')) {
        try {
          const parsed = JSON.parse(raw);
          const meta = parseUsageMetadata(parsed.usageMetadata);
          if (meta) usageSnapshot = mergeSnapshot(usageSnapshot, meta);
        } catch {
          /* skip */
        }
      }

      // Extract AI text + detect turn boundaries
      try {
        const parsed = JSON.parse(raw);
        if (hasGeminiSetupComplete(parsed)) {
          console.log("[Telefun] Gemini Setup Complete received, opening gate");
          geminiSetupComplete = true;
          while (postSetupQueue.length > 0) {
            const msg = postSetupQueue.shift();
            if (msg) sendToGemini(msg);
          }
        }
        if (parsed.serverContent?.modelTurn?.parts) {
          turnManager.startAiSpeaking();
          for (const part of parsed.serverContent.modelTurn.parts) {
            if (part.text) {
              transcriptMessages.push({
                role: "ai",
                text: part.text,
                timestamp: Date.now(),
              });
            }
          }
        }
        if (parsed.serverContent?.turnComplete) {
          turnManager.endAiSpeaking();
        }
      } catch {
        /* skip */
      }

      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    });

    geminiWs.on("error", () => {
      void saveAndCloseSession("failed").then(() => flushUsage());
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Gemini API Error");
    });

    geminiWs.on("close", (code, reason) => {
      console.log(
        `[Telefun] Gemini closed: ${code} (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
      );
      isGeminiOpen = false;
      geminiSetupComplete = false;
      postSetupQueue.length = 0;

      // Attempt reconnect on non-clean close
      if (code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
        console.log(
          `[Telefun] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
        );
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            setupGeminiWs();
          }
        }, delay);
        return;
      }

      void flushUsage();
      const safeCode =
        (code >= 3000 && code <= 4999) || (code >= 1000 && code <= 1013)
          ? code
          : 1011;
      if (ws.readyState === WebSocket.OPEN)
        ws.close(safeCode, reason.toString().slice(0, 123));
    });
  };

  // Silence handler: send gentle prompt to user
  silence.onSilence(() => {
    console.log("[Telefun] Silence detected > 5s");
    try {
      ws.send(
        JSON.stringify({
          type: "silence",
          message: "Saya masih mendengarkan. Silakan lanjutkan.",
        }),
      );
    } catch {
      /* ignore */
    }
  });

  // Message handler: validate and forward structured JSON to Gemini Live
  ws.on("message", (data) => {
    silence.ping();
    if (typeof data !== "string" && !Buffer.isBuffer(data)) {
      console.warn("[Telefun] Unsupported binary message type");
      return;
    }

    const raw = data.toString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[Telefun] Dropping non-JSON client message");
      return;
    }

    if (!isGeminiForwardableMessage(parsed)) {
      console.warn("[Telefun] Dropping unsupported client JSON message");
      return;
    }

    if ((parsed as any).setup?.model) {
      activeModelId = (parsed as any).setup.model.replace(/^models\//, "");
    }

    // Extract user text for transcript
    if ((parsed as any).clientContent?.turns) {
      for (const turn of (parsed as any).clientContent.turns) {
        for (const part of turn.parts || []) {
          if (part.text) {
            transcriptMessages.push({
              role: "user",
              text: part.text,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    if (isGeminiSetupMessage(parsed) || geminiSetupComplete) {
      sendToGemini(JSON.stringify(parsed));
    } else {
      postSetupQueue.push(JSON.stringify(parsed));
    }
  });

  ws.on("close", async () => {
    silence.stop();
    utteranceBuffer.flushNow();
    if (
      geminiWs &&
      (geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING)
    ) {
      geminiWs.close();
    }
    await saveAndCloseSession("completed");
    setTimeout(() => void flushUsage(), 2000);
  });

  ws.on("error", async () => {
    silence.stop();
    utteranceBuffer.clear();
    if (
      geminiWs &&
      (geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING)
    ) {
      geminiWs.close();
    }
    await saveAndCloseSession("failed");
    setTimeout(() => void flushUsage(), 2000);
  });

  // Validate origin
  const origin = req.headers.origin;
  if (
    env.ALLOWED_ORIGINS !== "*" &&
    origin &&
    !allowedOrigins.includes(normalizeOrigin(origin))
  ) {
    ws.close(4003, "Forbidden Origin");
    return;
  }

  if (url.pathname !== "/" && url.pathname !== "/ws") {
    ws.close(4000, "Invalid Path");
    return;
  }

  const token = url.searchParams.get("token");
  if (!token) {
    ws.close(4001, "Missing Token");
    return;
  }

  const authResult = await verifyToken(token);
  if (!authResult.success) {
    ws.close(4001, "Unauthorized");
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return;

  userId = authResult.user!.id;
  authed = true;
  console.log("[Telefun] User connected:", authResult.user?.email);

  // Create or attach session record
  const requestedSessionId = url.searchParams.get("sessionId");
  if (requestedSessionId) {
    try {
      const owned = await getOwnedSessionId(requestedSessionId, userId);
      if (!owned) {
        ws.close(4001, "Invalid Session");
        return;
      }
      sessionId = owned;
      console.log("[Telefun] Session attached:", sessionId);
    } catch (err) {
      console.error("[Telefun] Failed to attach session:", err);
      ws.close(4001, "Invalid Session Check");
      return;
    }
  } else {
    try {
      sessionId = await createSession(userId);
      console.log("[Telefun] Session created:", sessionId);
    } catch (err) {
      console.error("[Telefun] Failed to create session:", err);
    }
  }

  // Start silence detection after auth
  silence.start();

  // Connect to Gemini Live API
  setupGeminiWs();
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`[Telefun] Server running on http://0.0.0.0:${env.PORT}`);
  console.log(
    `[Telefun] Gemini API Key: ${env.GEMINI_API_KEY ? "***" + env.GEMINI_API_KEY.slice(-4) : "MISSING"}`,
  );
});

function gracefulShutdown(signal: string) {
  console.log(`\n[Telefun] Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  wss.close(() => {
    console.log("[Telefun] WebSocket server closed");
  });

  // Close all existing WebSocket connections
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, "Server shutting down");
    }
  }

  // Close HTTP server with 10s timeout
  server.close(() => {
    console.log("[Telefun] HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Telefun] Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
