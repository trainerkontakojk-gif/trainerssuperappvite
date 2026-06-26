import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRevokeOwnSessions } = vi.hoisted(() => ({
  mockRevokeOwnSessions: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        },
        401,
      );
    }

    c.set("user", {
      id: "user-1",
      email: "user@example.com",
    });
    c.set("profile", {
      full_name: "Test User",
      role: "trainer",
      status: "active",
    });
    await next();
  },
}));

vi.mock("../services/account-service", () => ({
  revokeOwnSessions: (params: unknown) => mockRevokeOwnSessions(params),
}));

import app from "../app";

describe("POST /api/v1/me/revoke-sessions", () => {
  beforeEach(() => {
    mockRevokeOwnSessions.mockReset();
  });

  it("revokes all sessions for the authenticated user", async () => {
    mockRevokeOwnSessions.mockResolvedValueOnce({ success: true });

    const res = await app.request("/api/v1/me/revoke-sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { success: true },
    });
    expect(mockRevokeOwnSessions).toHaveBeenCalledWith({
      accessToken: "valid-token",
      userId: "user-1",
      actorName: "Test User",
    });
  });

  it("returns 500 when session revoke fails", async () => {
    mockRevokeOwnSessions.mockRejectedValueOnce(new Error("boom"));

    const res = await app.request("/api/v1/me/revoke-sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "SESSION_REVOKE_FAILED",
        message: "Gagal logout dari semua perangkat. Silakan coba lagi.",
      },
    });
  });
});
