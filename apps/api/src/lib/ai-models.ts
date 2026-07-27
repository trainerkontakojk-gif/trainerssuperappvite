import { GoogleGenAI } from "@google/genai";
import {
  AiModelInfo,
  AIProvider,
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  KETIK_PDKT_MODELS,
  TEXT_SIMULATION_MODELS,
  TEXT_MODELS,
  IMAGE_GENERATION_MODELS,
  TELEFUN_LIVE_MODELS,
} from "@trainers/types";
import type { AiModelModule } from "@trainers/types";

type TextImageAIProvider = Extract<AIProvider, "gemini" | "openai">;
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
  (model) => model.provider === "gemini",
);

const LEGACY_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
  "google/gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
  "openai/gpt-4o-mini": "gpt-5.4-mini",
};

const MODEL_REGISTRY = [...AI_MODELS];
const SUPPORTED_MODEL_IDS = new Set(MODEL_REGISTRY.map((model) => model.id));
const LEGACY_MODEL_IDS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

export function normalizeModelId(modelId?: string | null): string {
  if (!modelId) return DEFAULT_AI_MODEL_ID;
  if (SUPPORTED_MODEL_IDS.has(modelId)) return modelId;
  if (LEGACY_MODEL_IDS.has(modelId) || modelId.includes("/")) {
    return "gpt-5.4-mini";
  }
  return LEGACY_ALIASES[modelId] || modelId;
}

export function getProviderFromModelId(modelId: string): TextImageAIProvider {
  const normalized = normalizeModelId(modelId);
  return (MODEL_REGISTRY.find((model) => model.id === normalized)?.provider ??
    "gemini") as TextImageAIProvider;
}

export function resolveModelProvider(modelId?: string | null): {
  modelId: string;
  provider: TextImageAIProvider;
  isFallback: boolean;
  timeoutMs?: number;
} {
  const normalized = normalizeModelId(modelId);
  const found = MODEL_REGISTRY.find((m) => m.id === normalized);
  if (found && (found.provider === "gemini" || found.provider === "openai")) {
    return {
      modelId: found.id,
      provider: found.provider,
      isFallback: false,
      timeoutMs: found.timeoutMs,
    };
  }
  const fallback = MODEL_REGISTRY.find(
    (model) => model.id === DEFAULT_AI_MODEL_ID,
  )!;
  return {
    modelId: fallback.id,
    provider: fallback.provider,
    isFallback: true,
    timeoutMs: fallback.timeoutMs,
  };
}

export function getModelsForModule(
  module: AiModelModule = "default",
): AiModelInfo[] {
  if (module === "telefun") return [...TELEFUN_LIVE_MODELS];
  if (module === "ketik" || module === "pdkt" || module === "qa-analyzer")
    return module === "qa-analyzer"
      ? TEXT_SIMULATION_MODELS
      : KETIK_PDKT_MODELS;
  return AI_MODELS;
}

export function supportsImageGeneration(modelId: string): boolean {
  return IMAGE_GENERATION_MODELS.some(
    (m) => m.id === normalizeModelId(modelId),
  );
}

export function getImageGenerationMode(modelId: string): "native" | "none" {
  return (
    IMAGE_GENERATION_MODELS.find((m) => m.id === normalizeModelId(modelId))
      ?.capabilities?.imageGenerationMode ?? "none"
  );
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}
