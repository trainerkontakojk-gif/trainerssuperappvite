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
import { TurnManager } from "./turn-taking.js";
import { TranscriptCollector } from "./transcript.js";
import {
  parseControlMessage,
  isSessionEndRequest,
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  hasGeminiSetupComplete,
  getGeminiGoAwayTimeLeftSeconds,
  getSessionResumptionHandle,
  isCurrentGeminiSocket,
  extractGeminiTranscriptionChunks,
} from "./server-protocol.js";
import { DrainCoordinator, type DrainOutcome } from "./session-drain.js";
import { buildSafeCloseMetadata } from "./server-close.js";

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
  const callStartedAt = Date.now();
  const transcriptCollector = new TranscriptCollector(callStartedAt);
  let geminiWs: WebSocket | null = null;
  let isGeminiOpen = false;
  let authed = false;
  let userId = "";
  let sessionId = "";
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
  let cachedSetupMessage: string | null = null;
  let latestSessionHandle: string | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let clientClosed = false;
  let finalized = false;
  let drainCoordinator: DrainCoordinator | null = null;
  let drainTimers: ReturnType<typeof setTimeout>[] = [];

  const keepaliveTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
    if (geminiWs?.readyState === WebSocket.OPEN) {
      geminiWs.ping();
    }
  }, 30_000);

  const turnManager = new TurnManager();

  const flushUsage = async () => {
    if (usageFlushed || !authed || !usageSnapshot) return;
    usageFlushed = true;
    await flushLiveUsage(requestId, userId, usageSnapshot, activeModelId);
  };

  const finalizeSessionOnce = async (status: string, outcome?: DrainOutcome) => {
    if (finalized) return;
    finalized = true;
    drainTimers.forEach(clearTimeout);
    drainTimers = [];

    const duration = Math.floor((Date.now() - callStartedAt) / 1000);
    transcriptCollector.flush(Date.now());
    if (sessionId) {
      await updateSession(sessionId, {
        status,
        duration_seconds: duration,
        messages: transcriptCollector.snapshot(),
      });
    }
    void flushUsage();

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "session_end_complete",
          outcome: outcome || "hard_timeout",
        }),
      );
    }
    if (geminiWs?.readyState === WebSocket.OPEN) {
      geminiWs.close(1000, "Session finalized");
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Session finalized");
    }
  };

  const sendToGemini = (raw: string) => {
    if (geminiWs && isGeminiOpen && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(raw);
    } else {
      pendingMessages.push(raw);
    }
  };

  const buildReconnectSetupMessage = () => {
    if (!cachedSetupMessage) return null;
    const setupMsg = JSON.parse(cachedSetupMessage);
    if (latestSessionHandle) {
      setupMsg.setup = {
        ...setupMsg.setup,
        sessionResumption: {
          ...(setupMsg.setup?.sessionResumption ?? {}),
          handle: latestSessionHandle,
        },
      };
    }
    return JSON.stringify(setupMsg);
  };

  const scheduleReconnect = (delay: number) => {
    if (clientClosed || reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (ws.readyState !== WebSocket.OPEN || clientClosed) return;
      geminiSetupComplete = false;
      const previousSocket = geminiWs;
      geminiWs = null;
      isGeminiOpen = false;
      if (
        previousSocket &&
        (previousSocket.readyState === WebSocket.OPEN ||
          previousSocket.readyState === WebSocket.CONNECTING)
      ) {
        previousSocket.close(1000, "Reconnecting Gemini session");
      }
      setupGeminiWs();
    }, delay);
  };

  const setupGeminiWs = () => {
    const socket = connectGemini();
    geminiWs = socket;

    socket.on("open", () => {
      if (!isCurrentGeminiSocket(geminiWs, socket)) return;
      isGeminiOpen = true;
      console.log("[Telefun] Gemini Live connected");

      if (reconnectAttempts > 0) {
        const reconnectSetup = buildReconnectSetupMessage();
        if (reconnectSetup) {
          socket.send(reconnectSetup);
        }
      }

      while (pendingMessages.length > 0) {
        const msg = pendingMessages.shift();
        if (msg) {
          try {
            const parsed = JSON.parse(msg);
            if (isGeminiSetupMessage(parsed) || geminiSetupComplete) {
              socket.send(msg);
            } else {
              postSetupQueue.push(msg);
            }
          } catch {
            socket.send(msg);
          }
        }
      }
    });

    socket.on("message", (data) => {
      if (!isCurrentGeminiSocket(geminiWs, socket)) return;
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
          const resumed = reconnectAttempts > 0;
          geminiSetupComplete = true;
          reconnectAttempts = 0;
          if (resumed && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "session_resumed" }));
          }
          while (postSetupQueue.length > 0) {
            const msg = postSetupQueue.shift();
            if (msg) sendToGemini(msg);
          }
        }
        const transcriptChunks = extractGeminiTranscriptionChunks(parsed);
        for (const chunk of transcriptChunks) {
          transcriptCollector.append({
            speaker: chunk.speaker,
            text: chunk.text,
            observedAtMs: Date.now(),
          });
        }

        if (parsed.serverContent?.modelTurn?.parts) {
          turnManager.startAiSpeaking();
        }
        if (parsed.serverContent?.turnComplete) {
          transcriptCollector.completeTurn("consumer");
          turnManager.endAiSpeaking();
        }
        if (parsed.serverContent?.interrupted) {
          transcriptCollector.interruptTurn();
          turnManager.endAiSpeaking();
        }

        if (drainCoordinator) {
          if (transcriptChunks.length > 0) drainCoordinator.notifyActivity();
          if (parsed.serverContent?.turnComplete)
            drainCoordinator.notifyTurnComplete();
          if (parsed.serverContent?.interrupted)
            drainCoordinator.notifyInterrupted();
        }

        const nextHandle = getSessionResumptionHandle(parsed);
        if (nextHandle) {
          latestSessionHandle = nextHandle;
          console.log("[Telefun] Session resumption handle updated");
        }

        const goAwaySeconds = getGeminiGoAwayTimeLeftSeconds(parsed);
        if (goAwaySeconds !== null) {
          console.log(`[Telefun] GoAway received: ${goAwaySeconds}s remaining`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "session_reconnecting",
                reason: "goAway",
                timeLeftSeconds: goAwaySeconds,
              }),
            );
          }
          if (goAwaySeconds > 5 && !reconnectTimer) {
            scheduleReconnect(250);
          }
        }
      } catch {
        /* skip */
      }

      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    });

    socket.on("error", (error) => {
      if (!isCurrentGeminiSocket(geminiWs, socket)) return;
      console.error("[Telefun] Gemini WebSocket error:", error);
    });

    socket.on("close", (code, reason) => {
      if (!isCurrentGeminiSocket(geminiWs, socket)) return;
      console.log(
        `[Telefun] Gemini closed: ${code} (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
      );
      isGeminiOpen = false;
      geminiSetupComplete = false;

      if (
        !clientClosed &&
        code !== 1000 &&
        reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 8000);
        console.log(
          `[Telefun] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`,
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "session_reconnecting",
              reason: "gemini_close",
              code,
            }),
          );
        }
        scheduleReconnect(delay);
        return;
      }

      void flushUsage();
      const closeMeta = buildSafeCloseMetadata(code, reason);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(closeMeta.code, closeMeta.reason);
      }
    });
  };

  // Message handler: validate and forward structured JSON to Gemini Live
  ws.on("message", (data) => {
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

    const controlMsg = parseControlMessage(parsed);
    if (controlMsg) {
      if (isSessionEndRequest(controlMsg)) {
        clientClosed = true;
        if (!drainCoordinator) {
          drainCoordinator = new DrainCoordinator({
            onFinalize: (outcome: DrainOutcome) => {
              void finalizeSessionOnce("completed", outcome);
            },
          });
        }
        drainCoordinator.startDrain();
      }
      return;
    }

    if (!isGeminiForwardableMessage(parsed)) {
      console.warn("[Telefun] Dropping unsupported client JSON message");
      return;
    }

    if ((parsed as any).setup?.model) {
      activeModelId = (parsed as any).setup.model.replace(/^models\//, "");
    }

    if (isGeminiSetupMessage(parsed)) {
      cachedSetupMessage = JSON.stringify(parsed);
    }

    if (isGeminiSetupMessage(parsed) || geminiSetupComplete) {
      sendToGemini(JSON.stringify(parsed));
    } else {
      postSetupQueue.push(JSON.stringify(parsed));
    }
  });

  ws.on("close", async (code, reason) => {
    console.log(
      `[Telefun] Client closed: ${code} ${reason.toString() || "(no reason)"}`,
    );
    clientClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearInterval(keepaliveTimer);
    if (
      geminiWs &&
      (geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING)
    ) {
      geminiWs.close(1000, "Client disconnected");
    }
    await finalizeSessionOnce("completed");
    setTimeout(() => void flushUsage(), 2000);
  });

  ws.on("error", async () => {
    clientClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearInterval(keepaliveTimer);
    if (
      geminiWs &&
      (geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING)
    ) {
      geminiWs.close(1011, "Client WebSocket error");
    }
    await finalizeSessionOnce("failed");
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session_created", sessionId }));
      }
    } catch (err) {
      console.error("[Telefun] Failed to create session:", err);
    }
  }

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
