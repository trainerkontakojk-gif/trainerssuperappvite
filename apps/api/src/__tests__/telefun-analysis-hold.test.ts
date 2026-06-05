import { describe, expect, it, vi, beforeEach } from "vitest";
import type { VoiceQualityAssessment } from "@trainers/types";

// Shared mutable state accessible from vi.mock factory
const mockState: {
  row: Record<string, any> | null;
  geminiResponse: any;
  updates: Array<Record<string, unknown>>;
} = {
  row: null,
  geminiResponse: null,
  updates: [],
};

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: mockState.row,
              error: mockState.row ? null : new Error("not found"),
            }),
          ),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn(() => {
          mockState.updates.push(payload);
          return Promise.resolve({ error: null });
        }),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() =>
          Promise.resolve({ data: new Blob(["audio"]), error: null }),
        ),
      })),
    },
    rpc: vi.fn(),
  })),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(() => Promise.resolve(mockState.geminiResponse)),
}));

vi.mock("../lib/telefun-communication-profile", () => ({
  enrichAssessmentWithCommunicationProfile: vi.fn((a: any) => a),
}));

vi.mock("../lib/ai-json", () => ({
  parseJsonFromModelText: vi.fn((t: string) => JSON.parse(t)),
}));

import { analyzeVoiceQuality } from "../lib/telefun-analysis";

const DEFAULT_AI_RESPONSE = {
  success: true,
  text: JSON.stringify({
    overallScore: 8,
    speakingRate: {
      score: 7,
      wordsPerMinute: 130,
      verdict: "Baik",
      feedback: "Ok",
    },
    intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
    articulation: { score: 9, verdict: "Baik", feedback: "Ok" },
    fillerWords: {
      score: 8,
      count: 2,
      examples: [],
      verdict: "Baik",
      feedback: "Ok",
    },
    emotionalTone: {
      score: 7,
      dominant: "tenang",
      verdict: "Baik",
      feedback: "Ok",
    },
    transcript: "Test",
    highlights: [],
    strengths: [],
  }),
};

const BASE_ROW = {
  id: "s1",
  user_id: "u1",
  scenario_title: "Test",
  agent_recording_path: "u1/s1/agent_only.webm",
  session_metrics: {},
  voice_assessment: null,
};

describe("Telefun analysis with hold assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.row = { ...BASE_ROW };
    mockState.geminiResponse = null;
    mockState.updates = [];
  });

  it("returns N/A hold when no hold metrics exist", async () => {
    mockState.row = { ...BASE_ROW, session_metrics: {} };
    mockState.geminiResponse = { ...DEFAULT_AI_RESPONSE };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(result.assessment?.holdManagement).toBeDefined();
    expect(result.assessment?.holdManagement?.verdict).toBe("N/A");
    expect(result.assessment?.holdManagement?.score).toBeNull();
  });

  it("returns Kurang when hold metrics exceeded", async () => {
    mockState.row = {
      ...BASE_ROW,
      session_metrics: {
        hold: {
          intervals: [
            {
              sequence: 1,
              startedAtMs: 0,
              endedAtMs: 61_000,
              durationMs: 61_000,
              limitMs: 60_000,
              exceededByMs: 1_000,
            },
          ],
        },
      },
    };
    mockState.geminiResponse = { ...DEFAULT_AI_RESPONSE };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(result.assessment?.holdManagement?.verdict).toBe("Kurang");
    expect(result.assessment?.holdManagement?.score).toBe(4);
    expect(result.assessment?.overallScore).toBe(7.3);
  });

  it("enriches cached assessment without Gemini call", async () => {
    const cached: VoiceQualityAssessment = JSON.parse(DEFAULT_AI_RESPONSE.text);
    mockState.row = {
      ...BASE_ROW,
      session_metrics: {
        hold: {
          intervals: [
            {
              sequence: 1,
              startedAtMs: 0,
              endedAtMs: 30_000,
              durationMs: 30_000,
              limitMs: 60_000,
              exceededByMs: 0,
            },
          ],
        },
      },
      voice_assessment: cached,
    };

    const result = await analyzeVoiceQuality("s1", "u1");
    expect(result.success).toBe(true);
    expect(mockState.geminiResponse).toBeNull(); // no gemini call
    expect(result.assessment?.holdManagement).toBeDefined();
    expect(result.assessment?.holdManagement?.verdict).toBe("Baik");
    expect(mockState.updates).toContainEqual(
      expect.objectContaining({
        score: expect.any(Number),
        voice_assessment: expect.objectContaining({
          holdManagement: expect.objectContaining({ verdict: "Baik" }),
        }),
      }),
    );
  });
});
