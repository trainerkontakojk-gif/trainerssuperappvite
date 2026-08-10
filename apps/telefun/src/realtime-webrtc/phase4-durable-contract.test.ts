import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

import {
  createWebRtcCallManager,
  WebRtcCallConflictError,
} from "./call-manager.js";
import {
  createOpenAIWebRtcHttpHandler,
  type OpenAIWebRtcHttpHandlerDependencies,
} from "./http-broker.js";
import {
  WebRtcDurabilityError,
  type TelefunWebRtcDb,
  type WebRtcAttemptClaim,
} from "../db.js";

const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
const userId = "019f45e3-5fac-7cd2-afeb-8069c2f81400";
const attemptId = "019f45e3-5fac-7cd2-afeb-8069c2f81401";
const finalizationKey = "019f45e3-5fac-7cd2-afeb-8069c2f81402";
const usageRequestId = `telefun-webrtc:${attemptId}` as `telefun-webrtc:${string}`;
const offer = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n";
const answer = "v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\ns=-\r\n";
const callId = "rtc_durable_call";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const validUsage = {
  input_tokens: 10,
  output_tokens: 4,
  total_tokens: 14,
  input_token_details: {
    text_tokens: 10,
    audio_tokens: 0,
    cached_tokens: 0,
  },
  output_token_details: { text_tokens: 4, audio_tokens: 0 },
};

function durableDb(): TelefunWebRtcDb {
  return {
    claimAttempt: vi.fn(async () => ({
      claimed: true,
      attemptId,
      finalizationKey,
      usageRequestId,
      state: "claimed" as const,
      reason: "claimed",
    })),
    getAttempt: vi.fn(async () => null),
    bindProviderCall: vi.fn(async () => ({
      accepted: true,
      state: "brokered" as const,
      reason: "bound",
    })),
    markSidebandConnected: vi.fn(async () => ({
      accepted: true,
      state: "sideband_connected" as const,
      reason: "connected",
    })),
    checkpointTranscript: vi.fn(async (input: { sequence: number }) => ({
      accepted: true,
      operation: "inserted",
      checkpointSequence: input.sequence,
      reason: "checkpointed",
    })),
    beginFinalization: vi.fn(async () => ({
      accepted: true,
      shouldFinalize: true,
      state: "ending" as const,
      reason: "ending",
    })),
    finalizeAttempt: vi.fn(async () => ({
      applied: true,
      idempotent: false,
      reason: "ended",
    })),
    markUsage: vi.fn(async (input: { status: "persisted" | "incomplete" | "failed" }) => ({
      applied: true,
      idempotent: false,
      usageRequestId,
      status: input.status,
      reason: "recorded",
    })),
  };
}

function response() {
  const result = new EventEmitter() as EventEmitter & {
    status: number;
    headers: Record<string, string>;
    body: string;
    writableEnded: boolean;
    headersSent: boolean;
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  };
  result.status = 0;
  result.headers = {};
  result.body = "";
  result.writableEnded = false;
  result.headersSent = false;
  result.writeHead = (status, headers) => {
    result.status = status;
    result.headers = headers;
    result.headersSent = true;
  };
  result.end = (body = "") => {
    result.body = body;
    result.writableEnded = true;
  };
  return result;
}

function request(method: string, query = "") {
  const req = new EventEmitter() as EventEmitter & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = `/telefun/realtime/openai/webrtc/sessions/${sessionId}/call${query}`;
  req.headers = {
    origin: "https://trainer.example.test",
    authorization: "Bearer jwt",
    "content-type": "",
  };
  queueMicrotask(() => req.emit("end"));
  return req;
}

function brokerDependencies(
  manager: OpenAIWebRtcHttpHandlerDependencies["manager"],
): OpenAIWebRtcHttpHandlerDependencies {
  return {
    enabled: true,
    allowedOrigins: "https://trainer.example.test",
    rollout: {
      enabled: true,
      nodeEnv: "development",
      allowedUserIds: [userId],
    },
    verifyToken: vi.fn(async () => ({ success: true, user: { id: userId } })),
    getProfile: vi.fn(async () => ({
      role: "trainer",
      status: "active",
      is_deleted: false,
    })),
    getSession: vi.fn(async () => ({
      id: sessionId,
      user_id: userId,
      status: "active",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
    })),
    manager,
  };
}

