import { isGeminiLiveVoiceName } from "./telefun-voices";

export interface AiModelCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  imageGenerationMode?: "native" | "none";
}

export type TelefunTransport = "gemini-live" | "openai-audio" | "openai-webrtc";

export interface AiModelRealtimeMetadata {
  transport: TelefunTransport;
  supportedTransports?: readonly TelefunTransport[];
  inputSampleRateHz: number;
  outputSampleRateHz: number;
  voiceProvider: Extract<AIProvider, "gemini" | "openai">;
  maxSessionMinutes?: number;
  supportsAudio: true;
}

export interface AiModelInfo {
  id: string;
  name: string;
  description: string;
  provider: AIProvider;
  timeoutMs?: number;
  capabilities?: AiModelCapabilities;
  availableModules?: readonly AiModelModule[];
  realtime?: AiModelRealtimeMetadata;
  /** False for reasoning models whose vendor API rejects the temperature parameter. */
  supportsTemperature?: boolean;
}

export type AIProvider = "gemini" | "openai";
export type AiModelModule =
  | "ketik"
  | "pdkt"
  | "qa-analyzer"
  | "telefun"
  | "default";

export const DEFAULT_AI_MODEL_ID = "gemini-3.1-flash-lite";
export const DEFAULT_IMAGE_GENERATION_MODEL_ID = "gemini-3.1-flash-image";
export const DEFAULT_TELEFUN_LIVE_MODEL_ID = "gemini-3.1-flash-live-preview";

const GEMINI_31_FLASH_LIVE_MODEL = {
  id: DEFAULT_TELEFUN_LIVE_MODEL_ID,
  name: "Gemini 3.1 Flash Live",
  description:
    "Generasi terbaru dengan pemahaman konteks terbaik untuk simulasi Telefun.",
  provider: "gemini",
  timeoutMs: 300_000,
  capabilities: {
    supportsText: true,
    supportsImage: false,
  },
  availableModules: ["default", "telefun"],
  realtime: {
    transport: "gemini-live",
    inputSampleRateHz: 16_000,
    outputSampleRateHz: 24_000,
    voiceProvider: "gemini",
    supportsAudio: true,
  },
} as const satisfies AiModelInfo;

export const TELEFUN_LIVE_MODELS = [
  GEMINI_31_FLASH_LIVE_MODEL,
  {
    id: "gemini-3.0-flash-live-preview",
    name: "Gemini 3.0 Flash Live",
    description: "Stabil dan optimal untuk latensi rendah.",
    provider: "gemini",
    timeoutMs: 300_000,
    capabilities: {
      supportsText: true,
      supportsImage: false,
    },
    availableModules: ["telefun"],
    realtime: {
      transport: "gemini-live",
      inputSampleRateHz: 16_000,
      outputSampleRateHz: 24_000,
      voiceProvider: "gemini",
      supportsAudio: true,
    },
  },
] as const satisfies readonly AiModelInfo[];

export type TelefunLiveModel = (typeof TELEFUN_LIVE_MODELS)[number];

/**
 * Readonly compatibility metadata for rows created before Telefun OpenAI
 * Realtime retirement. This registry is not selectable and is never merged
 * into the active Telefun or direct-text registries.
 */
export const TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS = [
  {
    id: "gpt-realtime-2.1",
    name: "GPT Realtime 2.1",
    description: "Metadata historis OpenAI Realtime untuk riwayat Telefun.",
    provider: "openai",
    timeoutMs: 300_000,
    capabilities: {
      supportsText: true,
      supportsImage: false,
    },
    realtime: {
      transport: "openai-audio",
      supportedTransports: ["openai-audio", "openai-webrtc"],
      inputSampleRateHz: 24_000,
      outputSampleRateHz: 24_000,
      voiceProvider: "openai",
      maxSessionMinutes: 60,
      supportsAudio: true,
    },
  },
  {
    id: "gpt-realtime-2.1-mini",
    name: "GPT Realtime 2.1 Mini",
    description: "Metadata historis OpenAI Realtime untuk riwayat Telefun.",
    provider: "openai",
    timeoutMs: 300_000,
    capabilities: {
      supportsText: true,
      supportsImage: false,
    },
    realtime: {
      transport: "openai-audio",
      supportedTransports: ["openai-audio", "openai-webrtc"],
      inputSampleRateHz: 24_000,
      outputSampleRateHz: 24_000,
      voiceProvider: "openai",
      maxSessionMinutes: 60,
      supportsAudio: true,
    },
  },
] as const satisfies readonly AiModelInfo[];

export type HistoricalTelefunOpenAiRealtimeModel =
  (typeof TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS)[number];

