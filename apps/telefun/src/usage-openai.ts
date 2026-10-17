/**
 * Retired OpenAI Realtime usage: parsing, accumulation, cost, and the
 * historical persistence paths kept for legacy WebRTC call finalization.
 */

import { getTelefunLiveModel } from "@trainers/types";
import {
  admin,
  getBillingRate,
  readPricingRate,
  roundUsd,
} from "./usage-store.js";

export interface OpenAIRealtimeUsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTextTokens?: number;
  inputAudioTokens?: number;
  cachedInputTokens?: number;
  cachedInputTextTokens?: number;
  cachedInputAudioTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
}

export interface OpenAIUsageObservation {
  source: "openai_realtime_response" | "openai_input_transcription";
  id: string;
  usage: unknown;
}

interface OpenAIRealtimeUsageEntry {
  id: string;
  observedAtMs: number;
  snapshot: OpenAIRealtimeUsageSnapshot;
}

interface OpenAITranscriptionUsageEntry {
  id: string;
  observedAtMs: number;
  usage: Record<string, unknown>;
}

export interface OpenAIUsageAccumulator {
  seenObservationKeys: Set<string>;
  responses: OpenAIRealtimeUsageEntry[];
  transcriptionObservations: OpenAITranscriptionUsageEntry[];
  missingUsageCount: number;
  recentMissingUsageIds: string[];
  unpriceableUsageCount: number;
  recentUnpriceableUsageIds: string[];
}

export interface OpenAIUsageAggregate extends OpenAIRealtimeUsageSnapshot {
  responseCount: number;
  unpriceableUsageCount: number;
  latestSnapshot: OpenAIRealtimeUsageSnapshot;
  rawUsageMetadata: {
    billing_model: "openai_realtime_per_response_v1";
    response_count: number;
    transcription_observation_count: number;
    responses: OpenAIRealtimeUsageEntry[];
    transcription_observations: OpenAITranscriptionUsageEntry[];
    warnings: string[];
  };
}

export interface OpenAIRealtimePricing {
  inputTextPriceUsdPerMillion: number;
  cachedInputTextPriceUsdPerMillion: number;
  inputAudioPriceUsdPerMillion: number;
  cachedInputAudioPriceUsdPerMillion: number;
  outputTextPriceUsdPerMillion: number;
  outputAudioPriceUsdPerMillion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTokenCount(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return Math.floor(raw);
}

export function parseOpenAIRealtimeUsage(
  raw: unknown,
): OpenAIRealtimeUsageSnapshot | null {
  if (!isRecord(raw)) return null;

  const inputTokens = readTokenCount(raw, "input_tokens");
  const outputTokens = readTokenCount(raw, "output_tokens");
  const totalTokens = readTokenCount(raw, "total_tokens");
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return null;
  }

