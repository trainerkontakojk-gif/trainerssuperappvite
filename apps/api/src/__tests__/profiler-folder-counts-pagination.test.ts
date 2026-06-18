import { describe, it, expect, vi } from "vitest";

function buildPaginatedQuery(rows: any[]) {
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
              return resolve({ data: rows.slice(0, 1000), error: null });
            }
            return resolve({
              data: rows.filter((_, idx) => idx >= rangeFrom && idx <= rangeTo),
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
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== "profiler_peserta") {
        throw new Error(`unexpected table: ${table}`);
      }

      const rows = [
        ...Array.from({ length: 700 }, () => ({ batch_name: "Batch A" })),
        ...Array.from({ length: 800 }, () => ({ batch_name: "Batch B" })),
      ];

      return buildPaginatedQuery(rows);
    }),
    rpc: vi.fn(),
  },
  createAdminClient: vi.fn(),
}));

vi.mock("../services/leader-access-service", () => ({
  getLeaderScopeSnapshot: vi.fn(),
}));

import { getFolderCounts } from "../services/profiler-service";

describe("getFolderCounts pagination", () => {
  it("counts all folder rows past the 1000-row boundary", async () => {
    const counts = await getFolderCounts();

    expect(counts["Batch A"]).toBe(700);
    expect(counts["Batch B"]).toBe(800);
  });
});
