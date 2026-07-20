import { createClient } from "@supabase/supabase-js";
import { getTelefunLiveModel } from "@trainers/types";
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
  const liveModel = getTelefunLiveModel(modelId);
  const usesGeminiPerMinuteFloor = liveModel?.provider === "gemini";
  const normalizedDurationMs =
    typeof sessionDurationMs === "number" && Number.isFinite(sessionDurationMs)
      ? Math.max(Math.floor(sessionDurationMs), 0)
      : null;
  const perMinuteCost =
    usesGeminiPerMinuteFloor && normalizedDurationMs !== null
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
      : (next.promptModality ?? prev.promptModality);

  const mergedResponseModality =
    prev.responseModality && next.responseModality
      ? {
          text: Math.max(
            prev.responseModality.text,
            next.responseModality.text,
          ),
          audio: Math.max(
            prev.responseModality.audio,
            next.responseModality.audio,
          ),
        }
      : (next.responseModality ?? prev.responseModality);

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

function readPricingRate(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function flushOpenAIRealtimeUsage(
  requestId: string,
  userId: string,
  aggregate: OpenAIUsageAggregate,
  modelId: string,
  sessionDurationMs?: number,
  action: "voice_live" | "voice_assessment" = "voice_live",
): Promise<boolean> {
  const model = getTelefunLiveModel(modelId);
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
    const [{ data: pricing }, usdToIdrRate] = await Promise.all([
      admin
        .from("ai_pricing_settings")
        .select("input_price_usd_per_million, output_price_usd_per_million")
        .eq("model_id", model.id)
        .maybeSingle(),
      getBillingRate(),
    ]);

    const usesGeminiLivePricing = model.realtime.transport === "gemini-live";
    const inputPricePerMillion =
      pricing?.input_price_usd_per_million ?? (usesGeminiLivePricing ? 3.0 : 0);
    const outputPricePerMillion =
      pricing?.output_price_usd_per_million ??
      (usesGeminiLivePricing ? 12.0 : 0);

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
