import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSidakAgentForecast } from "../services/sidak/forecast";
import * as periodService from "../services/sidak/period-indicator";
import * as accessScope from "../services/sidak/access-scope";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";

const queryCalls: Array<{ method: string; args: any[] }> = [];

const temuanRows = [
  {
    peserta_id: "agent-a",
    period_id: "p1",
    indicator_id: "ind-1",
    nilai: 1,
    service_type: "call",
    no_tiket: "A-1",
    is_phantom_padding: false,
    ketidaksesuaian: null,
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-a",
      nama: "Agent A",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
  {
    peserta_id: "agent-a",
    period_id: "p1",
    indicator_id: "ind-1",
    nilai: 1,
    service_type: "call",
    no_tiket: "A-2",
    is_phantom_padding: false,
    ketidaksesuaian: null,
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-a",
      nama: "Agent A",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
  {
    peserta_id: "agent-a",
    period_id: "p2",
    indicator_id: "ind-1",
    nilai: 2,
    service_type: "call",
    no_tiket: "A-3",
    is_phantom_padding: false,
    ketidaksesuaian: null,
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-a",
      nama: "Agent A",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
  {
    peserta_id: "agent-b",
    period_id: "p1",
    indicator_id: "ind-1",
    nilai: 3,
    service_type: "call",
    no_tiket: "B-1",
    is_phantom_padding: false,
    ketidaksesuaian: null,
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-b",
      nama: "Agent B",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
  {
    peserta_id: "agent-b",
    period_id: "p2",
    indicator_id: "ind-1",
    nilai: 1,
    service_type: "call",
    no_tiket: "B-2",
    is_phantom_padding: false,
    ketidaksesuaian: "Issue",
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-b",
      nama: "Agent B",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
  {
    peserta_id: "agent-c",
    period_id: "p1",
    indicator_id: "ind-1",
    nilai: 2,
    service_type: "call",
    no_tiket: "C-1",
    is_phantom_padding: false,
    ketidaksesuaian: null,
    sebaiknya: null,
    profiler_peserta: {
      id: "agent-c",
      nama: "Agent C",
      tim: "Tim Call",
      batch_name: "Tim Call",
      jabatan: "spv",
      foto_url: null,
    },
  },
];

const temuanQuery = {
  select: vi.fn(() => temuanQuery),
  eq: vi.fn((...args: any[]) => {
    queryCalls.push({ method: "eq", args });
    return temuanQuery;
  }),
  in: vi.fn((...args: any[]) => {
    queryCalls.push({ method: "in", args });
    return temuanQuery;
  }),
  order: vi.fn((...args: any[]) => {
    queryCalls.push({ method: "order", args });
    return temuanQuery;
  }),
  range: vi.fn(async () => ({ data: temuanRows, error: null })),
};

const weightsQuery = {
  select: vi.fn(async () => ({
    data: [
      {
        service_type: "call",
        critical_weight: 0.5,
        non_critical_weight: 0.5,
        scoring_mode: "weighted",
      },
    ],
    error: null,
  })),
};

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) =>
      table === "qa_service_weights" ? weightsQuery : temuanQuery,
    ),
  },
}));

vi.mock("../lib/supabase-pagination", () => ({
  fetchAllPages: vi.fn(async ({ build }) => {
    const result = await build({ from: 0, to: 999 });
    return result.data ?? [];
  }),
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getPeriods: vi.fn(),
  getIndicators: vi.fn(),
}));

vi.mock("../services/sidak/access-scope", () => ({
  resolveFolderFiltersByIds: vi.fn(),
}));

describe("sidak agent forecast service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls.length = 0;

    vi.mocked(periodService.getPeriods).mockResolvedValue([
      { id: "p1", month: 1, year: 2026, label: "Jan 26", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "p2", month: 2, year: 2026, label: "Feb 26", created_at: "2026-02-01T00:00:00.000Z" },
      { id: "p3", month: 3, year: 2026, label: "Mar 26", created_at: "2026-03-01T00:00:00.000Z" },
    ] as any);
    vi.mocked(periodService.getIndicators).mockResolvedValue([
      {
        id: "ind-1",
        service_type: "call",
        name: "Greeting",
        category: "critical",
        bobot: 1,
        has_na: false,
      },
    ] as any);
    vi.mocked(accessScope.resolveFolderFiltersByIds).mockResolvedValue({
      selectedFolders: [],
      filterNames: [],
    });
  });

  it("classifies score increase and lower findings as improving", async () => {
    const result = await generateSidakAgentForecast({
      request: {
        year: 2026,
        serviceType: "call",
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-a", "agent-b", "agent-c"],
    });

    expect(result.improvingAgents.map((entry) => entry.nama)).toContain(
      "Agent A",
    );
    expect(result.decliningAgents.map((entry) => entry.nama)).toContain(
      "Agent B",
    );
    expect(result.watchlistAgents.map((entry) => entry.nama)).toContain(
      "Agent C",
    );
    expect(result.improvingAgents[0]?.forecastStatus).toBe("improving");
    expect(result.decliningAgents[0]?.forecastStatus).toBe("declining");
  });

  it("marks a one-period agent as insufficient_data", async () => {
    vi.mocked(fetchAllPages).mockResolvedValueOnce([
      temuanRows[0],
      temuanRows[2],
      temuanRows[4],
    ] as any);

    const result = await generateSidakAgentForecast({
      request: {
        year: 2026,
        serviceType: "call",
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-a", "agent-c"],
    });

    expect(result.watchlistAgents).toHaveLength(1);
    expect(
      result.watchlistAgents.every(
        (entry) => entry.forecastStatus === "insufficient_data",
      ),
    ).toBe(true);
  });

  it("forwards service, folder, month, and access filters to the query", async () => {
    vi.mocked(accessScope.resolveFolderFiltersByIds).mockResolvedValueOnce({
      selectedFolders: [],
      filterNames: ["Tim Call"],
    } as any);

    await generateSidakAgentForecast({
      request: {
        year: 2026,
        serviceType: "call",
        folderIds: ["11111111-1111-1111-1111-111111111111"],
        startMonth: 1,
        endMonth: 2,
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-a"],
    });

    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "eq",
          args: ["tahun", 2026],
        }),
        expect.objectContaining({
          method: "eq",
          args: ["service_type", "call"],
        }),
        expect.objectContaining({
          method: "in",
          args: ["profiler_peserta.batch_name", ["Tim Call"]],
        }),
        expect.objectContaining({
          method: "in",
          args: ["peserta_id", ["agent-a"]],
        }),
      ]),
    );
  });
});
