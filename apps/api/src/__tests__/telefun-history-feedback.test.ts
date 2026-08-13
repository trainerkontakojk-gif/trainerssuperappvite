import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { VoiceQualityAssessment } from "@trainers/types";

const listResult = vi.fn();
const detailResult = vi.fn();
const select = vi.fn(() => ({
  order: vi.fn(() => ({ limit: listResult })),
  eq: vi.fn(() => ({ maybeSingle: detailResult })),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({ select })),
  }),
}));

import { telefunSessions } from "../routes/telefun/sessions";

const assessment: VoiceQualityAssessment = {
  overallScore: 8,
  speakingRate: {
    score: 8,
    wordsPerMinute: 145,
    verdict: "Baik",
    feedback: "Tempo stabil.",
  },
  intonation: {
    score: 7,
    verdict: "Cukup",
    feedback: "Intonasi perlu lebih hangat.",
  },
  articulation: {
    score: 8,
    verdict: "Baik",
    feedback: "Artikulasi jelas.",
  },
  fillerWords: {
    score: 9,
    count: 1,
    examples: ["eee"],
    verdict: "Baik",
    feedback: "Kata pengisi minim.",
  },
  emotionalTone: {
    score: 7,
    dominant: "tenang",
    verdict: "Cukup",
    feedback: "Empati perlu lebih eksplisit.",
  },
  transcript: "",
  highlights: [],
  strengths: [],
};

const terminalWebRtcRow = {
  id: "session-webrtc-feedback",
  user_id: "user-1",
  status: "completed",
  telefun_transport: "openai-webrtc",
  score: 8,
  feedback: null,
  voice_assessment: assessment,
};

function buildApp() {
  const app = new Hono<{
    Variables: { user: { id: string }; profile: { role: string } };
  }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" });
    c.set("profile", { role: "admin" });
    await next();
  });
  app.route("/", telefunSessions);
  return app;
}

describe("Telefun history feedback contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResult.mockResolvedValue({ data: [terminalWebRtcRow], error: null });
    detailResult.mockResolvedValue({ data: terminalWebRtcRow, error: null });
  });

  it("projects feedback for a terminal WebRTC history row with canonical assessment", async () => {
    const response = await buildApp().request("/sessions");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0].feedback).toContain("Tempo stabil.");
    expect(payload.data[0].feedback).toContain("Artikulasi jelas.");
  });

  it("applies the same projection to the history detail response", async () => {
    const response = await buildApp().request(
      "/history/session-webrtc-feedback",
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.feedback).toContain("Tempo stabil.");
  });

  it.each([
    ["another transport", { telefun_transport: "gemini-live" }],
    ["a non-terminal WebRTC row", { status: "active" }],
  ])("does not project feedback for %s", async (_label, overrides) => {
    listResult.mockResolvedValue({
      data: [{ ...terminalWebRtcRow, ...overrides }],
      error: null,
    });

    const response = await buildApp().request("/sessions");
    const payload = await response.json();

    expect(payload.data[0].feedback).toBeNull();
  });

  it("preserves an explicitly persisted legacy feedback value", async () => {
    listResult.mockResolvedValue({
      data: [{ ...terminalWebRtcRow, feedback: "Feedback tersimpan." }],
      error: null,
    });

    const response = await buildApp().request("/sessions");
    const payload = await response.json();

    expect(payload.data[0].feedback).toBe("Feedback tersimpan.");
  });
});