  const inputDetails = isRecord(raw.input_token_details)
    ? raw.input_token_details
    : undefined;
  const cachedDetails =
    inputDetails && isRecord(inputDetails.cached_tokens_details)
      ? inputDetails.cached_tokens_details
      : undefined;
  const outputDetails = isRecord(raw.output_token_details)
    ? raw.output_token_details
    : undefined;
  const inputTextTokens = inputDetails
    ? readTokenCount(inputDetails, "text_tokens")
    : undefined;
  const inputAudioTokens = inputDetails
    ? readTokenCount(inputDetails, "audio_tokens")
    : undefined;
  const cachedInputTokens = inputDetails
    ? readTokenCount(inputDetails, "cached_tokens")
    : undefined;
  const cachedInputTextTokens = cachedDetails
    ? readTokenCount(cachedDetails, "text_tokens")
    : undefined;
  const cachedInputAudioTokens = cachedDetails
    ? readTokenCount(cachedDetails, "audio_tokens")
    : undefined;
  const outputTextTokens = outputDetails
    ? readTokenCount(outputDetails, "text_tokens")
    : undefined;
  const outputAudioTokens = outputDetails
    ? readTokenCount(outputDetails, "audio_tokens")
    : undefined;

  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(inputTextTokens === undefined ? {} : { inputTextTokens }),
    ...(inputAudioTokens === undefined ? {} : { inputAudioTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(cachedInputTextTokens === undefined ? {} : { cachedInputTextTokens }),
    ...(cachedInputAudioTokens === undefined ? {} : { cachedInputAudioTokens }),
    ...(outputTextTokens === undefined ? {} : { outputTextTokens }),
    ...(outputAudioTokens === undefined ? {} : { outputAudioTokens }),
  };
}

export function createOpenAIUsageAccumulator(): OpenAIUsageAccumulator {
  return {
    seenObservationKeys: new Set(),
    responses: [],
    transcriptionObservations: [],
    missingUsageCount: 0,
    recentMissingUsageIds: [],
    unpriceableUsageCount: 0,
    recentUnpriceableUsageIds: [],
  };
}

function hasPriceableCachedInputBreakdown(
  snapshot: OpenAIRealtimeUsageSnapshot,
): boolean {
  const cachedTotal = snapshot.cachedInputTokens;
  const cachedText = snapshot.cachedInputTextTokens;
  const cachedAudio = snapshot.cachedInputAudioTokens;

  if (cachedTotal === undefined) return false;
  if (cachedTotal === 0) {
    return (cachedText ?? 0) === 0 && (cachedAudio ?? 0) === 0;
  }
  if (cachedText === undefined || cachedAudio === undefined) return false;
  if (cachedText + cachedAudio !== cachedTotal) return false;
  if (
    snapshot.inputTextTokens !== undefined &&
    cachedText > snapshot.inputTextTokens
  ) {
    return false;
  }
  if (
    snapshot.inputAudioTokens !== undefined &&
    cachedAudio > snapshot.inputAudioTokens
  ) {
    return false;
  }
  return true;
}

function hasPriceableOpenAIUsageBreakdown(
  snapshot: OpenAIRealtimeUsageSnapshot,
): boolean {
  const {
    inputTokens,
    outputTokens,
    totalTokens,
    inputTextTokens,
    inputAudioTokens,
    outputTextTokens,
    outputAudioTokens,
  } = snapshot;

  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined ||
    inputTextTokens === undefined ||
    inputAudioTokens === undefined ||
    outputTextTokens === undefined ||
    outputAudioTokens === undefined
  ) {
    return false;
  }
  if (inputTextTokens + inputAudioTokens !== inputTokens) return false;
  if (outputTextTokens + outputAudioTokens !== outputTokens) return false;
  if (inputTokens + outputTokens !== totalTokens) return false;
  return hasPriceableCachedInputBreakdown(snapshot);
}

function toBoundedTranscriptionUsage(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const bounded: Record<string, unknown> = {};
  for (const key of ["type", "input_tokens", "output_tokens", "total_tokens"]) {
    const value = raw[key];
    if (typeof value === "string" || typeof value === "number") {
      bounded[key] = value;
    }
  }
  return bounded;
}

export function observeOpenAIUsage(
  accumulator: OpenAIUsageAccumulator,
  observation: OpenAIUsageObservation,
  observedAtMs = Date.now(),
): boolean {
  const key = `${observation.source}:${observation.id}`;
  if (accumulator.seenObservationKeys.has(key)) return false;
  accumulator.seenObservationKeys.add(key);

  if (observation.source === "openai_input_transcription") {
    accumulator.transcriptionObservations.push({
      id: observation.id,
      observedAtMs,
      usage: toBoundedTranscriptionUsage(observation.usage),
    });
    return true;
  }

  const snapshot = parseOpenAIRealtimeUsage(observation.usage);
  if (!snapshot) {
    accumulator.missingUsageCount += 1;
    accumulator.recentMissingUsageIds.push(observation.id);
    if (accumulator.recentMissingUsageIds.length > 20) {
      accumulator.recentMissingUsageIds.shift();
    }
    return true;
  }

  if (!hasPriceableOpenAIUsageBreakdown(snapshot)) {
    accumulator.unpriceableUsageCount += 1;
    accumulator.recentUnpriceableUsageIds.push(observation.id);
    if (accumulator.recentUnpriceableUsageIds.length > 20) {
      accumulator.recentUnpriceableUsageIds.shift();
    }
  }

  accumulator.responses.push({ id: observation.id, observedAtMs, snapshot });
  return true;
}

