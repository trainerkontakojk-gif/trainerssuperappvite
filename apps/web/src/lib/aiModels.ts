import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  KETIK_PDKT_MODELS,
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
    return module === "ketik" || module === "pdkt"
      ? KETIK_PDKT_MODELS
      : AI_MODELS;
  }
}

export { AI_MODELS, DEFAULT_AI_MODEL_ID, TEXT_MODELS, KETIK_PDKT_MODELS };
export { TEXT_SIMULATION_MODELS };