describe("OpenAI WebRTC Phase 4 durable contract", () => {
  it("claims before provider work, hashes the call ID, and marks sideband after connect", async () => {
    const db = durableDb();
    const order: string[] = [];
    vi.mocked(db.claimAttempt).mockImplementation(async () => {
      order.push("claim");
      return {
        claimed: true,
        attemptId,
        finalizationKey,
        usageRequestId,
        state: "claimed",
        reason: "claimed",
      };
    });
    const socket = {
      connect: vi.fn(async () => {
        order.push("sideband-connect");
      }),
      sealAdmission: vi.fn(),
      drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
      close: vi.fn(),
    };
    const callsClient = {
      createCall: vi.fn(async () => {
        order.push("provider-create");
        return { answerSdp: answer, callId };
      }),
      closeCall: vi.fn(async () => true),
    };
    const createSideband = vi.fn(() => socket);
    const manager = createWebRtcCallManager({
      db,
      callsClient,
      createSideband,
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({
      userId,
      sessionId,
      offerSdp: offer,
      livePromptInstructions: "Scenario: Kartu kredit jatuh tempo.",
    });

    expect(db.claimAttempt).toHaveBeenCalledOnce();
    expect(callsClient.createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          instructions: "Scenario: Kartu kredit jatuh tempo.",
        }),
      }),
    );
    expect(order).toEqual(["claim", "provider-create", "sideband-connect"]);
    expect(db.bindProviderCall).toHaveBeenCalledWith(
      attemptId,
      userId,
      createHash("sha256").update(callId).digest("hex"),
    );
    expect(db.bindProviderCall).not.toHaveBeenCalledWith(
      attemptId,
      userId,
      callId,
    );
    expect(db.markSidebandConnected).toHaveBeenCalledAfter(
      db.bindProviderCall as never,
    );
    expect(db.markSidebandConnected).toHaveBeenCalledAfter(
      socket.connect as never,
    );
  });

  it("checkpoints sideband transcript and uses the claim usage request ID exactly once", async () => {
    const db = durableDb();
    const callbacks: { onEvent: (event: unknown) => void }[] = [];
    const socket = {
      connect: vi.fn(async () => undefined),
      sealAdmission: vi.fn(),
      drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
      close: vi.fn(),
    };
    const flushUsage = vi.fn(async () => true);
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn((_callId, nextCallbacks) => {
        callbacks.push(nextCallbacks);
        return socket;
      }),
      flushUsage,
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    callbacks[0]!.onEvent({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "input-1",
      transcript: "Halo",
    });
    callbacks[0]!.onEvent({
      type: "response.done",
      response: { id: "response-1", status: "completed", usage: validUsage },
    });

    await manager.endCall(sessionId, userId);

    expect(db.checkpointTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        userId,
        sequence: 1,
        dedupeKey: "transcript:0",
        speaker: "agent",
        text: "Halo",
        isPartial: false,
      }),
    );
    expect(flushUsage).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId, usageRequestId }),
    );
    expect(db.markUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        userId,
        status: "persisted",
      }),
    );
    expect(db.finalizeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId,
        userId,
        finalizationKey,
        outcome: "completed",
      }),
    );
  });

  it("rejects row-drift prompt overflow before provider work", async () => {
    const db = durableDb();
    const createCall = vi.fn(async () => ({ answerSdp: answer, callId }));
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall, closeCall: vi.fn(async () => true) },
      createSideband: vi.fn(),
      createAttemptId: vi.fn(() => attemptId),
    });

    await expect(
      manager.startCall({
        userId,
        sessionId,
        offerSdp: offer,
        livePromptInstructions: "x".repeat(16_001),
      }),
    ).rejects.toBeInstanceOf(WebRtcDurabilityError);
    expect(createCall).not.toHaveBeenCalled();
  });

  it("audits missing usage without synthesizing billable tokens", async () => {
    const db = durableDb();
    const auditFailedUsage = vi.fn(async (input: { usageRequestId: string }) => {
      expect(input.usageRequestId).toBe(usageRequestId);
      return true;
    });
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
      auditFailedUsage,
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await manager.endCall(sessionId, userId);

    expect(auditFailedUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usageRequestId }),
    );
    expect(db.markUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "incomplete" }),
    );
    expect(db.finalizeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "completed" }),
    );
  });

  it("keeps the durable binding retryable after terminal persistence fails", async () => {
    const db = durableDb();
    vi.mocked(db.finalizeAttempt)
      .mockRejectedValueOnce(new WebRtcDurabilityError("finalize"))
      .mockResolvedValueOnce({ applied: true, idempotent: false, reason: "ended" });
    const closeCall = vi.fn(async () => true);
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall,
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await expect(manager.endCall(sessionId, userId)).rejects.toThrow("durable");
    await expect(manager.endCall(sessionId, userId)).resolves.toBeUndefined();

    expect(db.finalizeAttempt).toHaveBeenCalledTimes(2);
    expect(db.finalizeAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ outcome: "completed" }),
    );
    expect(closeCall).toHaveBeenCalledOnce();
  });

  it("returns successfully for a second no-attempt finalization after already_terminal", async () => {
    const db = durableDb();
    const failSessionWithoutAttempt = vi
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
      });
    vi.mocked(db.getAttempt).mockResolvedValue(null);
    const manager = createWebRtcCallManager({
      db: { ...db, failSessionWithoutAttempt },
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
    });

    await expect(manager.failCall(sessionId, userId)).resolves.toBeUndefined();
    await expect(manager.endCall(sessionId, userId)).resolves.toBeUndefined();
    expect(failSessionWithoutAttempt).toHaveBeenNthCalledWith(1, sessionId, userId);
    expect(failSessionWithoutAttempt).toHaveBeenNthCalledWith(2, sessionId, userId);
    expect(failSessionWithoutAttempt).toHaveBeenCalledTimes(2);
    expect(db.finalizeAttempt).not.toHaveBeenCalled();
  });

  it("resolves for a no-attempt finalization when a terminal attempt exists", async () => {
    const db = durableDb();
    const failSessionWithoutAttempt = vi.fn(async () => ({
      applied: false,
      terminal: true,
      reason: "attempt_exists_terminal",
    }));
    vi.mocked(db.getAttempt).mockResolvedValue({
      attemptId: "00000000-0000-4000-8000-000000000001",
      finalizationKey: "00000000-0000-4000-8000-000000000002",
      state: "ended",
      usageRequestId: `telefun-webrtc:${sessionId}`,
      providerCallIdHash: null,
    });
    const manager = createWebRtcCallManager({
      db: { ...db, failSessionWithoutAttempt },
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
    });

    await expect(manager.endCall(sessionId, userId)).resolves.toBeUndefined();
    await expect(manager.failCall(sessionId, userId)).resolves.toBeUndefined();
    expect(failSessionWithoutAttempt).toHaveBeenCalledTimes(2);
    expect(db.finalizeAttempt).not.toHaveBeenCalled();
    expect(db.claimAttempt).not.toHaveBeenCalled();
  });

  it("records non-secret no-attempt finalization observability", async () => {
    const db = durableDb();
    const failSessionWithoutAttempt = vi.fn(async () => ({
      applied: true,
      terminal: true,
      reason: "failed_without_attempt",
    }));
    vi.mocked(db.getAttempt).mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const manager = createWebRtcCallManager({
        db: { ...db, failSessionWithoutAttempt },
        callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
        createSideband: vi.fn(),
      });

      await manager.failCall(sessionId, userId);

      expect(warn).toHaveBeenCalledWith(
        "[Telefun] OpenAI WebRTC no-attempt finalization",
        expect.objectContaining({
          sessionId,
          requestedOutcome: "failed",
          applied: true,
          terminal: true,
          reason: "failed_without_attempt",
          durationMs: expect.any(Number),
        }),
      );
      const serialized = JSON.stringify(warn.mock.calls);
      expect(serialized).not.toContain("SENTINEL-PROMPT");
      expect(serialized).not.toContain("SENTINEL-SDP");
      expect(serialized).not.toContain("rtc_SENTINEL");
      expect(serialized).not.toContain("SENTINEL-RAW-ERROR");
      expect(Object.keys(warn.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
        "applied",
        "durationMs",
        "reason",
        "requestedOutcome",
        "sessionId",
        "terminal",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("returns a conflict when an attempt appears during no-attempt failure", async () => {
    const db = durableDb();
    vi.mocked(db.getAttempt).mockResolvedValue(null);
    const manager = createWebRtcCallManager({
      db: {
        ...db,
        failSessionWithoutAttempt: vi.fn(async () => ({
          applied: false,
          terminal: false,
          reason: "attempt_exists_active",
        })),
      },
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
    });

    await expect(manager.failCall(sessionId, userId)).rejects.toThrow(/active call/i);
  });

  it("propagates a rejected durable claim to a concurrent DELETE", async () => {
    const db = durableDb();
    const rejectedClaim = deferred<WebRtcAttemptClaim>();
    vi.mocked(db.claimAttempt).mockImplementation(() => rejectedClaim.promise);
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(),
        closeCall: vi.fn(),
      },
      createSideband: vi.fn(),
      createAttemptId: vi.fn(() => attemptId),
    });

    const starting = manager.startCall({
      userId,
      sessionId,
      offerSdp: offer,
    });
    await vi.waitFor(() => expect(db.claimAttempt).toHaveBeenCalledOnce());

    const ending = manager.endCall(sessionId, userId);
    rejectedClaim.resolve({
      claimed: false,
      attemptId: "competing-attempt",
      finalizationKey,
      usageRequestId,
      state: "brokered",
      reason: "attempt_exists_active",
    });

    await expect(ending).rejects.toBeInstanceOf(WebRtcCallConflictError);
    await expect(starting).rejects.toBeInstanceOf(WebRtcCallConflictError);
    expect(db.finalizeAttempt).not.toHaveBeenCalled();
  });

  it("admits hangup-time frames before sealing, draining, and closing", async () => {
    const db = durableDb();
    const order: string[] = [];
    let callbacks: { onEvent: (event: unknown) => void } | undefined;
    vi.mocked(db.beginFinalization).mockImplementation(async () => {
      order.push("begin");
      return {
        accepted: true,
        shouldFinalize: true,
        state: "ending",
        reason: "ending",
      };
    });
    vi.mocked(db.checkpointTranscript).mockImplementation(async (input) => {
      order.push("checkpoint");
      return {
        accepted: true,
        operation: "inserted",
        checkpointSequence: input.sequence,
        reason: "checkpointed",
      };
    });
    vi.mocked(db.markUsage).mockImplementation(async (input) => {
      order.push("usage");
      return {
        applied: true,
        idempotent: false,
        usageRequestId,
        status: input.status,
        reason: "recorded",
      };
    });
    vi.mocked(db.finalizeAttempt).mockImplementation(async () => {
      order.push("terminal");
      return { applied: true, idempotent: false, reason: "ended" };
    });
    const socket = {
      connect: vi.fn(async () => {
        order.push("connect");
      }),
      sealAdmission: vi.fn(() => {
        order.push("seal");
      }),
      drain: vi.fn(async () => {
        order.push("drain");
        return { admittedFrameCount: 1 };
      }),
      close: vi.fn(() => {
        order.push("close");
      }),
    };
    const flushUsage = vi.fn(async () => true);
    const closeCall = vi.fn(async () => {
      order.push("hangup");
      callbacks?.onEvent({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "hangup-final",
        transcript: "Frame during hangup",
      });
      callbacks?.onEvent({
        type: "response.done",
        response: {
          id: "hangup-usage",
          status: "completed",
          usage: validUsage,
        },
      });
      return true;
    });
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall,
      },
      createSideband: vi.fn((_callId, nextCallbacks) => {
        callbacks = nextCallbacks;
        return socket;
      }),
      flushUsage,
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await manager.endCall(sessionId, userId);

    expect(db.checkpointTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Frame during hangup" }),
    );
    expect(flushUsage).toHaveBeenCalledOnce();
    expect(db.markUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "persisted" }),
    );
    expect(order.indexOf("begin")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("hangup")).toBeGreaterThan(order.indexOf("begin"));
    expect(order.indexOf("seal")).toBeGreaterThan(order.indexOf("hangup"));
    expect(order.indexOf("drain")).toBeGreaterThan(order.indexOf("seal"));
    expect(order.indexOf("close")).toBeGreaterThan(order.indexOf("drain"));
    expect(order.indexOf("checkpoint")).toBeGreaterThan(order.indexOf("close"));
    expect(order.indexOf("usage")).toBeGreaterThan(order.indexOf("checkpoint"));
    expect(order.indexOf("terminal")).toBeGreaterThan(order.indexOf("usage"));
  });

  it("drains a queued final sideband frame before checkpoint and terminal persistence", async () => {
    const db = durableDb();
    let callbacks: { onEvent: (event: unknown) => void } | undefined;
    const drain = vi.fn(async () => {
      callbacks?.onEvent({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "queued-final",
        transcript: "Final queued turn",
      });
      return { admittedFrameCount: 1 };
    });
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn((_callId, nextCallbacks) => {
        callbacks = nextCallbacks;
        return {
          connect: vi.fn(async () => undefined),
          sealAdmission: vi.fn(),
          drain,
          close: vi.fn(),
        };
      }),
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await manager.endCall(sessionId, userId);

    expect(drain).toHaveBeenCalledOnce();
    expect(db.checkpointTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Final queued turn", sequence: 1 }),
    );
  });

  it("retains a binding after a drain failure so the next DELETE can retry", async () => {
    const db = durableDb();
    const drain = vi
      .fn()
      .mockRejectedValueOnce(new Error("sideband drain timeout"))
      .mockResolvedValue({ admittedFrameCount: 0 });
    const sealAdmission = vi.fn();
    const close = vi.fn();
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission,
        drain,
        close,
      })),
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await expect(manager.endCall(sessionId, userId)).rejects.toThrow(/durable/i);
    await expect(manager.endCall(sessionId, userId)).resolves.toBeUndefined();

    expect(drain).toHaveBeenCalledTimes(2);
    expect(sealAdmission).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(db.finalizeAttempt).toHaveBeenCalledOnce();
  });

  it("bounds a hanging recovered attempt read and leaves cleanup retryable", async () => {
    const db = durableDb();
    vi.mocked(db.getAttempt).mockImplementation(() => new Promise(() => {}));
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
      persistenceTimeoutMs: 100,
    });

    await expect(manager.endCall(sessionId, userId)).rejects.toBeInstanceOf(
      WebRtcDurabilityError,
    );
  });

  it("bounds a hanging attempt claim before provider creation", async () => {
    const db = durableDb();
    vi.mocked(db.claimAttempt).mockImplementation(() => new Promise(() => {}));
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall: vi.fn(), closeCall: vi.fn() },
      createSideband: vi.fn(),
      persistenceTimeoutMs: 100,
    });

    await expect(
      manager.startCall({ userId, sessionId, offerSdp: offer }),
    ).rejects.toBeInstanceOf(WebRtcDurabilityError);
  });

  it("closes a late provider call when durable binding rejects and fails closed on close failure", async () => {
    const db = durableDb();
    const created = deferred<{ answerSdp: string; callId: string }>();
    vi.mocked(db.bindProviderCall).mockResolvedValue({
      accepted: false,
      state: "ended",
      reason: "attempt_terminalizing",
    });
    const closeCall = vi.fn(async () => false);
    const createCall = vi.fn(() => created.promise);
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall, closeCall },
      createSideband: vi.fn(),
      createAttemptId: vi.fn(() => attemptId),
    });

    const starting = manager.startCall({ userId, sessionId, offerSdp: offer });
    await vi.waitFor(() => expect(createCall).toHaveBeenCalledOnce());
    await manager.failCall(sessionId, userId);
    created.resolve({ answerSdp: answer, callId });

    await expect(starting).rejects.toBeInstanceOf(WebRtcDurabilityError);
    expect(closeCall).toHaveBeenCalledWith(callId);
  });

  it("does not claim successful recovery cleanup when the raw provider call ID is unavailable", async () => {
    const db = durableDb();
    vi.mocked(db.getAttempt).mockResolvedValue({
      attemptId,
      finalizationKey,
      state: "sideband_connected",
      usageRequestId,
      providerCallIdHash: null,
    });
    const closeCall = vi.fn(async () => true);
    const manager = createWebRtcCallManager({
      db,
      callsClient: { createCall: vi.fn(), closeCall },
      createSideband: vi.fn(),
    });

    await expect(manager.endCall(sessionId, userId)).rejects.toThrow(/durable/i);
    expect(closeCall).not.toHaveBeenCalled();
    expect(db.finalizeAttempt).not.toHaveBeenCalled();
  });

  it("drains in-process bindings during manager shutdown", async () => {
    const db = durableDb();
    const closeCall = vi.fn(async () => true);
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall,
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
      createAttemptId: vi.fn(() => attemptId),
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    await expect(manager.shutdown()).resolves.toBeUndefined();

    expect(closeCall).toHaveBeenCalledWith(callId);
    expect(db.finalizeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
    );
  });

  it("rejects shutdown after two bounded finalization attempts and gates new starts", async () => {
    const db = durableDb();
    vi.mocked(db.finalizeAttempt).mockRejectedValue(
      new WebRtcDurabilityError("finalize"),
    );
    const manager = createWebRtcCallManager({
      db,
      callsClient: {
        createCall: vi.fn(async () => ({ answerSdp: answer, callId })),
        closeCall: vi.fn(async () => true),
      },
      createSideband: vi.fn(() => ({
        connect: vi.fn(async () => undefined),
        sealAdmission: vi.fn(),
        drain: vi.fn(async () => ({ admittedFrameCount: 0 })),
        close: vi.fn(),
      })),
      createAttemptId: vi.fn(() => attemptId),
      shutdownTimeoutMs: 1_000,
    });

    await manager.startCall({ userId, sessionId, offerSdp: offer });
    const firstShutdown = manager.shutdown();
    const secondShutdown = manager.shutdown();
    expect(secondShutdown).toBe(firstShutdown);
    await expect(firstShutdown).rejects.toThrow(/shutdown/i);
    expect(db.finalizeAttempt).toHaveBeenCalledTimes(2);
    await expect(
      manager.startCall({
        userId,
        sessionId: "019f45e3-5fac-7cd2-afeb-8069c2f81499",
        offerSdp: offer,
      }),
    ).rejects.toThrow(/shutdown/i);
  });

  it("returns 409 when failed DELETE races an attempt claim", async () => {
    const manager = {
      startCall: vi.fn(),
      endCall: vi.fn(),
      failCall: vi.fn(async () => {
        throw new WebRtcCallConflictError();
      }),
    };
    const handler = createOpenAIWebRtcHttpHandler(brokerDependencies(manager));
    const res = response();
    const req = request("DELETE", "?outcome=failed");

    await handler(req as never, res as never);

    expect(res.status).toBe(409);
  });

  it("returns 503 when durable DELETE finalization is retryable", async () => {
    const manager = {
      startCall: vi.fn(),
      endCall: vi.fn(async () => {
        throw new WebRtcDurabilityError("finalize");
      }),
      failCall: vi.fn(async () => undefined),
    };
    const handler = createOpenAIWebRtcHttpHandler(brokerDependencies(manager));
    const res = response();
    const req = request("DELETE");

    await handler(req as never, res as never);

    expect(res.status).toBe(503);
  });
});