export function getOpenAIUsageDiagnostics(
  accumulator: OpenAIUsageAccumulator,
): {
  missingUsageCount: number;
  unpriceableUsageCount: number;
  warnings: string[];
  recentMissingUsageIds: string[];
  recentUnpriceableUsageIds: string[];
} {
  const warnings: string[] = [];
  if (accumulator.missingUsageCount > 0) {
    warnings.push("missing_openai_realtime_usage");
  }
  if (accumulator.unpriceableUsageCount > 0) {
    warnings.push("unpriceable_openai_usage_breakdown");
  }
  return {
    missingUsageCount: accumulator.missingUsageCount,
    unpriceableUsageCount: accumulator.unpriceableUsageCount,
    warnings,
    recentMissingUsageIds: [...accumulator.recentMissingUsageIds],
    recentUnpriceableUsageIds: [...accumulator.recentUnpriceableUsageIds],
  };
}

function sumOptionalSnapshotField(
  entries: OpenAIRealtimeUsageEntry[],
  field: keyof OpenAIRealtimeUsageSnapshot,
): number | undefined {
  let observed = false;
  let total = 0;
  for (const entry of entries) {
    const value = entry.snapshot[field];
    if (value === undefined) continue;
    observed = true;
    total += value;
  }
  return observed ? total : undefined;
}

export function summarizeOpenAIUsageAccumulator(
  accumulator: OpenAIUsageAccumulator,
): OpenAIUsageAggregate | null {
  if (accumulator.responses.length === 0) return null;

  const aggregate: OpenAIUsageAggregate = {
    responseCount: accumulator.responses.length,
    unpriceableUsageCount: accumulator.unpriceableUsageCount,
    latestSnapshot:
      accumulator.responses[accumulator.responses.length - 1]!.snapshot,
    rawUsageMetadata: {
      billing_model: "openai_realtime_per_response_v1",
      response_count: accumulator.responses.length,
      transcription_observation_count:
        accumulator.transcriptionObservations.length,
      responses: accumulator.responses.slice(-100),
      transcription_observations:
        accumulator.transcriptionObservations.slice(-50),
      warnings: getOpenAIUsageDiagnostics(accumulator).warnings,
    },
  };

  for (const field of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "inputTextTokens",
    "inputAudioTokens",
    "cachedInputTokens",
    "cachedInputTextTokens",
    "cachedInputAudioTokens",
    "outputTextTokens",
    "outputAudioTokens",
  ] as const) {
    const total = sumOptionalSnapshotField(accumulator.responses, field);
    if (total !== undefined) aggregate[field] = total;
  }

  return aggregate;
}

export function calculateOpenAIRealtimeUsageCost(
  aggregate: OpenAIUsageAggregate,
  pricing: OpenAIRealtimePricing,
  usdToIdrRate: number,
): {
  costUsd: number;
  costIdr: number;
  nonCachedInputTextTokens: number;
  nonCachedInputAudioTokens: number;
} | null {
  if (aggregate.unpriceableUsageCount > 0) return null;

  const nonCachedInputTextTokens = Math.max(
    (aggregate.inputTextTokens ?? 0) - (aggregate.cachedInputTextTokens ?? 0),
    0,
  );
  const nonCachedInputAudioTokens = Math.max(
    (aggregate.inputAudioTokens ?? 0) - (aggregate.cachedInputAudioTokens ?? 0),
    0,
  );
  const costUsd =
    (nonCachedInputTextTokens / 1_000_000) *
      pricing.inputTextPriceUsdPerMillion +
    ((aggregate.cachedInputTextTokens ?? 0) / 1_000_000) *
      pricing.cachedInputTextPriceUsdPerMillion +
    (nonCachedInputAudioTokens / 1_000_000) *
      pricing.inputAudioPriceUsdPerMillion +
    ((aggregate.cachedInputAudioTokens ?? 0) / 1_000_000) *
      pricing.cachedInputAudioPriceUsdPerMillion +
    ((aggregate.outputTextTokens ?? 0) / 1_000_000) *
      pricing.outputTextPriceUsdPerMillion +
    ((aggregate.outputAudioTokens ?? 0) / 1_000_000) *
      pricing.outputAudioPriceUsdPerMillion;

  return {
    costUsd: roundUsd(costUsd),
    costIdr: Math.round(costUsd * usdToIdrRate),
    nonCachedInputTextTokens,
    nonCachedInputAudioTokens,
  };
}

