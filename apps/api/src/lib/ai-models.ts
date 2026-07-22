import { GoogleGenAI } from "@google/genai";
import {
  AiModelInfo,
  AIProvider,
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  DEEPSEEK_MODELS,
  KETIK_PDKT_MODELS,
  TEXT_SIMULATION_MODELS,
  TEXT_MODELS,
  IMAGE_GENERATION_MODELS,
  TELEFUN_LIVE_MODELS,
} from "@trainers/types";
import type { AiModelModule } from "@trainers/types";
type TextImageAIProvider = Exclude<AIProvider, "openai">;
export {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  KETIK_PDKT_MODELS,
  TEXT_MODELS,
  IMAGE_GENERATION_MODELS,
  TEXT_SIMULATION_MODELS,
  TELEFUN_LIVE_MODELS,
};

export const DIRECT_GEMINI_MODELS = TEXT_MODELS.filter(
  (m) => m.provider === "gemini",
);

const LEGACY_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
};

const MODEL_REGISTRY = [...AI_MODELS, ...DEEPSEEK_MODELS];

export function normalizeModelId(modelId?: string | null): string {
  if (!modelId) return DEFAULT_AI_MODEL_ID;
  return LEGACY_ALIASES[modelId] || modelId;
}

export function getProviderFromModelId(modelId: string): TextImageAIProvider {
  const normalized = normalizeModelId(modelId);
  return (MODEL_REGISTRY.find((model) => model.id === normalized)?.provider ||
    (normalized.includes("/")
      ? "openrouter"
      : "gemini")) as TextImageAIProvider;
}

export function resolveModelProvider(modelId?: string | null): {
  modelId: string;
  provider: TextImageAIProvider;
  isFallback: boolean;
  timeoutMs?: number;
} {
  const normalized = normalizeModelId(modelId);
  const found = MODEL_REGISTRY.find((m) => m.id === normalized);
  if (found)
    return {
      modelId: found.id,
      provider: found.provider as TextImageAIProvider,
      isFallback: false,
      timeoutMs: found.timeoutMs,
    };
  const provider = getProviderFromModelId(normalized);
  return {
    modelId: normalized,
    provider,
    isFallback: true,
    timeoutMs: 120_000,
  };
}

export function getModelsForModule(
  module: AiModelModule = "default",
): AiModelInfo[] {
  if (module === "telefun") {
    return [...TELEFUN_LIVE_MODELS];
  }
  if (module === "ketik" || module === "pdkt" || module === "qa-analyzer") {
    return module === "qa-analyzer"
      ? TEXT_SIMULATION_MODELS
      : KETIK_PDKT_MODELS;
  }
  return AI_MODELS;
}

export function supportsImageGeneration(modelId: string): boolean {
  const normalized = normalizeModelId(modelId);
  const model = IMAGE_GENERATION_MODELS.find((m) => m.id === normalized);
  return !!model;
}

export function getImageGenerationMode(
  modelId: string,
): "native" | "openrouter-modalities" | "none" {
  const normalized = normalizeModelId(modelId);
  const model = IMAGE_GENERATION_MODELS.find((m) => m.id === normalized);
  return model?.capabilities?.imageGenerationMode ?? "none";
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}
