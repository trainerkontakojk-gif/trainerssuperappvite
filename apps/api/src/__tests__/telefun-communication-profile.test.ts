import { describe, expect, it } from "vitest";
import {
  evaluateMetricStatus,
  buildCommunicationProfileFromAssessment,
  enrichAssessmentWithCommunicationProfile,
  BENCHMARK_DEFAULTS,
  generateExplanation,
} from "../lib/telefun-communication-profile";
import type { VoiceQualityAssessment } from "@trainers/types";

function makeLegacyAssessment(
  overrides?: Partial<VoiceQualityAssessment>,
): VoiceQualityAssessment {
  return {
    overallScore: 8,
    speakingRate: {
      score: 7,
      wordsPerMinute: 145,
      verdict: "Baik",
      feedback: "Tempo stabil.",
    },
    intonation: { score: 8, verdict: "Baik", feedback: "Intonasi baik." },
    articulation: {
      score: 9,
      verdict: "Sangat baik",
      feedback: "Artikulasi jelas.",
    },
    fillerWords: {
      score: 8,
      count: 3,
      examples: ["uh", "um"],
      verdict: "Baik",
      feedback: "Minim filler.",
    },
    emotionalTone: {
      score: 7,
      dominant: "tenang",
      verdict: "Cukup",
      feedback: "Empati cukup.",
    },
    transcript: "Halo selamat siang...",
    highlights: ["Pembukaan baik"],
    strengths: ["Suara jelas"],
    ...overrides,
  };
}

describe("evaluateMetricStatus", () => {
  it("higher_better: good if >= goodMin (default 75)", () => {
    expect(evaluateMetricStatus(90, "higher_better", { goodMin: 75 })).toBe(
      "good",
    );
    expect(evaluateMetricStatus(75, "higher_better", { goodMin: 75 })).toBe(
      "good",
    );
  });

  it("higher_better: needs_improvement if >= 50 but < goodMin", () => {
    expect(evaluateMetricStatus(65, "higher_better", { goodMin: 75 })).toBe(
      "needs_improvement",
    );
  });

  it("higher_better: poor if < 50", () => {
    expect(evaluateMetricStatus(30, "higher_better", { goodMin: 75 })).toBe(
      "poor",
    );
  });

  it("lower_better: good if <= goodMax (default 30)", () => {
    expect(evaluateMetricStatus(15, "lower_better", { goodMax: 30 })).toBe(
      "good",
    );
    expect(evaluateMetricStatus(30, "lower_better", { goodMax: 30 })).toBe(
      "good",
    );
  });

  it("lower_better: needs_improvement if <= 50 but > goodMax", () => {
    expect(evaluateMetricStatus(40, "lower_better", { goodMax: 30 })).toBe(
      "needs_improvement",
    );
  });

  it("lower_better: poor if > 50", () => {
    expect(evaluateMetricStatus(70, "lower_better", { goodMax: 30 })).toBe(
      "poor",
    );
  });

  it("optimal_range: good if within ideal range", () => {
    expect(
      evaluateMetricStatus(70, "optimal_range", {
        idealMin: 60,
        idealMax: 80,
      }),
    ).toBe("good");
  });

  it("optimal_range: needs_improvement if within good range but outside ideal", () => {
    expect(
      evaluateMetricStatus(55, "optimal_range", {
        idealMin: 60,
        idealMax: 80,
        goodMin: 50,
        goodMax: 90,
      }),
    ).toBe("needs_improvement");
  });

  it("optimal_range: poor if outside both ranges", () => {
    expect(
      evaluateMetricStatus(40, "optimal_range", {
        idealMin: 60,
        idealMax: 80,
        goodMin: 50,
        goodMax: 90,
      }),
    ).toBe("poor");
  });

  it("clamps values to 0-100 before evaluating", () => {
    expect(evaluateMetricStatus(150, "higher_better", { goodMin: 75 })).toBe(
      "good",
    );
    expect(evaluateMetricStatus(-10, "lower_better", { goodMax: 30 })).toBe(
      "good",
    );
  });
});

describe("BENCHMARK_DEFAULTS", () => {
  it("has all 5 metric keys", () => {
    const keys = Object.keys(BENCHMARK_DEFAULTS);
    expect(keys).toContain("speakingRate");
    expect(keys).toContain("intonation");
    expect(keys).toContain("articulation");
    expect(keys).toContain("fillers");
    expect(keys).toContain("tone");
  });

  it("speakingRate uses optimal_range mode", () => {
    expect(BENCHMARK_DEFAULTS.speakingRate.evaluationMode).toBe(
      "optimal_range",
    );
  });

  it("fillers uses lower_better mode", () => {
    expect(BENCHMARK_DEFAULTS.fillers.evaluationMode).toBe("lower_better");
  });

  it("intonation, articulation, tone use higher_better mode", () => {
    expect(BENCHMARK_DEFAULTS.intonation.evaluationMode).toBe("higher_better");
    expect(BENCHMARK_DEFAULTS.articulation.evaluationMode).toBe(
      "higher_better",
    );
    expect(BENCHMARK_DEFAULTS.tone.evaluationMode).toBe("higher_better");
  });
});

