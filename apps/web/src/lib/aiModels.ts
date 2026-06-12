import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  TEXT_MODELS,
  TEXT_SIMULATION_MODELS,
} from "@trainers/types";
import type { AiModelModule } from "@trainers/types";
import { rpcClient, unwrapResponse } from "./api";

export async function fetchAiModels(
  module: AiModelModule = "default",
) {
  try {
    return await (unwrapResponse(
      (rpcClient as any).v1.ai.models.$get({ query: { module } }),
    ) as unknown) as typeof AI_MODELS;
  } catch {
    return AI_MODELS;
  }
}

export { AI_MODELS, DEFAULT_AI_MODEL_ID, TEXT_MODELS };
export { TEXT_SIMULATION_MODELS };
