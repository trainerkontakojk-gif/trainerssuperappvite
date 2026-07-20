import { describe, expect, it } from "vitest";
import {
  parseTelefunScoreResult,
  parseVoiceQualityAssessment,
  TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA,
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
  it("rejects incomplete or invalid shapes", () => {
    for (const input of [
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
    ]) {
      expect(parseVoiceQualityAssessment(input)).toBeNull();
    }
  });

  it("clamps scores, preserves zero, and bounds arrays", () => {
    expect(
      parseVoiceQualityAssessment({ ...validAssessment, overallScore: 12 })
        ?.overallScore,
    ).toBe(10);
    expect(
      parseVoiceQualityAssessment({ ...validAssessment, overallScore: -2 })
        ?.overallScore,
    ).toBe(0);
    expect(
      parseVoiceQualityAssessment({
        ...validAssessment,
        highlights: ["1", "2", "3", "4", "5", "6"],
      })?.highlights,
    ).toHaveLength(5);
  });
});

describe("parseTelefunScoreResult", () => {
  it("preserves the score envelope trust boundary", () => {
    expect(parseTelefunScoreResult(null)).toBeNull();
    expect(parseTelefunScoreResult(validAssessment)).toBeNull();
    expect(
      parseTelefunScoreResult({
        score: 88,
        feedback: "invalid scale",
        assessment: validAssessment,
      }),
    ).toBeNull();
    const zeroResult = parseTelefunScoreResult({
      score: 0,
      feedback: "Bad",
      assessment: { ...validAssessment, overallScore: 0 },
    });
    expect(zeroResult?.score).toBe(0);
    expect(zeroResult?.assessment.overallScore).toBe(0);
    expect(
      parseTelefunScoreResult({
        score: 8,
        feedback: "Mismatch",
        assessment: { ...validAssessment, overallScore: 7 },
      }),
    ).toBeNull();
  });
});

describe("TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA", () => {
  it("exports the complete provider-neutral voice assessment schema", () => {
    expect(TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA.required).toEqual([
      "overallScore",
      "speakingRate",
      "intonation",
      "articulation",
      "fillerWords",
      "emotionalTone",
      "transcript",
      "highlights",
      "strengths",
    ]);
    expect(
      TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA.properties.fillerWords.required,
    ).toContain("count");
  });
});
