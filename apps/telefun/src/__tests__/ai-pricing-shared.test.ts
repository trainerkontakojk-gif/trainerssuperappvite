import { describe, expect, it } from "vitest";

import {
  DEFAULT_USD_TO_IDR_RATE,
  GEMINI_LIVE_PRICING,
  GEMINI_PER_MINUTE_AUDIO_USD,
  geminiPerMinuteTotalUsd,
  getTelefunLiveModel,
  resolveGeminiLiveFallbackPerMillion,
} from "@trainers/types";

/**
 * Characterization tests for plan 020 (unify AI pricing).
 *
 * Pins the shared rate-card constants in ONE place so any future price
 * edit fails loudly here first — instead of silently drifting between
 * apps/api and apps/telefun like it did before commit 1cd3b75.
 */
describe("shared AI pricing constants (plan 020)", () => {
  it("keeps the default USD→IDR conversion rate", () => {
    expect(DEFAULT_USD_TO_IDR_RATE).toBe(15000);
  });

  it("pins Gemini Live modality rates to the official card", () => {
    expect(GEMINI_LIVE_PRICING.inputTextPriceUsdPerMillion).toBe(0.75);
    expect(GEMINI_LIVE_PRICING.inputAudioPriceUsdPerMillion).toBe(3.0);
    expect(GEMINI_LIVE_PRICING.outputTextPriceUsdPerMillion).toBe(4.5);
    expect(GEMINI_LIVE_PRICING.outputAudioPriceUsdPerMillion).toBe(12.0);
  });

  it("pins the Gemini per-minute audio floor", () => {
    expect(GEMINI_PER_MINUTE_AUDIO_USD.input).toBe(0.005);
    expect(GEMINI_PER_MINUTE_AUDIO_USD.output).toBe(0.018);
    expect(geminiPerMinuteTotalUsd()).toBeCloseTo(0.023, 12);
  });

  it("resolves live-transport fallback to audio rates and zeroes otherwise", () => {
    expect(resolveGeminiLiveFallbackPerMillion(true)).toEqual({
      input: 3.0,
      output: 12.0,
    });
    expect(resolveGeminiLiveFallbackPerMillion(false)).toEqual({
      input: 0,
      output: 0,
    });
  });

  it("stays consistent with the telefun live model registry", () => {
    const live = getTelefunLiveModel("gemini-3.0-flash-live-preview");
    expect(live?.provider).toBe("gemini");
    expect(live?.realtime.transport).toBe("gemini-live");
  });
});
