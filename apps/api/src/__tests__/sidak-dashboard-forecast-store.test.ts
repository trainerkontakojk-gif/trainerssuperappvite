import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasForecastSnapshotForFilter } from "../services/sidak/dashboard-forecast-store";
import { createAdminClient } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(),
}));

describe("hasForecastSnapshotForFilter", () => {
  const maybeSingle = vi.fn();
  const limit = vi.fn(() => ({ maybeSingle }));
  const eq2 = vi.fn(() => ({ limit }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockReturnValue({ from } as any);
  });

  it("detects any prior snapshot for the same filter and horizon", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "snapshot-1" }, error: null });

    await expect(
      hasForecastSnapshotForFilter({
        filterKey: "filter-a",
        horizonMonths: 3,
      }),
    ).resolves.toBe(true);

    expect(eq1).toHaveBeenCalledWith("filter_key", "filter-a");
    expect(eq2).toHaveBeenCalledWith("horizon_months", 3);
  });

  it("returns false when the filter has never been forecast", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      hasForecastSnapshotForFilter({
        filterKey: "filter-a",
        horizonMonths: 3,
      }),
    ).resolves.toBe(false);
  });

  it("surfaces a human-readable lookup error", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      hasForecastSnapshotForFilter({
        filterKey: "filter-a",
        horizonMonths: 3,
      }),
    ).rejects.toThrow("Gagal memeriksa snapshot prediksi");
  });
});
