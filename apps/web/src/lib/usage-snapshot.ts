export interface UsageSnapshot {
  totalCalls: number;
  totalTokens: number;
  totalCostIdr: number;
  simulationCostIdr?: number;
  reviewCostIdr?: number;
  periodLabel?: string;
}

export interface UsageDelta {
  costIdr: number;
  totalTokens: number;
  totalCalls: number;
  simulationCostIdr: number;
  reviewCostIdr: number;
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
    simulationCostIdr: Math.max(0, (after.simulationCostIdr ?? 0) - (before.simulationCostIdr ?? 0)),
    reviewCostIdr: Math.max(0, (after.reviewCostIdr ?? 0) - (before.reviewCostIdr ?? 0)),
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

interface PollOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  retryDelayMs?: number;
}

/**
 * Polls the usage summary endpoint and computes a delta against a baseline.
 * Returns the delta once new calls are detected, or null on timeout.
 */
export async function pollUsageDelta(
  fetchSummary: () => Promise<UsageSnapshot | null>,
  baseline: UsageSnapshot,
  options?: PollOptions,
): Promise<UsageDelta | null> {
  const {
    maxRetries = 15,
    initialDelayMs = 2000,
    retryDelayMs = 2000,
  } = options ?? {};

  await sleep(initialDelayMs);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const after = await fetchSummary();
      if (after && after.totalCalls > baseline.totalCalls) {
        return computeUsageDelta(baseline, after);
      }
    } catch {
      // ignore and retry
    }
    if (i < maxRetries - 1) {
      await sleep(retryDelayMs);
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
