import {
  AI_MODELS,
  TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS,
  TELEFUN_LIVE_MODELS,
} from "@trainers/types";
import type { UsageAggregation } from "../../../../lib/api";
import { USAGE_MODULE_LABELS } from "../../biaya-search";

export type UsageModelRow = UsageAggregation["models"][number];

export interface UsageTotals {
  cost: number;
  simulation: number;
  review: number;
  other: number;
  calls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
}

export function sumUsage(rows: readonly UsageAggregation[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (acc, row) => ({
      cost: acc.cost + row.total_cost_idr,
      simulation: acc.simulation + (row.simulation_cost_idr || 0),
      review: acc.review + (row.review_cost_idr || 0),
      other: acc.other + (row.other_cost_idr || 0),
      calls: acc.calls + row.total_calls,
      tokens: acc.tokens + row.total_tokens,
      inputTokens: acc.inputTokens + row.total_input_tokens,
      outputTokens: acc.outputTokens + row.total_output_tokens,
    }),
    {
      cost: 0,
      simulation: 0,
      review: 0,
      other: 0,
      calls: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  );
}

/** Baris per model + modul + jenis biaya, gabungan semua orang, termahal dulu. */
export function usageByModel(
  rows: readonly UsageAggregation[],
): UsageModelRow[] {
  const map = new Map<string, UsageModelRow>();
  for (const row of rows) {
    for (const m of row.models) {
      const key = `${m.model_id}|${m.module}|${m.action_category}`;
      const existing = map.get(key);
      if (existing) {
        existing.calls += m.calls;
        existing.input_tokens += m.input_tokens;
        existing.output_tokens += m.output_tokens;
        existing.total_tokens += m.total_tokens;
        existing.cost_idr += m.cost_idr;
      } else {
        map.set(key, { ...m });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.cost_idr - a.cost_idr);
}

const MODEL_NAMES = new Map<string, string>(
  [
    ...AI_MODELS,
    ...TELEFUN_LIVE_MODELS,
    ...TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS,
  ].map((model) => [model.id, model.name]),
);

export function usageModelName(modelId: string): string | null {
  return MODEL_NAMES.get(modelId) ?? null;
}

export function usageModuleLabel(module: string): string {
  return (
    USAGE_MODULE_LABELS[module as keyof typeof USAGE_MODULE_LABELS] ?? module
  );
}

export const CATEGORY_LABELS: Record<UsageModelRow["action_category"], string> =
  {
    simulation: "Simulasi",
    review: "Penilaian",
    other: "Lainnya",
  };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  trainer: "Trainer",
  leader: "Leader",
  agent: "Agent",
};

export function usageRoleLabel(role: string | null): string {
  if (!role) return "-";
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

/** Angka 0 ditulis "-" supaya kolom yang kosong mudah dilewati mata. */
export function formatRupiahCell(value: number): string {
  return value > 0 ? Math.round(value).toLocaleString("id-ID") : "-";
}

export function formatCount(value: number): string {
  return value.toLocaleString("id-ID");
}
