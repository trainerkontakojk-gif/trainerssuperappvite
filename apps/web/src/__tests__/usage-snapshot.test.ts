import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeUsageDelta,
  pollUsageDelta,
  formatCompactIdr,
  formatUsageDeltaLabel,
  type UsageSnapshot,
} from "../lib/usage-snapshot";

describe("computeUsageDelta", () => {
  it("returns null when before is null", () => {
    expect(computeUsageDelta(null, { totalCalls: 1, totalTokens: 100, totalCostIdr: 1000 })).toBeNull();
  });

  it("returns null when after is null", () => {
    expect(computeUsageDelta({ totalCalls: 0, totalTokens: 0, totalCostIdr: 0 }, null)).toBeNull();
  });

  it("returns positive delta when after > before", () => {
    const before: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    const after: UsageSnapshot = { totalCalls: 7, totalTokens: 1500, totalCostIdr: 8000, simulationCostIdr: 5000, reviewCostIdr: 3000 };
    const delta = computeUsageDelta(before, after);
    expect(delta).toMatchObject({ totalCalls: 2, totalTokens: 500, costIdr: 3000, simulationCostIdr: 2000, reviewCostIdr: 1000 });
  });

  it("clamps negative values to 0", () => {
    const before: UsageSnapshot = { totalCalls: 10, totalTokens: 2000, totalCostIdr: 10000, simulationCostIdr: 6000, reviewCostIdr: 4000 };
    const after: UsageSnapshot = { totalCalls: 5, totalTokens: 500, totalCostIdr: 2000, simulationCostIdr: 1000, reviewCostIdr: 1000 };
    const delta = computeUsageDelta(before, after);
    expect(delta).toMatchObject({ totalCalls: 0, totalTokens: 0, costIdr: 0, simulationCostIdr: 0, reviewCostIdr: 0 });
  });

  it("handles missing simulation/review fields gracefully", () => {
    const before: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000 };
    const after: UsageSnapshot = { totalCalls: 7, totalTokens: 1500, totalCostIdr: 8000 };
    const delta = computeUsageDelta(before, after);
    expect(delta).toMatchObject({ totalCalls: 2, totalTokens: 500, costIdr: 3000, simulationCostIdr: 0, reviewCostIdr: 0 });
  });
});

describe("formatCompactIdr", () => {
  it("formats millions as jt", () => {
    expect(formatCompactIdr(1_500_000)).toBe("Rp1.5jt");
  });

  it("formats thousands as rb", () => {
    expect(formatCompactIdr(5000)).toBe("Rp5rb");
  });

  it("formats small values directly", () => {
    expect(formatCompactIdr(500)).toBe("Rp500");
  });
});

describe("formatUsageDeltaLabel", () => {
  it("formats delta with + prefix", () => {
    expect(formatUsageDeltaLabel({ costIdr: 3000, totalTokens: 100, totalCalls: 1, simulationCostIdr: 2000, reviewCostIdr: 1000 })).toBe("+Rp3rb");
  });
});

describe("pollUsageDelta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns delta when new calls are detected", async () => {
    const baseline: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    let callCount = 0;
    const fetchSummary = vi.fn(async () => {
      callCount++;
      if (callCount >= 2) {
        return { totalCalls: 7, totalTokens: 1500, totalCostIdr: 8000, simulationCostIdr: 5000, reviewCostIdr: 3000 };
      }
      return { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    });

    const promise = pollUsageDelta(fetchSummary, baseline, {
      maxRetries: 5,
      initialDelayMs: 100,
      retryDelayMs: 100,
    });

    // Advance past initial delay
    await vi.advanceTimersByTimeAsync(100);
    // First poll returns same counts
    await vi.advanceTimersByTimeAsync(100);
    // Second poll returns new counts
    await vi.advanceTimersByTimeAsync(100);

    const delta = await promise;
    expect(delta).toMatchObject({ totalCalls: 2, totalTokens: 500, costIdr: 3000, simulationCostIdr: 2000, reviewCostIdr: 1000 });
  });

  it("returns null on timeout when no new calls", async () => {
    const baseline: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    const fetchSummary = vi.fn(async () => ({
      totalCalls: 5,
      totalTokens: 1000,
      totalCostIdr: 5000,
      simulationCostIdr: 3000,
      reviewCostIdr: 2000,
    }));

    const promise = pollUsageDelta(fetchSummary, baseline, {
      maxRetries: 3,
      initialDelayMs: 50,
      retryDelayMs: 50,
    });

    // Initial delay + 3 retries * 50ms (last one doesn't sleep)
    await vi.advanceTimersByTimeAsync(50 + 50 * 3 + 10);

    const delta = await promise;
    expect(delta).toBeNull();
    expect(fetchSummary).toHaveBeenCalledTimes(3);
  });

  it("handles fetch errors gracefully", async () => {
    const baseline: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    let callCount = 0;
    const fetchSummary = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("network");
      return { totalCalls: 6, totalTokens: 1200, totalCostIdr: 6000, simulationCostIdr: 4000, reviewCostIdr: 2000 };
    });

    const promise = pollUsageDelta(fetchSummary, baseline, {
      maxRetries: 3,
      initialDelayMs: 50,
      retryDelayMs: 50,
    });

    // Initial delay
    await vi.advanceTimersByTimeAsync(50);
    // First call throws (retry)
    await vi.advanceTimersByTimeAsync(50);
    // Second call succeeds
    await vi.advanceTimersByTimeAsync(50);

    const delta = await promise;
    expect(delta).toMatchObject({ totalCalls: 1, totalTokens: 200, costIdr: 1000, simulationCostIdr: 1000, reviewCostIdr: 0 });
  });

  it("returns null when fetch returns null", async () => {
    const baseline: UsageSnapshot = { totalCalls: 5, totalTokens: 1000, totalCostIdr: 5000, simulationCostIdr: 3000, reviewCostIdr: 2000 };
    const fetchSummary = vi.fn(async () => null);

    const promise = pollUsageDelta(fetchSummary, baseline, {
      maxRetries: 2,
      initialDelayMs: 50,
      retryDelayMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50 + 50 * 2 + 10);

    const delta = await promise;
    expect(delta).toBeNull();
  });
});

describe("computeUsageDelta — simulation/review breakdown", () => {
  it("computes simulation and review cost deltas correctly", () => {
    const before: UsageSnapshot = {
      totalCalls: 10, totalTokens: 5000, totalCostIdr: 20000,
      simulationCostIdr: 12000, reviewCostIdr: 8000,
    };
    const after: UsageSnapshot = {
      totalCalls: 14, totalTokens: 7000, totalCostIdr: 28000,
      simulationCostIdr: 16000, reviewCostIdr: 12000,
    };
    const delta = computeUsageDelta(before, after);
    expect(delta).toMatchObject({
      totalCalls: 4, totalTokens: 2000, costIdr: 8000,
      simulationCostIdr: 4000, reviewCostIdr: 4000,
    });
  });

  it("returns 0 for simulation/review when not present in snapshots", () => {
    const before: UsageSnapshot = { totalCalls: 1, totalTokens: 100, totalCostIdr: 500 };
    const after: UsageSnapshot = { totalCalls: 2, totalTokens: 200, totalCostIdr: 1000 };
    const delta = computeUsageDelta(before, after);
    expect(delta).toMatchObject({
      totalCalls: 1, totalTokens: 100, costIdr: 500,
      simulationCostIdr: 0, reviewCostIdr: 0,
    });
  });
});
