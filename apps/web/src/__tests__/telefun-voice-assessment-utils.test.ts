import { describe, expect, it } from "vitest";
import {
  validateAssessment,
  normalizeTelefunScoreResponse,
  getCommunicationProfileFromAssessment,
} from "../lib/voiceAssessmentUtils";

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
  it("returns null for non-object", () => {
    expect(validateAssessment(null)).toBeNull();
    expect(validateAssessment("string")).toBeNull();
    expect(validateAssessment(123)).toBeNull();
  });

  it("returns null when overallScore is missing", () => {
    expect(
      validateAssessment({ ...valid, overallScore: undefined }),
    ).toBeNull();
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
      speakingRate: {
        score: 5,
        verdict: "Ok",
        feedback: "Fine",
        wordsPerMinute: 100,
      },
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
      speakingRate: {
        score: 15,
        verdict: "Too fast",
        feedback: "Slow down",
        wordsPerMinute: 200,
      },
    });
    expect(result!.speakingRate.score).toBe(10);
  });

  it("preserves communicationProfile if present in payload", () => {
    const profile = {
      metrics: [],
      overallSummary: "Test",
      strengths: ["Satu"],
      improvementPriorities: ["Dua"],
    };
    const result = validateAssessment({
      ...valid,
      communicationProfile: profile,
    });
    expect(result!.communicationProfile).toEqual(profile);
  });

  it("sets communicationProfile to null for legacy payload", () => {
    const result = validateAssessment(valid);
    expect(result!.communicationProfile).toBeNull();
  });
});

describe("normalizeTelefunScoreResponse", () => {
  it("unwraps { score, feedback, assessment } envelope from postApi", () => {
    const envelope = {
      score: 85,
      feedback: "Bagus",
      assessment: {
        overallScore: 8,
        speakingRate: {
          score: 7,
          wordsPerMinute: 130,
          verdict: "Good",
          feedback: "Nice",
        },
        intonation: { score: 8, verdict: "Good", feedback: "Nice" },
        articulation: { score: 9, verdict: "Great", feedback: "Clear" },
        fillerWords: {
          score: 7,
          count: 2,
          examples: ["uh"],
          verdict: "Good",
          feedback: "Minimal",
        },
        emotionalTone: {
          score: 7,
          dominant: "calm",
          verdict: "Good",
          feedback: "Calm",
        },
        transcript: "Hello",
        highlights: [],
        strengths: [],
      },
    };

    const result = normalizeTelefunScoreResponse(envelope);
    expect(result.score).toBe(85);
    expect(result.feedback).toBe("Bagus");
    expect(result.assessment).not.toBeNull();
    expect(result.assessment!.overallScore).toBe(8);
  });

  it("handles assessment directly when no envelope (defensive)", () => {
    const direct = {
      overallScore: 7,
      speakingRate: {
        score: 6,
        wordsPerMinute: 120,
        verdict: "Ok",
        feedback: "Fine",
      },
      intonation: { score: 7, verdict: "Ok", feedback: "Fine" },
      articulation: { score: 8, verdict: "Good", feedback: "Clear" },
      fillerWords: {
        score: 5,
        count: 4,
        examples: [],
        verdict: "Ok",
        feedback: "Some",
      },
      emotionalTone: {
        score: 6,
        dominant: "neutral",
        verdict: "Ok",
        feedback: "Neutral",
      },
      transcript: "Hi",
      highlights: [],
      strengths: [],
    };

    const result = normalizeTelefunScoreResponse(direct);
    expect(result.assessment).not.toBeNull();
  });

  it("returns safe defaults for invalid input", () => {
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
