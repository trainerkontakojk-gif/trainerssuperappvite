import { describe, expect, it } from "vitest";
import {
  validateAssessment,
  normalizeTelefunScoreResponse,
  getCommunicationProfileFromAssessment,
} from "../lib/voiceAssessmentUtils";
import type { TelefunHoldAssessment } from "@trainers/types";

function makeHoldAssessment(
  overrides?: Partial<TelefunHoldAssessment>,
): TelefunHoldAssessment {
  return {
    status: "not_used",
    score: null,
    verdict: "N/A",
    feedback: "User tidak menggunakan hold pada sesi ini.",
    holdCount: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
    ...overrides,
  };
}

const valid = {
  overallScore: 8,
  speakingRate: {
    score: 7,
    verdict: "Good",
    feedback: "Nice pace",
    wordsPerMinute: 130,
  },
  intonation: { score: 8, verdict: "Good", feedback: "Nice tone" },
  articulation: { score: 9, verdict: "Great", feedback: "Clear speech" },
  fillerWords: {
    score: 6,
    verdict: "Fine",
    feedback: "Some fillers",
    count: 5,
    examples: ["uh", "um"],
  },
  emotionalTone: {
    score: 7,
    verdict: "Good",
    feedback: "Empathetic",
    dominant: "calm",
  },
  transcript: "Hello world",
  highlights: ["Great start"],
  strengths: ["Clear voice"],
};

describe("validateAssessment", () => {
  it("rejects non-object or incomplete shape", () => {
    expect(validateAssessment(null)).toBeNull();
    expect(validateAssessment("string")).toBeNull();
    expect(validateAssessment({})).toBeNull();
    expect(validateAssessment({ ...valid, intonation: undefined })).toBeNull();
  });

  it("rejects invalid numeric values", () => {
    expect(validateAssessment({ ...valid, overallScore: Number.NaN })).toBeNull();
    expect(validateAssessment({ 
      ...valid, 
      speakingRate: { ...valid.speakingRate, wordsPerMinute: -1 } 
    })).toBeNull();
    expect(validateAssessment({ 
      ...valid, 
      fillerWords: { ...valid.fillerWords, count: 1.5 } 
    })).toBeNull();
  });

  it("clamps overallScore to 0-10", () => {
    const high = validateAssessment({ ...valid, overallScore: 15 });
    expect(high?.overallScore).toBe(10);

    const low = validateAssessment({ ...valid, overallScore: -5 });
    expect(low?.overallScore).toBe(0);
  });

  it("preserves score 0 as valid", () => {
    const result = validateAssessment({ ...valid, overallScore: 0 });
    expect(result?.overallScore).toBe(0);
  });

  it("filters non-string highlights and truncates to 5", () => {
    const result = validateAssessment({
      ...valid,
      highlights: ["Good", 123, "Bad", null, "OK", "Extra"],
    });
    expect(result!.highlights).toEqual(["Good", "Bad", "OK", "Extra"]);
    
    const resultLong = validateAssessment({
      ...valid,
      highlights: ["1", "2", "3", "4", "5", "6", "7"],
    });
    expect(resultLong!.highlights).toHaveLength(5);
  });
});

describe("normalizeTelefunScoreResponse", () => {
  it("unwraps { score, feedback, assessment } envelope", () => {
    const envelope = {
      score: 8,
      feedback: "Bagus",
      assessment: { ...valid, overallScore: 8 },
    };

    const result = normalizeTelefunScoreResponse(envelope);
    expect(result.score).toBe(8);
    expect(result.feedback).toBe("Bagus");
    expect(result.assessment).not.toBeNull();
    expect(result.assessment!.overallScore).toBe(8);
  });

  it("rejects invalid scale or mismatch", () => {
    // Current normalizeTelefunScoreResponse might be permissive, 
    // but the new one must be strict.
    const invalidScale = {
      score: 85, // Scale 100
      feedback: "Bagus",
      assessment: { ...valid, overallScore: 8 },
    };
    expect(normalizeTelefunScoreResponse(invalidScale).assessment).toBeNull();

    const mismatch = {
      score: 8,
      feedback: "Bagus",
      assessment: { ...valid, overallScore: 7 },
    };
    expect(normalizeTelefunScoreResponse(mismatch).assessment).toBeNull();
  });

  it("returns safe error object for invalid input", () => {
    const result = normalizeTelefunScoreResponse(null);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe("");
    expect(result.assessment).toBeNull();
  });
});

