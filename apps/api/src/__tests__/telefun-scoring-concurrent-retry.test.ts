import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({
  claimCount: 0,
  status: "pending",
  cachedScore: 0 as number | null,
}));
const mockAnalyzeVoiceQuality = vi.hoisted(() => vi.fn());
const mockGenerateCoachingSummary = vi.hoisted(() => vi.fn());

const validAssessment = {
  overallScore: 0,
  speakingRate: {
    score: 0,
    wordsPerMinute: 130,
    verdict: "Perlu perbaikan",
    feedback: "Perlu perbaikan.",
  },
  intonation: { score: 0, verdict: "Perlu perbaikan", feedback: "Perlu perbaikan." },
  articulation: { score: 0, verdict: "Perlu perbaikan", feedback: "Perlu perbaikan." },
  fillerWords: {
    score: 0,
    count: 10,
    examples: ["eee"],
    verdict: "Perlu perbaikan",
    feedback: "Perlu perbaikan.",
  },
  emotionalTone: {
    score: 0,
    dominant: "netral",
    verdict: "Perlu perbaikan",
    feedback: "Perlu perbaikan.",
  },
  transcript: "Test",
  highlights: [],
  strengths: [],
};

const mockRpc = vi.hoisted(() =>
  vi.fn(async (name: string) => {
    if (name === "claim_telefun_scoring") {
      state.claimCount += 1;
      if (state.claimCount === 1) {
        state.status = "processing";
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
    if (name === "complete_telefun_scoring") {
      state.status = "completed";
      return { data: true, error: null };
    }
    return { data: true, error: null };
  }),
);

const mockMaybeSingle = vi.hoisted(() =>
  vi.fn(async () => ({
    data:
      state.status === "completed"
        ? {
            user_id: "user-1",
            scoring_status: "completed",
            scoring_ready_at: "2026-08-14T09:00:00.000Z",
            scoring_next_attempt_at: null,
            scoring_attempt_count: 2,
            score: state.cachedScore,
            voice_assessment: validAssessment,
          }
        : {
            user_id: "user-1",
            scoring_status: state.status,
            score: null,
            voice_assessment: null,
          },
    error: null,
  })),
);

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  })),
}));

vi.mock("../lib/telefun-analysis", () => ({
  analyzeVoiceQuality: mockAnalyzeVoiceQuality,
  generateCoachingSummary: mockGenerateCoachingSummary,
}));

vi.mock("../services/telefun-scoring-service", () => ({
  enqueueScoring: vi.fn(),
  isWebRtcScoringReady: vi.fn(() => true),
}));

import { telefunRecordings } from "../routes/telefun/recordings";

type Variables = { user: User; profile: unknown };

function buildApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", telefunRecordings);
  return app;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Telefun scoring atomic claim", () => {
  beforeEach(() => {
    state.claimCount = 0;
    state.status = "pending";
    state.cachedScore = 0;
    vi.clearAllMocks();
    mockAnalyzeVoiceQuality.mockResolvedValue({
      success: true,
      assessment: validAssessment,
    });
    mockGenerateCoachingSummary.mockResolvedValue({ success: true });
  });

  it("dua request paralel hanya menjalankan analisis sekali", async () => {
    const app = buildApp();
    const analysis = createDeferred<{
      success: true;
      assessment: typeof validAssessment;
    }>();
    mockAnalyzeVoiceQuality.mockReturnValueOnce(analysis.promise);

    const firstRequest = app.request("/score/session-1", { method: "POST" });
    await vi.waitFor(() =>
      expect(mockAnalyzeVoiceQuality).toHaveBeenCalledTimes(1),
    );

    const second = await app.request("/score/session-1", { method: "POST" });
    expect(second.status).toBe(409);
    expect(mockAnalyzeVoiceQuality).toHaveBeenCalledTimes(1);

    analysis.resolve({ success: true, assessment: validAssessment });
    const first = await firstRequest;
    expect(first.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("claim_telefun_scoring", {
      p_session_id: "session-1",
      p_claim_timeout_seconds: 120,
    });
  });

  it("cached score nol tetap dikembalikan tanpa analisis ulang", async () => {
    state.status = "completed";
    state.claimCount = 1;

    const response = await buildApp().request("/score/session-1", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      cached: true,
      data: { score: 0 },
    });
    expect(mockAnalyzeVoiceQuality).not.toHaveBeenCalled();
  });

  it("cached response tidak memaksa null score menjadi 0", async () => {
    state.status = "completed";
    state.claimCount = 1;
    state.cachedScore = null;

    const response = await buildApp().request("/score/session-1", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      cached: true,
      data: { score: null },
    });
    expect(mockAnalyzeVoiceQuality).not.toHaveBeenCalled();
  });

  it("cached response mengekspos scoring view fields", async () => {
    state.status = "completed";
    state.claimCount = 1;

    const response = await buildApp().request("/score/session-1", {
      method: "POST",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      scoring_status: "completed",
      scoring_ready_at: "2026-08-14T09:00:00.000Z",
      scoring_next_attempt_at: null,
      scoring_retryable: false,
      score: 0,
    });
    expect(mockAnalyzeVoiceQuality).not.toHaveBeenCalled();
  });
});