/** @deprecated Historical cleanup identifiers only; never use for admission. */
export type TelefunWebRtcModelId = HistoricalTelefunOpenAiRealtimeModel["id"];

/** @deprecated Historical cleanup identifiers only; never use for admission. */
export const TELEFUN_OPENAI_WEBRTC_MODEL_IDS: readonly TelefunWebRtcModelId[] =
  TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS.map((model) => model.id);

/**
 * @deprecated Retired configuration inputs are ignored. The empty set makes
 * accidental consumers fail closed while historical cleanup retains exact IDs
 * through TELEFUN_OPENAI_WEBRTC_MODEL_IDS.
 */
export const DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS: readonly TelefunWebRtcModelId[] =
  [];

/** @deprecated Retired configuration inputs are ignored and cannot admit a model. */
export function parseTelefunOpenAiWebRtcAllowedModelIds(
  _value: string | undefined,
): readonly TelefunWebRtcModelId[] {
  return DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS;
}
export type TelefunLiveModelWarningReason =
  | "unknown-model"
  | "legacy-model"
  | "transport-mismatch"
  | "provider-unavailable";

export interface NormalizedTelefunLiveModelSelection {
  model: TelefunLiveModel;
  transport: TelefunTransport;
  didFallback: boolean;
  warningReason?: TelefunLiveModelWarningReason;
}

export function getTelefunLiveModel(
  modelId: string | null | undefined,
): TelefunLiveModel | undefined {
  return TELEFUN_LIVE_MODELS.find((model) => model.id === modelId);
}

/** Exact readonly lookup for persisted pre-retirement OpenAI Realtime rows. */
export function getHistoricalTelefunRealtimeModel(
  modelId: string | null | undefined,
): HistoricalTelefunOpenAiRealtimeModel | undefined {
  return TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS.find(
    (model) => model.id === modelId,
  );
}

/** True only for a known historical OpenAI Realtime model identifier. */
export function isHistoricalTelefunOpenAiRealtimeModelId(
  modelId: unknown,
): modelId is TelefunWebRtcModelId {
  return (
    typeof modelId === "string" &&
    getHistoricalTelefunRealtimeModel(modelId) !== undefined
  );
}

export function isRetiredTelefunOpenAiTransport(
  transport: unknown,
): transport is Extract<TelefunTransport, "openai-audio" | "openai-webrtc"> {
  return transport === "openai-audio" || transport === "openai-webrtc";
}

/**
 * Fail-closed detector for persisted Telefun data. The exact lookup preserves
 * historical metadata semantics; the prefix guard prevents unknown old GPT
 * realtime rows from falling through to an active Gemini path.
 */
export function isRetiredTelefunOpenAiRealtimeSelection(input: {
  modelId?: unknown;
  transport?: unknown;
  selectedModel?: unknown;
}): boolean {
  return (
    isHistoricalTelefunOpenAiRealtimeModelId(input.modelId) ||
    isHistoricalTelefunOpenAiRealtimeModelId(input.selectedModel) ||
    isRetiredTelefunOpenAiTransport(input.transport) ||
    (typeof input.modelId === "string" &&
      input.modelId.startsWith("gpt-realtime-")) ||
    (typeof input.selectedModel === "string" &&
      input.selectedModel.startsWith("gpt-realtime-"))
  );
}

function getTelefunLiveModelSupportedTransports(
  model: TelefunLiveModel | undefined,
): readonly TelefunTransport[] {
  if (!model?.realtime) return [];

  const supportedTransports =
    (model.realtime as AiModelRealtimeMetadata).supportedTransports ?? [];

  return Array.from(
    new Set([model.realtime.transport, ...supportedTransports]),
  );
}

export function isValidTelefunModelTransportPair(
  modelId: string,
  transport: unknown,
): transport is TelefunTransport {
  const model = getTelefunLiveModel(modelId);
  return (
    typeof transport === "string" &&
    getTelefunLiveModelSupportedTransports(model).includes(
      transport as TelefunTransport,
    )
  );
}

export function normalizeTelefunLiveModelSelection(
  modelId?: unknown,
  transport?: unknown,
): NormalizedTelefunLiveModelSelection {
  const requestedModel =
    typeof modelId === "string" ? getTelefunLiveModel(modelId) : undefined;
  const didFallback = typeof modelId === "string" && !requestedModel;
  const model =
    requestedModel ?? getTelefunLiveModel(DEFAULT_TELEFUN_LIVE_MODEL_ID)!;
  const canonicalTransport = model.realtime.transport;
  const supportedTransports = getTelefunLiveModelSupportedTransports(model);

  let warningReason: TelefunLiveModelWarningReason | undefined;
  if (didFallback) {
    warningReason = isHistoricalTelefunOpenAiRealtimeModelId(modelId)
      ? "legacy-model"
      : "unknown-model";
  } else if (
    typeof transport === "string" &&
    supportedTransports.includes(transport as TelefunTransport)
  ) {
    return {
      model,
      transport: transport as TelefunTransport,
      didFallback,
      warningReason,
    };
  } else if (transport !== undefined && transport !== canonicalTransport) {
    warningReason = "transport-mismatch";
  }

  return {
    model,
    transport: canonicalTransport,
    didFallback,
    warningReason,
  };
}

