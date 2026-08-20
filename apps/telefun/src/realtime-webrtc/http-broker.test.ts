import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenAIWebRtcHttpHandler,
  type OpenAIWebRtcHttpHandlerDependencies,
} from "./http-broker.js";
import {
  createWebRtcCleanupManager,
  hashProviderCallId,
  WebRtcCallConflictError,
} from "./call-manager.js";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn(), storage: { from: vi.fn() } })),
}));

const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
const origin = "https://trainer.example.test";

function request({
  method,
  body = "",
  headers = {},
  query = "",
}: {
  method: string;
  body?: string;
  headers?: Record<string, string>;
  query?: string;
}) {
  const req = new EventEmitter() as EventEmitter & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = `/telefun/realtime/openai/webrtc/sessions/${sessionId}/call${query}`;
  req.headers = {
    origin,
    authorization: "Bearer jwt",
    "content-type": "application/sdp",
    ...headers,
  };
  const on = req.on.bind(req);
  req.on = vi.fn((event: string, listener: (...args: unknown[]) => void) =>
    on(event, listener),
  ) as typeof req.on;
  queueMicrotask(() => {
    if (body) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req as unknown as IncomingMessage & { on: ReturnType<typeof vi.fn> };
}

function response() {
  const result = new EventEmitter() as EventEmitter & {
    status: number;
    headers: Record<string, string>;
    body: string;
    writableEnded: boolean;
    headersSent: boolean;
    writeHead: ServerResponse["writeHead"];
    end: ServerResponse["end"];
  };
  result.status = 0;
  result.headers = {};
  result.body = "";
  result.writableEnded = false;
  result.headersSent = false;
  result.writeHead = ((status: number, headers: Record<string, string>) => {
    result.status = status;
    result.headers = headers;
    result.headersSent = true;
  }) as typeof result.writeHead;
  result.end = ((body?: string) => {
    result.body = body ?? "";
    result.writableEnded = true;
  }) as typeof result.end;
  return result as unknown as ServerResponse & typeof result;
}

function createHarness(
  overrides: Partial<OpenAIWebRtcHttpHandlerDependencies> = {},
) {
  const manager = {
    startCall: vi.fn(),
    endCall: vi.fn(async () => undefined),
    failCall: vi.fn(async () => undefined),
  };
  const verifyToken = vi.fn(async () => ({
    success: true,
    user: { id: "user-1" },
  }));
  const getProfile = vi.fn(async () => ({
    role: "trainer",
    status: "active",
    is_deleted: false,
  }));
  const getSession = vi.fn(async () => ({
    id: sessionId,
    user_id: "user-1",
    status: "active",
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-webrtc",
  }));
  const handler = createOpenAIWebRtcHttpHandler({
    enabled: true,
    rollout: {
      enabled: true,
      nodeEnv: "production",
      allowedUserIds: ["user-1"],
      allowedModelIds: ["gpt-realtime-2.1"],
    },
    allowedOrigins: origin,
    manager,
    verifyToken,
    getProfile,
    getSession,
    ...overrides,
  } as OpenAIWebRtcHttpHandlerDependencies);
  return { handler, manager, verifyToken, getProfile, getSession };
}

describe("historical OpenAI WebRTC cleanup broker", () => {
  it("returns 404 for POST before CORS, auth, body, session, or manager work", async () => {
    const { handler, manager, verifyToken, getProfile, getSession } =
      createHarness();
    const req = request({
      method: "POST",
      body: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n",
      headers: { origin: "https://untrusted.example.test" },
    });
    const res = response();

    await expect(handler(req, res)).resolves.toBe(true);

    expect(res.status).toBe(404);
    expect(res.body).toBe('{"error":"Not found"}');
    expect(req.on).not.toHaveBeenCalledWith("data", expect.any(Function));
    expect(verifyToken).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a POST preflight before auth or manager work", async () => {
    const { handler, manager, verifyToken } = createHarness();
    const req = request({
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example.test",
        "access-control-request-method": "POST",
      },
    });
    const res = response();

    await handler(req, res);

    expect(res.status).toBe(404);
    expect(res.body).toBe('{"error":"Not found"}');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
  });

  it("serves exact-origin DELETE preflight with cleanup-only CORS", async () => {
    const { handler, verifyToken, manager } = createHarness();
    const res = response();

    await handler(
      request({
        method: "OPTIONS",
        headers: {
          "access-control-request-method": "DELETE",
          "access-control-request-headers": "Authorization, Content-Type",
        },
      }),
      res,
    );

    expect(res.status).toBe(204);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Vary: "Origin",
    });
    expect(verifyToken).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
  });

  it("allows authenticated owner-bound cleanup despite retired flag and cohort values", async () => {
    const { handler, manager, verifyToken } = createHarness({
      enabled: false,
      rollout: {
        enabled: false,
        nodeEnv: "test",
        allowedUserIds: [],
        allowedModelIds: [],
      },
    });
    const res = response();

    await handler(request({ method: "DELETE" }), res);

    expect(res.status).toBe(204);
    expect(manager.endCall).toHaveBeenCalledWith(sessionId, "user-1");
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(verifyToken).toHaveBeenCalledOnce();
  });

  it("routes a validated failed cleanup outcome only to failCall", async () => {
    const { handler, manager } = createHarness();
    const res = response();

    await handler(request({ method: "DELETE", query: "?outcome=failed" }), res);

    expect(res.status).toBe(204);
    expect(manager.failCall).toHaveBeenCalledWith(sessionId, "user-1");
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
  });

  it("hides foreign or nonhistorical cleanup rows with 404 before manager work", async () => {
    const { handler, manager } = createHarness({
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gemini-3.1-flash-live-preview",
        telefun_transport: "gemini-live",
      })),
    });
    const res = response();

    await handler(request({ method: "DELETE" }), res);

    expect(res.status).toBe(404);
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("uses owner DELETE to recover and hang up a decrypted historical call after restart", async () => {
    const callId = "rtc_http_restart";
    const getAttempt = vi.fn(async () => ({
      attemptId: "attempt-http-restart",
      finalizationKey: "finalization-key",
      state: "brokered" as const,
      usageRequestId: "telefun-webrtc:attempt-http-restart",
      providerCallIdHash: hashProviderCallId(callId),
      providerCallReference: "v1:http-restart-reference",
      modelId: "gpt-realtime-2.1" as const,
    }));
    const beginFinalization = vi.fn(async () => ({
      accepted: true,
      shouldFinalize: true,
      state: "ending" as const,
      reason: "ending",
    }));
    const finalizeAttempt = vi.fn(async () => ({
      applied: true,
      idempotent: false,
      reason: "finalized",
    }));
    const closeCall = vi.fn(async () => true);
    const manager = createWebRtcCleanupManager({
      db: { getAttempt, beginFinalization, finalizeAttempt } as any,
      callsClient: { closeCall },
      decryptProviderCallReference: (reference) =>
        reference === "v1:http-restart-reference" ? callId : null,
    });
    const { handler } = createHarness({ manager });
    const res = response();

    await handler(request({ method: "DELETE" }), res);

    expect(res.status).toBe(204);
    expect(closeCall).toHaveBeenCalledWith(callId);
    expect(finalizeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
    );
  });

  it("keeps durable retry and lifecycle conflict statuses safe", async () => {
    const unavailable = createHarness({
      manager: {
        endCall: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
        failCall: vi.fn(),
      },
    });
    const unavailableResponse = response();
    await unavailable.handler(
      request({ method: "DELETE" }),
      unavailableResponse,
    );
    expect(unavailableResponse.status).toBe(503);
    expect(unavailableResponse.body).toBe(
      '{"error":"Realtime call finalization unavailable"}',
    );

    const conflict = createHarness({
      manager: {
        endCall: vi.fn(async () => {
          throw new WebRtcCallConflictError();
        }),
        failCall: vi.fn(),
      },
    });
    const conflictResponse = response();
    await conflict.handler(request({ method: "DELETE" }), conflictResponse);
    expect(conflictResponse.status).toBe(409);
  });
});
