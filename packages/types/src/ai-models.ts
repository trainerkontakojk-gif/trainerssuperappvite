export interface AiModelCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  imageGenerationMode?: "native" | "none";
}

export type TelefunTransport = "gemini-live" | "openai-audio";

export interface AiModelRealtimeMetadata {
  transport: TelefunTransport;
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
  {
    id: "gpt-realtime-2.1",
    name: "GPT Realtime 2.1",
    description: "Model realtime OpenAI untuk percakapan audio native.",
    provider: "openai",
    timeoutMs: 300_000,
    capabilities: {
      supportsText: true,
      supportsImage: false,
    },
    availableModules: ["telefun"],
    realtime: {
      transport: "openai-audio",
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
    description: "Model realtime OpenAI yang lebih ringkas dan efisien.",
    provider: "openai",
    timeoutMs: 300_000,
    capabilities: {
      supportsText: true,
      supportsImage: false,
    },
    availableModules: ["telefun"],
    realtime: {
      transport: "openai-audio",
      inputSampleRateHz: 24_000,
      outputSampleRateHz: 24_000,
      voiceProvider: "openai",
      maxSessionMinutes: 60,
      supportsAudio: true,
    },
  },
] as const satisfies readonly AiModelInfo[];

export type TelefunLiveModel = (typeof TELEFUN_LIVE_MODELS)[number];
export type TelefunLiveModelWarningReason =
  | "unknown-model"
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

export function isValidTelefunModelTransportPair(
  modelId: string,
  transport: unknown,
): transport is TelefunTransport {
  const model = getTelefunLiveModel(modelId);
  return model?.realtime.transport === transport;
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

  let warningReason: TelefunLiveModelWarningReason | undefined;
  if (didFallback) {
    warningReason = "unknown-model";
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
