import { createServer } from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { env } from "./env.js";
import { verifyToken } from "./auth.js";
import {
  flushLiveUsage,
  createLiveUsageAccumulator,
  observeLiveUsageMetadata,
  commitPendingLiveUsageTurn,
  summarizeLiveUsageAccumulator,
  createOpenAIUsageAccumulator,
  observeOpenAIUsage,
  summarizeOpenAIUsageAccumulator,
  getOpenAIUsageDiagnostics,
  flushOpenAIRealtimeUsage,
} from "./usage.js";
import { createSession, updateSession, getOwnedSessionId } from "./db.js";
import { TurnManager } from "./turn-taking.js";
import { TranscriptCollector } from "./transcript.js";
import {
  parseControlMessage,
  isSessionEndRequest,
  isTelefunControlEnvelope,
  parseTelefunAuthMessage,
} from "./server-protocol.js";
import { DrainCoordinator, type DrainOutcome } from "./session-drain.js";
import { buildSafeCloseMetadata } from "./server-close.js";
import { TelefunAuthGate } from "./server-auth.js";
import { GeminiLiveAdapter } from "./providers/GeminiLiveAdapter.js";
import {
  OpenAIRealtimeAdapter,
  buildSafeOpenAIDiagnosticLogMetadata,
} from "./providers/OpenAIRealtimeAdapter.js";
import type { RealtimeProviderAdapter } from "./providers/RealtimeProviderAdapter.js";
import { createRealtimeProviderAdapter } from "./providers/provider-router.js";
import {
  TELEFUN_WEBSOCKET_SERVER_OPTIONS,
  TelefunProviderConfigurationGate,
} from "./server-configuration.js";
import {
  buildTelefunHealthPayload,
  normalizeTelefunOrigin,
  resolveTelefunHealthCors,
} from "./health.js";
import { retryUsageAfterInFlight } from "./usage-flush-retry.js";
import {
  handleInternalScoringRequest,
  INTERNAL_SCORING_PATH,
} from "./internal-scoring-http.js";

process.on("uncaughtException", (err) =>
  console.error("[Telefun] Uncaught:", err),
);
process.on("unhandledRejection", (reason) =>
  console.error("[Telefun] Unhandled Rejection:", reason),
);

