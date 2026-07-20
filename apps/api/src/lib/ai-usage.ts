import { createAdminClient } from "./supabase";
import { normalizeModelId } from "./ai-models";
import { getTelefunLiveModel, type AIProvider } from "@trainers/types";
import {
  DEFAULT_USD_TO_IDR_RATE,
  getBillingRate,
} from "./ai-billing-settings";
import { calculateModalityCost } from "./modality-pricing";
import { isMissingRealtimePricingColumn } from "./pricing-contract";

export interface UsageContext {
  module: "ketik" | "pdkt" | "telefun" | "qa-analyzer";
  action: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTextTokens?: number;
  cachedInputTextTokens?: number;
  inputAudioTokens?: number;
  cachedInputAudioTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
}

function isPostgrestError(error: unknown): error is {
  code?: string;
  message?: string;
} {
  return Boolean(error && typeof error === "object");
}

function isMissingAiUsageStatusColumnError(error: unknown): boolean {
  if (!error) return false;
  const err = isPostgrestError(error) ? error : {};
  const msg = (err.message || "").toLowerCase();
  const newColumnPattern =
    "status|error_message|input_text_tokens|cached_input_text_tokens|input_audio_tokens|cached_input_audio_tokens|input_unspecified_tokens|output_text_tokens|output_audio_tokens|output_unspecified_tokens|input_text_price_usd_per_million|cached_input_text_price_usd_per_million|input_audio_price_usd_per_million|cached_input_audio_price_usd_per_million|output_text_price_usd_per_million|output_audio_price_usd_per_million";
  
  if (err.code === "42703") {
    return new RegExp(
      `ai_usage_logs\\.(${newColumnPattern})|column .*(${newColumnPattern})`,
    ).test(msg);
  }
  
  if (err.code === "PGRST204") {
    return (
      msg.includes("schema cache") &&
      new RegExp(newColumnPattern).test(msg)
    );
  }
  
  return false;
}

