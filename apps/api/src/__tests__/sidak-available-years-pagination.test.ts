import { beforeEach, describe, expect, it, vi } from "vitest";

let queryError: { message: string } | null = null;
const yearRows = Array.from({ length: 1101 }, (_, index) => ({
  tahun: index < 1000 ? 2026 : 2025,
}));

function buildPaginatedQuery() {
  const state = {
    rangeFrom: 0,
    rangeTo: Number.MAX_SAFE_INTEGER,
  };
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            if (queryError) return resolve({ data: null, error: queryError });
            return resolve({
              data: yearRows.filter(
                (_, idx) => idx >= state.rangeFrom && idx <= state.rangeTo,
              ),
              error: null,
            });
          };
        }
        if (prop === "range") {
          return (from: number, to: number) => {
            state.rangeFrom = from;
            state.rangeTo = to;
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
    from: vi.fn(() => buildPaginatedQuery()),
  },
  createAdminClient: vi.fn(),
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getIndicators: vi.fn().mockResolvedValue([]),
  getPeriods: vi.fn().mockResolvedValue([]),
}));

import { getAvailableYears } from "../services/sidak/service-trends";

describe("getAvailableYears pagination", () => {
  beforeEach(() => {
    queryError = null;
  });

  it("returns years from every page beyond the 1000-row boundary", async () => {
    await expect(getAvailableYears()).resolves.toEqual([2026, 2025]);
  });

  it("throws when the paginated query fails", async () => {
    queryError = { message: "years query failed" };

    await expect(getAvailableYears()).rejects.toThrow("years query failed");
  });
});
