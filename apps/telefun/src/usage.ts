import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DEFAULT_USD_TO_IDR_RATE = 15000;
const GEMINI_LIVE_PRICING = {
  inputTextPriceUsdPerMillion: 0.75,
  inputAudioPriceUsdPerMillion: 3.0,
  outputTextPriceUsdPerMillion: 4.5,
  outputAudioPriceUsdPerMillion: 12.0,
} as const;

export interface ModalityTokenBreakdown {
  text: number;
  audio: number;
}

export interface LiveUsageSnapshot {
  promptTokenCount: number;
  responseTokenCount: number;
  totalTokenCount: number;
  promptModality?: ModalityTokenBreakdown;
  responseModality?: ModalityTokenBreakdown;
}

function sumModalityDetails(
  details: Record<string, unknown>[],
  modalityMap: Record<string, "text" | "audio">,
): ModalityTokenBreakdown {
  const result = { text: 0, audio: 0 };
  for (const detail of details) {
    if (typeof detail?.tokenCount !== "number") continue;
    const modality = String(detail.modality || "").toLowerCase();
    const bucket = modalityMap[modality] ?? "text";
    result[bucket] += detail.tokenCount;
  }
  return result;
}

function calculateLiveUsageCost(
  snapshot: LiveUsageSnapshot,
  inputPricePerMillion: number,
  outputPricePerMillion: number,
  usdToIdrRate: number,
): {
  costUsd: number;
  costIdr: number;
  inputUnspecifiedTokens: number;
  outputUnspecifiedTokens: number;
} {
  const inputTextTokens = snapshot.promptModality?.text ?? 0;
  const inputAudioTokens = snapshot.promptModality?.audio ?? 0;
  const outputTextTokens = snapshot.responseModality?.text ?? 0;
  const outputAudioTokens = snapshot.responseModality?.audio ?? 0;
  const inputUnspecifiedTokens = Math.max(
    snapshot.promptTokenCount - inputTextTokens - inputAudioTokens,
    0,
  );
  const outputUnspecifiedTokens = Math.max(
    snapshot.responseTokenCount - outputTextTokens - outputAudioTokens,
    0,
  );
  const costUsd =
    (inputTextTokens / 1_000_000) *
      GEMINI_LIVE_PRICING.inputTextPriceUsdPerMillion +
    (inputAudioTokens / 1_000_000) *
      GEMINI_LIVE_PRICING.inputAudioPriceUsdPerMillion +
    (inputUnspecifiedTokens / 1_000_000) * inputPricePerMillion +
    (outputTextTokens / 1_000_000) *
      GEMINI_LIVE_PRICING.outputTextPriceUsdPerMillion +
    (outputAudioTokens / 1_000_000) *
      GEMINI_LIVE_PRICING.outputAudioPriceUsdPerMillion +
    (outputUnspecifiedTokens / 1_000_000) * outputPricePerMillion;

  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    costIdr: Math.round(costUsd * usdToIdrRate),
    inputUnspecifiedTokens,
    outputUnspecifiedTokens,
  };
}

export function parseUsageMetadata(raw: unknown): LiveUsageSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Record<string, unknown>;

  let prompt =
    typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : 0;
  let promptModality: ModalityTokenBreakdown | undefined;
  if (prompt === 0 && Array.isArray(meta.promptTokensDetails)) {
    for (const detail of meta.promptTokensDetails as Record<
      string,
      unknown
    >[]) {
      if (typeof detail?.tokenCount === "number") prompt += detail.tokenCount;
    }
  }
  if (Array.isArray(meta.promptTokensDetails)) {
    promptModality = sumModalityDetails(
      meta.promptTokensDetails as Record<string, unknown>[],
      { text: "text", audio: "audio" },
    );
    // Ensure modality sum matches prompt total
    if (promptModality.text + promptModality.audio !== prompt) {
      promptModality = undefined;
    }
  }

  let response =
    typeof meta.responseTokenCount === "number" ? meta.responseTokenCount : 0;
  if (response === 0 && typeof meta.candidatesTokenCount === "number") {
    response = meta.candidatesTokenCount;
  }
  let responseModality: ModalityTokenBreakdown | undefined;
  if (response === 0 && Array.isArray(meta.responseTokensDetails)) {
    for (const detail of meta.responseTokensDetails as Record<
      string,
      unknown
    >[]) {
      if (typeof detail?.tokenCount === "number") response += detail.tokenCount;
    }
  }
  if (Array.isArray(meta.responseTokensDetails)) {
    responseModality = sumModalityDetails(
      meta.responseTokensDetails as Record<string, unknown>[],
      { text: "text", audio: "audio" },
    );
    if (responseModality.text + responseModality.audio !== response) {
      responseModality = undefined;
    }
  }

  let total =
    typeof meta.totalTokenCount === "number" ? meta.totalTokenCount : 0;
  if (total === 0 && (prompt > 0 || response > 0)) total = prompt + response;
  if (response === 0 && total > 0 && prompt > 0 && total >= prompt)
    response = total - prompt;

  if (prompt === 0 && response === 0 && total === 0) return null;
  return {
    promptTokenCount: prompt,
    responseTokenCount: response,
    totalTokenCount: total,
    promptModality,
    responseModality,
  };
}

