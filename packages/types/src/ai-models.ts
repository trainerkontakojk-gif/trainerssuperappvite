import type { AiModelInfo } from "./index";

export const DEFAULT_AI_MODEL_ID = "gemini-3.1-flash-lite";

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    description: "Cepat dan efisien untuk percakapan natural.",
    provider: "gemini",
    timeoutMs: 120_000,
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    description:
      "Model Gemini 3 paling cepat untuk percakapan natural dan tugas ringan.",
    provider: "gemini",
    timeoutMs: 120_000,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    description: "Model Gemini 3.1 paling powerful untuk tugas kompleks.",
    provider: "gemini",
    timeoutMs: 180_000,
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    description: "Model ringan Gemini 2.0 untuk respons cepat dan hemat biaya.",
    provider: "gemini",
    timeoutMs: 120_000,
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B",
    description: "Model open-weight yang kuat untuk tugas kompleks.",
    provider: "openrouter",
    timeoutMs: 90_000,
  },
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite (OR)",
    description: "Model ringan Google via OpenRouter.",
    provider: "openrouter",
    timeoutMs: 120_000,
  },
  {
    id: "google/gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite (OR)",
    description: "Model Gemini 2.0 ringan via OpenRouter.",
    provider: "openrouter",
    timeoutMs: 120_000,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Model OpenAI compact dan efisien.",
    provider: "openrouter",
    timeoutMs: 90_000,
  },
  {
    id: "qwen/qwen3.5-flash-02-23",
    name: "Qwen 3.5 Flash",
    description: "Model Qwen cepat dan efisien.",
    provider: "openrouter",
    timeoutMs: 120_000,
  },
];
