import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  TEXT_MODELS,
  TEXT_SIMULATION_MODELS,
} from "@trainers/types";
import type { AiModelModule } from "@trainers/types";
import { getApi } from "../hooks/useApi";

export async function fetchAiModels(
  module: AiModelModule = "default",
) {
  try {
    return await getApi<typeof AI_MODELS>(`/ai/models?module=${module}`);
  } catch {
    return AI_MODELS;
  }
}

export { AI_MODELS, DEFAULT_AI_MODEL_ID, TEXT_MODELS };
export { TEXT_SIMULATION_MODELS };
