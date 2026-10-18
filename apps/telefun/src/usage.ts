import {
  GEMINI_LIVE_PRICING,
  getTelefunLiveModel,
  resolveGeminiLiveFallbackPerMillion,
} from "@trainers/types";
import {
  calculateFinalLiveUsageCost,
  calculateLiveUsageCost,
  type LiveUsageAggregate,
} from "./usage-live.js";
import {
  admin,
  getBillingRate,
  isMissingAiUsageModalityColumnError,
  readEffectiveLivePricing,
} from "./usage-store.js";

export * from "./usage-live.js";
export * from "./usage-openai.js";

export async function flushLiveUsage(
  requestId: string,
  userId: string,
  aggregate: LiveUsageAggregate,
  modelId: string,
  sessionDurationMs?: number,
): Promise<void> {
  const model = getTelefunLiveModel(modelId);
  if (
    model?.provider !== "gemini" ||
    model.realtime.transport !== "gemini-live"
  ) {
    console.error(
      "[Telefun Usage] Refusing non-Gemini model for Gemini usage",
      {
        modelId,
      },
    );
    return;
  }

  try {
    const [pricing, usdToIdrRate] = await Promise.all([
      readEffectiveLivePricing(model.id),
      getBillingRate(),
    ]);

    const usesGeminiLivePricing = model.realtime.transport === "gemini-live";
    const geminiFallback =
      resolveGeminiLiveFallbackPerMillion(usesGeminiLivePricing);
    const inputPricePerMillion =
      pricing?.input_price_usd_per_million ?? geminiFallback.input;
    const outputPricePerMillion =
      pricing?.output_price_usd_per_million ?? geminiFallback.output;

    const contextTokenCost = calculateLiveUsageCost(
      aggregate,
      inputPricePerMillion,
      outputPricePerMillion,
      usdToIdrRate,
    );

    const billingCost = calculateFinalLiveUsageCost({
      modelId: model.id,
      perTokenCostUsd: contextTokenCost.costUsd,
      sessionDurationMs,
      usdToIdrRate,
    });

    const payload = {
      request_id: requestId,
      user_id: userId,
      provider: model.provider,
      model_id: model.id,
      module: "telefun",
      action: "voice_live",
      input_tokens: aggregate.billedPromptTokenCount,
      output_tokens: aggregate.billedResponseTokenCount,
      total_tokens: aggregate.billedTotalTokenCount,
      input_text_tokens: aggregate.billedPromptModality?.text ?? null,
      input_audio_tokens: aggregate.billedPromptModality?.audio ?? null,
      input_unspecified_tokens:
        contextTokenCost.inputUnspecifiedTokens > 0
          ? contextTokenCost.inputUnspecifiedTokens
          : null,
      output_text_tokens: aggregate.billedResponseModality?.text ?? null,
      output_audio_tokens: aggregate.billedResponseModality?.audio ?? null,
      output_unspecified_tokens:
        contextTokenCost.outputUnspecifiedTokens > 0
          ? contextTokenCost.outputUnspecifiedTokens
          : null,
      input_text_price_usd_per_million:
        GEMINI_LIVE_PRICING.inputTextPriceUsdPerMillion,
      input_audio_price_usd_per_million:
        GEMINI_LIVE_PRICING.inputAudioPriceUsdPerMillion,
      output_text_price_usd_per_million:
        GEMINI_LIVE_PRICING.outputTextPriceUsdPerMillion,
      output_audio_price_usd_per_million:
        GEMINI_LIVE_PRICING.outputAudioPriceUsdPerMillion,
      input_price_usd_per_million: inputPricePerMillion,
      output_price_usd_per_million: outputPricePerMillion,
      usd_to_idr_rate: usdToIdrRate,
      estimated_cost_usd: contextTokenCost.costUsd,
      estimated_cost_idr: contextTokenCost.costIdr,
      live_turn_count: aggregate.turnCount,
      latest_input_tokens: aggregate.latestSnapshot.promptTokenCount,
      latest_output_tokens: aggregate.latestSnapshot.responseTokenCount,
      latest_total_tokens: aggregate.latestSnapshot.totalTokenCount,
      context_rebilled_cost_usd: contextTokenCost.costUsd,
      context_rebilled_cost_idr: contextTokenCost.costIdr,
      session_duration_ms: billingCost.sessionDurationMs,
      per_minute_cost_usd: billingCost.perMinuteCostUsd,
      per_minute_cost_idr: billingCost.perMinuteCostIdr,
      final_cost_usd: billingCost.finalCostUsd,
      final_cost_idr: billingCost.finalCostIdr,
      raw_usage_metadata: aggregate.rawUsageMetadata,
    };

    const { error } = await admin.from("ai_usage_logs").insert(payload);

    if (error && error.code !== "23505") {
      if (isMissingAiUsageModalityColumnError(error)) {
        const {
          input_text_tokens: _inputTextTokens,
          input_audio_tokens: _inputAudioTokens,
          input_unspecified_tokens: _inputUnspecifiedTokens,
          output_text_tokens: _outputTextTokens,
          output_audio_tokens: _outputAudioTokens,
          output_unspecified_tokens: _outputUnspecifiedTokens,
          input_text_price_usd_per_million: _inputTextPriceUsdPerMillion,
          input_audio_price_usd_per_million: _inputAudioPriceUsdPerMillion,
          output_text_price_usd_per_million: _outputTextPriceUsdPerMillion,
          output_audio_price_usd_per_million: _outputAudioPriceUsdPerMillion,
          session_duration_ms: _sessionDurationMs,
          per_minute_cost_usd: _perMinuteCostUsd,
          per_minute_cost_idr: _perMinuteCostIdr,
          final_cost_usd: _finalCostUsd,
          final_cost_idr: _finalCostIdr,
          raw_usage_metadata: _rawUsageMetadata,
          live_turn_count: _liveTurnCount,
          latest_input_tokens: _latestInputTokens,
          latest_output_tokens: _latestOutputTokens,
          latest_total_tokens: _latestTotalTokens,
          context_rebilled_cost_usd: _contextRebilledCostUsd,
          context_rebilled_cost_idr: _contextRebilledCostIdr,
          ...legacyPayload
        } = payload;
        const legacyResult = await admin
          .from("ai_usage_logs")
          .insert(legacyPayload);
        if (legacyResult.error && legacyResult.error.code !== "23505") {
          console.error(
            "[Telefun Usage] Failed to insert:",
            legacyResult.error,
          );
        }
        return;
      }
      console.error("[Telefun Usage] Failed to insert:", error);
    }
  } catch (err) {
    console.error("[Telefun Usage] Exception:", err);
  }
}