const server = createServer((req, res) => {
  if (
    new URL(req.url ?? "/", "http://telefun.internal").pathname ===
    INTERNAL_SCORING_PATH
  ) {
    void handleInternalScoringRequest(req, res);
    return;
  }
  if (req.url === "/health") {
    const cors = resolveTelefunHealthCors({
      allowedOrigins: env.ALLOWED_ORIGINS,
      requestOrigin: req.headers.origin,
    });
    if (!cors.allowed) {
      res.writeHead(403, cors.headers);
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors.headers);
      res.end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { ...cors.headers, Allow: "GET, OPTIONS" });
      res.end();
      return;
    }
    res.writeHead(200, {
      ...cors.headers,
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify(
        buildTelefunHealthPayload(
          {
            geminiConfigured: Boolean(env.GEMINI_API_KEY),
            openAIEnabled: env.TELEFUN_OPENAI_ENABLED,
            openAIConfigured: Boolean(env.OPENAI_API_KEY),
          },
          {
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
          },
        ),
      ),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server,
  ...TELEFUN_WEBSOCKET_SERVER_OPTIONS,
});

const allowedOrigins =
  env.ALLOWED_ORIGINS === "*"
    ? []
    : env.ALLOWED_ORIGINS.split(",")
        .map((o) => normalizeTelefunOrigin(o.trim()))
        .filter(Boolean);

function connectGemini(): WebSocket {
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
  return new WebSocket(geminiUrl);
}

wss.on("connection", async (ws, req) => {
  const callStartedAt = Date.now();
  const transcriptCollector = new TranscriptCollector(callStartedAt);
  let providerAdapter: RealtimeProviderAdapter | null = null;
  let authed = false;
  let authTimeout: ReturnType<typeof setTimeout> | null = null;
  let userId = "";
  let sessionId = "";
  const requestId = `telefun-live-${randomUUID()}`;
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  const usageAccumulator = createLiveUsageAccumulator();
  const openAIUsageAccumulator = createOpenAIUsageAccumulator();
  let usageFlushed = false;
  let usageFlushPromise: Promise<void> | null = null;
  let activeModelId = "gemini-3.1-flash-live-preview";
  let activeProvider: "gemini" | "openai" = "gemini";
  let finalized = false;
  let drainCoordinator: DrainCoordinator | null = null;
  let drainTimers: ReturnType<typeof setTimeout>[] = [];

  const keepaliveTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30_000);

  const turnManager = new TurnManager();

  const clearAuthTimeout = () => {
    if (authTimeout) {
      clearTimeout(authTimeout);
      authTimeout = null;
    }
  };

  const authGate = new TelefunAuthGate({
    verifyToken,
    getOwnedSessionId,
    createSession,
  });

  const flushUsage = (sessionDurationMs?: number): Promise<void> => {
    if (usageFlushed || !authed) return Promise.resolve();
    if (usageFlushPromise) return usageFlushPromise;

    const attempt = async () => {
      if (activeProvider !== "openai") {
        commitPendingLiveUsageTurn(usageAccumulator, "session_flush");
        const usageAggregate = summarizeLiveUsageAccumulator(usageAccumulator);
        if (!usageAggregate) return;
        usageFlushed = true;
        await flushLiveUsage(
          requestId,
          userId,
          usageAggregate,
          activeModelId,
          sessionDurationMs,
        );
        return;
      }

      const usageAggregate = summarizeOpenAIUsageAccumulator(
        openAIUsageAccumulator,
      );
      const diagnostics = getOpenAIUsageDiagnostics(openAIUsageAccumulator);
      if (diagnostics.warnings.length > 0 || !usageAggregate) {
        console.warn("[Telefun] OpenAI usage incomplete", {
          requestId,
          ...diagnostics,
          hasAggregate: Boolean(usageAggregate),
        });
      }
      if (!usageAggregate) {
        usageFlushed = true;
        return;
      }
      const persisted = await flushOpenAIRealtimeUsage(
        requestId,
        userId,
        usageAggregate,
        activeModelId,
        sessionDurationMs,
      );
      if (!persisted) {
        console.warn("[Telefun] OpenAI usage was not persisted", {
          requestId,
          modelId: activeModelId,
        });
        return;
      }
      usageFlushed = true;
    };

    usageFlushPromise = attempt().finally(() => {
      usageFlushPromise = null;
    });
    return usageFlushPromise;
  };

  const scheduleUsageRetry = (sessionDurationMs?: number) => {
    setTimeout(() => {
      void retryUsageAfterInFlight(
        () => flushUsage(sessionDurationMs),
        () => usageFlushed,
      );
    }, 2_000);
  };

  const finalizeSessionOnce = async (
    status: string,
    outcome?: DrainOutcome,
  ) => {
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
    void flushUsage(duration * 1000);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "session_end_complete",
          outcome: outcome || "hard_timeout",
        }),
      );
    }
    providerAdapter?.close(1000, "Session finalized");
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Session finalized");
    }
  };

  const createGeminiAdapter = (
    configuration: Parameters<typeof createRealtimeProviderAdapter>[0],
  ) =>
    new GeminiLiveAdapter({
      configuration,
      createSocket: connectGemini,
      callbacks: {
        forwardToClient: (raw) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(raw);
        },
        observeUsage: (metadata, observedAtMs) => {
          observeLiveUsageMetadata(usageAccumulator, metadata, observedAtMs);
        },
        appendTranscript: (entry) => transcriptCollector.append(entry),
        startAiSpeaking: () => turnManager.startAiSpeaking(),
        completeTurn: () => {
          transcriptCollector.completeTurn("consumer");
          turnManager.endAiSpeaking();
          commitPendingLiveUsageTurn(usageAccumulator, "turnComplete");
        },
        interruptTurn: () => {
          transcriptCollector.interruptTurn();
          turnManager.endAiSpeaking();
          commitPendingLiveUsageTurn(usageAccumulator, "interrupted");
        },
        notifyActivity: () => drainCoordinator?.notifyActivity(),
        notifyTurnComplete: () => drainCoordinator?.notifyTurnComplete(),
        notifyInterrupted: () => drainCoordinator?.notifyInterrupted(),
        onFinalClose: (code, reason) => {
          void flushUsage();
          const closeMeta = buildSafeCloseMetadata(code, reason);
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(closeMeta.code, closeMeta.reason);
          }
        },
        onDiagnostic: (diagnostic) => {
          console.warn("[Telefun] Gemini adapter diagnostic", {
            requestId,
            ...diagnostic,
          });
        },
      },
    });

  const createOpenAIAdapter = (
    configuration: Parameters<typeof createRealtimeProviderAdapter>[0],
  ) => {
    const openAIKey = env.OPENAI_API_KEY;
    if (!openAIKey) {
      throw new Error("OpenAI Realtime is not configured");
    }

    return new OpenAIRealtimeAdapter({
      configuration,
      apiKey: openAIKey,
      userId,
      createSocket: (url, { headers }) => new WebSocket(url, { headers }),
      callbacks: {
        forwardToClient: (raw) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(raw);
        },
        observeUsage: (observation, observedAtMs) => {
          observeOpenAIUsage(openAIUsageAccumulator, observation, observedAtMs);
        },
        appendTranscript: (entry) => transcriptCollector.append(entry),
        startAiSpeaking: () => turnManager.startAiSpeaking(),
        completeTurn: () => {
          transcriptCollector.completeTurn("consumer");
          turnManager.endAiSpeaking();
        },
        interruptTurn: () => {
          transcriptCollector.interruptTurn();
          turnManager.endAiSpeaking();
        },
        notifyActivity: () => drainCoordinator?.notifyActivity(),
        notifyTurnComplete: () => drainCoordinator?.notifyTurnComplete(),
        notifyInterrupted: () => drainCoordinator?.notifyInterrupted(),
        onFinalClose: (code, reason) => {
          const closeMeta = buildSafeCloseMetadata(code, reason);
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(closeMeta.code, closeMeta.reason);
          }
        },
        onDiagnostic: (diagnostic) => {
          console.warn("[Telefun] OpenAI adapter diagnostic", {
            requestId,
            ...buildSafeOpenAIDiagnosticLogMetadata(diagnostic),
          });
        },
      },
    });
  };

  const configurationGate = new TelefunProviderConfigurationGate({
    createAdapter: (configuration) =>
      createRealtimeProviderAdapter(configuration, {
        createGeminiAdapter,
        createOpenAIAdapter,
        openAIEnabled: env.TELEFUN_OPENAI_ENABLED,
        openAIConfigured: Boolean(env.OPENAI_API_KEY),
      }),
    onConfigured: (configuration, adapter) => {
      providerAdapter = adapter;
      activeModelId = configuration.model.id;
      activeProvider = configuration.model.provider;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "telefun_session_configured",
            modelId: configuration.model.id,
            transport: configuration.model.realtime.transport,
          }),
        );
      }
    },
    onClose: (code, reason) => {
      if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
    },
  });

  const authenticateClient = async (
    message: ReturnType<typeof parseTelefunAuthMessage>,
  ) => {
    if (!message) {
      ws.close(4001, "Authentication Required");
      return;
    }

    const authResult = await authGate.authenticate(message);
    if (!authResult.ok) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(authResult.closeCode, authResult.reason);
      }
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) return;

    userId = authResult.userId;
    sessionId = authResult.sessionId;
    authed = true;
    clearAuthTimeout();
    console.log("[Telefun] User authenticated", { requestId });
    ws.send(JSON.stringify({ type: "auth_ok", sessionId }));
    configurationGate.start();
  };

  // Message handler: authenticate, configure once, then delegate provider data.
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
      if (authed && !configurationGate.isConfigured()) {
        configurationGate.rejectClientMessage("invalid_envelope");
        return;
      }
      console.warn("[Telefun] Dropping non-JSON client message");
      return;
    }

    if (!authed) {
      const authMessage = parseTelefunAuthMessage(parsed);
      if (!authMessage) {
        ws.close(4001, "Authentication Required");
        return;
      }
      void authenticateClient(authMessage);
      return;
    }

    if (parseTelefunAuthMessage(parsed)) {
      ws.close(4001, "Duplicate Authentication");
      return;
    }

    if (isTelefunControlEnvelope(parsed)) {
      const controlMsg = parseControlMessage(parsed);
      if (controlMsg && isSessionEndRequest(controlMsg)) {
        configurationGate.dispose();
        if (!drainCoordinator) {
          drainCoordinator = new DrainCoordinator({
            onFinalize: (outcome: DrainOutcome) => {
              void finalizeSessionOnce("completed", outcome);
            },
          });
        }
        drainCoordinator.startDrain();
      } else {
        configurationGate.rejectClientMessage("unexpected_control_message");
      }
      return;
    }

    if (configurationGate.handleMessage(parsed)) return;
    providerAdapter?.handleClientMessage(parsed);
  });

  ws.on("close", async (code, reason) => {
    console.log(
      `[Telefun] Client closed: ${code} ${reason.toString() || "(no reason)"}`,
    );
    clearAuthTimeout();
    configurationGate.dispose();
    clearInterval(keepaliveTimer);
    providerAdapter?.close(1000, "Client disconnected");
    await finalizeSessionOnce("completed");
    scheduleUsageRetry(Math.floor((Date.now() - callStartedAt) / 1000) * 1000);
  });

  ws.on("error", async () => {
    clearAuthTimeout();
    configurationGate.dispose();
    clearInterval(keepaliveTimer);
    providerAdapter?.close(1011, "Client WebSocket error");
    await finalizeSessionOnce("failed");
    scheduleUsageRetry(Math.floor((Date.now() - callStartedAt) / 1000) * 1000);
  });

  // Validate origin
  const origin = req.headers.origin;
  if (
    env.ALLOWED_ORIGINS !== "*" &&
    origin &&
    !allowedOrigins.includes(normalizeTelefunOrigin(origin))
  ) {
    ws.close(4003, "Forbidden Origin");
    return;
  }

  if (url.pathname !== "/" && url.pathname !== "/ws") {
    ws.close(4000, "Invalid Path");
    return;
  }

  authTimeout = setTimeout(() => {
    if (!authed && ws.readyState === WebSocket.OPEN) {
      ws.close(4001, "Authentication Timeout");
    }
  }, 10_000);
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`[Telefun] Server running on http://0.0.0.0:${env.PORT}`);
  console.log(
    `[Telefun] Gemini API Key: ${env.GEMINI_API_KEY ? "configured" : "missing"}`,
  );
  console.log(
    `[Telefun] OpenAI Realtime: ${env.TELEFUN_OPENAI_ENABLED ? "enabled/configured" : "disabled"}`,
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
