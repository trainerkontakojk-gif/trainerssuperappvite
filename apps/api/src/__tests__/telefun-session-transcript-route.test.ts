import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const update = vi.fn(() => ({
  eq: vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  })),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({ update })),
  }),
}));

import { telefunSessions } from "../routes/telefun/sessions";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" });
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", telefunSessions);
  return app;
}

describe("Telefun session transcript PATCH route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts canonical transcript entries", async () => {
    const response = await buildApp().request("/sessions/session-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
          { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      messages: [
        { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
        { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
      ],
    });
  });

  it("rejects malformed transcript entries before database update", async () => {
    const response = await buildApp().request("/sessions/session-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { speaker: "system", text: "Internal prompt", startMs: 3000 },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
