import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mockEvaluateAgentResponse = vi.hoisted(() => vi.fn());

vi.mock("../services/pdkt-service", () => ({
  evaluateAgentResponse: mockEvaluateAgentResponse,
}));

vi.mock("../middleware/role", () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (_c: unknown, next: () => Promise<void>) =>
    next(),
}));

import { mailbox } from "../routes/pdkt/mailbox";

function makePayload(body: string) {
  return {
    config: {
      scenarios: [
        {
          id: "scenario-1",
          category: "Perbankan",
          title: "Pengaduan transaksi",
          description: "Konsumen mengadukan transaksi.",
          isActive: true,
        },
      ],
      consumerType: {
        id: "consumer-1",
        name: "Kooperatif",
        description: "Konsumen kooperatif.",
      },
      identity: {
        name: "Budi",
        email: "budi@example.com",
        city: "Jakarta",
        bodyName: "Budi",
      },
    },
    emails: [
      {
        id: "inbound-1",
        from: "budi@example.com",
        to: "konsumen@ojk.go.id",
        subject: "Pengaduan",
        body,
        timestamp: "2026-07-22T00:00:00.000Z",
        isAgent: false,
      },
      {
        id: "reply-1",
        from: "konsumen@ojk.go.id",
        to: "budi@example.com",
        subject: "Re: Pengaduan",
        body: "Terima kasih atas pengaduan Anda.",
        timestamp: "2026-07-22T00:01:00.000Z",
        isAgent: true,
      },
    ],
  };
}

function createApp() {
  const app = new Hono<{ Variables: { user: { id: string } } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-1" });
    await next();
  });
  app.route("/mailbox", mailbox);
  return app;
}

describe("POST /mailbox/evaluate prompt validation", () => {
  beforeEach(() => {
    mockEvaluateAgentResponse.mockReset();
  });

  it("rejects prompt-bound email text above the explicit limit before evaluation", async () => {
    const response = await createApp().request("/mailbox/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload("x".repeat(50_001))),
    });

    expect(response.status).toBe(400);
    expect(mockEvaluateAgentResponse).not.toHaveBeenCalled();
  });
});