describe("buildCommunicationProfileFromAssessment", () => {
  it("returns null for null input", () => {
    expect(buildCommunicationProfileFromAssessment(null)).toBeNull();
  });

  it("builds profile with 5 metrics from legacy assessment", () => {
    const assessment = makeLegacyAssessment();
    const profile = buildCommunicationProfileFromAssessment(assessment);
    expect(profile).not.toBeNull();
    expect(profile!.metrics).toHaveLength(5);
    expect(profile!.metrics[0]).toHaveProperty("key");
    expect(profile!.metrics[0]).toHaveProperty("value");
    expect(profile!.metrics[0]).toHaveProperty("benchmarkValue");
    expect(profile!.metrics[0]).toHaveProperty("evaluationMode");
    expect(profile!.metrics[0]).toHaveProperty("status");
    expect(profile!.metrics[0]).toHaveProperty("explanation");
    expect(profile!.metrics[0]).toHaveProperty("score");
    expect(profile!.metrics[0]).toHaveProperty("verdict");
    expect(profile!.metrics[0]).toHaveProperty("feedback");
    expect(profile!.metrics[0]).toHaveProperty("targetDirection");
  });

  it("uses wordsPerMinute for speakingRate value (not score * 10)", () => {
    const assessment = makeLegacyAssessment({
      speakingRate: {
        score: 5,
        wordsPerMinute: 145,
        verdict: "Ok",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const sr = profile!.metrics.find((m) => m.key === "speakingRate");
    expect(sr!.value).toBe(70);
  });

  it("falls back speakingRate to score * 10 when wordsPerMinute missing", () => {
    const assessment = makeLegacyAssessment({
      speakingRate: {
        score: 6,
        wordsPerMinute: 0,
        verdict: "Ok",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const sr = profile!.metrics.find((m) => m.key === "speakingRate");
    expect(sr!.value).toBe(60);
  });

  it("fillers uses count (not score) for value", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: {
        score: 9,
        count: 3,
        examples: ["uh"],
        verdict: "Baik",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const fl = profile!.metrics.find((m) => m.key === "fillers");
    expect(fl!.value).toBe(20);
    expect(fl!.evaluationMode).toBe("lower_better");
    expect(fl!.status).toBe("good");
  });

  it("fillers poor status when count is high", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: {
        score: 4,
        count: 15,
        examples: ["uh", "um", "eh"],
        verdict: "Buruk",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const fl = profile!.metrics.find((m) => m.key === "fillers");
    expect(fl!.value).toBe(90);
    expect(fl!.status).toBe("poor");
  });

  it("maps emotionalTone to tone key", () => {
    const assessment = makeLegacyAssessment({
      emotionalTone: {
        score: 8,
        dominant: "tenang",
        verdict: "Baik",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const tone = profile!.metrics.find((m) => m.key === "tone");
    expect(tone!.value).toBe(80);
  });

  it("generates overallSummary correctly for all-good profile", () => {
    const assessment = makeLegacyAssessment({
      speakingRate: {
        score: 7,
        wordsPerMinute: 140,
        verdict: "Baik",
        feedback: "",
      },
      intonation: { score: 8, verdict: "Baik", feedback: "" },
      articulation: { score: 9, verdict: "Baik", feedback: "" },
      fillerWords: {
        score: 9,
        count: 1,
        examples: [],
        verdict: "Baik",
        feedback: "",
      },
      emotionalTone: {
        score: 8,
        dominant: "tenang",
        verdict: "Baik",
        feedback: "",
      },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    expect(profile!.overallSummary).toContain("sangat baik");
  });

  it("includes strengths and improvementPriorities", () => {
    const assessment = makeLegacyAssessment();
    const profile = buildCommunicationProfileFromAssessment(assessment);
    expect(profile!.strengths.length).toBeGreaterThan(0);
    expect(profile!.improvementPriorities).toBeDefined();
  });

  it("normalizes speaking rate WPM into displayScore without using WPM as score", () => {
    const profile = buildCommunicationProfileFromAssessment(
      makeLegacyAssessment({
        speakingRate: {
          score: 4,
          wordsPerMinute: 118,
          verdict: "Cukup",
          feedback: "Tempo agak lambat.",
        },
      }),
    );
    const sr = profile!.metrics.find((m) => m.key === "speakingRate")!;
    expect(sr.rawValue).toBe(118);
    expect(sr.displayScore).toBeGreaterThanOrEqual(0);
    expect(sr.displayScore).toBeLessThanOrEqual(100);
    expect(sr.displayScore).not.toBe(118);
    expect(sr.targetScore).toBe(70);
  });

  it("normalizes filler count as low target display value instead of raw count score", () => {
    const profile = buildCommunicationProfileFromAssessment(
      makeLegacyAssessment({
        fillerWords: {
          score: 9,
          count: 3,
          examples: ["eh"],
          verdict: "Baik",
          feedback: "Minim filler.",
        },
      }),
    );
    const fillers = profile!.metrics.find((m) => m.key === "fillers")!;
    expect(fillers.rawValue).toBe(3);
    expect(fillers.displayScore).toBe(20);
    expect(fillers.targetScore).toBe(20);
    expect(fillers.status).toBe("good");
  });

  it("carries original quality score, verdict, and feedback into the display metric", () => {
    const profile = buildCommunicationProfileFromAssessment(
      makeLegacyAssessment({
        speakingRate: {
          score: 6,
          wordsPerMinute: 118,
          verdict: "Cukup",
          feedback: "Tempo agak lambat, tambahkan jeda.",
        },
      }),
    );
    const sr = profile!.metrics.find((m) => m.key === "speakingRate")!;
    expect(sr.score).toBe(6);
    expect(sr.verdict).toBe("Cukup");
    expect(sr.feedback).toBe("Tempo agak lambat, tambahkan jeda.");
    expect(sr.targetDirection).toBe("match_target");
  });
});

describe("enrichAssessmentWithCommunicationProfile", () => {
  it("adds communicationProfile if absent", () => {
    const assessment = makeLegacyAssessment();
    expect(assessment.communicationProfile).toBeUndefined();

    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    expect(enriched.communicationProfile).not.toBeNull();
    expect(enriched.communicationProfile!.metrics).toHaveLength(5);
  });

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
          verdict: "Baik",
          status: "good",
          feedback: "Tempo stabil.",
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
          verdict: "Baik",
          status: "good",
          feedback: "Intonasi baik.",
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
          verdict: "Sangat baik",
          status: "good",
          feedback: "Artikulasi jelas.",
          explanation: "Custom",
        },
        {
          key: "fillers",
          label: "Fillers",
          value: 20,
          benchmarkValue: 20,
          score: 8,
          displayScore: 20,
          targetScore: 20,
          targetDirection: "lower_raw_is_better",
          evaluationMode: "lower_better",
          verdict: "Baik",
          status: "good",
          feedback: "Minim filler.",
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
          verdict: "Cukup",
          status: "good",
          feedback: "Empati cukup.",
          explanation: "Custom",
        },
      ],
      overallSummary: "Custom",
      strengths: [],
      improvementPriorities: [],
    };
    const assessment = {
      ...makeLegacyAssessment(),
      communicationProfile: existing as any,
    };
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    expect(enriched.communicationProfile).toBe(existing);
  });

  it("rebuilds existing communicationProfile if stale or invalid", () => {
    const existing = {
      metrics: [],
      overallSummary: "Custom",
      strengths: [],
      improvementPriorities: [],
    };
    const assessment = {
      ...makeLegacyAssessment(),
      communicationProfile: existing as any,
    };
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    expect(enriched.communicationProfile).not.toBe(existing);
    expect(enriched.communicationProfile!.metrics).toHaveLength(5);
    expect(
      enriched.communicationProfile!.metrics[0].displayScore,
    ).toBeDefined();
  });

  it("rebuilds stale communicationProfile instead of trusting an old ambiguous profile", () => {
    const assessment = makeLegacyAssessment({
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
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    const sr = enriched.communicationProfile!.metrics.find(
      (m) => m.key === "speakingRate",
    )!;
    expect(sr.displayScore).not.toBe(118);
    expect(sr.targetScore).toBe(70);
  });

  it("rebuilds cache with wrong deterministic target even if display fields exist", () => {
    const assessment = makeLegacyAssessment({
      communicationProfile: {
        metrics: [
          {
            key: "speakingRate",
            label: "Speaking Rate",
            value: 70,
            benchmarkValue: 100,
            score: 7,
            displayScore: 70,
            targetScore: 100,
            targetDirection: "match_target",
            evaluationMode: "optimal_range",
            verdict: "Baik",
            status: "good",
            feedback: "Old target",
            explanation: "old",
          },
        ],
        overallSummary: "old",
        strengths: [],
        improvementPriorities: [],
      } as any,
    });
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    const sr = enriched.communicationProfile!.metrics.find(
      (m) => m.key === "speakingRate",
    )!;
    expect(sr.targetScore).toBe(70);
    expect(sr.feedback).toBe("Tempo stabil.");
  });

  it("does not mutate original assessment", () => {
    const assessment = makeLegacyAssessment();
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    expect(assessment.communicationProfile).toBeUndefined();
    expect(enriched.communicationProfile).toBeDefined();
  });
});

describe("generateExplanation", () => {
  it("higher_better good", () => {
    const exp = generateExplanation("intonation", 90, "higher_better", {
      goodMin: 75,
    });
    expect(exp).toContain("sudah sangat baik");
  });

  it("higher_better needs_improvement", () => {
    const exp = generateExplanation("intonation", 60, "higher_better", {
      goodMin: 75,
    });
    expect(exp).toContain("cukup baik");
  });

  it("lower_better good", () => {
    const exp = generateExplanation("fillers", 15, "lower_better", {
      goodMax: 30,
    });
    expect(exp).toContain("sangat minim");
  });

  it("optimal_range ideal", () => {
    const exp = generateExplanation("speakingRate", 70, "optimal_range", {
      idealMin: 60,
      idealMax: 80,
    });
    expect(exp).toContain("rentang ideal");
  });
});
