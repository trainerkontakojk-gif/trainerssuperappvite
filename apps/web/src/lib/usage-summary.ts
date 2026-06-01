import { getApi } from "../hooks/useApi";
import {
  type UsageBreakdown,
  type UsageSnapshot,
  emptyUsageBreakdown,
} from "./usage-snapshot";

export type UsageModule = "ketik" | "pdkt" | "telefun";

interface UsageSummaryApiResponse {
  totalCalls?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  totalCostIdr?: number;
  simulationCostIdr?: number;
  reviewCostIdr?: number;
  periodLabel?: string;
  breakdown?: UsageBreakdown;
}

export async function fetchUsageSummary(module: UsageModule): Promise<UsageSnapshot | null> {
  try {
    const data = await getApi<UsageSummaryApiResponse>(`/ai/usage/summary?module=${module}`);
    if (!data) return null;

    return {
      totalCalls: data.totalCalls || 0,
      totalInputTokens: data.totalInputTokens || 0,
      totalOutputTokens: data.totalOutputTokens || 0,
      totalTokens: data.totalTokens || 0,
      totalCostIdr: data.totalCostIdr || 0,
      simulationCostIdr: data.simulationCostIdr || 0,
      reviewCostIdr: data.reviewCostIdr || 0,
      periodLabel: data.periodLabel || undefined,
      breakdown: data.breakdown || emptyUsageBreakdown(),
    };
  } catch (err) {
    return null;
  }
}