export async function recordFailedOpenAIRealtimeUsage(
  requestId: string,
  userId: string,
  modelId: string,
  errorMessage: string,
  action: "voice_live" | "voice_assessment" = "voice_live",
): Promise<boolean> {
  // Retired realtime IDs are never allowed to create a fresh usage audit,
  // even if a future registry edit accidentally exposes one again.
  if (modelId.startsWith("gpt-realtime-")) return false;
  const model = getTelefunLiveModel(modelId) as
    { provider: "openai"; id: string } | undefined;
  if (model?.provider !== "openai") return false;
  const boundedError =
    errorMessage.replace(/\s+/g, " ").trim().slice(0, 240) ||
    "incomplete OpenAI usage";
  try {
    const { error } = await admin.from("ai_usage_logs").insert({
      request_id: requestId,
      user_id: userId,
      provider: model.provider,
      model_id: model.id,
      module: "telefun",
      action,
      status: "failed",
      error_message: boundedError,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0,
      estimated_cost_idr: 0,
      final_cost_usd: 0,
      final_cost_idr: 0,
      raw_usage_metadata: {
        billing_model: "openai_realtime_per_response_v1",
        status: "failed",
      },
    });
    if (error && error.code !== "23505") {
      console.error(
        "[Telefun Usage] Failed to insert OpenAI failure audit:",
        error,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Telefun Usage] OpenAI failure audit exception:", error);
    return false;
  }
}

export async function flushOpenAIRealtimeUsage(
  requestId: string,
  userId: string,
  aggregate: OpenAIUsageAggregate,
  modelId: string,
  sessionDurationMs?: number,
  action: "voice_live" | "voice_assessment" = "voice_live",
): Promise<boolean> {
  // New Telefun OpenAI Realtime usage is permanently disabled. Keep the
  // historical calculation helpers above for immutable usage-read support.
  if (modelId.startsWith("gpt-realtime-")) return false;
  const model = getTelefunLiveModel(modelId) as
    { provider: "openai"; id: string } | undefined;
  if (model?.provider !== "openai") {
    console.error(
      "[Telefun Usage] Refusing non-OpenAI model for OpenAI usage",
      {
        modelId,
      },
    );
    return false;
  }
  if (aggregate.unpriceableUsageCount > 0) {
    console.error(
      "[Telefun Usage] Refusing unpriceable OpenAI usage breakdown",
      {
        modelId,
        unpriceableResponseCount: aggregate.unpriceableUsageCount,
      },
    );
    return false;
  }

  try {
    const [{ data: pricing, error: pricingError }, usdToIdrRate] =
      await Promise.all([
        admin
          .from("ai_pricing_settings")
          .select(
            "input_price_usd_per_million, output_price_usd_per_million, input_text_price_usd_per_million, cached_input_text_price_usd_per_million, input_audio_price_usd_per_million, cached_input_audio_price_usd_per_million, output_text_price_usd_per_million, output_audio_price_usd_per_million",
          )
          .eq("model_id", model.id)
          .maybeSingle(),
        getBillingRate(),
      ]);

    if (pricingError) throw pricingError;

    const rateSnapshots = {
      inputTextPriceUsdPerMillion: readPricingRate(
        pricing?.input_text_price_usd_per_million,
      ),
      cachedInputTextPriceUsdPerMillion: readPricingRate(
        pricing?.cached_input_text_price_usd_per_million,
      ),
      inputAudioPriceUsdPerMillion: readPricingRate(
        pricing?.input_audio_price_usd_per_million,
      ),
      cachedInputAudioPriceUsdPerMillion: readPricingRate(
        pricing?.cached_input_audio_price_usd_per_million,
      ),
      outputTextPriceUsdPerMillion: readPricingRate(
        pricing?.output_text_price_usd_per_million,
      ),
      outputAudioPriceUsdPerMillion: readPricingRate(
        pricing?.output_audio_price_usd_per_million,
      ),
    };
    const calculationRates: OpenAIRealtimePricing = {
      inputTextPriceUsdPerMillion:
        rateSnapshots.inputTextPriceUsdPerMillion ?? 0,
      cachedInputTextPriceUsdPerMillion:
        rateSnapshots.cachedInputTextPriceUsdPerMillion ?? 0,
      inputAudioPriceUsdPerMillion:
        rateSnapshots.inputAudioPriceUsdPerMillion ?? 0,
      cachedInputAudioPriceUsdPerMillion:
        rateSnapshots.cachedInputAudioPriceUsdPerMillion ?? 0,
      outputTextPriceUsdPerMillion:
        rateSnapshots.outputTextPriceUsdPerMillion ?? 0,
      outputAudioPriceUsdPerMillion:
        rateSnapshots.outputAudioPriceUsdPerMillion ?? 0,
    };
    const tokenCost = calculateOpenAIRealtimeUsageCost(
      aggregate,
      calculationRates,
      usdToIdrRate,
    );
    if (!tokenCost) return false;
    const normalizedDurationMs =
      typeof sessionDurationMs === "number" &&
      Number.isFinite(sessionDurationMs)
        ? Math.max(Math.floor(sessionDurationMs), 0)
        : null;
    const inputUnspecifiedTokens =
      aggregate.inputTokens === undefined ||
      aggregate.inputTextTokens === undefined ||
      aggregate.inputAudioTokens === undefined
        ? null
        : Math.max(
            aggregate.inputTokens -
              aggregate.inputTextTokens -
              aggregate.inputAudioTokens,
            0,
          );
    const outputUnspecifiedTokens =
      aggregate.outputTokens === undefined ||
      aggregate.outputTextTokens === undefined ||
      aggregate.outputAudioTokens === undefined
        ? null
        : Math.max(
            aggregate.outputTokens -
              aggregate.outputTextTokens -
              aggregate.outputAudioTokens,
            0,
          );

    const payload = {
      request_id: requestId,
      user_id: userId,
      provider: model.provider,
      model_id: model.id,
      module: "telefun",
      action,
      input_tokens: aggregate.inputTokens ?? 0,
      output_tokens: aggregate.outputTokens ?? 0,
      total_tokens: aggregate.totalTokens ?? 0,
      input_text_tokens: aggregate.inputTextTokens ?? null,
      input_audio_tokens: aggregate.inputAudioTokens ?? null,
      input_unspecified_tokens: inputUnspecifiedTokens,
      cached_input_text_tokens: aggregate.cachedInputTextTokens ?? null,
      cached_input_audio_tokens: aggregate.cachedInputAudioTokens ?? null,
      cached_input_tokens: aggregate.cachedInputTokens ?? null,
      output_text_tokens: aggregate.outputTextTokens ?? null,
      output_audio_tokens: aggregate.outputAudioTokens ?? null,
      output_unspecified_tokens: outputUnspecifiedTokens,
      input_text_price_usd_per_million:
        rateSnapshots.inputTextPriceUsdPerMillion,
      cached_input_text_price_usd_per_million:
        rateSnapshots.cachedInputTextPriceUsdPerMillion,
      input_audio_price_usd_per_million:
        rateSnapshots.inputAudioPriceUsdPerMillion,
      cached_input_audio_price_usd_per_million:
        rateSnapshots.cachedInputAudioPriceUsdPerMillion,
      output_text_price_usd_per_million:
        rateSnapshots.outputTextPriceUsdPerMillion,
      output_audio_price_usd_per_million:
        rateSnapshots.outputAudioPriceUsdPerMillion,
      input_price_usd_per_million:
        readPricingRate(pricing?.input_price_usd_per_million) ?? 0,
      output_price_usd_per_million:
        readPricingRate(pricing?.output_price_usd_per_million) ?? 0,
      usd_to_idr_rate: usdToIdrRate,
      estimated_cost_usd: tokenCost.costUsd,
      estimated_cost_idr: tokenCost.costIdr,
      billing_model: "openai_realtime_per_response_v1",
      live_turn_count: aggregate.responseCount,
      latest_input_tokens: aggregate.latestSnapshot.inputTokens ?? null,
      latest_output_tokens: aggregate.latestSnapshot.outputTokens ?? null,
      latest_total_tokens: aggregate.latestSnapshot.totalTokens ?? null,
      context_rebilled_cost_usd: tokenCost.costUsd,
      context_rebilled_cost_idr: tokenCost.costIdr,
      session_duration_ms: normalizedDurationMs,
      per_minute_cost_usd: null,
      per_minute_cost_idr: null,
      final_cost_usd: tokenCost.costUsd,
      final_cost_idr: tokenCost.costIdr,
      raw_usage_metadata: aggregate.rawUsageMetadata,
    };

    const { error } = await admin.from("ai_usage_logs").insert(payload);
    if (error && error.code !== "23505") {
      console.error("[Telefun Usage] Failed to insert OpenAI usage:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Telefun Usage] OpenAI usage exception:", error);
    return false;
  }
}
