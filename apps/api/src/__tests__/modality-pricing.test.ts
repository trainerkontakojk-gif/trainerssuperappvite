import { describe, expect, it } from "vitest";
import {
  calculateModalityCost,
  type ModalityTokenCounts,
  type PricingRates,
} from "../lib/modality-pricing";

describe("calculateModalityCost", () => {
  const defaultRates: PricingRates = {
    inputPriceUsdPerMillion: 3.0,
    outputPriceUsdPerMillion: 12.0,
  };

  it("calculates cost with zero tokens", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 0,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    };
    const result = calculateModalityCost(tokens, defaultRates, 18000);
    expect(result.costUsd).toBe(0);
    expect(result.costIdr).toBe(0);
  });

  it("calculates cost for input-only tokens", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 1_000_000,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    };
    const result = calculateModalityCost(tokens, defaultRates, 18000);
    expect(result.costUsd).toBe(3.0);
    expect(result.costIdr).toBe(54000);
  });

  it("calculates cost for output-only tokens", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 0,
      inputAudioTokens: 0,
      outputTextTokens: 1_000_000,
      outputAudioTokens: 0,
    };
    const result = calculateModalityCost(tokens, defaultRates, 18000);
    expect(result.costUsd).toBe(12.0);
    expect(result.costIdr).toBe(216000);
  });

  it("calculates cost with mixed modality tokens", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 500_000,
      inputAudioTokens: 500_000,
      outputTextTokens: 250_000,
      outputAudioTokens: 750_000,
    };
    const result = calculateModalityCost(tokens, defaultRates, 18000);
    // Input: (1M / 1M) * 3 = 3.0
    // Output: (1M / 1M) * 12 = 12.0
    expect(result.costUsd).toBe(15.0);
    expect(result.costIdr).toBe(270000);
  });

  it("rounds costUsd to 6 decimal places", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 123456,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    };
    const result = calculateModalityCost(tokens, defaultRates, 18000);
    // 123456 / 1_000_000 * 3 = 0.370368
    expect(result.costUsd).toBe(0.370368);
    expect(result.costIdr).toBe(Math.round(0.370368 * 18000));
  });

  it("handles different rates", () => {
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 1_000_000,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    };
    // Text pricing: $0.75 input
    const textRates: PricingRates = {
      inputPriceUsdPerMillion: 0.75,
      outputPriceUsdPerMillion: 4.5,
    };
    const result = calculateModalityCost(tokens, textRates, 15000);
    expect(result.costUsd).toBe(0.75);
    expect(result.costIdr).toBe(Math.round(0.75 * 15000));
  });

  it("charges cached text and audio at cached rates without double charging full input", () => {
    const result = calculateModalityCost(
      {
        inputTextTokens: 1_000_000,
        cachedInputTextTokens: 250_000,
        inputAudioTokens: 2_000_000,
        cachedInputAudioTokens: 500_000,
        outputTextTokens: 100_000,
        outputAudioTokens: 200_000,
      },
      {
        inputPriceUsdPerMillion: 4,
        outputPriceUsdPerMillion: 24,
        inputTextPriceUsdPerMillion: 4,
        cachedInputTextPriceUsdPerMillion: 0.4,
        inputAudioPriceUsdPerMillion: 32,
        cachedInputAudioPriceUsdPerMillion: 0.4,
        outputTextPriceUsdPerMillion: 24,
        outputAudioPriceUsdPerMillion: 64,
      },
      15_000,
      "gpt-realtime-2.1",
    );

    expect(result.costUsd).toBe(66.5);
    expect(result.cachedInputTextPriceUsdPerMillion).toBe(0.4);
    expect(result.cachedInputAudioPriceUsdPerMillion).toBe(0.4);
  });

  it("uses canonical registry metadata instead of a live substring", () => {
    const rates: PricingRates = {
      inputPriceUsdPerMillion: 9,
      outputPriceUsdPerMillion: 11,
    };
    const tokens: ModalityTokenCounts = {
      inputTextTokens: 1_000_000,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    };

    expect(
      calculateModalityCost(tokens, rates, 1, "not-a-model-live").costUsd,
    ).toBe(9);
    expect(
      calculateModalityCost(
        tokens,
        rates,
        1,
        "gemini-3.1-flash-live-preview",
      ).costUsd,
    ).toBe(0.75);
  });
});
