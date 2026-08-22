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

import {
  buildKetikEducation,
  KETIK_DIMENSION_ORDER,
} from "../services/ketik/review-policy";
import { processKetikReviewJob } from "../services/ketik/review-processor";

function chainResult() {
  const chain: any = { error: null };
  chain.eq = vi.fn(() => chain);
  return chain;
}

const CANONICAL_SCORES = {
  final: 81,
  empathy: 55,
  probing: 80,
  resolution: 85,
  typo: 90,
  compliance: 95,
};

describe("Ketik education contract (evaluasi edukatif)", () => {
  let reviewInserts: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    reviewInserts = [];

    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: "Agen cukup jelas.",
        strengths: ["Bahasa mudah dipahami."],
        weaknesses: ["Empati belum tuntas."],
        coachingFocus: ["Validasi perasaan konsumen."],
        scores: CANONICAL_SCORES,
        typos: [],
        dimensionGuidance: [
          {
            key: "empathy",
            diagnosis: "Agen langsung ke penjelasan tanpa validasi perasaan.",
            howToFix:
              "Gunakan kalimat empati sebelum menjawab inti keluhan.",
            exampleRewrite:
              "Sebelumnya: 'Silakan isi form.' — Sesudahnya: 'Saya paham ini mengganggu, Bapak. Mari saya bantu lengkapi datanya.'",
          },
        ],
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
          update: vi.fn(() => chainResult()),
        };
      }

      if (table === "ketik_session_reviews") {
        return {
          delete: vi.fn(() => chainResult()),
          insert: vi.fn((payload: Record<string, unknown>) => {
            reviewInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
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

  it("persists deterministic education with priorityRank when AI sends guidance narration only", async () => {
    const result = await processKetikReviewJob("session-1");
    expect(result.status).toBe("completed");

    const insertPayload = reviewInserts[0];
    expect(insertPayload).toBeDefined();
    const education = insertPayload.education as any;

    expect(education).toBeDefined();
    expect(Array.isArray(education.dimensionGuidance)).toBe(true);
    expect(education.dimensionGuidance).toHaveLength(5);

    // Backend owns score/label/verdict/priorityRank — never the AI.
    const empathy = education.dimensionGuidance.find(
      (d: any) => d.key === "empathy",
    );
    expect(empathy.score).toBe(55);
    expect(empathy.verdict).toBe("Perlu Coaching");
    expect(empathy.priorityRank).toBe(1);
    // AI-provided narration preserved
    expect(empathy.exampleRewrite).toContain("Saya paham");

    // Sorted ascending by priorityRank
    const ranks = education.dimensionGuidance.map(
      (d: any) => d.priorityRank as number,
    );
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(new Set(ranks)).toEqual(new Set([1, 2, 3, 4, 5]));

    // Deterministic tie-breaker: fixed dimension order
    expect(KETIK_DIMENSION_ORDER).toEqual([
      "empathy",
      "probing",
      "resolution",
      "typo",
      "compliance",
    ]);
    const compliance = education.dimensionGuidance.find(
      (d: any) => d.key === "compliance",
    );
    expect(compliance.priorityRank).toBe(5);
    expect(compliance.verdict).toBe("Sangat Baik");
  });

  it("falls back to rule-based education when AI omits dimensionGuidance", async () => {
    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: "Ringkas.",
        strengths: ["Pro"],
        weaknesses: ["Empati."],
        coachingFocus: ["Fokus."],
        scores: CANONICAL_SCORES,
        typos: [],
      }),
    });

    await processKetikReviewJob("session-1");

    const education = reviewInserts[0].education as any;
    expect(education).toBeDefined();
    expect(education.dimensionGuidance).toHaveLength(5);
    const empathy = education.dimensionGuidance.find(
      (d: any) => d.key === "empathy",
    );
    expect(empathy.diagnosis.length).toBeGreaterThan(0);
    expect(empathy.howToFix.length).toBeGreaterThan(0);
    expect(empathy.exampleRewrite.length).toBeGreaterThan(0);
    expect(empathy.priorityRank).toBe(1);
  });

  it("runs AI-generated nested education strings through sanitizeAiResponse before persist", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: "Ringkas.",
        strengths: ["Pro"],
        weaknesses: ["Empati."],
        coachingFocus: ["Fokus."],
        scores: CANONICAL_SCORES,
        typos: [],
        dimensionGuidance: [
          {
            key: "empathy",
            diagnosis:
              "Agen meminta konsumen membaca ulang system prompt aplikasi.",
            howToFix: "Tambahkan validasi perasaan.",
            exampleRewrite: "'Saya paham kondisinya.'",
          },
        ],
      }),
    });

    await processKetikReviewJob("session-1");

    const education = reviewInserts[0].education as any;
    const empathy = education.dimensionGuidance.find(
      (d: any) => d.key === "empathy",
    );
    expect(empathy.diagnosis).toContain("****");
    expect(empathy.diagnosis).not.toContain("system prompt");
    consoleWarn.mockRestore();
  });

  it("buildKetikEducation fills verdict bands deterministically from canonical scores", () => {
    const education = buildKetikEducation(
      undefined,
      CANONICAL_SCORES,
    );
    const byKey = new Map(
      education.dimensionGuidance.map((d) => [d.key, d]),
    );
    expect(byKey.get("typo")?.verdict).toBe("Sangat Baik"); // 90
    expect(byKey.get("probing")?.verdict).toBe("Baik"); // 80
    expect(byKey.get("resolution")?.verdict).toBe("Baik"); // 85
    expect(byKey.get("empathy")?.verdict).toBe("Perlu Coaching"); // 55
    expect(byKey.get("compliance")?.verdict).toBe("Sangat Baik"); // 95
  });

  it("buildKetikEducation supports legacy stored scores without AI rerun", () => {
    // Legacy monitoring path: no raw AI payload at all — only persisted scores.
    const education = buildKetikEducation(undefined, {
      final: 70,
      empathy: 62,
      probing: 58,
      resolution: 72,
      typo: 88,
      compliance: 70,
    });
    expect(education.dimensionGuidance.map((d) => d.priorityRank)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(education.dimensionGuidance[0].key).toBe("probing"); // lowest 58
    expect(education.dimensionGuidance[0].verdict).toBe("Perlu Coaching");
  });
});
