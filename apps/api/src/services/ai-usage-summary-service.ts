import { SupabaseClient } from "@supabase/supabase-js";
import {
  getUsageActionDefinition,
  isUsageActionInCategory,
  type UsageCategory,
} from "../lib/ai-usage-categories";
import { fetchAllPages } from "../lib/supabase-pagination";

interface UsageBreakdownItem {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costIdr: number;
  costUsd: number;
}

interface UsageBreakdownItemized extends UsageBreakdownItem {
  key: string;
  label: string;
  category: UsageCategory;
}

function emptyUsageBreakdownItem(): UsageBreakdownItem {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costIdr: 0, costUsd: 0 };
}

export async function getAiUsageSummary(params: {
  admin: SupabaseClient;
  userId: string;
  module: string;
  startIso: string;
  endIso: string;
  year: number;
  month: number;
  periodLabel: string;
}) {
  const logs = await fetchAllPages<any>({
    build: ({ from, to }) =>
      params.admin
        .from("ai_usage_logs")
        .select(
          "action, input_tokens, output_tokens, total_tokens, estimated_cost_usd, estimated_cost_idr",
        )
        .eq("user_id", params.userId)
        .eq("module", params.module)
        .gte("created_at", params.startIso)
        .lte("created_at", params.endIso)
        .order("id", { ascending: true })
        .range(from, to),
  });

  const totalCalls = logs.length;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalCostIdr = 0;
  let simulationCostIdr = 0;
  let reviewCostIdr = 0;

  const breakdown = {
    simulation: emptyUsageBreakdownItem(),
    review: emptyUsageBreakdownItem(),
    uncategorized: emptyUsageBreakdownItem(),
  };
  const itemMap = new Map<string, UsageBreakdownItemized>();

  for (const log of logs) {
    const inputTokens = log.input_tokens || 0;
    const outputTokens = log.output_tokens || 0;
    const tokens = log.total_tokens || 0;
    const costUsd = Number(log.estimated_cost_usd || 0);
    const costIdr = Number(log.estimated_cost_idr || 0);
    const definition = getUsageActionDefinition(log.action);
    const bucket = breakdown[definition.category];

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalTokens += tokens;
    totalCostUsd += costUsd;
    totalCostIdr += costIdr;

    bucket.calls += 1;
    bucket.inputTokens += inputTokens;
    bucket.outputTokens += outputTokens;
    bucket.totalTokens += tokens;
    bucket.costUsd += costUsd;
    bucket.costIdr += costIdr;

    if (isUsageActionInCategory(log.action, "simulation")) simulationCostIdr += costIdr;
    if (isUsageActionInCategory(log.action, "review")) reviewCostIdr += costIdr;

    const item = itemMap.get(definition.itemKey) || {
      key: definition.itemKey,
      label: definition.itemLabel,
      category: definition.category,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costIdr: 0,
      costUsd: 0,
    };
    item.calls += 1;
    item.inputTokens += inputTokens;
    item.outputTokens += outputTokens;
    item.totalTokens += tokens;
    item.costUsd += costUsd;
    item.costIdr += costIdr;
    itemMap.set(definition.itemKey, item);
  }

  return {
    module: params.module,
    year: params.year,
    month: params.month,
    periodLabel: params.periodLabel,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCostUsd,
    totalCostIdr,
    simulationCostIdr,
    reviewCostIdr,
    breakdown,
    breakdownItems: Array.from(itemMap.values()).filter(
      (item) => item.calls > 0 || item.totalTokens > 0 || item.costIdr > 0,
    ),
  };
}
