import { describe, expect, it, vi } from "vitest";
import {
  authorizeWebRtcCall,
  type BrokerAuthDependencies,
  type WebRtcProfile,
  type WebRtcSession,
} from "./broker-auth.js";

const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";

function deps(
  profile: Record<string, unknown> | null,
  session: Record<string, unknown> | null,
): BrokerAuthDependencies {
  return {
    rollout: {
      enabled: true,
      nodeEnv: "development",
      allowedUserIds: ["user-1"],
    },
    verifyToken: vi.fn(async () => ({ success: true, user: { id: "user-1" } })),
    getProfile: vi.fn(async () => profile as WebRtcProfile | null),
    getSession: vi.fn(async () => session as WebRtcSession | null),
  };
}

describe("WebRTC broker authorization", () => {
  it.each([
    ["whitespace/case legacy approved status", { role: "trainer", status: " approved ", is_deleted: false }],
    ["uppercase normalized active status", { role: "trainer", status: "ACTIVE", is_deleted: false }],
    ["uppercase admin role", { role: "ADMIN", status: "active", is_deleted: false }],
    ["whitespace/case legacy trainers role", { role: " Trainers ", status: "active", is_deleted: false }],
  ])("accepts %s", async (_name, profile) => {
    const dependencies = deps(profile, {
      id: sessionId,
      user_id: "user-1",
      status: "active",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
    });

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: true, userId: "user-1", sessionId });
  });

  it.each([
    ["unknown status", { role: "trainer", status: "unknown", is_deleted: false }],
    ["null status", { role: "trainer", status: null, is_deleted: false }],
    ["unknown role", { role: "unknown", status: "active", is_deleted: false }],
    ["null role", { role: null, status: "active", is_deleted: false }],
  ])("rejects %s", async (_name, profile) => {
    const dependencies = deps(profile, null);

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("requires active admin/trainer profile and an owned active canonical session", async () => {
    const dependencies = deps(
      { id: "user-1", role: "trainer", status: "approved", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      },
    );

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: true, userId: "user-1", sessionId, session: { id: sessionId } });
  });

  it("denies a start for an exact non-allowlisted user and permits end after rollout removal", async () => {
    const dependencies = deps(
      { role: "trainer", status: "active", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      },
    );
    dependencies.rollout = {
      enabled: true,
      nodeEnv: "staging",
      allowedUserIds: ["another-user"],
    };

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: false, reason: "forbidden" });
    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId, operation: "end" }, dependencies),
    ).resolves.toMatchObject({ ok: true, userId: "user-1" });
  });

  it.each([
    ["pending profile", { role: "trainer", status: "pending", is_deleted: false }, null],
    ["wrong role", { role: "agent", status: "active", is_deleted: false }, null],
    ["deleted profile", { role: "admin", status: "active", is_deleted: true }, null],
    ["foreign session", { role: "admin", status: "active", is_deleted: false }, { id: sessionId, user_id: "other", status: "active", telefun_model_id: "gpt-realtime-2.1", telefun_transport: "openai-webrtc" }],
    ["wrong session state", { role: "admin", status: "active", is_deleted: false }, { id: sessionId, user_id: "user-1", status: "completed", telefun_model_id: "gpt-realtime-2.1", telefun_transport: "openai-webrtc" }],
    ["wrong transport", { role: "admin", status: "active", is_deleted: false }, { id: sessionId, user_id: "user-1", status: "active", telefun_model_id: "gpt-realtime-2.1", telefun_transport: "openai-audio" }],
  ])("rejects %s before any provider dependency", async (_name, profile, session) => {
    const dependencies = deps(profile, session);
    await expect(authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies)).resolves.toMatchObject({ ok: false });
    expect(dependencies.verifyToken).toHaveBeenCalledOnce();
  });
});
