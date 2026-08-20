import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockGenerateGeminiContent } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGenerateGeminiContent: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: mockGenerateGeminiContent,
}));

vi.mock("../lib/openai", () => ({
  generateOpenAIContent: vi.fn(),
}));

import { processKetikReviewJob } from "../services/ketik/review-processor";

function chainResult() {
  const chain: any = { error: null };
  chain.eq = vi.fn(() => chain);
  return chain;
}

describe("processKetikReviewJob five-dimension contract", () => {
  let historyUpdate: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    historyUpdate = undefined;

    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: "Agen cukup jelas.",
        strengths: ["Bahasa mudah dipahami."],
        weaknesses: ["Resolusi belum lengkap."],
        coachingFocus: ["Berikan langkah tindak lanjut."],
        scores: {
          final: 82,
          empathy: 80,
          probing: 70,
          resolution: 60,
          typo: 90,
          compliance: 100,
        },
        typos: [],
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "ketik_history") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: "session-1",
              user_id: "user-1",
              messages: [
                { id: "m1", sender: "agent", text: "Silakan isi form." },
              ],
            },
            error: null,
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            historyUpdate = payload;
            return chainResult();
          }),
        };
      }

      if (table === "ketik_session_reviews") {
        return {
          delete: vi.fn(() => chainResult()),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === "ketik_typo_findings") {
        return { delete: vi.fn(() => chainResult()) };
      }

      if (table === "results" || table === "ketik_review_jobs") {
        return { update: vi.fn(() => chainResult()) };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("requests, calculates, and persists all five review dimensions", async () => {
    const result = await processKetikReviewJob("session-1");

    expect(result).toEqual({
      status: "completed",
      scores: {
        final: 80,
        empathy: 80,
        probing: 70,
        resolution: 60,
        typo: 90,
        compliance: 100,
      },
    });
    expect(historyUpdate).toMatchObject({
      final_score: 80,
      empathy_score: 80,
      probing_score: 70,
      resolution_score: 60,
      typo_score: 90,
      compliance_score: 100,
      review_status: "completed",
    });

    const options = mockGenerateGeminiContent.mock.calls[0][0];
    expect(options.model).toBe("gemini-3.7-flash");
    expect(options.responseSchema.properties.scores.required).toContain(
      "resolution",
    );
    expect(options.systemInstruction).toContain("Resolusi");
    expect(options.systemInstruction).toContain("Empati & Komunikasi");
    expect(options.systemInstruction).not.toContain(
      "You are an expert Quality Assurance",
    );
    expect(options.systemInstruction).not.toContain("Evaluation Categories");
  });

  it("does not write raw model output to logs when review JSON is invalid", async () => {
    const sensitiveOutput = "INVALID SECRET_TRANSCRIPT_CONTENT";
    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: sensitiveOutput,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(processKetikReviewJob("session-1")).rejects.toThrow(
      "AI response JSON tidak valid",
    );

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      sensitiveOutput,
    );
    consoleError.mockRestore();
  });
});
