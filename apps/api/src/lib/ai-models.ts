import { GoogleGenAI } from '@google/genai';
import { AiModelInfo, AIProvider } from '@trainers/types';

const DEFAULT_MODEL_ID = 'gemini-3.1-flash-lite';

export const AI_MODELS: AiModelInfo[] = [
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', description: 'Cepat dan efisien untuk percakapan natural.', provider: 'gemini' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Model Gemini 3 paling cepat untuk percakapan natural dan tugas ringan.', provider: 'gemini' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', description: 'Model Gemini 3.1 paling powerful untuk tugas kompleks.', provider: 'gemini' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Model ringan Gemini 2.0 untuk respons cepat dan hemat biaya.', provider: 'gemini' },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', description: 'Model open-weight yang kuat untuk tugas kompleks.', provider: 'openrouter' },
  { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (OR)', description: 'Model ringan Google via OpenRouter.', provider: 'openrouter' },
  { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (OR)', description: 'Model Gemini 2.0 ringan via OpenRouter.', provider: 'openrouter' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Model OpenAI compact dan efisien.', provider: 'openrouter' },
  { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen 3.5 Flash', description: 'Model Qwen cepat dan efisien.', provider: 'openrouter' },
];

export const TEXT_SIMULATION_MODELS = AI_MODELS.filter(m => !m.id.includes('tts'));
export const DIRECT_GEMINI_MODELS = AI_MODELS.filter(m => m.provider === 'gemini');

const LEGACY_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
};

export function normalizeModelId(modelId?: string | null): string {
  if (!modelId) return DEFAULT_MODEL_ID;
  return LEGACY_ALIASES[modelId] || modelId;
}

export function getProviderFromModelId(modelId: string): AIProvider {
  return normalizeModelId(modelId).includes('/') ? 'openrouter' : 'gemini';
}

export function resolveModelProvider(modelId?: string | null): {
  modelId: string;
  provider: AIProvider;
  isFallback: boolean;
} {
  const normalized = normalizeModelId(modelId);
  const found = AI_MODELS.find(m => m.id === normalized);
  if (found) return { modelId: found.id, provider: found.provider, isFallback: false };
  const provider = getProviderFromModelId(normalized);
  return { modelId: normalized, provider, isFallback: true };
}

export function getModelsForModule(module: 'ketik' | 'pdkt' | 'default' = 'default'): AiModelInfo[] {
  if (module === 'ketik' || module === 'pdkt') return TEXT_SIMULATION_MODELS;
  return AI_MODELS;
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}
