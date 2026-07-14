import { describe, it, expect, vi, beforeEach } from "vitest";

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: any) => resolve(onAwait());
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: () => any = () => ({ data: [], error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildQuery(() => pendingResolve())),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
  },
  createAdminClient: vi.fn(),
}));

import * as profilerService from "../services/profiler-service";

describe("getUpcomingBirthdays", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  it("returns top 5 nearest birthdays sorted ascending by daysUntil", async () => {
    const base = new Date();
    const mk = (id: string, offsetDays: number) => {
      const d = new Date(base);
      d.setDate(d.getDate() + offsetDays);
      // build a dob whose next birthday is offsetDays away
      const dob = new Date(d.getFullYear() - 30, d.getMonth(), d.getDate());
      return {
        id,
        nama: `Agent ${id}`,
        tgl_lahir: dob.toISOString().slice(0, 10),
        batch_name: "Batch A",
      };
    };

    const rows = [
      mk("a", 10),
      mk("b", 2),
      mk("c", 50),
      mk("d", 1),
      mk("e", 200),
      mk("f", 5),
      mk("g", 300),
    ];
    pendingResolve = () => ({ data: rows, error: null });

    const result = await profilerService.getUpcomingBirthdays(5, null);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(["d", "b", "f", "a", "c"]);
    // daysUntil strictly ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].daysUntil).toBeGreaterThanOrEqual(result[i - 1].daysUntil);
    }
    // age computed
    expect(result[0].age).toBeGreaterThan(0);
  });

  it("ignores rows with null tgl_lahir", async () => {
    pendingResolve = () => ({
      data: [
        { id: "x", nama: "NoDate", tgl_lahir: null, batch_name: "B" },
        {
          id: "y",
          nama: "HasDate",
          tgl_lahir: new Date().toISOString().slice(0, 10),
          batch_name: "B",
        },
      ],
      error: null,
    });

    const result = await profilerService.getUpcomingBirthdays(5, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("y");
  });

  it("respects scope when accessibleIds is empty", async () => {
    pendingResolve = () => ({ data: [{ id: "z", nama: "Z", tgl_lahir: "2000-01-01", batch_name: "B" }], error: null });
    const result = await profilerService.getUpcomingBirthdays(5, []);
    expect(result).toHaveLength(0);
  });
});
