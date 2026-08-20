import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authorizeWebRtcCall,
  type BrokerAuthDependencies,
} from "./broker-auth.js";
import { parseSessionId } from "./contracts.js";
import {
  WebRtcCallConflictError,
  type WebRtcCallManager,
} from "./call-manager.js";
import type { AttemptOutcome } from "../db.js";

const ROUTE_PATTERN =
  /^\/telefun\/realtime\/openai\/webrtc\/sessions\/([^/]+)\/call$/;
const CLEANUP_METHODS = "OPTIONS, DELETE";
const CLEANUP_HEADERS = "Authorization, Content-Type";
const MAX_DELETE_BODY_BYTES = 4_096;

export interface OpenAIWebRtcHttpHandlerDependencies extends BrokerAuthDependencies {
  /** Deprecated no-op values retained for stale service wiring compatibility. */
  enabled?: boolean;
  rollout?: unknown;
  requestTimeoutMs?: number;
  allowedOrigins: string;
  manager: Pick<WebRtcCallManager, "endCall" | "failCall">;
}

export type OpenAIWebRtcHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

export function isOpenAIWebRtcRequest(req: IncomingMessage): boolean {
  const pathname = new URL(req.url ?? "/", "http://telefun.internal").pathname;
  return ROUTE_PATTERN.test(pathname);
}

/**
 * Retains only owner-bound DELETE cleanup for historical calls. New WebRTC
 * starts are hidden before CORS, authentication, body parsing, or lifecycle
 * dependencies can run.
 */
export function createOpenAIWebRtcHttpHandler(
  dependencies: OpenAIWebRtcHttpHandlerDependencies,
): OpenAIWebRtcHttpHandler {
  return async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://telefun.internal");
    const match = ROUTE_PATTERN.exec(requestUrl.pathname);
    if (!match) return false;

    const requestedMethod = header(
      req,
      "access-control-request-method",
    ).toUpperCase();
    if (
      req.method === "POST" ||
      (req.method === "OPTIONS" && requestedMethod === "POST")
    ) {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }

    if (req.method === "OPTIONS") {
      if (requestedMethod !== "DELETE") {
        sendJson(res, 404, { error: "Not found" });
        return true;
      }
      const cors = resolveCleanupCors(
        dependencies.allowedOrigins,
        header(req, "origin"),
      );
      if (!cors) {
        sendJson(res, 403, { error: "Forbidden" });
        return true;
      }
      if (
        !hasOnlyCleanupHeaders(header(req, "access-control-request-headers"))
      ) {
        sendJson(res, 400, { error: "Invalid request" }, cors);
        return true;
      }
      res.writeHead(204, cors);
      res.end();
      return true;
    }

    if (req.method !== "DELETE") {
      sendJson(res, 404, { error: "Not found" });
      return true;
    }

    const cors = resolveCleanupCors(
      dependencies.allowedOrigins,
      header(req, "origin"),
    );
    if (!cors) {
      sendJson(res, 403, { error: "Forbidden" });
      return true;
    }

    const sessionId = parseSessionId(match[1]!);
    if (!sessionId || !hasValidCleanupQuery(requestUrl)) {
      sendJson(res, 400, { error: "Invalid request" }, cors);
      return true;
    }
    const requestedOutcome = requestUrl.searchParams.get(
      "outcome",
    ) as AttemptOutcome | null;

    const contentLength = Number(header(req, "content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_DELETE_BODY_BYTES
    ) {
      sendJson(res, 400, { error: "Invalid request" }, cors);
      return true;
    }
    const body = await readDeleteBody(req);
    if (body === null || body.length > 0) {
      sendJson(res, 400, { error: "Invalid request" }, cors);
      return true;
    }

    const token = /^Bearer\s+(\S+)$/.exec(header(req, "authorization"))?.[1];
    if (!token) {
      sendJson(res, 401, { error: "Unauthorized" }, cors);
      return true;
    }

    const auth = await authorizeWebRtcCall(
      { token, sessionId, operation: "end" },
      dependencies,
    );
    if (!auth.ok) {
      if (auth.reason === "aborted") return true;
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

    try {
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
      res.writeHead(204, cors);
      res.end();
    } catch (error) {
      if (error instanceof WebRtcCallConflictError) {
        sendJson(
          res,
          409,
          { error: "Realtime call finalization rejected" },
          cors,
        );
      } else {
        sendJson(
          res,
          503,
          { error: "Realtime call finalization unavailable" },
          cors,
        );
      }
    }
    return true;
  };
}

function resolveCleanupCors(
  allowedOrigins: string,
  requestOrigin: string,
): Record<string, string> | null {
  if (!requestOrigin || allowedOrigins.trim() === "*") return null;
  const origins = allowedOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.includes("*") || !origins.includes(requestOrigin)) return null;
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Methods": CLEANUP_METHODS,
    "Access-Control-Allow-Headers": CLEANUP_HEADERS,
    Vary: "Origin",
  };
}

function hasOnlyCleanupHeaders(value: string): boolean {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .every((item) => item === "authorization" || item === "content-type");
}

function hasValidCleanupQuery(requestUrl: URL): boolean {
  const outcomes = requestUrl.searchParams.getAll("outcome");
  return (
    [...requestUrl.searchParams.keys()].every((key) => key === "outcome") &&
    (outcomes.length === 0 ||
      (outcomes.length === 1 &&
        ["failed", "network_lost", "orphaned"].includes(outcomes[0]!)))
  );
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readDeleteBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let done = false;
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onError);
    };
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_DELETE_BODY_BYTES) {
        finish(null);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish(Buffer.concat(chunks).toString("utf8"));
    const onError = () => finish(null);
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onError);
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
