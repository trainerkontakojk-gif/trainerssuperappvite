export interface AiModelCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  imageGenerationMode?: "native" | "openrouter-modalities" | "none";
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

export type AIProvider = "gemini" | "openrouter" | "deepseek" | "openai";
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
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite (OR)",
    description: "Model ringan Google via OpenRouter.",
    provider: "openrouter",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Model OpenAI compact dan efisien.",
    provider: "openrouter",
    timeoutMs: 90_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "xiaomi/mimo-v2.5",
    name: "MiMo V 2.5",
    description: "Model Xiaomi MiMo V2.5 — agentic, cepat, dan efficient.",
    provider: "openrouter",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    name: "MiMo 2.5 Pro",
    description:
      "Model Xiaomi MiMo V2.5 Pro — flagship untuk tugas kompleks, agentic, dan software engineering.",
    provider: "openrouter",
    timeoutMs: 180_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
];

export const DEEPSEEK_MODELS: AiModelInfo[] = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description:
      "Model DeepSeek langsung untuk tugas kompleks dan respons lebih dalam.",
    provider: "deepseek",
    timeoutMs: 180_000,
    capabilities: { supportsText: true, supportsImage: false },
    availableModules: ["ketik", "pdkt"],
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    description: "Model DeepSeek langsung yang cepat dan efisien.",
    provider: "deepseek",
    timeoutMs: 120_000,
    capabilities: { supportsText: true, supportsImage: false },
    availableModules: ["ketik", "pdkt"],
  },
];

export const KETIK_PDKT_MODELS: AiModelInfo[] = [
  ...TEXT_MODELS,
  ...DEEPSEEK_MODELS,
];

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
  {
    id: "google/gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image Preview (OR)",
    description: "Model Gemini 3.1 Flash Image via OpenRouter.",
    provider: "openrouter",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: false,
      supportsImage: true,
      imageGenerationMode: "openrouter-modalities",
    },
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image (OR)",
    description: "Model Gemini 2.5 Flash Image via OpenRouter.",
    provider: "openrouter",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: false,
      supportsImage: true,
      imageGenerationMode: "openrouter-modalities",
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
