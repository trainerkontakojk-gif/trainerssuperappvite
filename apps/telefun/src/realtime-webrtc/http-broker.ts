import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authorizeWebRtcCall,
  type BrokerAuthDependencies,
} from "./broker-auth.js";
import type { TelefunOpenAiWebRtcRolloutConfig } from "./rollout-gate.js";
import { parseRawSdp, parseSessionId, POC_MAX_SDP_BYTES } from "./contracts.js";
import {
  WebRtcCallConflictError,
  WebRtcCallQuotaError,
  WebRtcRateLimitError,
  type WebRtcCallManager,
} from "./call-manager.js";
import { WebRtcDurabilityError, type AttemptOutcome } from "../db.js";

const ROUTE_PATTERN =
  /^\/telefun\/realtime\/openai\/webrtc\/sessions\/([^/]+)\/call$/;
const METHODS = "OPTIONS, POST, DELETE";
const HEADERS = "Authorization, Content-Type";

export interface OpenAIWebRtcHttpHandlerDependencies extends BrokerAuthDependencies {
  enabled: boolean;
  rollout: TelefunOpenAiWebRtcRolloutConfig;
  allowedOrigins: string;
  requestTimeoutMs?: number;
  manager: Pick<WebRtcCallManager, "startCall" | "endCall" | "failCall">;
}

export type OpenAIWebRtcHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

export function isOpenAIWebRtcRequest(req: IncomingMessage): boolean {
  const pathname = new URL(req.url ?? "/", "http://telefun.internal").pathname;
  return ROUTE_PATTERN.test(pathname);
}

