import { describe, expect, it } from "vitest";
import { validateAssessment } from "../lib/voiceAssessmentUtils";

describe("validateAssessment", () => {
  const valid = {
    overallScore: 8,
    speakingRate: { score: 7, verdict: "Good", feedback: "Nice pace", wordsPerMinute: 130 },
    intonation: { score: 8, verdict: "Good", feedback: "Nice tone" },
    articulation: { score: 9, verdict: "Great", feedback: "Clear speech" },
    fillerWords: { score: 6, verdict: "Fine", feedback: "Some fillers", count: 5, examples: ["uh", "um"] },
    emotionalTone: { score: 7, verdict: "Good", feedback: "Empathetic", dominant: "calm" },
    transcript: "Hello world",
    highlights: ["Great start"],
    strengths: ["Clear voice"],
  };

  it("returns null for non-object", () => {
    expect(validateAssessment(null)).toBeNull();
    expect(validateAssessment("string")).toBeNull();
    expect(validateAssessment(123)).toBeNull();
  });

  it("returns null when overallScore is missing", () => {
    expect(validateAssessment({ ...valid, overallScore: undefined })).toBeNull();
  });

  it("clamps overallScore to 0-10", () => {
    const high = validateAssessment({ ...valid, overallScore: 15 });
    expect(high?.overallScore).toBe(10);

    const low = validateAssessment({ ...valid, overallScore: -5 });
    expect(low?.overallScore).toBe(0);
  });

  it("returns validated assessment with safe defaults", () => {
    const result = validateAssessment(valid);
    expect(result).not.toBeNull();
    expect(result!.overallScore).toBe(8);
    expect(result!.speakingRate.score).toBe(7);
    expect(result!.fillerWords.count).toBe(5);
    expect(result!.transcript).toBe("Hello world");
  });

  it("handles missing aspect fields gracefully with safe defaults", () => {
    const result = validateAssessment({
      overallScore: 5,
      speakingRate: { score: 5, verdict: "Ok", feedback: "Fine", wordsPerMinute: 100 },
      intonation: {},
      articulation: {},
      fillerWords: {},
      emotionalTone: {},
    });
    expect(result).not.toBeNull();
    expect(result!.intonation.score).toBe(0);
    expect(result!.intonation.verdict).toBe("Neutral");
    expect(result!.intonation.feedback).toBe("No feedback provided.");
  });

  it("filters non-string highlights", () => {
    const result = validateAssessment({
      ...valid,
      highlights: ["Good", 123, "Bad", null, "OK"],
    });
    expect(result!.highlights).toEqual(["Good", "Bad", "OK"]);
  });

  it("truncates highlights to 5", () => {
    const result = validateAssessment({
      ...valid,
      highlights: ["1", "2", "3", "4", "5", "6", "7"],
    });
    expect(result!.highlights).toHaveLength(5);
  });

  it("truncates strengths to 5", () => {
    const result = validateAssessment({
      ...valid,
      strengths: ["1", "2", "3", "4", "5", "6"],
    });
    expect(result!.strengths).toHaveLength(5);
  });

  it("defaults empty transcript to empty string", () => {
    const result = validateAssessment({ ...valid, transcript: undefined });
    expect(result!.transcript).toBe("");
  });

  it("filters non-string filler word examples", () => {
    const result = validateAssessment({
      ...valid,
      fillerWords: {
        score: 5,
        verdict: "Ok",
        feedback: "Fine",
        count: 3,
        examples: ["uh", 123, "um", null, "ah"],
      },
    });
    expect(result!.fillerWords.examples).toEqual(["uh", "um", "ah"]);
  });

  it("defaults missing dominant tone to Unknown", () => {
    const result = validateAssessment({
      ...valid,
      emotionalTone: { score: 5, verdict: "Ok", feedback: "Fine" },
    });
    expect(result!.emotionalTone.dominant).toBe("Unknown");
  });

  it("clamps aspect scores to 0-10", () => {
    const result = validateAssessment({
      ...valid,
      speakingRate: { score: 15, verdict: "Too fast", feedback: "Slow down", wordsPerMinute: 200 },
    });
    expect(result!.speakingRate.score).toBe(10);
  });
});
