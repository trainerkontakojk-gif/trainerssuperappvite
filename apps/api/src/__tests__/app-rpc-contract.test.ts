import { describe, expect, it } from "vitest";
import app from "../app";

describe("app RPC route composition", () => {
  it("keeps the health route public under the API base path", async () => {
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("keeps v1 routes behind auth middleware", async () => {
    const res = await app.request("/api/v1/me/access-status");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });
});
