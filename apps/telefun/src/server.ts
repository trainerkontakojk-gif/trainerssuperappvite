import { createServer, type IncomingMessage, type ServerResponse } from "http";
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
} from "./usage.js";
import {
  createSession,
  updateSession,
  createTelefunWebRtcDb,
  getOwnedSessionId,
  getWebRtcProfile,
  getWebRtcSession,
} from "./db.js";
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
import {
  createOpenAIWebRtcHttpHandler,
  isOpenAIWebRtcRequest,
} from "./realtime-webrtc/http-broker.js";
import { createWebRtcCleanupManager } from "./realtime-webrtc/call-manager.js";
import { createOpenAiCallCleanupClient } from "./realtime-webrtc/openai-calls-client.js";
import { createOrphanCleanupWorker } from "./realtime-webrtc/orphan-cleanup.js";
import { decryptProviderCallReference } from "./realtime-webrtc/provider-reference.js";
import {
  createWebRtcMetricRecorder,
  redactProviderDiagnostic,
} from "./realtime-webrtc/observability.js";
import { createShutdownCoordinator } from "./shutdown-coordinator.js";

process.on("uncaughtException", () =>
  console.error("[Telefun] Uncaught:", redactProviderDiagnostic(undefined)),
);
process.on("unhandledRejection", () =>
  console.error(
    "[Telefun] Unhandled Rejection:",
    redactProviderDiagnostic(undefined),
  ),
);

const openAIWebRtcDb = createTelefunWebRtcDb();
const webRtcMetricRecorder = createWebRtcMetricRecorder(async (metric) => {
  await openAIWebRtcDb.recordMetric?.(metric);
});
const WEBRTC_SHUTDOWN_TIMEOUT_MS = 30_000;
const openAiCleanupClient = createOpenAiCallCleanupClient({
  apiKey: env.OPENAI_API_KEY ?? "",
  timeoutMs: env.TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS,
});

/** Server-only decryptor for an already-bound historical provider call. */
const decryptHistoricalProviderCallReference = (
  encryptedReference: string,
): string | null => {
  const key = env.TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY;
  return key ? decryptProviderCallReference(encryptedReference, key) : null;
};

// The broker receives only this facade: no HTTP route can call startCall,
// construct a provider session, or create a sideband.
const openAIWebRtcManager = createWebRtcCleanupManager({
  db: openAIWebRtcDb,
  callsClient: openAiCleanupClient,
  decryptProviderCallReference: decryptHistoricalProviderCallReference,
  providerHangupTimeoutMs: env.TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS,
  shutdownTimeoutMs: WEBRTC_SHUTDOWN_TIMEOUT_MS,
});

const orphanCleanupWorker = createOrphanCleanupWorker({
  store: {
    claim: (limit) =>
      openAIWebRtcDb.claimOrphans?.(limit) ?? Promise.resolve([]),
    getProviderBinding: async (candidate) => {
      const attempt = await openAIWebRtcDb.getAttempt(
        candidate.sessionId,
        candidate.userId,
      );
      if (!attempt) return "unknown";
      return attempt.providerCallIdHash ? "bound" : "unbound";
    },
    complete: (input) => openAIWebRtcDb.completeOrphan!(input),
  },
  closeProvider: async (encryptedReference) => {
    const callId = decryptHistoricalProviderCallReference(encryptedReference);
    if (!callId) return false;
    return openAiCleanupClient.closeCall(callId);
  },
  // Historical orphan cleanup has no process-local sideband to touch.
  closeSideband: async () => true,
  onOrphan: ({ candidate, completed }) =>
    webRtcMetricRecorder.record({
      name: "orphan",
      userId: candidate.userId,
      sessionId: candidate.sessionId,
      attemptId: candidate.attemptId,
      metadata: { cleanup: completed ? "completed" : "retryable" },
    }),
  intervalMs: env.TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS,
});
// Without a key, cleanup attempts remain retryable and the cleanup client
// refuses to fetch; do not convert unavailable hangup authority into success.
orphanCleanupWorker.start();

const openAIWebRtcHandler = createOpenAIWebRtcHttpHandler({
  allowedOrigins: env.ALLOWED_ORIGINS,
  verifyToken,
  getProfile: getWebRtcProfile,
  getSession: getWebRtcSession,
  manager: openAIWebRtcManager,
});

const server = createServer((req, res) => {
  if (isOpenAIWebRtcRequest(req)) {
    runHttpHandler(openAIWebRtcHandler, req, res);
    return;
  }
  if (
    new URL(req.url ?? "/", "http://telefun.internal").pathname ===
    INTERNAL_SCORING_PATH
  ) {
    runHttpHandler(handleInternalScoringRequest, req, res);
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
          { geminiConfigured: Boolean(env.GEMINI_API_KEY) },
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

function runHttpHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  void handler(req, res).catch(() => {
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  });
}

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
  let usageFlushed = false;
  let usageFlushPromise: Promise<void> | null = null;
  let activeModelId = "gemini-3.1-flash-live-preview";
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

  const configurationGate = new TelefunProviderConfigurationGate({
    createAdapter: (configuration) =>
      createRealtimeProviderAdapter(configuration, { createGeminiAdapter }),
    onConfigured: (configuration, adapter) => {
      providerAdapter = adapter;
      activeModelId = configuration.model.id;
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
});

function closeHttpServer(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        console.log("[Telefun] HTTP server closed");
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

const gracefulShutdown = createShutdownCoordinator({
  timeoutMs: WEBRTC_SHUTDOWN_TIMEOUT_MS,
  stopAccepting: () => {
    console.log("[Telefun] Stopping new HTTP/WebSocket work");
    orphanCleanupWorker.stop();
    wss.close(() => {
      console.log("[Telefun] WebSocket server closed");
    });
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, "Server shutting down");
      }
    }
  },
  closeHttp: closeHttpServer,
  shutdownManager: () => openAIWebRtcManager.shutdown(),
  exit: (code) => process.exit(code),
  logFailure: (metadata) => {
    if (metadata.reason === "deadline") {
      console.error("[Telefun] Graceful shutdown timeout", metadata);
    } else {
      console.error("[Telefun] Graceful shutdown failed", metadata);
    }
  },
});

process.on("SIGTERM", () => {
  console.log("\n[Telefun] Received SIGTERM. Starting graceful shutdown...");
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  console.log("\n[Telefun] Received SIGINT. Starting graceful shutdown...");
  void gracefulShutdown("SIGINT");
});
