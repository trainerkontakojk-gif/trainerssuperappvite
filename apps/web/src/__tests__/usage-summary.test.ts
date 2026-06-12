import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchUsageSummary } from "../lib/usage-summary";
import { emptyUsageBreakdown } from "../lib/usage-snapshot";

const mockGet = vi.fn();

vi.mock("../lib/api", () => ({
  aiClient: {
    usage: {
      summary: {
        $get: (...args: unknown[]) => mockGet(...args),
      },
    },
  },
  unwrapResponse: (x: any) => x,
}));

describe("fetchUsageSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes old API shape with empty breakdown", async () => {
    mockGet.mockResolvedValueOnce({
      totalCalls: 5,
      totalTokens: 1000,
      totalCostIdr: 5000,
      simulationCostIdr: 3000,
      reviewCostIdr: 2000,
    });

    const result = await fetchUsageSummary("ketik");
    expect(result).toEqual({
      totalCalls: 5,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 1000,
      totalCostIdr: 5000,
      simulationCostIdr: 3000,
      reviewCostIdr: 2000,
      periodLabel: undefined,
      breakdown: emptyUsageBreakdown(),
      breakdownItems: [],
    });
  });

  it("returns new API shape correctly", async () => {
    const mockBreakdown = emptyUsageBreakdown();
    mockBreakdown.review.calls = 1;
    mockBreakdown.review.costIdr = 0;
    mockBreakdown.review.totalTokens = 100;

    mockGet.mockResolvedValueOnce({
      totalCalls: 1,
      totalTokens: 100,
      totalCostIdr: 0,
      breakdown: mockBreakdown,
    });

    const result = await fetchUsageSummary("pdkt");
    expect(result?.breakdown?.review.calls).toBe(1);
    expect(result?.breakdown?.review.costIdr).toBe(0);
  });

  it("normalizes itemized breakdown from API", async () => {
    mockGet.mockResolvedValueOnce({
      totalCalls: 3,
      totalTokens: 1500,
      totalCostIdr: 9000,
      breakdownItems: [
        {
          key: "pdkt_create_email",
          label: "Create Email",
          category: "simulation",
          calls: 1,
          inputTokens: 100,
          outputTokens: 300,
          totalTokens: 400,
          costIdr: 1500,
          costUsd: 0.001,
        },
      ],
    });

    const result = await fetchUsageSummary("pdkt");

    expect(result?.breakdownItems).toEqual([
      expect.objectContaining({ key: "pdkt_create_email", label: "Create Email", costIdr: 1500 }),
    ]);
  });

  it("returns null on fetch error", async () => {
    mockGet.mockRejectedValueOnce(new Error("Network Error"));
    const result = await fetchUsageSummary("telefun");
    expect(result).toBeNull();
  });
});
