import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRankingData } from "../services/sidak-ranking-service";
import * as sidakService from "../services/sidak-service";

// ─── Supabase Mock ─────────────────────────────────────────────────────────────
let profilerFoldersResult = {
  data: [{ id: "folder-1", name: "Folder A" }],
  error: null as null | { message: string },
};

function buildQuery(onAwait: () => any) {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      if (tableName === "profiler_folders") {
        return buildQuery(() => profilerFoldersResult);
      }
      return buildQuery(() => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

vi.mock("../services/sidak-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/sidak-service")>();
  return {
    ...original,
    getPeriods: vi.fn().mockResolvedValue([{ id: "uuid-1234", year: 2026, month: 5, label: "05/2026" }]),
    getAvailableYears: vi.fn().mockResolvedValue([2026]),
    getDashboardData: vi.fn().mockResolvedValue({
      periods: [],
      folders: [],
      summary: {},
      serviceData: [],
      topAgents: [
        { agentId: "agent-a", nama: "Agent A", score: 90, defects: 0 },
      ],
      paretoData: [],
      donutData: { critical: 0, nonCritical: 0, total: 0 },
      availableServices: ["call", "chat"],
    }),
  };
});

describe("Sidak Ranking Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profilerFoldersResult = {
      data: [{ id: "folder-1", name: "Folder A" }],
      error: null,
    };
  });

  it("fetches ranking data correctly for alltime", async () => {
    const data = await getRankingData({
      period: "alltime",
      service_type: "call",
      year: 2026,
      folder: "ALL",
      accessibleIds: null,
      filterScope: null,
    });

    expect(data.rankings).toBeDefined();
    expect(data.availableServices).toContain("call");
    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: undefined,
        year: undefined,
        service_type: "call",
      })
    );
  });

  it("fetches ranking data with YTD specific query", async () => {
    const data = await getRankingData({
      period: "ytd",
      service_type: "chat",
      year: 2026,
      folder: "folder-1",
      accessibleIds: ["agent-1"],
      filterScope: null,
    });

    expect(data.rankings).toBeDefined();
    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: undefined,
        year: 2026,
        service_type: "chat",
        folder_ids: ["folder-1"],
        agent_ids: ["agent-1"],
      })
    );
  });

  it("throws when the folder metadata query fails", async () => {
    profilerFoldersResult = {
      data: null as any,
      error: { message: "folder query failed" },
    };

    await expect(
      getRankingData({
        period: "alltime",
        service_type: "call",
        year: 2026,
        folder: "ALL",
        accessibleIds: null,
        filterScope: null,
      }),
    ).rejects.toThrow("folder query failed");
  });
});
