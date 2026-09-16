import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mockFetchMailboxItemById = vi.hoisted(() => vi.fn());

vi.mock("../services/pdkt-service", () => ({
  fetchMailboxItemById: mockFetchMailboxItemById,
}));

vi.mock("../middleware/role", () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) =>
    next(),
}));

import { mailbox } from "../routes/pdkt/mailbox";

function createApp() {
  const app = new Hono<{
    Variables: { user: { id: string }; profile: { role: string } };
  }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-1" });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/mailbox", mailbox);
  return app;
}

describe("GET /mailbox/:id", () => {
  beforeEach(() => {
    mockFetchMailboxItemById.mockReset();
  });

  it("returns the full mailbox item including inline attachments", async () => {
    mockFetchMailboxItemById.mockResolvedValue({
      id: "m-1",
      subject: "Keluhan",
      inbound_email: { attachments: ["data:image/png;base64,AAAA"] },
    });

    const response = await createApp().request("/mailbox/m-1");
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.inbound_email.attachments).toEqual([
      "data:image/png;base64,AAAA",
    ]);
    expect(mockFetchMailboxItemById).toHaveBeenCalledWith(
      expect.anything(),
      { id: "trainer-1", role: "trainer" },
      "m-1",
    );
  });

  it("returns 404 when the item is not visible to the actor", async () => {
    mockFetchMailboxItemById.mockResolvedValue(null);

    const response = await createApp().request("/mailbox/missing");
    const body = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
