import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({
  session: {
    user_id: "user-1",
    status: "completed",
    telefun_transport: "openai-webrtc",
    recording_path: null as string | null,
    agent_recording_path: null as string | null,
    scoring_status: "pending",
    scoring_ready_at: null as string | null,
    recording_status: "pending",
    recording_error: null as string | null,
  },
  rpcResult: null as { data: unknown; error: unknown } | null,
}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  analyze: vi.fn(),
  coaching: vi.fn(),
  permanentlyFail: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mocks.rpc,
    storage: {
      from: vi.fn(() => ({ remove: mocks.remove })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: state.session, error: null })),
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ data: [state.session], error: null }),
        })),
      })),
      update: mocks.update,
    })),
  })),
}));

vi.mock("../lib/telefun-analysis", () => ({
  analyzeVoiceQuality: mocks.analyze,
  generateCoachingSummary: mocks.coaching,
  isTelefunWebRtcSeekableAgentPath: vi.fn(({ path, userId, sessionId }) =>
    path === `${userId}/${sessionId}/agent_only.seekable.webm`,
  ),
}));

vi.mock("../services/telefun-scoring-service", () => ({
  enqueueScoring: vi.fn(),
  isWebRtcScoringReady: vi.fn((state: any, userId: string, sessionId: string) =>
    state?.telefun_transport !== "openai-webrtc" ||
    (state.status === "completed" &&
      (state.recording_status === "partial" || state.recording_status === "ready") &&
      state.recording_error == null &&
      state.scoring_ready_at != null &&
      state.agent_recording_path ===
        `${userId}/${sessionId}/agent_only.seekable.webm`),
  ),
  permanentlyFailRetiredOpenAiScoring: mocks.permanentlyFail,
}));

import { telefunRecordings } from "../routes/telefun/recordings";
import { telefunSessions } from "../routes/telefun/sessions";

type Variables = { user: User; profile: { role: string } };

function buildApp(route: "recordings" | "sessions") {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "admin" });
    await next();
  });
  app.route("/", route === "recordings" ? telefunRecordings : telefunSessions);
  return app;
}

describe("Telefun Phase 4 recording and server-owned lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = {
      user_id: "user-1",
      status: "completed",
      telefun_transport: "openai-webrtc",
      recording_path: null,
      agent_recording_path: null,
      scoring_status: "pending",
      scoring_ready_at: null,
      recording_status: "pending",
      recording_error: null,
    };
    state.rpcResult = {
      data: [
        {
          applied: true,
          recording_status: "uploaded",
          recording_ready: false,
          scoring_ready: false,
          scoring_ready_at: null,
          scoring_status: "pending",
          reason: "uploaded",
        },
      ],
      error: null,
    };
    mocks.rpc.mockImplementation(async () => state.rpcResult);
    mocks.update.mockImplementation(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    }));
    mocks.analyze.mockResolvedValue({ success: true });
    mocks.coaching.mockResolvedValue({ success: true });
    mocks.permanentlyFail.mockResolvedValue(true);
  });

  it("persists upload state through the recording RPC without completing the session", async () => {
    const response = await buildApp("recordings").request("/finalize-recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
        recordingPath: "user-1/019f45e3-5fac-7cd2-afeb-8069c2f813b3/full_call.webm",
        agentRecordingPath: "user-1/019f45e3-5fac-7cd2-afeb-8069c2f813b3/agent_only.webm",
        captureStatus: "ready",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        recordingStatus: "uploaded",
        recordingReady: false,
        scoringReady: false,
        scoringStatus: "pending",
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("mark_telefun_recording_uploaded", {
      p_session_id: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
      p_user_id: "user-1",
      p_recording_path: "user-1/019f45e3-5fac-7cd2-afeb-8069c2f813b3/full_call.webm",
      p_agent_recording_path: "user-1/019f45e3-5fac-7cd2-afeb-8069c2f813b3/agent_only.webm",
      p_capture_status: "ready",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("permanently retires terminal historical WebRTC scoring before artifact readiness", async () => {
    state.rpcResult = { data: true, error: null };

    const response = await buildApp("recordings").request("/score/019f45e3-5fac-7cd2-afeb-8069c2f813b3", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toMatchObject({
      code: "TELEFUN_OPENAI_SCORING_DISABLED",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_telefun_scoring", {
      p_session_id: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
      p_claim_timeout_seconds: 120,
    });
    expect(mocks.permanentlyFail).toHaveBeenCalledWith(
      "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("does not run analysis or completion for a terminal historical WebRTC capture", async () => {
    state.session = {
      user_id: "user-1",
      status: "completed",
      telefun_transport: "openai-webrtc",
      recording_path: "user-1/session-1/full_call.seekable.webm",
      agent_recording_path: "user-1/session-1/agent_only.seekable.webm",
      scoring_status: "processing",
      scoring_ready_at: "2026-08-01T00:00:00.000Z",
      recording_status: "ready",
      recording_error: null,
    };
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const response = await buildApp("recordings").request("/score/session-1", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toMatchObject({
      code: "TELEFUN_OPENAI_SCORING_DISABLED",
    });
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "complete_telefun_scoring",
      expect.anything(),
    );
    expect(mocks.permanentlyFail).toHaveBeenCalledWith("session-1");
  });

  it("rejects deletion of an active WebRTC session before touching storage", async () => {
    state.session.status = "active";

    const response = await buildApp("sessions").request(
      "/history/019f45e3-5fac-7cd2-afeb-8069c2f813b3",
      { method: "DELETE" },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "ACTIVE_WEBRTC_SESSION" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects clear-history deletion when any active WebRTC session remains", async () => {
    state.session.status = "active";

    const response = await buildApp("sessions").request("/history", {
      method: "DELETE",
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "ACTIVE_WEBRTC_SESSION" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects client-owned WebRTC lifecycle fields while allowing no writes", async () => {
    const response = await buildApp("sessions").request("/sessions/019f45e3-5fac-7cd2-afeb-8069c2f813b3", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", messages: [] }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "SERVER_OWNED_LIFECYCLE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
