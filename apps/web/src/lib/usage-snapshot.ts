export interface UsageBreakdownItem {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costIdr: number;
  costUsd: number;
}

export interface UsageBreakdown {
  simulation: UsageBreakdownItem;
  review: UsageBreakdownItem;
  uncategorized: UsageBreakdownItem;
}

export function emptyUsageBreakdown(): UsageBreakdown {
  const emptyItem = (): UsageBreakdownItem => ({
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costIdr: 0,
    costUsd: 0,
  });
  return {
    simulation: emptyItem(),
    review: emptyItem(),
    uncategorized: emptyItem(),
  };
}

export interface UsageSnapshot {
  totalCalls: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens: number;
  totalCostIdr: number;
  simulationCostIdr?: number;
  reviewCostIdr?: number;
  periodLabel?: string;
  breakdown?: UsageBreakdown;
}

export interface UsageDelta {
  costIdr: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCalls: number;
  simulationCostIdr: number;
  reviewCostIdr: number;
  breakdown: UsageBreakdown;
}

export function computeUsageDelta(
  before: UsageSnapshot | null | undefined,
  after: UsageSnapshot | null | undefined,
): UsageDelta | null {
  if (!before || !after) return null;

  const calcBucketDelta = (
    cat: keyof UsageBreakdown,
  ): UsageBreakdownItem => {
    const bBefore = before.breakdown?.[cat];
    const bAfter = after.breakdown?.[cat];
    return {
      calls: Math.max(0, (bAfter?.calls ?? 0) - (bBefore?.calls ?? 0)),
      inputTokens: Math.max(0, (bAfter?.inputTokens ?? 0) - (bBefore?.inputTokens ?? 0)),
      outputTokens: Math.max(0, (bAfter?.outputTokens ?? 0) - (bBefore?.outputTokens ?? 0)),
      totalTokens: Math.max(0, (bAfter?.totalTokens ?? 0) - (bBefore?.totalTokens ?? 0)),
      costIdr: Math.max(0, (bAfter?.costIdr ?? 0) - (bBefore?.costIdr ?? 0)),
      costUsd: Math.max(0, (bAfter?.costUsd ?? 0) - (bBefore?.costUsd ?? 0)),
    };
  };

  return {
    costIdr: Math.max(0, after.totalCostIdr - before.totalCostIdr),
    inputTokens: Math.max(0, (after.totalInputTokens ?? 0) - (before.totalInputTokens ?? 0)),
    outputTokens: Math.max(0, (after.totalOutputTokens ?? 0) - (before.totalOutputTokens ?? 0)),
    totalTokens: Math.max(0, after.totalTokens - before.totalTokens),
    totalCalls: Math.max(0, after.totalCalls - before.totalCalls),
    simulationCostIdr: Math.max(0, (after.simulationCostIdr ?? 0) - (before.simulationCostIdr ?? 0)),
    reviewCostIdr: Math.max(0, (after.reviewCostIdr ?? 0) - (before.reviewCostIdr ?? 0)),
    breakdown: {
      simulation: calcBucketDelta("simulation"),
      review: calcBucketDelta("review"),
      uncategorized: calcBucketDelta("uncategorized"),
    },
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

export function formatUsageDeltaLabel<T extends { costIdr: number }>(
  delta: T,
): string {
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
