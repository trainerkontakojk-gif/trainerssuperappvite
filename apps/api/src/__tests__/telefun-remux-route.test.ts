import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({
  session: {
    user_id: "user-1",
    recording_path: "user-1/session-1/full_call.webm" as string | null,
    agent_recording_path: null as string | null,
    telefun_transport: undefined as string | undefined,
    status: "completed",
  },
  updateError: null as { message: string } | null,
  readbackSession: null as Record<string, unknown> | null,
  readbackError: null as { message: string } | null,
}));

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  remuxWebM: vi.fn(),
  checkFFmpegAvailable: vi.fn(),
}));

vi.mock("../lib/telefun-ffmpeg", () => ({
  checkFFmpegAvailable: mocks.checkFFmpegAvailable,
  remuxWebM: mocks.remuxWebM,
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mocks.createSignedUrl,
        upload: mocks.upload,
        remove: mocks.remove,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        const chain: any = {};
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () =>
          columns.startsWith("id, user_id, status")
            ? { data: state.readbackSession, error: state.readbackError }
            : { data: state.session, error: null },
        );
        return chain;
      }),
      update: mocks.update,
    })),
    rpc: mocks.rpc,
  })),
}));

import { telefunRemuxRecording } from "../routes/telefun/remux-recording";

type Variables = { user: User; profile: unknown };

function buildApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", telefunRemuxRecording);
  return app;
}

