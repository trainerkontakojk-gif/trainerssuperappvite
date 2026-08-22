import { describe, expect, it } from "vitest";
import {
  buildCommunicationProfileFromAssessment,
  enrichAssessmentWithCommunicationProfile,
} from "../lib/telefun-communication-profile";
import { evaluateTelefunHoldAssessment } from "../lib/telefun-hold-assessment";
import { normalizeTelefunHoldMetrics } from "../lib/telefun-hold-assessment";
import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
} from "@trainers/types";
import type {
  TelefunHoldMetrics,
  VoiceQualityAssessment,
} from "@trainers/types";

function makeAssessment(
  overrides?: Partial<VoiceQualityAssessment>,
): VoiceQualityAssessment {
  return {
    overallScore: 8,
    speakingRate: {
      score: 4,
      wordsPerMinute: 180,
      verdict: "Terlalu cepat",
      feedback: "Tempo 180 WPM melebihi ideal 130-150 WPM.",
    },
    intonation: { score: 8, verdict: "Baik", feedback: "Intonasi baik." },
    articulation: {
      score: 9,
      verdict: "Sangat baik",
      feedback: "Artikulasi jelas.",
    },
    fillerWords: {
      score: 5,
      count: 6,
      examples: ["eh", "anu"],
      verdict: "Cukup mengganggu",
      feedback: "6 filler terdeteksi.",
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

describe("Telefun evaluasi edukatif (deterministic drill/examplePhrase)", () => {
  it("adds rule-based drill and examplePhrase per metric — never AI-generated", () => {
    const profile = buildCommunicationProfileFromAssessment(makeAssessment());
    expect(profile).not.toBeNull();
    expect(profile?.coachingVersion).toBe(1);

    const byKey = new Map(profile!.metrics.map((m) => [m.key, m]));

    // WPM 180 → poor + deterministic improvementTip + drill
    const speakingRate = byKey.get("speakingRate")!;
    expect(speakingRate.status).toBe("poor");
    expect(speakingRate.improvementTip).toContain("130-150 WPM");
    expect(typeof speakingRate.drill).toBe("string");
    expect(speakingRate.drill!.length).toBeGreaterThan(0);
    expect(typeof speakingRate.examplePhrase).toBe("string");
    expect(speakingRate.examplePhrase!.length).toBeGreaterThan(0);

    // fillers 6 > target 3 → not good → drill mentions replacing fillers
    const fillers = byKey.get("fillers")!;
    expect(fillers.status === "poor" || fillers.status === "needs_improvement").toBe(
      true,
    );
    expect(fillers.drill).toContain("jeda");

    // good metrics still get examplePhrase
    const articulation = byKey.get("articulation")!;
    expect(articulation.status).toBe("good");
    expect(articulation.drill).toBeUndefined();
    expect(articulation.examplePhrase!.length).toBeGreaterThan(0);
  });

  it("rebuilds legacy profiles that lack drill/examplePhrase (coachingVersion upgrade)", () => {
    const fresh = enrichAssessmentWithCommunicationProfile(makeAssessment());
    expect(fresh.communicationProfile?.coachingVersion).toBe(1);
    expect(fresh.communicationProfile?.metrics.every((m) => m.examplePhrase)).toBe(
      true,
    );

    // Legacy: metrics without drill must be detected as invalid and rebuilt.
    const legacyProfile =
      buildCommunicationProfileFromAssessment(makeAssessment())!;
    const strippedProfile = {
      ...legacyProfile,
      coachingVersion: undefined,
      metrics: legacyProfile.metrics.map((m) => ({
        ...m,
        drill: undefined,
        examplePhrase: undefined,
      })),
    };
    const legacyAssessment = makeAssessment({
      communicationProfile: strippedProfile as never,
    });
    const enriched = enrichAssessmentWithCommunicationProfile(legacyAssessment);
    const rebuilt = enriched.communicationProfile!;
    expect(rebuilt.coachingVersion).toBe(1);
    expect(rebuilt.metrics.every((m) => m.examplePhrase)).toBe(true);
    expect(
      rebuilt.metrics.every(
        (m) => m.status !== "good" || typeof m.improvementTip !== "undefined",
      ) ||
        rebuilt.metrics.some((m) => m.status === "good"),
    ).toBe(true);
    expect(rebuilt.metrics.find((m) => m.key === "speakingRate")!.drill).toBeTruthy();
  });

  it("derives overallNextSteps deterministically from improvement priorities", () => {
    const enriched = enrichAssessmentWithCommunicationProfile(makeAssessment());
    expect(Array.isArray(enriched.overallNextSteps)).toBe(true);
    expect(enriched.overallNextSteps!.length).toBeGreaterThan(0);
    expect(enriched.overallNextSteps!.length).toBeLessThanOrEqual(3);
  });

  it("hold nextSteps/drill use TELEFUN hold limits as source of truth", () => {
    const exceededMetrics: TelefunHoldMetrics = normalizeTelefunHoldMetrics({
      intervals: [
        {
          sequence: 1,
          startedAtMs: 0,
          endedAtMs: TELEFUN_FIRST_HOLD_LIMIT_MS + 30_000,
        },
        {
          sequence: 2,
          startedAtMs: 200_000,
          endedAtMs:
            200_000 + TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS + 10_000,
        },
      ],
    });
    const hold = evaluateTelefunHoldAssessment(exceededMetrics);
    expect(hold.status).toBe("exceeded");
    expect(hold.nextSteps).toBeDefined();
    expect(hold.nextSteps!.length).toBeGreaterThan(0);
    // Source of truth values appear in the drill — no hardcoded limits.
    expect(JSON.stringify(hold.nextSteps)).toContain(
      String(Math.round(TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS / 1000)),
    );
    expect(hold.drill).toContain("hold");

    const withinLimit = evaluateTelefunHoldAssessment(
      normalizeTelefunHoldMetrics({
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 30_000,
          },
        ],
      }),
    );
    expect(withinLimit.nextSteps ?? []).toHaveLength(0);
    expect(withinLimit.drill).toBeUndefined();
  });
});
