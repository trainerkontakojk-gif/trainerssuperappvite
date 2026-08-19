import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenAIWebRtcHttpHandler as createHttpHandler,
  type OpenAIWebRtcHttpHandlerDependencies,
} from "./http-broker.js";
import { createWebRtcCallManager, WebRtcRateLimitError } from "./call-manager.js";
import type { TelefunWebRtcDb } from "../db.js";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
const origin = "https://trainer.example.test";
const offer = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n";
const defaultRollout = {
  enabled: true,
  nodeEnv: "development",
  allowedUserIds: ["user-1"],
  allowedModelIds: ["gpt-realtime-2.1"],
} as const;

function createOpenAIWebRtcHttpHandler(
  dependencies: Omit<OpenAIWebRtcHttpHandlerDependencies, "rollout"> &
    Partial<Pick<OpenAIWebRtcHttpHandlerDependencies, "rollout">>,
) {
  return createHttpHandler({
    ...dependencies,
    rollout: dependencies.rollout ?? defaultRollout,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function request(
  method: string,
  body = "",
  headers: Record<string, string> = {},
  query = "",
) {
  const req = manualRequest(method, headers, query);
  queueMicrotask(() => {
    if (body) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req as unknown as IncomingMessage;
}

function manualRequest(
  method: string,
  headers: Record<string, string> = {},
  query = "",
) {
  const req = new EventEmitter() as EventEmitter & {
    method: string;
    url: string;
    headers: Record<string, string>;
    aborted?: boolean;
  };
  req.method = method;
  req.url = `/telefun/realtime/openai/webrtc/sessions/${sessionId}/call${query}`;
  req.headers = {
    origin,
    authorization: "Bearer jwt",
    "content-type": "application/sdp",
    ...headers,
  };
  return req;
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

describe("OpenAI WebRTC HTTP broker", () => {
  it("enforces the exact start cohort while allowing owner cleanup after removal", async () => {
    const manager = {
      startCall: vi.fn(),
      endCall: vi.fn(async () => undefined),
      failCall: vi.fn(async () => undefined),
    };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      rollout: {
        enabled: true,
        nodeEnv: "staging",
        allowedUserIds: ["different-user"],
        allowedModelIds: ["gpt-realtime-2.1"],
      },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager,
    });

    const rejected = response();
    await handler(request("POST", offer), rejected);
    expect(rejected.status).toBe(403);
    expect(manager.startCall).not.toHaveBeenCalled();

    const ended = response();
    await handler(request("DELETE"), ended);
    expect(ended.status).toBe(204);
    expect(manager.endCall).toHaveBeenCalledOnce();
  });

  it("permits authenticated failed cleanup DELETE when the start flag is off", async () => {
    const failCall = vi.fn(async () => undefined);
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: {
        enabled: false,
        nodeEnv: "staging",
        allowedUserIds: [],
        allowedModelIds: ["gpt-realtime-2.1"],
      },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall: vi.fn(), endCall: vi.fn(), failCall },
    });
    const res = response();

    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      res,
    );

    expect(res.status).toBe(204);
    expect(failCall).toHaveBeenCalledWith(sessionId, "user-1");
  });

  it("allows exact-origin cleanup preflight DELETE when the start flag is off", async () => {
    const verifyToken = vi.fn();
    const manager = { startCall: vi.fn(), endCall: vi.fn(), failCall: vi.fn() };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken,
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager,
    });
    const res = response();

    await handler(
      request("OPTIONS", "", {
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      }),
      res,
    );

    expect(res.status).toBe(204);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "OPTIONS, POST, DELETE",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Vary: "Origin",
    });
    expect(verifyToken).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("rejects disabled cleanup preflight POST without starting provider or auth", async () => {
    const verifyToken = vi.fn();
    const manager = { startCall: vi.fn(), endCall: vi.fn(), failCall: vi.fn() };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken,
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager,
    });
    const res = response();

    await handler(
      request("OPTIONS", "", {
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      }),
      res,
    );

    expect(res.status).toBe(404);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("rejects disabled actual POST without starting provider or auth", async () => {
    const verifyToken = vi.fn();
    const manager = { startCall: vi.fn(), endCall: vi.fn(), failCall: vi.fn() };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken,
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager,
    });
    const res = response();

    await handler(request("POST", offer), res);

    expect(res.status).toBe(404);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(manager.startCall).not.toHaveBeenCalled();
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("allows direct cleanup DELETE when the start flag is off", async () => {
    const endCall = vi.fn(async () => undefined);
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall: vi.fn(), endCall, failCall: vi.fn() },
    });
    const res = response();

    await handler(request("DELETE"), res);

    expect(res.status).toBe(204);
    expect(endCall).toHaveBeenCalledWith(sessionId, "user-1");
  });

  it("routes validated failed DELETE outcome to failCall", async () => {
    const failCall = vi.fn(async () => undefined);
    const endCall = vi.fn(async () => undefined);
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall: vi.fn(), endCall, failCall },
    });
    const res = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      res,
    );
    expect(res.status).toBe(204);
    expect(failCall).toHaveBeenCalledOnce();
    expect(endCall).not.toHaveBeenCalled();
  });

  it("returns 204 for a second failed cleanup after already_terminal", async () => {
    const db = {
      getAttempt: vi.fn(async () => null),
      failSessionWithoutAttempt: vi
        .fn()
        .mockResolvedValueOnce({
          applied: true,
          terminal: true,
          reason: "failed_without_attempt",
        })
        .mockResolvedValueOnce({
          applied: false,
          terminal: true,
          reason: "already_terminal",
        }),
    } as unknown as TelefunWebRtcDb;
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
    });
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "failed",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager,
    });
    const first = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      first,
    );
    const second = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      second,
    );

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(db.failSessionWithoutAttempt).toHaveBeenCalledTimes(2);
  });

  it("returns 204 for a second cleanup when a terminal attempt exists", async () => {
    const db = {
      getAttempt: vi.fn(async () => ({
        attemptId: "00000000-0000-4000-8000-000000000001",
        finalizationKey: "00000000-0000-4000-8000-000000000002",
        state: "ended",
        usageRequestId: `telefun-webrtc:${sessionId}`,
        providerCallIdHash: null,
      })),
      failSessionWithoutAttempt: vi.fn(async () => ({
        applied: false,
        terminal: true,
        reason: "attempt_exists_terminal",
      })),
    } as unknown as TelefunWebRtcDb;
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
    });
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: false,
      allowedOrigins: origin,
      rollout: { enabled: false, nodeEnv: "staging", allowedUserIds: [], allowedModelIds: ["gpt-realtime-2.1"] },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "failed",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager,
    });
    const first = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      first,
    );
    const second = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      second,
    );

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(db.failSessionWithoutAttempt).toHaveBeenCalledTimes(2);
  });

  it("records non-secret broker request and outcome observability", async () => {
    const endCall = vi.fn(async () => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const handler = createOpenAIWebRtcHttpHandler({
        enabled: true,
        allowedOrigins: origin,
        verifyToken: vi.fn(async () => ({
          success: true,
          user: { id: "user-1" },
        })),
        getProfile: vi.fn(async () => ({
          role: "trainer",
          status: "active",
          is_deleted: false,
        })),
        getSession: vi.fn(async () => ({
          id: sessionId,
          user_id: "user-1",
          status: "active",
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "openai-webrtc",
        })),
        manager: { startCall: vi.fn(), endCall, failCall: vi.fn() },
      });
      const res = response();

      await handler(request("DELETE"), res);

      expect(res.status).toBe(204);
      expect(warn).toHaveBeenCalledWith(
        "[Telefun] OpenAI WebRTC broker request",
        expect.objectContaining({
          method: "DELETE",
          sessionId,
          requestedOutcome: "completed",
          authOutcome: "success",
          httpStatus: 204,
          durationMs: expect.any(Number),
        }),
      );
      const serialized = JSON.stringify(warn.mock.calls);
      expect(serialized).not.toContain("SENTINEL-PROMPT");
      expect(serialized).not.toContain("SENTINEL-SDP");
      expect(serialized).not.toContain("rtc_SENTINEL");
      expect(serialized).not.toContain("SENTINEL-RAW-ERROR");
      expect(Object.keys(warn.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
        "authOutcome",
        "durationMs",
        "httpStatus",
        "method",
        "requestedOutcome",
        "sessionId",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("routes terminal history cleanup through the manager instead of trusting history alone", async () => {
    const failCall = vi.fn(async () => undefined);
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "failed",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall: vi.fn(), endCall: vi.fn(), failCall },
    });
    const res = response();

    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=failed"),
      res,
    );

    expect(res.status).toBe(204);
    expect(failCall).toHaveBeenCalledWith(sessionId, "user-1");
  });

  it("does not abort when IncomingMessage closes normally after its body ends", async () => {
    const started = deferred<{ answerSdp: string }>();
    const startCall = vi.fn(
      async (_input: { signal?: AbortSignal }) => started.promise,
    );
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const req = request("POST", offer);
    const res = response();
    const pending = handler(req, res);
    await vi.waitFor(() => expect(startCall).toHaveBeenCalledOnce());

    (req as unknown as EventEmitter).emit("close");
    expect(startCall.mock.calls[0]?.[0].signal?.aborted).toBe(false);

    started.resolve({ answerSdp: offer });
    await pending;
    expect(res.status).toBe(201);
  });

  it("does not authenticate or start when the client aborts during body reading", async () => {
    const verifyToken = vi.fn(async () => ({
      success: true,
      user: { id: "user-1" },
    }));
    const startCall = vi.fn();
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken,
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const req = manualRequest("POST");
    const pending = handler(req as unknown as IncomingMessage, response());
    req.emit("data", Buffer.from(offer));
    req.emit("aborted");
    await pending;
    expect(verifyToken).not.toHaveBeenCalled();
    expect(startCall).not.toHaveBeenCalled();
  });

  it("does not start when the client aborts during authentication", async () => {
    const verification = deferred<{ success: boolean; user: { id: string } }>();
    const verifyToken = vi.fn(() => verification.promise);
    const startCall = vi.fn();
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken,
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const req = request("POST", offer);
    const pending = handler(req, response());
    await vi.waitFor(() => expect(verifyToken).toHaveBeenCalledOnce());
    req.emit("aborted");
    verification.resolve({ success: true, user: { id: "user-1" } });
    await pending;
    expect(startCall).not.toHaveBeenCalled();
  });

  it("propagates an aborted response to broker start", async () => {
    const startCall = vi.fn(async (input: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        input.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
      return { answerSdp: offer };
    });
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const req = request("POST", offer);
    const res = response();
    const pending = handler(req, res);
    await vi.waitFor(() => expect(startCall).toHaveBeenCalledOnce());
    (res as unknown as EventEmitter).emit("close");
    await pending;
    expect(startCall.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(res.status).toBe(0);
  });

  it("rejects unknown DELETE query parameters without calling lifecycle", async () => {
    const manager = { startCall: vi.fn(), endCall: vi.fn(), failCall: vi.fn() };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager,
    });
    const res = response();
    await handler(
      request("DELETE", "", { "content-type": "" }, "?outcome=completed"),
      res,
    );
    expect(res.status).toBe(400);
    expect(manager.endCall).not.toHaveBeenCalled();
    expect(manager.failCall).not.toHaveBeenCalled();
  });

  it("brokers raw SDP with exact CORS and never returns provider metadata", async () => {
    const startCall = vi.fn(async () => ({ answerSdp: offer }));
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
        live_prompt_instructions: "Scenario: Kartu kredit jatuh tempo.",
        consumer_gender: "male",
      })),
      manager: {
        startCall,
        endCall: vi.fn(async () => undefined),
        failCall: vi.fn(async () => undefined),
      },
    });
    const res = response();

    await handler(request("POST", offer), res);

    expect(res.status).toBe(201);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "OPTIONS, POST, DELETE",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Content-Type": "application/sdp",
    });
    expect(res.body).toBe(offer);
    expect(JSON.stringify(res)).not.toContain("rtc_");
    expect(startCall).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId,
      offerSdp: offer,
      modelId: "gpt-realtime-2.1",
      livePromptInstructions: "Scenario: Kartu kredit jatuh tempo.",
      consumerGender: "male",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns a bounded Retry-After when distributed start rate limiting rejects", async () => {
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: {
        startCall: vi.fn(async () => {
          throw new WebRtcRateLimitError(
            new Date(Date.now() + 60_000).toISOString(),
          );
        }),
        endCall: vi.fn(),
        failCall: vi.fn(),
      },
    });
    const res = response();

    await handler(request("POST", offer), res);

    expect(res.status).toBe(429);
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
    expect(Number(res.headers["Retry-After"])).toBeLessThanOrEqual(60);
  });

  it("rejects wildcard origin, invalid content, and bodyful DELETE before manager calls", async () => {
    const manager = { startCall: vi.fn(), endCall: vi.fn(), failCall: vi.fn() };
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: "*",
      verifyToken: vi.fn(),
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager,
    });
    const wildcard = response();
    await handler(request("POST", offer), wildcard);
    expect(wildcard.status).toBe(403);
    expect(manager.startCall).not.toHaveBeenCalled();

    const validOriginHandler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(),
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager,
    });
    const invalid = response();
    await validOriginHandler(
      request("POST", "{}", { "content-type": "application/json" }),
      invalid,
    );
    expect(invalid.status).toBe(400);
    expect(manager.startCall).not.toHaveBeenCalled();

    const deletion = response();
    await validOriginHandler(
      request("DELETE", "not-empty", { "content-type": "" }),
      deletion,
    );
    expect(deletion.status).toBe(400);
    expect(manager.endCall).not.toHaveBeenCalled();

    const endedHandler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "admin",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "completed",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      })),
      manager: {
        startCall: vi.fn(),
        endCall: vi.fn(async () => undefined),
        failCall: vi.fn(async () => undefined),
      },
    });
    const ended = response();
    await endedHandler(request("DELETE"), ended);
    expect(ended.status).toBe(204);
  });

  it("passes the exact persisted model into the manager start call for Full and Mini", async () => {
    for (const modelId of ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"]) {
      const startCall = vi.fn(async () => ({ answerSdp: offer }));
      const handler = createOpenAIWebRtcHttpHandler({
        enabled: true,
        allowedOrigins: origin,
        rollout: {
          enabled: true,
          nodeEnv: "development",
          allowedUserIds: ["user-1"],
          allowedModelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
        },
        verifyToken: vi.fn(async () => ({
          success: true,
          user: { id: "user-1" },
        })),
        getProfile: vi.fn(async () => ({
          role: "trainer",
          status: "active",
          is_deleted: false,
        })),
        getSession: vi.fn(async () => ({
          id: sessionId,
          user_id: "user-1",
          status: "active",
          telefun_model_id: modelId,
          telefun_transport: "openai-webrtc",
        })),
        manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
      });
      const res = response();

      await handler(request("POST", offer), res);

      expect(res.status).toBe(201);
      expect(startCall).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId,
          sessionId,
          offerSdp: offer,
        }),
      );
    }
  });

  it("rejects an unsupported persisted model with 404 before any manager call", async () => {
    const startCall = vi.fn();
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      rollout: {
        enabled: true,
        nodeEnv: "development",
        allowedUserIds: ["user-1"],
        allowedModelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
      },
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getProfile: vi.fn(async () => ({
        role: "trainer",
        status: "active",
        is_deleted: false,
      })),
      getSession: vi.fn(async () => ({
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-4",
        telefun_transport: "openai-webrtc",
      })),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const res = response();

    await handler(request("POST", offer), res);

    expect(res.status).toBe(404);
    expect(startCall).not.toHaveBeenCalled();
  });

  it("keeps the browser unable to override the persisted model (raw SDP body only)", async () => {
    const startCall = vi.fn();
    const handler = createOpenAIWebRtcHttpHandler({
      enabled: true,
      allowedOrigins: origin,
      verifyToken: vi.fn(),
      getProfile: vi.fn(),
      getSession: vi.fn(),
      manager: { startCall, endCall: vi.fn(), failCall: vi.fn() },
    });
    const res = response();

    await handler(
      request("POST", '{"model":"gpt-realtime-2.1-mini"}', {
        "content-type": "application/json",
      }),
      res,
    );

    expect(res.status).toBe(400);
    expect(startCall).not.toHaveBeenCalled();
  });
});
