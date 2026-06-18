import { createAdminClient } from "./supabase";
import { normalizeModelId } from "./ai-models";
import type { AIProvider } from "@trainers/types";
import {
  DEFAULT_USD_TO_IDR_RATE,
  getBillingRate,
} from "./ai-billing-settings";

export interface UsageContext {
  module: "ketik" | "pdkt" | "telefun" | "qa-analyzer";
  action: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function isMissingAiUsageStatusColumnError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  
  if (error.code === "42703") {
    return /ai_usage_logs\.(status|error_message)|column .*status|column .*error_message/.test(msg);
  }
  
  if (error.code === "PGRST204") {
    return msg.includes("schema cache") && (msg.includes("status") || msg.includes("error_message"));
  }
  
  return false;
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

    const [{ data: pricing }, billingRate] = await Promise.all([
      admin
        .from("ai_pricing_settings")
        .select("input_price_usd_per_million, output_price_usd_per_million")
        .eq("model_id", normalizedModelId)
        .maybeSingle(),
      getBillingRate(admin),
    ]);

    let inputPricePerMillion = 0;
    let outputPricePerMillion = 0;
    const usdToIdrRate = billingRate ?? DEFAULT_USD_TO_IDR_RATE;

    const isLiveModel = normalizedModelId.includes("live");
    const defaultInput = isLiveModel ? 3.0 : 0;
    const defaultOutput = isLiveModel ? 12.0 : 0;

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

    const estimatedCostUsd =
      (inputTokens / 1_000_000) * inputPricePerMillion +
      (outputTokens / 1_000_000) * outputPricePerMillion;

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
      input_price_usd_per_million: inputPricePerMillion,
      output_price_usd_per_million: outputPricePerMillion,
      usd_to_idr_rate: usdToIdrRate,
      estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      estimated_cost_idr: Math.round(estimatedCostUsd * usdToIdrRate),
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
        ...legacyPayload
      } = payload;
      const legacyResult = await admin
        .from("ai_usage_logs")
        .insert(legacyPayload);
      if (legacyResult.error) throw legacyResult.error;
    }
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === "23505") {
      console.warn(`[AI Usage] Duplicate request_id "${options.requestId}".`);
      return;
    }
    console.error("[AI Usage] Failed to log usage:", error);
  }
}
