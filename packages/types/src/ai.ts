import type { AIProvider } from "./ai-models";

export type AIModule = "ketik" | "pdkt" | "telefun" | "qa-analyzer";

export interface AiUsageLog {
  id: string;
  request_id: string;
  user_id: string;
  provider: AIProvider;
  model_id: string;
  module: AIModule;
  action: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
  usd_to_idr_rate: number;
  estimated_cost_usd: number;
  estimated_cost_idr: number;
  created_at: string;
}
