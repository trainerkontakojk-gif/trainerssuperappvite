import { describe, expect, it, vi } from "vitest";
import {
  authorizeWebRtcCall,
  type BrokerAuthDependencies,
  type WebRtcProfile,
  type WebRtcSession,
} from "./broker-auth.js";
import { DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS } from "./contracts.js";

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
      allowedModelIds: [...DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS],
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

  it("preserves the owned session live prompt for the broker handoff", async () => {
    const instructions = "Konsumen menghadapi tagihan kartu kredit.";
    const dependencies = deps(
      { role: "trainer", status: "active", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
        live_prompt_instructions: instructions,
        consumer_gender: "male",
      },
    );

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({
      ok: true,
      session: {
        live_prompt_instructions: instructions,
        consumer_gender: "male",
      },
    });
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

  it("accepts a Mini persisted model when the server allowed set admits it", async () => {
    const dependencies = deps(
      { role: "trainer", status: "active", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
      },
    );
    dependencies.rollout = {
      ...dependencies.rollout,
      allowedModelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
    };

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({
      ok: true,
      session: { telefun_model_id: "gpt-realtime-2.1-mini" },
    });
  });

  it("rejects a persisted Mini model while the server config is still Full-only", async () => {
    const dependencies = deps(
      { role: "trainer", status: "active", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
      },
    );

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: false, reason: "not_found" });
  });

  it("rejects an unsupported persisted model before any provider dependency", async () => {
    const dependencies = deps(
      { role: "trainer", status: "active", is_deleted: false },
      {
        id: sessionId,
        user_id: "user-1",
        status: "active",
        telefun_model_id: "gpt-realtime-4",
        telefun_transport: "openai-webrtc",
      },
    );

    await expect(
      authorizeWebRtcCall({ token: "jwt", sessionId }, dependencies),
    ).resolves.toMatchObject({ ok: false, reason: "not_found" });
    expect(dependencies.getSession).toHaveBeenCalledOnce();
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
      allowedModelIds: ["gpt-realtime-2.1"],
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
