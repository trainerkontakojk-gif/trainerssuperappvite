import { AI_MODELS, DEFAULT_AI_MODEL_ID } from "@trainers/types";
import { getApi } from "../hooks/useApi";

export async function fetchAiModels(module: "ketik" | "pdkt" | "default" = "default") {
  try {
    return await getApi<typeof AI_MODELS>(`/ai/models?module=${module}`);
  } catch {
    return AI_MODELS;
  }
}

export { AI_MODELS, DEFAULT_AI_MODEL_ID };
export const TEXT_SIMULATION_MODELS = AI_MODELS.filter(
  (m) => !m.id.includes("tts"),
);
