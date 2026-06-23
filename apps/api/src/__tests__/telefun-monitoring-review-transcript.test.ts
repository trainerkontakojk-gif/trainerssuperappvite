import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const single = vi.fn();
const select = vi.fn(() => ({
  eq: vi.fn(() => ({ single })),
}));
const createSignedUrl = vi.fn();
let currentRole = "trainer";

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({ select })),
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
  }),
}));

import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-1" });
    c.set("profile", { role: currentRole });
    await next();
  });
  app.route("/", ai);
  return app;
}

describe("Telefun monitoring review transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = "trainer";
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-full-call.webm" },
      error: null,
    });
  });

  it("selects messages, returns transcript entries, and signs recording URL for trainer", async () => {
    single.mockResolvedValue({
      data: {
        score: 8,
        recording_path: "user/session/full_call.webm",
        agent_recording_path: "user/session/agent_only.webm",
        scenario_title: "Tagihan",
        duration_seconds: 60,
        voice_assessment: null,
        messages: [
          { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
          { speaker: "system", text: "Internal prompt", startMs: 3500 },
          { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
        ],
        ai_summary: null,
        strengths: null,
        weaknesses: null,
        coaching_focus: null,
      },
      error: null,
    });

    const response = await buildApp().request(
      "/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("messages"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("agent_recording_path"));
    expect(createSignedUrl).toHaveBeenCalledWith("user/session/full_call.webm", 3600);
    expect(body.data.recording_url).toBe("https://storage.example/signed-full-call.webm");
    expect(body.data.agent_recording_path).toBe("user/session/agent_only.webm");
    expect(body.data.transcript).toEqual([
      { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
      { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
    ]);
  });

  it("does not sign monitoring recording URLs for leader", async () => {
    currentRole = "leader";
    single.mockResolvedValue({
      data: {
        score: 8,
        recording_path: "user/session/full_call.webm",
        agent_recording_path: "user/session/agent_only.webm",
        scenario_title: "Tagihan",
        duration_seconds: 60,
        voice_assessment: null,
        messages: [],
        ai_summary: null,
        strengths: null,
        weaknesses: null,
        coaching_focus: null,
      },
      error: null,
    });

    const response = await buildApp().request(
      "/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(body.data.recording_url).toBeNull();
    expect(body.data.recording_path).toBe("user/session/full_call.webm");
  });
});
