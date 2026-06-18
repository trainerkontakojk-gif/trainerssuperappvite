import { describe, it, expect } from "vitest";
import { fetchAllPages } from "../supabase-pagination";

function makeFakeQuery(rows: any[][]) {
  return (range: { from: number; to: number }) => {
    const idx = Math.floor(range.from / 1000);
    return Promise.resolve({ data: rows[idx] ?? [], error: null });
  };
}

describe("fetchAllPages", () => {
  it("returns all rows when total < pageSize", async () => {
    const rows = await fetchAllPages({
      build: makeFakeQuery([[{ id: 1 }, { id: 2 }]]),
      pageSize: 1000,
    });
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("loops across multiple pages when total > pageSize", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 1001 }, { id: 1002 }];
    const rows = await fetchAllPages({
      build: makeFakeQuery([page1, page2]),
      pageSize: 1000,
    });
    expect(rows).toHaveLength(1002);
    expect(rows[0].id).toBe(1);
    expect(rows[1000].id).toBe(1001);
    expect(rows[1001].id).toBe(1002);
  });

  it("stops when page returns fewer than pageSize rows", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 1001 }];
    const rows = await fetchAllPages({
      build: makeFakeQuery([page1, page2]),
      pageSize: 1000,
    });
    expect(rows).toHaveLength(1001);
  });

  it("stops when page returns empty array (defensive)", async () => {
    const rows = await fetchAllPages({
      build: makeFakeQuery([[]]),
      pageSize: 1000,
    });
    expect(rows).toEqual([]);
  });

  it("throws when query returns error", async () => {
    const build = () => Promise.resolve({ data: null, error: new Error("boom") });
    await expect(fetchAllPages({ build, pageSize: 1000 })).rejects.toThrow("boom");
  });

  it("handles exact multiple of pageSize (does not stop too early)", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const rows = await fetchAllPages({
      build: makeFakeQuery([page, page, []]),
      pageSize: 1000,
    });
    expect(rows).toHaveLength(2000);
  });
});
