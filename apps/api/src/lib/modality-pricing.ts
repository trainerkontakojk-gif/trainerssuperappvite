/**
 * Modality pricing helper.
 * Pure function for computing per-modality costs from token counts.
 */

export interface ModalityTokenCounts {
  inputTextTokens: number;
  inputAudioTokens: number;
  inputUnspecifiedTokens?: number;
  outputTextTokens: number;
  outputAudioTokens: number;
  outputUnspecifiedTokens?: number;
}

export interface PricingRates {
  inputPriceUsdPerMillion: number;
  outputPriceUsdPerMillion: number;
  inputTextPriceUsdPerMillion?: number;
  inputAudioPriceUsdPerMillion?: number;
  outputTextPriceUsdPerMillion?: number;
  outputAudioPriceUsdPerMillion?: number;
}

export interface ModalityCostResult {
  costUsd: number;
  costIdr: number;
  inputTextPriceUsdPerMillion: number;
  inputAudioPriceUsdPerMillion: number;
  outputTextPriceUsdPerMillion: number;
  outputAudioPriceUsdPerMillion: number;
}

const GEMINI_LIVE_PRICING = {
  inputTextPriceUsdPerMillion: 0.75,
  inputAudioPriceUsdPerMillion: 3.0,
  outputTextPriceUsdPerMillion: 4.5,
  outputAudioPriceUsdPerMillion: 12.0,
} as const;

export function resolveModalityPricing(
  modelId: string,
  pricing: PricingRates,
): Required<PricingRates> {
  const isGeminiLive =
    modelId.toLowerCase().includes("gemini") &&
    modelId.toLowerCase().includes("live");

  const liveDefaults = isGeminiLive ? GEMINI_LIVE_PRICING : null;

  return {
    inputPriceUsdPerMillion: pricing.inputPriceUsdPerMillion,
    outputPriceUsdPerMillion: pricing.outputPriceUsdPerMillion,
    inputTextPriceUsdPerMillion:
      pricing.inputTextPriceUsdPerMillion ??
      liveDefaults?.inputTextPriceUsdPerMillion ??
      pricing.inputPriceUsdPerMillion,
    inputAudioPriceUsdPerMillion:
      pricing.inputAudioPriceUsdPerMillion ??
      liveDefaults?.inputAudioPriceUsdPerMillion ??
      pricing.inputPriceUsdPerMillion,
    outputTextPriceUsdPerMillion:
      pricing.outputTextPriceUsdPerMillion ??
      liveDefaults?.outputTextPriceUsdPerMillion ??
      pricing.outputPriceUsdPerMillion,
    outputAudioPriceUsdPerMillion:
      pricing.outputAudioPriceUsdPerMillion ??
      liveDefaults?.outputAudioPriceUsdPerMillion ??
      pricing.outputPriceUsdPerMillion,
  };
}

/**
 * Calculate per-modality cost from token counts.
 *
 * The formula mirrors the one used in ai_usage_logs and telefun usage.ts:
 *   cost = (inputTokens / 1_000_000) * inputPricePerMillion
 *        + (outputTokens / 1_000_000) * outputPricePerMillion
 *
 * @param tokens - Per-modality token counts
 * @param pricing - Input/output prices per million tokens (USD)
 * @param usdToIdrRate - Exchange rate from USD to IDR
 * @returns { costUsd, costIdr } rounded to 6 and 0 decimal places respectively
 */
export function calculateModalityCost(
  tokens: ModalityTokenCounts,
  pricing: PricingRates,
  usdToIdrRate: number,
  modelId = "",
): ModalityCostResult {
  const resolvedPricing = resolveModalityPricing(modelId, pricing);

  const costUsd =
    (tokens.inputTextTokens / 1_000_000) *
      resolvedPricing.inputTextPriceUsdPerMillion +
    (tokens.inputAudioTokens / 1_000_000) *
      resolvedPricing.inputAudioPriceUsdPerMillion +
    ((tokens.inputUnspecifiedTokens ?? 0) / 1_000_000) *
      resolvedPricing.inputPriceUsdPerMillion +
    (tokens.outputTextTokens / 1_000_000) *
      resolvedPricing.outputTextPriceUsdPerMillion +
    (tokens.outputAudioTokens / 1_000_000) *
      resolvedPricing.outputAudioPriceUsdPerMillion +
    ((tokens.outputUnspecifiedTokens ?? 0) / 1_000_000) *
      resolvedPricing.outputPriceUsdPerMillion;

  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    costIdr: Math.round(costUsd * usdToIdrRate),
    inputTextPriceUsdPerMillion:
      resolvedPricing.inputTextPriceUsdPerMillion,
    inputAudioPriceUsdPerMillion:
      resolvedPricing.inputAudioPriceUsdPerMillion,
    outputTextPriceUsdPerMillion:
      resolvedPricing.outputTextPriceUsdPerMillion,
    outputAudioPriceUsdPerMillion:
      resolvedPricing.outputAudioPriceUsdPerMillion,
  };
}