function getKnownTokenCount(...values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export async function logAiUsage(options: {
  requestId: string;
  userId: string;
  provider: AIProvider;
  modelId: string;
  usageContext: UsageContext;
  tokens: TokenUsage;
  status?: "success" | "failed" | "timeout";
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const normalizedModelId = normalizeModelId(options.modelId);
    const requestStatus = options.status ?? "success";
    const isFailure = requestStatus === "failed" || requestStatus === "timeout";

    // When status is failed or timeout, token counts are 0
    const inputTokens = isFailure ? 0 : options.tokens.inputTokens;
    const outputTokens = isFailure ? 0 : options.tokens.outputTokens;
    const totalTokens = isFailure ? 0 : options.tokens.totalTokens;

    // Determine error_message value
    let errorMessageValue: string | null = null;
    if (isFailure) {
      const rawMessage = options.errorMessage;
      if (!rawMessage || rawMessage.trim() === "") {
        errorMessageValue = "Unknown error";
      } else {
        errorMessageValue = rawMessage.slice(0, 1000);
      }
    }

    let pricingResult = await admin
      .from("ai_pricing_settings")
      .select(
        "input_price_usd_per_million, output_price_usd_per_million, input_text_price_usd_per_million, cached_input_text_price_usd_per_million, input_audio_price_usd_per_million, cached_input_audio_price_usd_per_million, output_text_price_usd_per_million, output_audio_price_usd_per_million",
      )
      .eq("model_id", normalizedModelId)
      .maybeSingle();
    if (
      pricingResult.error &&
      isMissingRealtimePricingColumn(pricingResult.error)
    ) {
      pricingResult = await admin
        .from("ai_pricing_settings")
        .select("input_price_usd_per_million, output_price_usd_per_million")
        .eq("model_id", normalizedModelId)
        .maybeSingle();
    }
    if (pricingResult.error) throw pricingResult.error;
    const pricing = pricingResult.data;
    const billingRate = await getBillingRate(admin);

    let inputPricePerMillion = 0;
    let outputPricePerMillion = 0;
    const usdToIdrRate = billingRate ?? DEFAULT_USD_TO_IDR_RATE;

    const liveModel = getTelefunLiveModel(normalizedModelId);
    const isGeminiLive = liveModel?.provider === "gemini";
    const defaultInput = isGeminiLive ? 3.0 : 0;
    const defaultOutput = isGeminiLive ? 12.0 : 0;

    if (!pricing) {
      console.warn(
        `[AI Usage] No pricing for "${normalizedModelId}". Using fallback.`,
      );
      inputPricePerMillion = defaultInput;
      outputPricePerMillion = defaultOutput;
    } else {
      inputPricePerMillion =
        pricing.input_price_usd_per_million ?? defaultInput;
      outputPricePerMillion =
        pricing.output_price_usd_per_million ?? defaultOutput;
    }

    const inputKnownTokens = getKnownTokenCount(
      options.tokens.inputTextTokens,
      options.tokens.inputAudioTokens,
    );
    const outputKnownTokens = getKnownTokenCount(
      options.tokens.outputTextTokens,
      options.tokens.outputAudioTokens,
    );
    const inputUnspecifiedTokens = Math.max(inputTokens - inputKnownTokens, 0);
    const outputUnspecifiedTokens = Math.max(
      outputTokens - outputKnownTokens,
      0,
    );
    const modalityCost = calculateModalityCost(
      {
        inputTextTokens: options.tokens.inputTextTokens ?? 0,
        cachedInputTextTokens: options.tokens.cachedInputTextTokens,
        inputAudioTokens: options.tokens.inputAudioTokens ?? 0,
        cachedInputAudioTokens: options.tokens.cachedInputAudioTokens,
        inputUnspecifiedTokens,
        outputTextTokens: options.tokens.outputTextTokens ?? 0,
        outputAudioTokens: options.tokens.outputAudioTokens ?? 0,
        outputUnspecifiedTokens,
      },
      {
        inputPriceUsdPerMillion: inputPricePerMillion,
        outputPriceUsdPerMillion: outputPricePerMillion,
        inputTextPriceUsdPerMillion:
          pricing?.input_text_price_usd_per_million ?? undefined,
        cachedInputTextPriceUsdPerMillion:
          pricing?.cached_input_text_price_usd_per_million ?? undefined,
        inputAudioPriceUsdPerMillion:
          pricing?.input_audio_price_usd_per_million ?? undefined,
        cachedInputAudioPriceUsdPerMillion:
          pricing?.cached_input_audio_price_usd_per_million ?? undefined,
        outputTextPriceUsdPerMillion:
          pricing?.output_text_price_usd_per_million ?? undefined,
        outputAudioPriceUsdPerMillion:
          pricing?.output_audio_price_usd_per_million ?? undefined,
      },
      usdToIdrRate,
      normalizedModelId,
    );

    const payload = {
      request_id: options.requestId,
      user_id: options.userId,
      provider: options.provider,
      model_id: normalizedModelId,
      module: options.usageContext.module,
      action: options.usageContext.action,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      input_text_tokens: options.tokens.inputTextTokens ?? null,
      cached_input_text_tokens: options.tokens.cachedInputTextTokens ?? null,
      input_audio_tokens: options.tokens.inputAudioTokens ?? null,
      cached_input_audio_tokens: options.tokens.cachedInputAudioTokens ?? null,
      input_unspecified_tokens:
        inputUnspecifiedTokens > 0 ? inputUnspecifiedTokens : null,
      output_text_tokens: options.tokens.outputTextTokens ?? null,
      output_audio_tokens: options.tokens.outputAudioTokens ?? null,
      output_unspecified_tokens:
        outputUnspecifiedTokens > 0 ? outputUnspecifiedTokens : null,
      input_text_price_usd_per_million:
        modalityCost.inputTextPriceUsdPerMillion,
      cached_input_text_price_usd_per_million:
        modalityCost.cachedInputTextPriceUsdPerMillion,
      input_audio_price_usd_per_million:
        modalityCost.inputAudioPriceUsdPerMillion,
      cached_input_audio_price_usd_per_million:
        modalityCost.cachedInputAudioPriceUsdPerMillion,
      output_text_price_usd_per_million:
        modalityCost.outputTextPriceUsdPerMillion,
      output_audio_price_usd_per_million:
        modalityCost.outputAudioPriceUsdPerMillion,
      input_price_usd_per_million: inputPricePerMillion,
      output_price_usd_per_million: outputPricePerMillion,
      usd_to_idr_rate: usdToIdrRate,
      estimated_cost_usd: modalityCost.costUsd,
      estimated_cost_idr: modalityCost.costIdr,
      status: requestStatus,
      error_message: errorMessageValue,
    };

    const insertResult = await admin.from("ai_usage_logs").insert(payload);
    if (insertResult.error) {
      if (!isMissingAiUsageStatusColumnError(insertResult.error)) {
        throw insertResult.error;
      }

      const {
        status: _status,
        error_message: _errorMessage,
        input_text_tokens: _inputTextTokens,
        cached_input_text_tokens: _cachedInputTextTokens,
        input_audio_tokens: _inputAudioTokens,
        cached_input_audio_tokens: _cachedInputAudioTokens,
        input_unspecified_tokens: _inputUnspecifiedTokens,
        output_text_tokens: _outputTextTokens,
        output_audio_tokens: _outputAudioTokens,
        output_unspecified_tokens: _outputUnspecifiedTokens,
        input_text_price_usd_per_million: _inputTextPriceUsdPerMillion,
        cached_input_text_price_usd_per_million:
          _cachedInputTextPriceUsdPerMillion,
        input_audio_price_usd_per_million: _inputAudioPriceUsdPerMillion,
        cached_input_audio_price_usd_per_million:
          _cachedInputAudioPriceUsdPerMillion,
        output_text_price_usd_per_million: _outputTextPriceUsdPerMillion,
        output_audio_price_usd_per_million: _outputAudioPriceUsdPerMillion,
        ...legacyPayload
      } = payload;
      const legacyResult = await admin
        .from("ai_usage_logs")
        .insert(legacyPayload);
      if (legacyResult.error) throw legacyResult.error;
    }
  } catch (error) {
    const err = isPostgrestError(error) ? error : {};
    if (err?.code === "23505") {
      console.warn(`[AI Usage] Duplicate request_id "${options.requestId}".`);
      return;
    }
    console.error("[AI Usage] Failed to log usage:", error);
  }
}
