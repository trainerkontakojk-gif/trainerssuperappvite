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
import {
  KETIK_ANNOTATION_LIMITS,
  normalizeKetikAnnotations,
} from "../services/ketik/review-annotations";

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

describe("Ketik Telaah annotations (normalizeKetikAnnotations)", () => {
  const MESSAGES = [
    { id: "c1", sender: "consumer", text: "Tagihan saya dobel bulan ini." },
    { id: "a1", sender: "agent", text: "Baik Bu, saya cek  tagihan Ibu dulu." },
    { id: "c2", sender: "consumer", text: "Tolong cepat ya, saya mau bayar." },
    { id: "s1", sender: "system", text: "Sesi berakhir." },
  ];

  const point = (overrides: Record<string, unknown> = {}) => ({
    messageId: "c1",
    quote: "Tagihan saya dobel",
    summary: "Kenapa tagihan dobel",
    status: "partial",
    reason: "Penyebab belum dijelaskan.",
    answerMessageId: "a1",
    answerQuote: "saya cek tagihan Ibu",
    ...overrides,
  });

  const note = (overrides: Record<string, unknown> = {}) => ({
    messageId: "a1",
    quote: "saya cek tagihan Ibu",
    dimension: "resolution",
    verdict: "fix",
    note: "Belum ada estimasi waktu.",
    example: "Saya cek sekarang, kabar dalam 10 menit.",
    ...overrides,
  });

  it("keeps grounded annotations; quote match ignores case and extra spaces", () => {
    const result = normalizeKetikAnnotations(
      {
        caseCore: "  Tagihan dobel, konsumen minta cepat.  ",
        consumerPoints: [point({ quote: "tagihan SAYA dobel" })],
        agentNotes: [note()],
      },
      MESSAGES,
    );
    expect(result.caseCore).toBe("Tagihan dobel, konsumen minta cepat.");
    expect(result.consumerPoints).toHaveLength(1);
    expect(result.consumerPoints[0]).toMatchObject({
      messageId: "c1",
      status: "partial",
      answerMessageId: "a1",
      answerQuote: "saya cek tagihan Ibu",
    });
    expect(result.agentNotes).toHaveLength(1);
    expect(result.agentNotes[0]).toMatchObject({
      messageId: "a1",
      dimension: "resolution",
      verdict: "fix",
      example: "Saya cek sekarang, kabar dalam 10 menit.",
    });
  });

  it("drops a quote that is in no message of the right sender", () => {
    const result = normalizeKetikAnnotations(
      {
        consumerPoints: [point({ quote: "Saya minta refund penuh" })],
        // Kutipan konsumen tidak boleh dipakai sebagai kalimat agen.
        agentNotes: [note({ messageId: "c1", quote: "Tagihan saya dobel" })],
      },
      MESSAGES,
    );
    expect(result.consumerPoints).toEqual([]);
    expect(result.agentNotes).toEqual([]);
  });

  it("repairs a wrong messageId by finding the quote in another message of that sender", () => {
    const result = normalizeKetikAnnotations(
      {
        consumerPoints: [point({ messageId: "a1", quote: "Tolong cepat ya" })],
        agentNotes: [note({ messageId: "nope" })],
      },
      MESSAGES,
    );
    expect(result.consumerPoints[0].messageId).toBe("c2");
    expect(result.agentNotes[0].messageId).toBe("a1");
  });

  it("clears an answer that does not point at an agent sentence, keeping the point", () => {
    const result = normalizeKetikAnnotations(
      {
        consumerPoints: [
          point({ answerMessageId: "c2", answerQuote: "Tolong cepat ya" }),
          point({
            quote: "saya mau bayar",
            messageId: "c2",
            status: "unanswered",
            answerMessageId: "a1",
            answerQuote: "kalimat yang tidak ada",
          }),
        ],
      },
      MESSAGES,
    );
    expect(result.consumerPoints).toHaveLength(2);
    expect(result.consumerPoints[0].answerMessageId).toBeNull();
    expect(result.consumerPoints[0].answerQuote).toBeNull();
    expect(result.consumerPoints[1].answerMessageId).toBeNull();
  });

  it("drops invalid status, dimension, verdict, and empty text; caps counts", () => {
    const result = normalizeKetikAnnotations(
      {
        caseCore: "   ",
        consumerPoints: [
          point({ status: "done" }),
          point({ summary: "" }),
          ...Array.from({ length: 7 }, () => point()),
        ],
        agentNotes: [
          note({ dimension: "tone" }),
          note({ verdict: "maybe" }),
          note({ note: "  " }),
          ...Array.from({ length: 12 }, () => note()),
        ],
      },
      MESSAGES,
    );
    expect(result.caseCore).toBeNull();
    expect(result.consumerPoints).toHaveLength(KETIK_ANNOTATION_LIMITS.consumerPoints);
    expect(result.agentNotes).toHaveLength(KETIK_ANNOTATION_LIMITS.agentNotes);
  });

  it("a good verdict has no better-sentence example; non-arrays become empty", () => {
    const result = normalizeKetikAnnotations(
      { consumerPoints: "x", agentNotes: [note({ verdict: "good" })] },
      MESSAGES,
    );
    expect(result.consumerPoints).toEqual([]);
    expect(result.agentNotes[0].example).toBeNull();
    expect(normalizeKetikAnnotations(null, MESSAGES)).toEqual({
      caseCore: null,
      consumerPoints: [],
      agentNotes: [],
    });
  });
});

describe("Ketik Telaah annotations (processKetikReviewJob)", () => {
  let reviewInserts: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    reviewInserts = [];
    mockGenerateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify({
        summary: "Ringkas.",
        strengths: ["Pro"],
        weaknesses: ["Empati."],
        coachingFocus: ["Fokus."],
        scores: CANONICAL_SCORES,
        typos: [],
        caseCore: "Konsumen bingung soal system prompt tagihan.",
        consumerPoints: [
          {
            messageId: "c1",
            quote: "Tagihan saya dobel",
            summary: "Kenapa dobel",
            status: "answered",
            reason: null,
            answerMessageId: "m1",
            answerQuote: "Silakan isi form",
          },
        ],
        agentNotes: [
          {
            messageId: "m1",
            quote: "Silakan isi form",
            dimension: "empathy",
            verdict: "fix",
            note: "Tanpa validasi perasaan.",
            example: "Saya paham ini mengganggu, mari saya bantu isi form.",
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
                { id: "c1", sender: "consumer", text: "Tagihan saya dobel." },
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
      return { update: vi.fn(() => chainResult()) };
    });
  });

  it("persists sanitized annotations inside education", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await processKetikReviewJob("session-1");
    const education = reviewInserts[0].education as any;
    expect(education.caseCore).toContain("****");
    expect(education.caseCore).not.toContain("system prompt");
    expect(education.consumerPoints).toHaveLength(1);
    expect(education.consumerPoints[0].answerMessageId).toBe("m1");
    expect(education.agentNotes).toHaveLength(1);
    expect(education.agentNotes[0].example).toContain("Saya paham");
    consoleWarn.mockRestore();
  });
});
