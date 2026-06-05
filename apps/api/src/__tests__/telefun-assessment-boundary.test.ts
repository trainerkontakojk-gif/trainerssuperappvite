import { describe, expect, it } from "vitest";
// @ts-ignore - shared parser might not be exported yet
import { 
  parseVoiceQualityAssessment, 
  parseTelefunScoreResult 
} from "@trainers/types";

const validAssessment = {
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

describe("parseVoiceQualityAssessment", () => {
  it("rejects non-object or incomplete shape", () => {
    const invalidAssessments = [
      null,
      {},
      { overallScore: 8 },
      { ...validAssessment, overallScore: Number.NaN },
      { ...validAssessment, intonation: undefined },
      {
        ...validAssessment,
        speakingRate: { ...validAssessment.speakingRate, wordsPerMinute: -1 },
      },
      {
        ...validAssessment,
        fillerWords: { ...validAssessment.fillerWords, count: 1.5 },
      },
    ];

    for (const input of invalidAssessments) {
      expect(parseVoiceQualityAssessment(input)).toBeNull();
    }
  });

  it("clamps valid scores to 0-10", () => {
    const resultHigh = parseVoiceQualityAssessment({
      ...validAssessment,
      overallScore: 12,
    });
    expect(resultHigh?.overallScore).toBe(10);

    const resultLow = parseVoiceQualityAssessment({
      ...validAssessment,
      overallScore: -2,
    });
    expect(resultLow?.overallScore).toBe(0);
  });

  it("preserves score 0 as valid", () => {
    const result = parseVoiceQualityAssessment({
      ...validAssessment,
      overallScore: 0,
    });
    expect(result?.overallScore).toBe(0);
  });

  it("validates and truncates highlights/strengths", () => {
    const result = parseVoiceQualityAssessment({
      ...validAssessment,
      highlights: ["1", "2", "3", "4", "5", "6"],
    });
    expect(result?.highlights).toHaveLength(5);
  });
});

describe("parseTelefunScoreResult", () => {
  it("rejects invalid envelope", () => {
    expect(parseTelefunScoreResult(null)).toBeNull();
    expect(parseTelefunScoreResult(validAssessment)).toBeNull();
    expect(parseTelefunScoreResult({
      score: 88,
      feedback: "invalid scale",
      assessment: validAssessment,
    })).toBeNull();
  });

  it("accepts valid result with score 0", () => {
    const result = parseTelefunScoreResult({
      score: 0,
      feedback: "Bad",
      assessment: { ...validAssessment, overallScore: 0 },
    });
    expect(result?.score).toBe(0);
    expect(result?.assessment.overallScore).toBe(0);
  });

  it("rejects result if score doesn't match assessment overallScore", () => {
    const result = parseTelefunScoreResult({
      score: 8,
      feedback: "Mismatch",
      assessment: { ...validAssessment, overallScore: 7 },
    });
    expect(result).toBeNull();
  });
});