export function createOpenAIWebRtcHttpHandler(
  dependencies: OpenAIWebRtcHttpHandlerDependencies,
): OpenAIWebRtcHttpHandler {
  return async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://telefun.internal");
    const match = ROUTE_PATTERN.exec(requestUrl.pathname);
    if (!match) return false;

    if (!dependencies.enabled) {
      if (req.method === "OPTIONS") {
        const requestedMethod = header(req, "access-control-request-method");
        if (requestedMethod !== "DELETE") {
          sendJson(res, 404, { error: "Not found" });
          return true;
        }
      } else if (req.method !== "DELETE") {
        sendJson(res, 404, { error: "Not found" });
        return true;
      }
    }

    const origin = header(req, "origin");
    const corsOrigin = resolvePaidOrigin(dependencies.allowedOrigins, origin);
    if (!corsOrigin) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }
    const cors = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": METHODS,
      "Access-Control-Allow-Headers": HEADERS,
      Vary: "Origin",
    };

    if (req.method === "OPTIONS") {
      const requestedMethod = header(req, "access-control-request-method");
      if (requestedMethod && !["POST", "DELETE"].includes(requestedMethod)) {
        sendJson(res, 405, { error: "Method not allowed" }, cors);
        return true;
      }
      const requestedHeaders = header(req, "access-control-request-headers")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (
        requestedHeaders.some(
          (value) => value !== "authorization" && value !== "content-type",
        )
      ) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
      res.writeHead(204, cors);
      res.end();
      return true;
    }
    if (req.method !== "POST" && req.method !== "DELETE") {
      sendJson(
        res,
        405,
        { error: "Method not allowed" },
        { ...cors, Allow: METHODS },
      );
      return true;
    }

    const sessionId = parseSessionId(match[1]!);
    if (!sessionId) {
      sendJson(res, 400, { error: "Invalid request" }, cors);
      return true;
    }

    let requestedOutcome: AttemptOutcome | undefined;
    if (req.method === "DELETE") {
      const outcomeValues = requestUrl.searchParams.getAll("outcome");
      const unknownQuery = [...requestUrl.searchParams.keys()].some(
        (key) => key !== "outcome",
      );
      if (
        unknownQuery ||
        (outcomeValues.length > 0 &&
          (outcomeValues.length !== 1 ||
            !["failed", "network_lost", "orphaned"].includes(
              outcomeValues[0]!,
            )))
      ) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
      requestedOutcome = outcomeValues[0] as AttemptOutcome | undefined;
    } else if ([...requestUrl.searchParams.keys()].length > 0) {
      sendJson(res, 400, { error: "Invalid request" }, cors);
      return true;
    }

    if (req.method === "POST") {
      const contentType = header(req, "content-type")
        .split(";", 1)[0]!
        .trim()
        .toLowerCase();
      if (contentType !== "application/sdp") {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
    }

    const contentLength = Number(header(req, "content-length"));
    if (Number.isFinite(contentLength) && contentLength > POC_MAX_SDP_BYTES) {
      sendJson(res, 413, { error: "Request too large" }, cors);
      return true;
    }

    // Observe a client disconnect before either body consumption or auth. A
    // normal IncomingMessage `close` is deliberately not an abort signal.
    const requestAbort = new AbortController();
    const requestTimeoutMs = Math.max(
      1_000,
      Math.min(120_000, Math.floor(dependencies.requestTimeoutMs ?? 30_000)),
    );
    const requestTimer = setTimeout(
      () => requestAbort.abort(),
      requestTimeoutMs,
    );
    const abortRequest = () => requestAbort.abort();
    const abortResponse = () => {
      if (!res.headersSent && !res.writableEnded) requestAbort.abort();
    };
    if (req.aborted) abortRequest();
    req.on("aborted", abortRequest);
    res.on("close", abortResponse);
    try {
      const body = await readBody(
        req,
        req.method === "POST" ? POC_MAX_SDP_BYTES : 4_096,
        requestAbort.signal,
      );
      if (requestAbort.signal.aborted) return true;
      if (body === null) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
      if (req.method === "DELETE" && body.length > 0) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }

      const authorization = header(req, "authorization");
      const token = /^Bearer\s+(\S+)$/.exec(authorization)?.[1];
      if (!token) {
        sendJson(res, 401, { error: "Unauthorized" }, cors);
        return true;
      }
      const auth = await authorizeWebRtcCall(
        {
          token,
          sessionId,
          operation: req.method === "DELETE" ? "end" : "start",
          signal: requestAbort.signal,
        },
        dependencies,
      );
      if (requestAbort.signal.aborted) return true;
      if (!auth.ok && auth.reason === "aborted") return true;
      if (!auth.ok) {
        const status =
          auth.reason === "unauthorized"
            ? 401
            : auth.reason === "forbidden"
              ? 403
              : 404;
        sendJson(
          res,
          status,
          { error: status === 401 ? "Unauthorized" : "Request rejected" },
          cors,
        );
        return true;
      }

      if (req.method === "DELETE") {
        try {
          if (requestAbort.signal.aborted) return true;
          if (requestedOutcome === "failed") {
            await dependencies.manager.failCall(sessionId, auth.userId);
          } else if (requestedOutcome) {
            await dependencies.manager.failCall(
              sessionId,
              auth.userId,
              requestedOutcome,
            );
          } else {
            await dependencies.manager.endCall(sessionId, auth.userId);
          }
          if (requestAbort.signal.aborted) return true;
          res.writeHead(204, cors);
          res.end();
        } catch (error) {
          const status =
            error instanceof WebRtcDurabilityError
              ? 503
              : error instanceof WebRtcCallQuotaError
                ? 429
                : error instanceof WebRtcRateLimitError
                  ? 429
                  : error instanceof WebRtcCallConflictError
                    ? 409
                    : 500;
          sendJson(
            res,
            status,
            {
              error:
                status === 503
                  ? "Realtime call finalization unavailable"
                  : "Realtime call finalization rejected",
            },
            {
              ...cors,
              ...(error instanceof WebRtcRateLimitError
                ? { "Retry-After": retryAfterSeconds(error.resetAt) }
                : {}),
            },
          );
        }
        return true;
      }

      const offerSdp = parseRawSdp(body);
      if (!offerSdp) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
      if (requestAbort.signal.aborted) return true;

      const result = await dependencies.manager.startCall({
        userId: auth.userId,
        sessionId,
        offerSdp,
        signal: requestAbort.signal,
      });
      if (res.headersSent || res.writableEnded || requestAbort.signal.aborted)
        return true;
      res.writeHead(201, { ...cors, "Content-Type": "application/sdp" });
      res.end(result.answerSdp);
    } catch (error) {
      if (
        !requestAbort.signal.aborted &&
        !res.headersSent &&
        !res.writableEnded
      ) {
        const status =
          error instanceof WebRtcCallQuotaError
            ? 429
            : error instanceof WebRtcRateLimitError
              ? 429
              : error instanceof WebRtcCallConflictError
                ? 409
                : error instanceof WebRtcDurabilityError
                  ? 503
                  : 502;
        sendJson(
          res,
          status,
          {
            error:
              status === 503
                ? "Realtime call persistence unavailable"
                : "Realtime call unavailable",
          },
          {
            ...cors,
            ...(error instanceof WebRtcRateLimitError
              ? { "Retry-After": retryAfterSeconds(error.resetAt) }
              : {}),
          },
        );
      }
    } finally {
      clearTimeout(requestTimer);
      req.removeListener("aborted", abortRequest);
      res.removeListener("close", abortResponse);
    }
    return true;
  };
}

function resolvePaidOrigin(
  allowedOrigins: string,
  requestOrigin: string,
): string | null {
  if (!requestOrigin || allowedOrigins.trim() === "*") return null;
  const origins = allowedOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.includes("*")) return null;
  return origins.includes(requestOrigin) ? requestOrigin : null;
}

function retryAfterSeconds(resetAt: string): string {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return "1";
  return String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1_000)));
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readBody(
  req: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    let done = false;
    const onData = (chunk: Buffer | string) => {
      if (done) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        finish(null);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish(Buffer.concat(chunks).toString("utf8"));
    const onError = () => finish(null);
    const onAborted = () => finish(null);
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAborted);
      signal.removeEventListener("abort", onAborted);
    };
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
    signal.addEventListener("abort", onAborted, { once: true });
    if (signal.aborted) finish(null);
  });
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { ...headers, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
