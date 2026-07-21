import { describe, expect, it } from "vitest";
import {
  evaluateMetricStatus,
  getMetricStatus,
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

  it("fillers uses higher_better display score with lower raw count direction", () => {
    expect(BENCHMARK_DEFAULTS.fillers.evaluationMode).toBe("higher_better");
    expect(BENCHMARK_DEFAULTS.fillers.benchmarkValue).toBe(80);
  });

  it("intonation, articulation, tone use optimal_range mode", () => {
    expect(BENCHMARK_DEFAULTS.intonation.evaluationMode).toBe("optimal_range");
    expect(BENCHMARK_DEFAULTS.articulation.evaluationMode).toBe("optimal_range");
    expect(BENCHMARK_DEFAULTS.tone.evaluationMode).toBe("optimal_range");
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
    expect(fl!.rawValue).toBe(3);
    expect(fl!.displayScore).toBe(20); // burden: round(3/15*100)
    expect(fl!.evaluationMode).toBe("higher_better");
    expect(fl!.targetDirection).toBe("lower_raw_is_better");
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
    expect(fl!.rawValue).toBe(15);
    expect(fl!.displayScore).toBe(100); // burden capped at 15
    expect(fl!.status).toBe("poor");
  });

  it("maps filler count to radar burden where fewer fillers are better", () => {
    const cases = [
      { count: 0, burden: 0, status: "good" },
      { count: 1, burden: 7, status: "good" },
      { count: 3, burden: 20, status: "good" },
      { count: 5, burden: 33, status: "needs_improvement" },
      { count: 8, burden: 53, status: "poor" },
      { count: 11, burden: 73, status: "poor" },
      { count: 15, burden: 100, status: "poor" },
    ] as const;

    for (const { count, burden, status } of cases) {
      const profile = buildCommunicationProfileFromAssessment(
        makeLegacyAssessment({
          fillerWords: {
            score: 9,
            count,
            examples: [],
            verdict: "Baik",
            feedback: "Feedback filler.",
          },
        }),
      );
      const fillers = profile!.metrics.find((m) => m.key === "fillers")!;
      expect(fillers.rawValue).toBe(count);
      expect(fillers.displayScore).toBe(burden);
      expect(fillers.status).toBe(status);
    }
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

  it("normalizes filler count as quality display score instead of raw count score", () => {
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
    expect(fillers.displayScore).toBe(20); // burden: round(3/15*100) = 20
    expect(fillers.targetScore).toBe(80);
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

  it("optimal_range status penalizes deviation ABOVE target for intonation", () => {
    // Intonation target is 80. Score 100 (distance 20) should NOT be "good"
    const assessment = makeLegacyAssessment({
      intonation: { score: 10, verdict: "Sempurna", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const m = profile!.metrics.find((x) => x.key === "intonation")!;
    expect(m.displayScore).toBe(100);
    expect(m.status).not.toBe("good");
    expect(m.status).toBe("needs_improvement");
  });

  it("optimal_range status penalizes deviation BELOW target for articulation", () => {
    // Articulation target is 90. Score 50 (displayScore 50) should be "poor"
    const assessment = makeLegacyAssessment({
      articulation: { score: 5, verdict: "Kurang", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const m = profile!.metrics.find((x) => x.key === "articulation")!;
    expect(m.displayScore).toBe(50);
    expect(m.status).toBe("poor");
  });

  it("optimal_range status: on-target intonation yields good", () => {
    const assessment = makeLegacyAssessment({
      intonation: { score: 8, verdict: "Baik", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const m = profile!.metrics.find((x) => x.key === "intonation")!;
    expect(m.displayScore).toBe(80);
    expect(m.status).toBe("good");
  });

  it("fillers 0 count produces radar value 0 and status good", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: { score: 10, count: 0, examples: [], verdict: "Sempurna", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const fl = profile!.metrics.find((x) => x.key === "fillers")!;
    expect(fl.rawValue).toBe(0);
    expect(fl.displayScore).toBe(0);
    expect(fl.status).toBe("good");
  });

  it("fillers exactly at target (3) aligns radar with green guide 20", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: { score: 8, count: 3, examples: ["eh"], verdict: "Baik", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const fl = profile!.metrics.find((x) => x.key === "fillers")!;
    expect(fl.rawValue).toBe(3);
    expect(fl.displayScore).toBe(20);
    expect(fl.status).toBe("good");
  });

  it("fillers 15+ caps displayScore at 100 and status poor", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: { score: 2, count: 20, examples: ["eh", "um", "anu"], verdict: "Buruk", feedback: "" },
    });
    const profile = buildCommunicationProfileFromAssessment(assessment);
    const fl = profile!.metrics.find((x) => x.key === "fillers")!;
    expect(fl.rawValue).toBe(20);
    expect(fl.displayScore).toBe(100);
    expect(fl.status).toBe("poor");
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
          targetDirection: "match_target",
          evaluationMode: "optimal_range",
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
          targetDirection: "match_target",
          evaluationMode: "optimal_range",
          verdict: "Sangat baik",
          status: "good",
          feedback: "Artikulasi jelas.",
          explanation: "Custom",
        },
        {
          key: "fillers",
          label: "Fillers",
          value: 20,
          benchmarkValue: 80,
          score: 8,
          displayScore: 20,
          targetScore: 80,
          targetDirection: "lower_raw_is_better",
          evaluationMode: "higher_better",
          rawValue: 3,
          rawUnit: "filler_words",
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
          targetDirection: "match_target",
          evaluationMode: "optimal_range",
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

  it("rebuilds a profile when canonical metric keys are duplicated", () => {
    const assessment = makeLegacyAssessment();
    const existing = buildCommunicationProfileFromAssessment(assessment);
    expect(existing).not.toBeNull();

    const duplicatedMetric = existing!.metrics[0];
    const enriched = enrichAssessmentWithCommunicationProfile({
      ...assessment,
      communicationProfile: {
        ...existing!,
        metrics: Array.from({ length: 5 }, () => duplicatedMetric),
      },
    });

    expect(
      enriched.communicationProfile?.metrics.map((metric) => metric.key),
    ).toEqual([
      "speakingRate",
      "intonation",
      "articulation",
      "fillers",
      "tone",
    ]);
  });

  it("does not mutate original assessment", () => {
    const assessment = makeLegacyAssessment();
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    expect(assessment.communicationProfile).toBeUndefined();
    expect(enriched.communicationProfile).toBeDefined();
  });

  it("rebuilds stale cache where fillers has old inverted displayScore (100 for 0 count)", () => {
    const assessment = makeLegacyAssessment({
      fillerWords: {
        score: 10,
        count: 0,
        examples: [],
        verdict: "Sempurna",
        feedback: "No fillers.",
      },
      communicationProfile: {
        metrics: [
          {
            key: "fillers",
            label: "Fillers",
            value: 0,
            benchmarkValue: 80,
            score: 10,
            displayScore: 100, // old inverted: 0 fillers → 100
            targetScore: 80,
            targetDirection: "lower_raw_is_better",
            evaluationMode: "higher_better",
            rawValue: 0,
            rawUnit: "filler_words",
            verdict: "Sempurna",
            status: "good",
            feedback: "No fillers.",
            explanation: "old inverted",
          },
        ],
        overallSummary: "old",
        strengths: [],
        improvementPriorities: [],
      } as any,
    });
    const enriched = enrichAssessmentWithCommunicationProfile(assessment);
    const fl = enriched.communicationProfile!.metrics.find(
      (m) => m.key === "fillers",
    )!;
    expect(fl.displayScore).toBe(0); // rebuilt: mapFillerCountToRadarBurden(0) = 0
    expect(fl.rawValue).toBe(0);
  });

  it("rebuilds cache when intonation targetDirection or status is stale despite valid fillers", () => {
    // Build a canonical profile, then mutate intonation direction+status
    const assessment = makeLegacyAssessment();
    const canonical = buildCommunicationProfileFromAssessment(assessment)!;

    // Clone and mutate intonation to old invalid values
    const staleMetrics = canonical.metrics.map((m) =>
      m.key === "intonation"
        ? { ...m, targetDirection: "higher_quality" as const, status: "poor" as const }
        : m,
    );

    const assessmentWithStaleCache = {
      ...assessment,
      communicationProfile: {
        ...canonical,
        metrics: staleMetrics,
      },
    };

    const enriched = enrichAssessmentWithCommunicationProfile(
      assessmentWithStaleCache,
    );

    // Must rebuild — mutated cache is invalid
    expect(enriched.communicationProfile).not.toBe(
      assessmentWithStaleCache.communicationProfile,
    );

    const intonation = enriched.communicationProfile!.metrics.find(
      (m) => m.key === "intonation",
    )!;
    // Rebuilt with correct targetDirection
    expect(intonation.targetDirection).toBe("match_target");
    // Rebuilt with correct status via getMetricStatus
    expect(intonation.status).toBe(
      getMetricStatus(intonation.displayScore, intonation.targetScore),
    );
  });
});

describe("generateExplanation", () => {
  it("optimal_range good generates target-ideal explanation", () => {
    const exp = generateExplanation("intonation", 80, "optimal_range", {
      idealMin: 70,
      idealMax: 90,
    });
    expect(exp).toContain("mendekati target ideal");
  });

  it("optimal_range needs_improvement generates distance wording", () => {
    const exp = generateExplanation("intonation", 95, "optimal_range", {
      idealMin: 70,
      idealMax: 90,
      goodMin: 55,
      goodMax: 100,
    });
    expect(exp).toContain("cukup mendekati target");
  });

  it("fillers 0 count generates zero-filler explanation", () => {
    const exp = generateExplanation("fillers", 0, "good", undefined, 0);
    expect(exp).toContain("Tidak ada kata pengisi");
    expect(exp).toContain("Pertahankan");
  });

  it("optimal_range needs_improvement via higher_better delegate", () => {
    const exp = generateExplanation("intonation", 60, "higher_better", {
      goodMin: 75,
    });
    // BENCHMARK_DEFAULTS.intonation is now optimal_range, so explanation
    // uses distance-to-target wording even when called with higher_better
    expect(exp).toContain("cukup mendekati target");
  });

  it("fillers good explanation mentions detected count", () => {
    const exp = generateExplanation("fillers", 20, "good", undefined, 2);
    expect(exp).toContain("2 kata pengisi");
    expect(exp).toContain("pertahankan");
  });

  it("fillers poor explanation names count", () => {
    const exp = generateExplanation("fillers", 100, "poor", undefined, 15);
    expect(exp).toContain("15 kata pengisi");
    expect(exp).toContain("terlalu sering");
  });

  it("optimal_range ideal", () => {
    const exp = generateExplanation("speakingRate", 70, "optimal_range", {
      idealMin: 60,
      idealMax: 80,
    });
    expect(exp).toContain("rentang ideal");
  });
});

describe("getMetricStatus — absolute deviation symmetry", () => {
  it("intonation target 80: same distance above/below yields same status", () => {
    // Distance ≤10 → good
    expect(getMetricStatus(70, 80)).toBe("good");  // -10
    expect(getMetricStatus(90, 80)).toBe("good");  // +10
    // Distance ≤25 → needs_improvement
    expect(getMetricStatus(55, 80)).toBe("needs_improvement"); // -25
    expect(getMetricStatus(100, 80)).toBe("needs_improvement"); // +20 (clamped)
    // Distance >25 → poor
    expect(getMetricStatus(50, 80)).toBe("poor");  // -30
  });

  it("speakingRate target 70: symmetric above/below", () => {
    expect(getMetricStatus(60, 70)).toBe("good");  // -10
    expect(getMetricStatus(80, 70)).toBe("good");  // +10
    expect(getMetricStatus(45, 70)).toBe("needs_improvement"); // -25
    expect(getMetricStatus(95, 70)).toBe("needs_improvement"); // +25
    expect(getMetricStatus(44, 70)).toBe("poor");  // -26
    expect(getMetricStatus(96, 70)).toBe("poor");  // +26
  });

  it("tone target 85: symmetric above/below (upper clamped at 100)", () => {
    expect(getMetricStatus(75, 85)).toBe("good");  // -10
    expect(getMetricStatus(95, 85)).toBe("good");  // +10
    expect(getMetricStatus(60, 85)).toBe("needs_improvement"); // -25
    // Upper side: 85+25=110 >100, so 100 (distance 15) is needs_improvement
    expect(getMetricStatus(100, 85)).toBe("needs_improvement"); // +15
    // 59 (distance 26) → poor on lower side
    expect(getMetricStatus(59, 85)).toBe("poor");
  });

  it("articulation target 90: symmetric above/below (upper clamped at 100)", () => {
    expect(getMetricStatus(80, 90)).toBe("good");  // -10
    expect(getMetricStatus(100, 90)).toBe("good");  // +10 (distance 10)
    expect(getMetricStatus(65, 90)).toBe("needs_improvement"); // -25
    // Upper side past 100 impossible, but 100 (distance 10) is good
    // Lower side only for needs_improvement
    // 64 (distance 26) → poor
    expect(getMetricStatus(64, 90)).toBe("poor");
  });

  it("speakingRate target 70: builder produces symmetric status via getMetricStatus", () => {
    // WPM 140 → displayScore 70 (exact target) → distance 0 → good
    let profile = buildCommunicationProfileFromAssessment({
      overallScore: 8,
      speakingRate: { score: 7, wordsPerMinute: 140, verdict: "Baik", feedback: "" },
      intonation: { score: 8, verdict: "Baik", feedback: "" },
      articulation: { score: 9, verdict: "Baik", feedback: "" },
      fillerWords: { score: 8, count: 1, examples: [], verdict: "Baik", feedback: "" },
      emotionalTone: { score: 7, dominant: "tenang", verdict: "Cukup", feedback: "" },
      transcript: "",
      highlights: [],
      strengths: [],
    });
    let sr = profile!.metrics.find(m => m.key === "speakingRate")!;
    expect(sr.displayScore).toBe(70);
    expect(sr.status).toBe("good");
  });

  it("speakingRate target 70: needs_improvement when far from target through builder", () => {
    // WPM 118 → displayScore ~56 (distance 14 from target 70) → needs_improvement
    let profile = buildCommunicationProfileFromAssessment({
      overallScore: 8,
      speakingRate: { score: 4, wordsPerMinute: 118, verdict: "Cukup", feedback: "" },
      intonation: { score: 8, verdict: "Baik", feedback: "" },
      articulation: { score: 9, verdict: "Baik", feedback: "" },
      fillerWords: { score: 8, count: 1, examples: [], verdict: "Baik", feedback: "" },
      emotionalTone: { score: 7, dominant: "tenang", verdict: "Cukup", feedback: "" },
      transcript: "",
      highlights: [],
      strengths: [],
    });
    let sr = profile!.metrics.find(m => m.key === "speakingRate")!;
    expect(sr.displayScore).toBe(56);
    expect(sr.status).toBe("needs_improvement");
  });
});
