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

const PER_MINUTE_AUDIO_INPUT_USD = 0.005;
const PER_MINUTE_AUDIO_OUTPUT_USD = 0.018;
const PER_MINUTE_AUDIO_TOTAL_USD =
  PER_MINUTE_AUDIO_INPUT_USD + PER_MINUTE_AUDIO_OUTPUT_USD;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

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

export type LiveUsageBoundary =
  | "turnComplete"
  | "interrupted"
  | "session_flush";

export interface LiveUsageTurn {
  index: number;
  observedAtMs: number;
  boundary: LiveUsageBoundary;
  snapshot: LiveUsageSnapshot;
  rawUsageMetadata: Record<string, unknown>;
  key: string;
}

export interface LiveUsageAccumulator {
  turns: LiveUsageTurn[];
  pending: {
    snapshot: LiveUsageSnapshot;
    rawUsageMetadata: Record<string, unknown>;
    observedAtMs: number;
    key: string;
  } | null;
  latestSnapshot: LiveUsageSnapshot | null;
  seenKeys: Set<string>;
  nextIndex: number;
}

export interface LiveUsageAggregate {
  turnCount: number;
  billedPromptTokenCount: number;
  billedResponseTokenCount: number;
  billedTotalTokenCount: number;
  billedPromptModality?: ModalityTokenBreakdown;
  billedResponseModality?: ModalityTokenBreakdown;
  latestSnapshot: LiveUsageSnapshot;
  rawUsageMetadata: {
    billing_model: "gemini_live_context_window_per_turn_v1";
    turn_count: number;
    latest: LiveUsageSnapshot;
    turns: Array<{
      index: number;
      observedAtMs: number;
      boundary: LiveUsageBoundary;
      snapshot: LiveUsageSnapshot;
      rawUsageMetadata: Record<string, unknown>;
    }>;
  };
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

export function calculateLiveUsageCost(
  aggregate: LiveUsageAggregate,
  inputPricePerMillion: number,
  outputPricePerMillion: number,
  usdToIdrRate: number,
): {
  costUsd: number;
  costIdr: number;
  inputUnspecifiedTokens: number;
  outputUnspecifiedTokens: number;
} {
  const inputTextTokens = aggregate.billedPromptModality?.text ?? 0;
  const inputAudioTokens = aggregate.billedPromptModality?.audio ?? 0;
  const outputTextTokens = aggregate.billedResponseModality?.text ?? 0;
  const outputAudioTokens = aggregate.billedResponseModality?.audio ?? 0;
  const inputUnspecifiedTokens = Math.max(
    aggregate.billedPromptTokenCount - inputTextTokens - inputAudioTokens,
    0,
  );
  const outputUnspecifiedTokens = Math.max(
    aggregate.billedResponseTokenCount - outputTextTokens - outputAudioTokens,
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
    costUsd: roundUsd(costUsd),
    costIdr: Math.round(costUsd * usdToIdrRate),
    inputUnspecifiedTokens,
    outputUnspecifiedTokens,
  };
}

export function calculatePerMinuteCost(
  sessionDurationMs: number | undefined,
  usdToIdrRate: number,
): { costUsd: number; costIdr: number } | null {
  if (
    typeof sessionDurationMs !== "number" ||
    !Number.isFinite(sessionDurationMs)
  ) {
    return null;
  }

  const minutes = Math.max(sessionDurationMs, 0) / 60_000;
  const costUsd = minutes * PER_MINUTE_AUDIO_TOTAL_USD;

  return {
    costUsd: roundUsd(costUsd),
    costIdr: Math.round(costUsd * usdToIdrRate),
  };
}

export function calculateFinalLiveUsageCost({
  modelId,
  perTokenCostUsd,
  sessionDurationMs,
  usdToIdrRate,
}: {
  modelId: string;
  perTokenCostUsd: number;
  sessionDurationMs?: number;
  usdToIdrRate: number;
}): {
  sessionDurationMs: number | null;
  perMinuteCostUsd: number | null;
  perMinuteCostIdr: number | null;
  finalCostUsd: number;
  finalCostIdr: number;
} {
  const isLiveModel = modelId.toLowerCase().includes("live");
  const normalizedDurationMs =
    typeof sessionDurationMs === "number" && Number.isFinite(sessionDurationMs)
      ? Math.max(Math.floor(sessionDurationMs), 0)
      : null;
  const perMinuteCost =
    isLiveModel && normalizedDurationMs !== null
      ? calculatePerMinuteCost(normalizedDurationMs, usdToIdrRate)
      : null;
  const finalCostUsd = Math.max(perTokenCostUsd, perMinuteCost?.costUsd ?? 0);

  return {
    sessionDurationMs: normalizedDurationMs,
    perMinuteCostUsd: perMinuteCost?.costUsd ?? null,
    perMinuteCostIdr: perMinuteCost?.costIdr ?? null,
    finalCostUsd: roundUsd(finalCostUsd),
    finalCostIdr: Math.round(finalCostUsd * usdToIdrRate),
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

function buildSnapshotKey(snapshot: LiveUsageSnapshot): string {
  return JSON.stringify({
    p: snapshot.promptTokenCount,
    r: snapshot.responseTokenCount,
    t: snapshot.totalTokenCount,
    pm: snapshot.promptModality ?? null,
    rm: snapshot.responseModality ?? null,
  });
}

export function createLiveUsageAccumulator(): LiveUsageAccumulator {
  return {
    turns: [],
    pending: null,
    latestSnapshot: null,
    seenKeys: new Set(),
    nextIndex: 0,
  };
}

export function observeLiveUsageMetadata(
  accumulator: LiveUsageAccumulator,
  rawUsageMetadata: unknown,
  observedAtMs?: number,
): boolean {
  const snapshot = parseUsageMetadata(rawUsageMetadata);
  if (!snapshot) return false;

  const key = buildSnapshotKey(snapshot);
  const ts = observedAtMs ?? Date.now();

  // Update latestSnapshot always
  accumulator.latestSnapshot = snapshot;

  // If same as current pending, just update latest
  if (accumulator.pending && accumulator.pending.key === key) {
    accumulator.pending.snapshot = snapshot;
    return false;
  }

  // If already committed, ignore
  if (accumulator.seenKeys.has(key)) {
    return false;
  }

  // Set as new pending
  accumulator.pending = {
    snapshot,
    rawUsageMetadata: (rawUsageMetadata as Record<string, unknown>) ?? {},
    observedAtMs: ts,
    key,
  };
  return true;
}

export function commitPendingLiveUsageTurn(
  accumulator: LiveUsageAccumulator,
  boundary: LiveUsageBoundary,
): boolean {
  if (!accumulator.pending) return false;
  if (accumulator.seenKeys.has(accumulator.pending.key)) {
    accumulator.pending = null;
    return false;
  }

  accumulator.turns.push({
    index: accumulator.nextIndex++,
    observedAtMs: accumulator.pending.observedAtMs,
    boundary,
    snapshot: accumulator.pending.snapshot,
    rawUsageMetadata: accumulator.pending.rawUsageMetadata,
    key: accumulator.pending.key,
  });
  accumulator.seenKeys.add(accumulator.pending.key);
  accumulator.pending = null;
  return true;
}

export function summarizeLiveUsageAccumulator(
  accumulator: LiveUsageAccumulator,
): LiveUsageAggregate | null {
  if (accumulator.turns.length === 0) return null;

  let billedPromptTokenCount = 0;
  let billedResponseTokenCount = 0;
  let billedTotalTokenCount = 0;
  let promptText = 0;
  let promptAudio = 0;
  let responseText = 0;
  let responseAudio = 0;

  for (const turn of accumulator.turns) {
    billedPromptTokenCount += turn.snapshot.promptTokenCount;
    billedResponseTokenCount += turn.snapshot.responseTokenCount;
    billedTotalTokenCount += turn.snapshot.totalTokenCount;
    if (turn.snapshot.promptModality) {
      promptText += turn.snapshot.promptModality.text;
      promptAudio += turn.snapshot.promptModality.audio;
    }
    if (turn.snapshot.responseModality) {
      responseText += turn.snapshot.responseModality.text;
      responseAudio += turn.snapshot.responseModality.audio;
    }
  }

  const billedPromptModality =
    promptText > 0 || promptAudio > 0
      ? { text: promptText, audio: promptAudio }
      : undefined;
  const billedResponseModality =
    responseText > 0 || responseAudio > 0
      ? { text: responseText, audio: responseAudio }
      : undefined;

  const latest = accumulator.latestSnapshot!;
  return {
    turnCount: accumulator.turns.length,
    billedPromptTokenCount,
    billedResponseTokenCount,
    billedTotalTokenCount,
    billedPromptModality,
    billedResponseModality,
    latestSnapshot: latest,
    rawUsageMetadata: {
      billing_model: "gemini_live_context_window_per_turn_v1",
      turn_count: accumulator.turns.length,
      latest,
      turns: accumulator.turns.map((t) => ({
        index: t.index,
        observedAtMs: t.observedAtMs,
        boundary: t.boundary,
        snapshot: t.snapshot,
        rawUsageMetadata: t.rawUsageMetadata,
      })),
    },
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
    "input_text_tokens|input_audio_tokens|input_unspecified_tokens|output_text_tokens|output_audio_tokens|output_unspecified_tokens|input_text_price_usd_per_million|input_audio_price_usd_per_million|output_text_price_usd_per_million|output_audio_price_usd_per_million|session_duration_ms|per_minute_cost_usd|per_minute_cost_idr|final_cost_usd|final_cost_idr|raw_usage_metadata|live_turn_count|latest_input_tokens|latest_output_tokens|latest_total_tokens|context_rebilled_cost_usd|context_rebilled_cost_idr";

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
  aggregate: LiveUsageAggregate,
  modelId: string,
  sessionDurationMs?: number,
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

    const contextTokenCost = calculateLiveUsageCost(
      aggregate,
      inputPricePerMillion,
      outputPricePerMillion,
      usdToIdrRate,
    );

    const billingCost = calculateFinalLiveUsageCost({
      modelId,
      perTokenCostUsd: contextTokenCost.costUsd,
      sessionDurationMs,
      usdToIdrRate,
    });

    const payload = {
      request_id: requestId,
      user_id: userId,
      provider: "gemini",
      model_id: modelId,
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
