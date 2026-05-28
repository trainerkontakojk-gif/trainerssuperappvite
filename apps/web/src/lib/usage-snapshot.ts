export interface UsageSnapshot {
  totalCalls: number;
  totalTokens: number;
  totalCostIdr: number;
  periodLabel?: string;
}

export interface UsageDelta {
  costIdr: number;
  totalTokens: number;
  totalCalls: number;
}

export function computeUsageDelta(
  before: UsageSnapshot | null | undefined,
  after: UsageSnapshot | null | undefined,
): UsageDelta | null {
  if (!before || !after) return null;
  return {
    costIdr: Math.max(0, after.totalCostIdr - before.totalCostIdr),
    totalTokens: Math.max(0, after.totalTokens - before.totalTokens),
    totalCalls: Math.max(0, after.totalCalls - before.totalCalls),
  };
}

export function formatCompactIdr(value: number): string {
  if (value >= 1_000_000) {
    return `Rp${(value / 1_000_000).toFixed(1)}jt`;
  }
  if (value >= 1_000) {
    return `Rp${(value / 1_000).toFixed(0)}rb`;
  }
  return `Rp${value}`;
}

export function formatUsageDeltaLabel(delta: UsageDelta): string {
  return `+${formatCompactIdr(delta.costIdr)}`;
}
