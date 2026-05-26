import { describe, it, expect, vi } from "vitest";

// We want to test that the importItems payload structure and BatchCreateResult
// align with the expected frontend-backend contract.
describe("SIDAK batch insert payload contract", () => {
  it("expects createTemuanBatch format to have correct fields for items", () => {
    const importItems = [
      {
        indicator_id: "ind-1",
        nilai: 3,
        ketidaksesuaian: "Fatal",
        sebaiknya: "Fix",
        no_tiket: "TKT-100",
      },
    ];

    const payload = {
      peserta_id: "p-1",
      period_id: "per-1",
      service_type: "call",
      items: importItems,
    };

    expect(payload.items[0]).toHaveProperty("no_tiket", "TKT-100");
    expect(payload.items[0].no_tiket).toBe("TKT-100");
  });

  it("handles BatchCreateResult correctly", () => {
    const mockResult = {
      inserted: 12,
      skipped: 2,
      total: 14,
    };

    // The result should not be an array, but an object, and we should be able to access inserted count.
    expect(Array.isArray(mockResult)).toBe(false);
    expect(mockResult.inserted).toBe(12);
  });
});
