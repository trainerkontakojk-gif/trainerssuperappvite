import { GoogleGenAI } from "@google/genai";
import {
  AiModelInfo,
  AIProvider,
  AI_MODELS,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  TEXT_MODELS,
  IMAGE_GENERATION_MODELS,
} from "@trainers/types";
export { AI_MODELS, DEFAULT_IMAGE_GENERATION_MODEL_ID, TEXT_MODELS, IMAGE_GENERATION_MODELS };

const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite";

export const TEXT_SIMULATION_MODELS = TEXT_MODELS.filter(
  (m) => !m.id.includes("tts"),
);
export const DIRECT_GEMINI_MODELS = TEXT_MODELS.filter(
  (m) => m.provider === "gemini",
);

const LEGACY_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
};

export function normalizeModelId(modelId?: string | null): string {
  if (!modelId) return DEFAULT_MODEL_ID;
  return LEGACY_ALIASES[modelId] || modelId;
}

export function getProviderFromModelId(modelId: string): AIProvider {
  return normalizeModelId(modelId).includes("/") ? "openrouter" : "gemini";
}

export function resolveModelProvider(modelId?: string | null): {
  modelId: string;
  provider: AIProvider;
  isFallback: boolean;
  timeoutMs?: number;
} {
  const normalized = normalizeModelId(modelId);
  const found = AI_MODELS.find((m) => m.id === normalized);
  if (found)
    return {
      modelId: found.id,
      provider: found.provider,
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
  module: "ketik" | "pdkt" | "default" = "default",
): AiModelInfo[] {
  if (module === "ketik" || module === "pdkt") return TEXT_SIMULATION_MODELS;
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
