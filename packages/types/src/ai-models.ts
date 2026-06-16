export interface AiModelCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  imageGenerationMode?: "native" | "openrouter-modalities" | "none";
}

export interface AiModelInfo {
  id: string;
  name: string;
  description: string;
  provider: AIProvider;
  timeoutMs?: number;
  capabilities?: AiModelCapabilities;
  availableModules?: AiModelModule[];
}

export type AIProvider = "gemini" | "openrouter" | "deepseek";
export type AiModelModule = "ketik" | "pdkt" | "qa-analyzer" | "default";

export const DEFAULT_AI_MODEL_ID = "gemini-3.1-flash-lite";
export const DEFAULT_IMAGE_GENERATION_MODEL_ID = "gemini-3.1-flash-image";

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
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    description: "Model ringan Gemini 2.0 untuk respons cepat dan hemat biaya.",
    provider: "gemini",
    timeoutMs: 120_000,
    capabilities: {
      supportsText: true,
      supportsImage: true,
    },
  },
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
    id: "qwen/qwen3.5-flash-02-23",
    name: "Qwen 3.5 Flash",
    description: "Model Qwen cepat dan efisien.",
    provider: "openrouter",
    timeoutMs: 120_000,
    capabilities: { supportsText: true, supportsImage: false },
  },
];

export const DEEPSEEK_MODELS: AiModelInfo[] = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description: "Model DeepSeek langsung untuk tugas kompleks dan respons lebih dalam.",
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