export function mergeSnapshot(
  prev: LiveUsageSnapshot | null,
  next: LiveUsageSnapshot,
): LiveUsageSnapshot {
  if (!prev) return next;

  const mergedPromptModality =
    prev.promptModality && next.promptModality
      ? {
          text: Math.max(prev.promptModality.text, next.promptModality.text),
          audio: Math.max(prev.promptModality.audio, next.promptModality.audio),
        }
      : next.promptModality ?? prev.promptModality;

  const mergedResponseModality =
    prev.responseModality && next.responseModality
      ? {
          text: Math.max(prev.responseModality.text, next.responseModality.text),
          audio: Math.max(
            prev.responseModality.audio,
            next.responseModality.audio,
          ),
        }
      : next.responseModality ?? prev.responseModality;

  return {
    promptTokenCount: Math.max(prev.promptTokenCount, next.promptTokenCount),
    responseTokenCount: Math.max(
      prev.responseTokenCount,
      next.responseTokenCount,
    ),
    totalTokenCount: Math.max(prev.totalTokenCount, next.totalTokenCount),
    promptModality: mergedPromptModality,
    responseModality: mergedResponseModality,
  };
}

function isPostgrestError(error: unknown): error is {
  code?: string;
  message?: string;
} {
  return Boolean(error && typeof error === "object");
}

function isMissingBillingKeyColumnError(error: unknown): boolean {
  if (!error) return false;
  const err = isPostgrestError(error) ? error : {};
  const message = String(err.message || "").toLowerCase();

  if (err.code === "42703") {
    return (
      message.includes("ai_billing_settings.key") ||
      /column .*key/.test(message)
    );
  }

  if (err.code === "PGRST204") {
    return message.includes("schema cache") && message.includes("key");
  }

  return false;
}

function isMissingAiUsageModalityColumnError(error: unknown): boolean {
  if (!error) return false;
  const err = isPostgrestError(error) ? error : {};
  const message = String(err.message || "").toLowerCase();
  const newColumnPattern =
    "input_text_tokens|input_audio_tokens|input_unspecified_tokens|output_text_tokens|output_audio_tokens|output_unspecified_tokens|input_text_price_usd_per_million|input_audio_price_usd_per_million|output_text_price_usd_per_million|output_audio_price_usd_per_million";

  if (err.code === "42703") {
    return new RegExp(
      `ai_usage_logs\\.(${newColumnPattern})|column .*(${newColumnPattern})`,
    ).test(message);
  }

  if (err.code === "PGRST204") {
    return (
      message.includes("schema cache") &&
      new RegExp(newColumnPattern).test(message)
    );
  }

  return false;
}

async function getBillingRate(): Promise<number> {
  const singletonResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .eq("key", "default")
    .maybeSingle();

  if (!singletonResult.error) {
    return singletonResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
  }

  if (!isMissingBillingKeyColumnError(singletonResult.error)) {
    throw singletonResult.error;
  }

  const legacyResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
}

export async function flushLiveUsage(
  requestId: string,
  userId: string,
  snapshot: LiveUsageSnapshot,
  modelId: string,
): Promise<void> {
  try {
    const [{ data: pricing }, usdToIdrRate] = await Promise.all([
      admin
        .from("ai_pricing_settings")
        .select("input_price_usd_per_million, output_price_usd_per_million")
        .eq("model_id", modelId)
        .maybeSingle(),
      getBillingRate(),
    ]);

    const isLiveModel = modelId.includes("live");
    const inputPricePerMillion =
      pricing?.input_price_usd_per_million ?? (isLiveModel ? 3.0 : 0);
    const outputPricePerMillion =
      pricing?.output_price_usd_per_million ?? (isLiveModel ? 12.0 : 0);

    const modalityCost = calculateLiveUsageCost(
      snapshot,
      inputPricePerMillion,
      outputPricePerMillion,
      usdToIdrRate,
    );

    const payload = {
      request_id: requestId,
      user_id: userId,
      provider: "gemini",
      model_id: modelId,
      module: "telefun",
      action: "voice_live",
      input_tokens: snapshot.promptTokenCount,
      output_tokens: snapshot.responseTokenCount,
      total_tokens: snapshot.totalTokenCount,
      input_text_tokens: snapshot.promptModality?.text ?? null,
      input_audio_tokens: snapshot.promptModality?.audio ?? null,
      input_unspecified_tokens:
        modalityCost.inputUnspecifiedTokens > 0
          ? modalityCost.inputUnspecifiedTokens
          : null,
      output_text_tokens: snapshot.responseModality?.text ?? null,
      output_audio_tokens: snapshot.responseModality?.audio ?? null,
      output_unspecified_tokens:
        modalityCost.outputUnspecifiedTokens > 0
          ? modalityCost.outputUnspecifiedTokens
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
      estimated_cost_usd: modalityCost.costUsd,
      estimated_cost_idr: modalityCost.costIdr,
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
          ...legacyPayload
        } = payload;
        const legacyResult = await admin
          .from("ai_usage_logs")
          .insert(legacyPayload);
        if (legacyResult.error && legacyResult.error.code !== "23505") {
          console.error("[Telefun Usage] Failed to insert:", legacyResult.error);
        }
        return;
      }
      console.error("[Telefun Usage] Failed to insert:", error);
    }
  } catch (err) {
    console.error("[Telefun Usage] Exception:", err);
  }
}
