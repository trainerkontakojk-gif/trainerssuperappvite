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
  scoring_status: "completed",
  scoring_ready_at: "2026-08-14T09:00:00.000Z",
  scoring_next_attempt_at: null,
  scoring_attempt_count: 1,
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

describe("Telefun history scoring view contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listResult.mockResolvedValue({ data: [terminalWebRtcRow], error: null });
    detailResult.mockResolvedValue({ data: terminalWebRtcRow, error: null });
  });

  async function listFirstRow(overrides: Record<string, unknown>) {
    listResult.mockResolvedValue({
      data: [{ ...terminalWebRtcRow, ...overrides }],
      error: null,
    });
    const response = await buildApp().request("/sessions");
    expect(response.status).toBe(200);
    return (await response.json()).data[0];
  }

  it("exposes scoring view fields on list", async () => {
    const row = await listFirstRow({});
    expect(row).toMatchObject({
      scoring_status: "completed",
      scoring_ready_at: "2026-08-14T09:00:00.000Z",
      scoring_next_attempt_at: null,
      scoring_retryable: false,
      score: 8,
      voice_assessment: assessment,
    });
  });

  it("exposes the same scoring view fields on detail", async () => {
    const response = await buildApp().request(
      "/history/session-webrtc-feedback",
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      scoring_status: "completed",
      scoring_ready_at: "2026-08-14T09:00:00.000Z",
      scoring_next_attempt_at: null,
      scoring_retryable: false,
      score: 8,
      voice_assessment: assessment,
    });
  });

  it("never normalizes a null score to 0 on list or detail", async () => {
    const row = await listFirstRow({ score: null });
    expect(row.score).toBeNull();

    detailResult.mockResolvedValue({
      data: { ...terminalWebRtcRow, score: null },
      error: null,
    });
    const detail = await buildApp().request("/history/session-webrtc-feedback");
    expect((await detail.json()).data.score).toBeNull();
  });

  it("keeps a zero score as 0", async () => {
    const row = await listFirstRow({ score: 0 });
    expect(row.score).toBe(0);
  });

  it("keeps completed-without-assessment observable instead of fabricating feedback", async () => {
    const row = await listFirstRow({
      voice_assessment: null,
      feedback: null,
      score: null,
    });
    expect(row).toMatchObject({
      scoring_status: "completed",
      voice_assessment: null,
      feedback: null,
      score: null,
    });
  });

  it.each([
    [
      "a retryable failed row (attempt 1, next attempt scheduled)",
      {
        scoring_status: "failed",
        scoring_attempt_count: 1,
        scoring_next_attempt_at: "2026-08-15T09:00:00.000Z",
      },
      true,
    ],
    [
      "a failed row with no recorded attempts but a scheduled next attempt",
      {
        scoring_status: "failed",
        scoring_attempt_count: null,
        scoring_next_attempt_at: "2026-08-15T09:00:00.000Z",
      },
      true,
    ],
    [
      "an exhausted failed row (attempt count at MAX_SCORING_ATTEMPTS)",
      {
        scoring_status: "failed",
        scoring_attempt_count: 3,
        scoring_next_attempt_at: "2026-08-15T09:00:00.000Z",
      },
      false,
    ],
    [
      "a permanent failed row (no next attempt scheduled)",
      {
        scoring_status: "failed",
        scoring_attempt_count: 1,
        scoring_next_attempt_at: null,
      },
      false,
    ],
    ["a completed row", { scoring_status: "completed" }, false],
    ["a pending row", { scoring_status: "pending" }, false],
    ["a processing row", { scoring_status: "processing" }, false],
  ])(
    "derives scoring_retryable for %s",
    async (_label, overrides, expected) => {
      const row = await listFirstRow(overrides);
      expect(row.scoring_retryable).toBe(expected);
    },
  );

  it("always exposes scoring_retryable as a boolean for legacy rows", async () => {
    const row = await listFirstRow({
      telefun_transport: "gemini-live",
      scoring_status: undefined,
      scoring_attempt_count: undefined,
      scoring_next_attempt_at: undefined,
      score: undefined,
    });
    expect(typeof row.scoring_retryable).toBe("boolean");
    expect(row.scoring_retryable).toBe(false);
    expect(row.scoring_status).toBeNull();
    expect(row.score).toBeNull();
    expect(row.feedback).toBeNull();
  });

  it("returns deterministic score/assessment/feedback on list and detail", async () => {
    const listRow = await listFirstRow({});
    const detail = await buildApp().request("/history/session-webrtc-feedback");
    const detailData = (await detail.json()).data;

    expect(detailData.score).toBe(listRow.score);
    expect(detailData.feedback).toBe(listRow.feedback);
    expect(detailData.voice_assessment).toEqual(listRow.voice_assessment);
    expect(detailData.scoring_status).toBe(listRow.scoring_status);
  });
});
