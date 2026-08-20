import { describe, expect, it, vi } from "vitest";
import {
  authorizeWebRtcCall,
  type BrokerAuthDependencies,
  type WebRtcProfile,
  type WebRtcSession,
} from "./broker-auth.js";

const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";

function deps(
  profile: Record<string, unknown> | null = {
    role: "trainer",
    status: "active",
    is_deleted: false,
  },
  session: Record<string, unknown> | null = {
    id: sessionId,
    user_id: "user-1",
    status: "active",
    telefun_model_id: "gpt-realtime-2.1",
    telefun_transport: "openai-webrtc",
  },
): BrokerAuthDependencies {
  return {
    // Retired configuration is intentionally hostile to prove cleanup does
    // not depend on a former rollout/cohort/model admission decision.
    rollout: {
      enabled: false,
      nodeEnv: "test",
      allowedUserIds: [],
      allowedModelIds: [],
    },
    verifyToken: vi.fn(async () => ({ success: true, user: { id: "user-1" } })),
    getProfile: vi.fn(async () => profile as WebRtcProfile | null),
    getSession: vi.fn(async () => session as WebRtcSession | null),
  };
}

describe("WebRTC historical cleanup authorization", () => {
  it.each(["pending", "active", "completed", "failed"])(
    "authorizes an owned historical cleanup row in %s regardless of retired rollout values",
    async (status) => {
      const dependencies = deps(undefined, {
        id: sessionId,
        user_id: "user-1",
        status,
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
      });

      await expect(
        authorizeWebRtcCall(
          { token: "jwt", sessionId, operation: "end" },
          dependencies,
        ),
      ).resolves.toMatchObject({
        ok: true,
        userId: "user-1",
        sessionId,
      });
    },
  );

  it("rejects nonhistorical models and non-WebRTC transports after ownership lookup", async () => {
    for (const session of [
      {
        id: sessionId,
        user_id: "user-1",
        status: "completed",
        telefun_model_id: "gpt-realtime-4",
        telefun_transport: "openai-webrtc",
      },
      {
        id: sessionId,
        user_id: "user-1",
        status: "completed",
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-audio",
      },
    ]) {
      const dependencies = deps(undefined, session);
      await expect(
        authorizeWebRtcCall(
          { token: "jwt", sessionId, operation: "end" },
          dependencies,
        ),
      ).resolves.toEqual({ ok: false, reason: "not_found" });
      expect(dependencies.getSession).toHaveBeenCalledOnce();
    }
  });

  it("requires a valid bearer identity before profile or session lookup", async () => {
    const dependencies = deps();
    vi.mocked(dependencies.verifyToken).mockResolvedValue({ success: false });

    await expect(
      authorizeWebRtcCall(
        { token: "invalid", sessionId, operation: "end" },
        dependencies,
      ),
    ).resolves.toEqual({ ok: false, reason: "unauthorized" });
    expect(dependencies.getProfile).not.toHaveBeenCalled();
    expect(dependencies.getSession).not.toHaveBeenCalled();
  });

  it("fails closed if a caller attempts the retired start operation", async () => {
    const dependencies = deps();

    await expect(
      authorizeWebRtcCall(
        { token: "jwt", sessionId, operation: "start" },
        dependencies,
      ),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(dependencies.getProfile).not.toHaveBeenCalled();
    expect(dependencies.getSession).not.toHaveBeenCalled();
  });

  it.each([
    ["deleted", { role: "trainer", status: "active", is_deleted: true }],
    ["inactive", { role: "trainer", status: "pending", is_deleted: false }],
    ["wrong role", { role: "agent", status: "active", is_deleted: false }],
  ])("rejects a %s profile", async (_label, profile) => {
    const dependencies = deps(profile);

    await expect(
      authorizeWebRtcCall(
        { token: "jwt", sessionId, operation: "end" },
        dependencies,
      ),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });
  });
});
