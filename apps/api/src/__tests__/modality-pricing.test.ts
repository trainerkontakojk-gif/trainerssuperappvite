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
});
