import { describe, expect, it, vi } from "vitest";
import {
  consumeTelefunDistributedRateLimit,
  type TelefunDistributedRateLimitClient,
} from "../middleware/rateLimit";

describe("distributed Telefun rate limiting", () => {
  it("uses the atomic Supabase RPC with user, session, and provider scopes", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        allowed: true,
        remaining: 4,
        reset_at: "2026-08-01T00:01:00.000Z",
        reason: "allowed",
      },
      error: null,
    }));
    const client: TelefunDistributedRateLimitClient = { rpc };

    await expect(
      consumeTelefunDistributedRateLimit({
        client,
        userId: "user-1",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        provider: "openai-webrtc",
        scope: "session-write",
        requestLimit: 10,
      }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 4,
      resetAt: "2026-08-01T00:01:00.000Z",
      reason: "allowed",
    });
    expect(rpc).toHaveBeenCalledWith(
      "consume_telefun_realtime_rate_limit",
      expect.objectContaining({
        p_scope_key:
          "user:user-1:session:550e8400-e29b-41d4-a716-446655440000:provider:openai-webrtc:session-write",
        p_user_id: "user-1",
        p_session_id: "550e8400-e29b-41d4-a716-446655440000",
        p_provider: "openai-webrtc",
        p_request_limit: 10,
      }),
    );
  });

  it("accepts the singleton row array returned by a Supabase RETURNS TABLE RPC", async () => {
    const client: TelefunDistributedRateLimitClient = {
      rpc: vi.fn(async () => ({
        data: [
          {
            allowed: true,
            remaining: 3,
            reset_at: "2026-08-01T00:01:00.000Z",
            reason: "allowed",
          },
        ],
        error: null,
      })),
    };

    await expect(
      consumeTelefunDistributedRateLimit({
        client,
        userId: "user-1",
        provider: "openai-webrtc",
        scope: "session-create",
        requestLimit: 10,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 3 });
  });

  it("fails closed when the distributed limiter cannot be reached", async () => {
    const client: TelefunDistributedRateLimitClient = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("database down"),
      })),
    };
    await expect(
      consumeTelefunDistributedRateLimit({
        client,
        userId: "user-1",
        provider: "openai-webrtc",
        scope: "session-create",
        requestLimit: 10,
      }),
    ).rejects.toThrow("distributed rate limit unavailable");
  });
});
