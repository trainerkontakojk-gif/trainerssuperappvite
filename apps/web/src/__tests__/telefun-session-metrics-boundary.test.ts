import { describe, expect, it } from "vitest";
import type { SessionMetricsExtended } from "../routes/telefun/services/realisticMode/types";

describe("Telefun session metrics boundary", () => {
  it("allows realisticModeMetrics without casting base SessionMetrics to any", () => {
    const metrics: SessionMetricsExtended = {
      speechSegments: [],
      totalSpeakingMs: 0,
      totalSilenceMs: 0,
      deadAirCount: 0,
      interruptionCount: 0,
      volumeSamples: [],
      volumeConsistency: 0,
      inputTranscriptionChunks: [],
      sessionDurationMs: 1000,
      turnTakingEvents: [],
      fallbackCount: 0,
      fallbackRecoveryCount: 0,
      backchannelCount: 0,
      personaIntensityHistory: [],
      disruptionOutcomes: [],
      speakingDominanceRatio: 0,
      estimatedWpm: 0,
      realisticModeMetrics: {
        turnTakingEvents: [],
        fallbackCount: 0,
        fallbackRecoveryCount: 0,
        backchannelCount: 0,
        personaIntensityHistory: [],
        disruptionOutcomes: [],
      },
    };

    expect(metrics.realisticModeMetrics?.fallbackCount).toBe(0);
  });
});