type UnknownSettingsRecord = Record<string, unknown>;

function isSettingsRecord(value: unknown): value is UnknownSettingsRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeGeminiVoice(value: unknown): string {
  return isGeminiLiveVoiceName(value) ? value : "";
}

function normalizeIdentityVoice(
  value: unknown,
): unknown {
  if (!isSettingsRecord(value) || value.voiceName === undefined) return value;
  return { ...value, voiceName: normalizeGeminiVoice(value.voiceName) };
}

export interface TelefunPersistedSettingsNormalization<T> {
  settings: T;
  didNormalize: boolean;
}

/**
 * Projects a persisted retired Telefun selection to the active Gemini pair.
 * This is pure: callers must never write the returned object during a read.
 */
export function normalizePersistedTelefunSettings<T>(
  settings: T,
): TelefunPersistedSettingsNormalization<T> {
  if (!isSettingsRecord(settings)) {
    return { settings, didNormalize: false };
  }

  const isRetired = isRetiredTelefunOpenAiRealtimeSelection({
    modelId: settings.telefunModelId,
    transport: settings.telefunTransport,
    selectedModel: settings.selectedModel,
  });
  if (!isRetired) return { settings, didNormalize: false };

  const normalized: UnknownSettingsRecord = {
    ...settings,
    telefunModelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
    telefunTransport: "gemini-live",
  };
  if (isHistoricalTelefunOpenAiRealtimeModelId(settings.selectedModel)) {
    normalized.selectedModel = DEFAULT_TELEFUN_LIVE_MODEL_ID;
  }
  if (settings.voiceName !== undefined) {
    normalized.voiceName = normalizeGeminiVoice(settings.voiceName);
  }
  if (settings.identitySettings !== undefined) {
    normalized.identitySettings = normalizeIdentityVoice(settings.identitySettings);
  }
  if (settings.identity !== undefined) {
    normalized.identity = normalizeIdentityVoice(settings.identity);
  }

  return { settings: normalized as T, didNormalize: true };
}

export const TEXT_MODELS: AiModelInfo[] = [
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    description: "Model Gemini cepat untuk percakapan dan analisis.",
    provider: "gemini",
    timeoutMs: 180_000,
    capabilities: { supportsText: true, supportsImage: true },
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    description: "Model Gemini ringan dan efisien.",
    provider: "gemini",
    timeoutMs: 120_000,
    capabilities: { supportsText: true, supportsImage: true },
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT 5.6 Luna",
    description: "Model OpenAI untuk analisis dan generasi teks.",
    provider: "openai",
    timeoutMs: 180_000,
    capabilities: { supportsText: true, supportsImage: false },
    supportsTemperature: false,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    description: "Model OpenAI ringkas dan efisien.",
    provider: "openai",
    timeoutMs: 120_000,
    capabilities: { supportsText: true, supportsImage: false },
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description:
      "Model Flash terbaru untuk reasoning, coding, workflow agentic, dan analisis multimodal.",
    provider: "gemini",
    timeoutMs: 180_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    description: "Cepat dan efisien untuk percakapan natural.",
    provider: "gemini",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    description:
      "Model Gemini 3 paling cepat untuk percakapan natural dan tugas ringan.",
    provider: "gemini",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    description: "Model Gemini 3.1 paling powerful untuk tugas kompleks.",
    provider: "gemini",
    timeoutMs: 180_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  GEMINI_31_FLASH_LIVE_MODEL,
];

export const KETIK_PDKT_MODELS: AiModelInfo[] = [...TEXT_MODELS];

export const IMAGE_GENERATION_MODELS: AiModelInfo[] = [
  {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    description: "Model native Gemini untuk generate gambar.",
    provider: "gemini",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: false,
      supportsImage: true,
      imageGenerationMode: "native",
    },
  },
];

export const AI_MODELS: AiModelInfo[] = [
  ...TEXT_MODELS,
  ...IMAGE_GENERATION_MODELS,
];

export const TEXT_SIMULATION_MODELS = TEXT_MODELS.filter(
  (model) => !model.id.includes("tts"),
);
