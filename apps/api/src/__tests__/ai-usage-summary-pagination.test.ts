import { describe, it, expect } from "vitest";

import { getAiUsageSummary } from "../services/ai-usage-summary-service";

function buildPaginatedAdmin(logs: any[]) {
  return {
    from: (table: string) => {
      if (table !== "ai_usage_logs") {
        throw new Error(`unexpected table: ${table}`);
      }

      let rangeFrom = 0;
      let rangeTo = Number.MAX_SAFE_INTEGER;
      let usedRange = false;

      const q: any = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: any) => {
                if (!usedRange) {
                  return resolve({ data: logs.slice(0, 1000), error: null });
                }
                return resolve({
                  data: logs.filter((_, idx) => idx >= rangeFrom && idx <= rangeTo),
                  error: null,
                });
              };
            }
            if (prop === "range") {
              return (from: number, to: number) => {
                usedRange = true;
                rangeFrom = from;
                rangeTo = to;
                return q;
              };
            }
            return (..._args: any[]) => q;
          },
        },
      );

      return q;
    },
  };
}

describe("getAiUsageSummary pagination", () => {
  it("aggregates logs across all pages", async () => {
    const logs = Array.from({ length: 1101 }, (_, i) => ({
      action: "chat_response",
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      estimated_cost_usd: 0.001,
      estimated_cost_idr: 15,
      id: i + 1,
    }));

    const summary = await getAiUsageSummary({
      admin: buildPaginatedAdmin(logs) as any,
      userId: "user-1",
      module: "ketik",
      startIso: "2026-01-01T00:00:00Z",
      endIso: "2026-01-31T23:59:59Z",
      year: 2026,
      month: 1,
      periodLabel: "Jan 2026",
    });

    expect(summary.totalCalls).toBe(1101);
    expect(summary.totalTokens).toBe(33030);
    expect(summary.totalCostIdr).toBe(16515);
  });
});