describe("getCommunicationProfileFromAssessment", () => {
  it("keeps existing communicationProfile if present and valid", () => {
    const existing = {
      metrics: [
        {
          key: "speakingRate",
          label: "Speaking Rate",
          value: 70,
          benchmarkValue: 70,
          score: 7,
          displayScore: 70,
          targetScore: 70,
          targetDirection: "match_target",
          evaluationMode: "optimal_range",
          verdict: "Good",
          status: "good",
          feedback: "Nice pace",
          explanation: "Custom",
        },
        {
          key: "intonation",
          label: "Intonation",
          value: 80,
          benchmarkValue: 80,
          score: 8,
          displayScore: 80,
          targetScore: 80,
          targetDirection: "higher_quality",
          evaluationMode: "higher_better",
          verdict: "Good",
          status: "good",
          feedback: "Nice tone",
          explanation: "Custom",
        },
        {
          key: "articulation",
          label: "Articulation",
          value: 90,
          benchmarkValue: 90,
          score: 9,
          displayScore: 90,
          targetScore: 90,
          targetDirection: "higher_quality",
          evaluationMode: "higher_better",
          verdict: "Great",
          status: "good",
          feedback: "Clear speech",
          explanation: "Custom",
        },
        {
          key: "fillers",
          label: "Fillers",
          value: 20,
          benchmarkValue: 20,
          score: 6,
          displayScore: 20,
          targetScore: 20,
          targetDirection: "lower_raw_is_better",
          evaluationMode: "lower_better",
          verdict: "Fine",
          status: "good",
          feedback: "Some fillers",
          explanation: "Custom",
        },
        {
          key: "tone",
          label: "Tone",
          value: 85,
          benchmarkValue: 85,
          score: 7,
          displayScore: 85,
          targetScore: 85,
          targetDirection: "higher_quality",
          evaluationMode: "higher_better",
          verdict: "Good",
          status: "good",
          feedback: "Empathetic",
          explanation: "Custom",
        },
      ],
      overallSummary: "Custom",
      strengths: [],
      improvementPriorities: [],
    };
    const result = getCommunicationProfileFromAssessment({
      ...valid,
      communicationProfile: existing as any,
    });
    expect(result).toBe(existing);
  });

  it("rebuilds existing communicationProfile if stale or invalid", () => {
    const existing = {
      metrics: [],
      overallSummary: "Custom",
      strengths: [],
      improvementPriorities: [],
    };
    const result = getCommunicationProfileFromAssessment({
      ...valid,
      communicationProfile: existing as any,
    });
    expect(result).not.toBe(existing);
    expect(result!.metrics).toHaveLength(5);
    expect(result!.metrics[0].displayScore).toBeDefined();
  });

  it("rebuilds stale profile where WPM was stored as radar score", () => {
    const result = validateAssessment({
      ...valid,
      speakingRate: {
        score: 7,
        wordsPerMinute: 118,
        verdict: "Cukup",
        feedback: "Tempo cukup.",
      },
      communicationProfile: {
        metrics: [
          {
            key: "speakingRate",
            label: "Speaking Rate",
            value: 118,
            benchmarkValue: 100,
            evaluationMode: "higher_better",
            status: "good",
            explanation: "old",
          },
        ],
        overallSummary: "old",
        strengths: [],
        improvementPriorities: [],
      } as any,
    });
    const profile = getCommunicationProfileFromAssessment(result);
    const sr = profile!.metrics.find((m) => m.key === "speakingRate")!;
    expect(sr.displayScore).not.toBe(118);
    expect(sr.targetScore).toBe(70);
  });

  it("builds fallback profile from legacy assessment", () => {
    const result = getCommunicationProfileFromAssessment(valid);
    expect(result).not.toBeNull();
    expect(result!.metrics).toHaveLength(5);
    expect(result!.overallSummary).toBeDefined();
    expect(result!.strengths).toBeDefined();
  });

  it("fillers in fallback uses lower_better mode", () => {
    const result = getCommunicationProfileFromAssessment(valid);
    const fillers = result!.metrics.find((m: any) => m.key === "fillers");
    expect(fillers!.evaluationMode).toBe("lower_better");
  });

  it("speakingRate in fallback uses optimal_range mode", () => {
    const result = getCommunicationProfileFromAssessment(valid);
    const sr = result!.metrics.find((m: any) => m.key === "speakingRate");
    expect(sr!.evaluationMode).toBe("optimal_range");
  });

  it("returns null for null/undefined input", () => {
    expect(getCommunicationProfileFromAssessment(null)).toBeNull();
    expect(getCommunicationProfileFromAssessment(undefined)).toBeNull();
  });
});

describe("validateAssessment with holdManagement", () => {
  it("preserves valid holdManagement with N/A", () => {
    const result = validateAssessment({
      ...valid,
      holdManagement: makeHoldAssessment(),
    });
    expect(result?.holdManagement?.verdict).toBe("N/A");
    expect(result?.holdManagement?.score).toBeNull();
  });

  it("preserves valid holdManagement with Baik", () => {
    const result = validateAssessment({
      ...valid,
      holdManagement: makeHoldAssessment({
        status: "within_limit",
        score: 10,
        verdict: "Baik",
      }),
    });
    expect(result?.holdManagement?.verdict).toBe("Baik");
    expect(result?.holdManagement?.score).toBe(10);
  });

  it("normalizes invalid holdManagement status to N/A", () => {
    const result = validateAssessment({
      ...valid,
      holdManagement: { status: "invalid", score: 5, verdict: "Unknown" },
    });
    expect(result?.holdManagement).toEqual({
      status: "not_used",
      score: null,
      verdict: "N/A",
      feedback: "User tidak menggunakan hold pada sesi ini.",
      holdCount: 0,
      totalDurationMs: 0,
      longestDurationMs: 0,
      exceededCount: 0,
    });
  });

  it("clamps hold score to 0-10", () => {
    const result = validateAssessment({
      ...valid,
      holdManagement: makeHoldAssessment({
        status: "within_limit",
        score: 15,
        verdict: "Baik",
      }),
    });
    expect(result?.holdManagement?.score).toBe(10);
  });

  it("normalizes missing holdManagement to N/A for historical assessments", () => {
    const result = validateAssessment(valid);
    expect(result?.holdManagement).toEqual({
      status: "not_used",
      score: null,
      verdict: "N/A",
      feedback: "User tidak menggunakan hold pada sesi ini.",
      holdCount: 0,
      totalDurationMs: 0,
      longestDurationMs: 0,
      exceededCount: 0,
    });
  });
});