describe("POST /remux-recording/:sessionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = {
      user_id: "user-1",
      recording_path: "user-1/session-1/full_call.webm",
      agent_recording_path: null,
      telefun_transport: undefined,
      status: "completed",
    };
    state.updateError = null;
    state.readbackSession = null;
    state.readbackError = null;
    mocks.checkFFmpegAvailable.mockResolvedValue("ffmpeg version");
    mocks.createSignedUrl.mockImplementation(async (path: string) =>
      path.endsWith(".seekable.webm")
        ? { data: null, error: { statusCode: 404, message: "Object not found" } }
        : { data: { signedUrl: "https://storage.example/source.webm" }, error: null },
    );
    mocks.remuxWebM.mockResolvedValue(Buffer.from("seekable"));
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.update.mockImplementation(() => ({
      eq: vi.fn(async () => ({ error: state.updateError })),
    }));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("source"), { status: 200 })),
    );
  });

  it("treats an existing seekable path as an idempotent success", async () => {
    state.session.recording_path =
      "user-1/session-1/full_call.seekable.webm";

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { remuxed: true },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("removes newly uploaded seekable objects when the DB path update fails", async () => {
    state.updateError = { message: "update failed" };

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/full_call.seekable.webm",
    ]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      "user-1/session-1/full_call.webm",
    ]);
  });

  it("keeps sibling remux failures bounded and persists the successful item", async () => {
    state.session.agent_recording_path = "user-1/session-1/agent_only.webm";
    mocks.remuxWebM
      .mockResolvedValueOnce(Buffer.from("full-seekable"))
      .mockRejectedValueOnce(new Error("agent remux failed"));
    state.session.telefun_transport = "openai-webrtc";
    mocks.rpc.mockResolvedValue({
      data: [
        {
          applied: true,
          recording_status: "partial",
          recording_ready: true,
          scoring_ready: false,
          scoring_ready_at: null,
          scoring_status: "pending",
          reason: "ready",
        },
      ],
      error: null,
    });

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.remuxed).toBe(false);
    expect(body.data.recordings["user-1/session-1/full_call.webm"]).toMatchObject({
      remuxed: true,
      seekablePath: "user-1/session-1/full_call.seekable.webm",
    });
    expect(body.data.recordings["user-1/session-1/agent_only.webm"]).toMatchObject({
      remuxed: false,
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/full_call.webm",
    ]);
  });

  it("preserves the failed-capture latch when only the agent artifact survived", async () => {
    state.session.telefun_transport = "openai-webrtc";
    state.session.recording_path = null;
    state.session.agent_recording_path = "user-1/session-1/agent_only.webm";
    mocks.rpc.mockResolvedValue({
      data: [
        {
          applied: false,
          recording_status: "failed",
          recording_ready: false,
          scoring_ready: false,
          scoring_ready_at: null,
          scoring_status: "pending",
          reason: "capture_failed",
        },
      ],
      error: null,
    });

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "RECORDING_CONFLICT",
    });
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/agent_only.seekable.webm",
    ]);
  });

  it("records WebRTC seekable readiness through one atomic RPC for all siblings", async () => {
    state.session.telefun_transport = "openai-webrtc";
    state.session.status = "completed";
    state.session.agent_recording_path = "user-1/session-1/agent_only.webm";
    mocks.rpc.mockResolvedValue({
      data: [
        {
          applied: true,
          recording_status: "ready",
          recording_ready: true,
          scoring_ready: true,
          scoring_ready_at: "2026-08-01T00:00:00.000Z",
          scoring_status: "pending",
          reason: "ready",
        },
      ],
      error: null,
    });

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("mark_telefun_recording_ready", {
      p_session_id: "session-1",
      p_user_id: "user-1",
      p_recording_path: "user-1/session-1/full_call.seekable.webm",
      p_agent_recording_path: "user-1/session-1/agent_only.seekable.webm",
    });
    expect(mocks.upload.mock.calls.every((call) => call[2].upsert === false)).toBe(true);
    expect(body.data).toMatchObject({
      recordingStatus: "ready",
      recordingReady: true,
      scoringReady: true,
      scoringStatus: "pending",
    });
    expect(Math.min(...mocks.rpc.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...mocks.remove.mock.invocationCallOrder),
    );
  });

  it("reconciles an ambiguous RPC error from the exact read-back before cleanup", async () => {
    state.session.telefun_transport = "openai-webrtc";
    state.session.agent_recording_path = "user-1/session-1/agent_only.webm";
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    state.readbackSession = {
      id: "session-1",
      user_id: "user-1",
      status: "completed",
      telefun_transport: "openai-webrtc",
      recording_path: null,
      agent_recording_path: "user-1/other/agent_only.seekable.webm",
      recording_status: "partial",
      recording_ready_at: null,
      recording_error: null,
      scoring_ready_at: null,
      scoring_status: "pending",
    };

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "RECORDING_RECONCILIATION_AMBIGUOUS",
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/full_call.seekable.webm",
    ]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      "user-1/session-1/agent_only.seekable.webm",
    ]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      "user-1/session-1/full_call.webm",
    ]);
  });

  it("cleans persisted raw and confirmed-unpersisted seekable siblings before mixed read-back failure", async () => {
    state.session.telefun_transport = "openai-webrtc";
    state.session.agent_recording_path = "user-1/session-1/agent_only.webm";
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    state.readbackSession = {
      id: "session-1",
      user_id: "user-1",
      status: "completed",
      telefun_transport: "openai-webrtc",
      recording_path: "user-1/session-1/full_call.seekable.webm",
      agent_recording_path: null,
      recording_status: "partial",
      recording_ready_at: "2026-08-01T00:00:00.000Z",
      recording_error: null,
      scoring_ready_at: null,
      scoring_status: "pending",
    };

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatchObject({
      code: "RECORDING_STATE_UNAVAILABLE",
    });
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/agent_only.seekable.webm",
    ]);
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/full_call.webm",
    ]);
  });

  it("preserves a preexisting seekable output on a known readiness rejection", async () => {
    state.session.telefun_transport = "openai-webrtc";
    mocks.createSignedUrl.mockImplementation(async (path: string) =>
      path.endsWith(".seekable.webm")
        ? { data: { signedUrl: "https://storage.example/existing.webm" }, error: null }
        : { data: { signedUrl: "https://storage.example/source.webm" }, error: null },
    );
    mocks.rpc.mockResolvedValue({
      data: [{
        applied: false,
        recording_status: "failed",
        recording_ready: false,
        scoring_ready: false,
        scoring_ready_at: null,
        scoring_status: "failed",
        reason: "capture_failed",
      }],
      error: null,
    });

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("preserves an unknown output when seekable presence cannot be proven", async () => {
    state.session.telefun_transport = "openai-webrtc";
    mocks.createSignedUrl.mockImplementation(async (path: string) =>
      path.endsWith(".seekable.webm")
        ? { data: null, error: { statusCode: 500, message: "storage unavailable" } }
        : { data: { signedUrl: "https://storage.example/source.webm" }, error: null },
    );

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("REMUX_ERROR");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
