import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SidakAgentForecastEntry,
  SidakAgentForecastResponse,
  SidakAgentQuickviewResponse,
  TopAgentData,
} from "@trainers/types";
import {
  getSidakAgentQuickview,
  type GetSidakAgentQuickviewParams,
} from "../services/sidak/agent-quickview";
import { getDashboardData } from "../services/sidak/dashboard-data";
import { generateSidakAgentForecast } from "../services/sidak/forecast";
import {
  getAllFolders,
  resolveScopedServiceType,
} from "../services/sidak/access-scope";

const { participantState, supabaseFrom } = vi.hoisted(() => ({
  participantState: {
    data: {
      id: "agent-1",
      batch_name: "Leader Dimas",
      tim: "Tim Call",
    } as {
      id: string;
      batch_name: string;
      tim: string;
    } | null,
    error: null as { message: string } | null,
  },
  supabaseFrom: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: supabaseFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => participantState),
        })),
      })),
    })),
  },
}));

vi.mock("../services/sidak/dashboard-data", () => ({
  getDashboardData: vi.fn(),
}));

vi.mock("../services/sidak/forecast", () => ({
  generateSidakAgentForecast: vi.fn(),
}));

vi.mock("../services/sidak/access-scope", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../services/sidak/access-scope")>();
  return {
    ...original,
    getAllFolders: vi.fn(),
    resolveScopedServiceType: vi.fn((requested) => requested ?? "call"),
  };
});

const folders = [
  { id: "parent-call", name: "Tim Call", parent_id: null },
  { id: "leader-dimas", name: "Leader Dimas", parent_id: "parent-call" },
];

const rankedParentWorstFirst: TopAgentData[] = [
  {
    agentId: "agent-3",
    nama: "Agent 3",
    batch: "Leader Lain",
    defects: 5,
    score: 75,
    hasCritical: true,
  },
  {
    agentId: "agent-2",
    nama: "Agent 2",
    batch: "Leader Lain",
    defects: 3,
    score: 85,
    hasCritical: false,
  },
  {
    agentId: "agent-1",
    nama: "Agent 1",
    batch: "Leader Dimas",
    defects: 1,
    score: 90,
    hasCritical: false,
  },
];

const rankedLeaderWorstFirst: TopAgentData[] = [
  {
    agentId: "agent-4",
    nama: "Agent 4",
    batch: "Leader Dimas",
    defects: 4,
    score: 80,
    hasCritical: true,
  },
  {
    agentId: "agent-1",
    nama: "Agent 1",
    batch: "Leader Dimas",
    defects: 1,
    score: 90,
    hasCritical: false,
  },
];

function forecastEntry(
  forecastStatus: SidakAgentForecastEntry["forecastStatus"],
  overrides: Partial<SidakAgentForecastEntry> = {},
): SidakAgentForecastEntry {
  return {
    agentId: "agent-1",
    nama: "Agent 1",
    tim: "Tim Call",
    batchName: "Leader Dimas",
    jabatan: null,
    foto_url: null,
    latestPeriodLabel: "Mei 26",
    latestScore: 90,
    latestFindingsCount: 1,
    latestCriticalFindingsCount: 0,
    projectedScore: 92,
    projectedScoreChange: 2,
    projectedFindings: 0,
    projectedFindingsChange: -1,
    findingsSlope: -1.25,
    projectedCriticalFindings: 0,
    projectedCriticalFindingsChange: 0,
    sourcePointCount: 5,
    forecastStatus,
    confidence: "high",
    historical: [],
    ...overrides,
  };
}

function forecastResponse(
  entry: SidakAgentForecastEntry | null,
): SidakAgentForecastResponse {
  const response: SidakAgentForecastResponse = {
    improvingAgents: [],
    decliningAgents: [],
    stableAgents: [],
    watchlistAgents: [],
    summary: {
      totalEligible: entry ? 1 : 0,
      improvingCount: 0,
      decliningCount: 0,
      stableCount: 0,
      watchlistCount: 0,
      latestPeriodLabel: "Mei 26",
    },
  };

  if (!entry) return response;
  const target =
    entry.forecastStatus === "improving"
      ? response.improvingAgents
      : entry.forecastStatus === "declining"
        ? response.decliningAgents
        : entry.forecastStatus === "stable"
          ? response.stableAgents
          : response.watchlistAgents;
  target.push(entry);
  return response;
}

function mockDashboardByFolder(
  agentsByFolder: Record<string, TopAgentData[]>,
): void {
  vi.mocked(getDashboardData).mockImplementation(
    async (params) =>
      ({
        topAgents: agentsByFolder[params.folder_ids?.[0] ?? ""] ?? [],
      }) as Awaited<ReturnType<typeof getDashboardData>>,
  );
}

const baseParams = {
  agentId: "agent-1",
  year: 2026,
  requestedServiceType: "call" as const,
  accessibleAgentIds: ["agent-1", "agent-4"],
  filterScope: null,
} satisfies GetSidakAgentQuickviewParams;

const requestedServiceType: string = "call";
const stringServiceParams: GetSidakAgentQuickviewParams = {
  ...baseParams,
  requestedServiceType,
};

beforeEach(() => {
  vi.clearAllMocks();
  participantState.data = {
    id: "agent-1",
    batch_name: "Leader Dimas",
    tim: "Tim Call",
  };
  participantState.error = null;
  vi.mocked(getAllFolders).mockResolvedValue(folders);
  vi.mocked(resolveScopedServiceType).mockImplementation(
    (requested) => requested ?? "call",
  );
  mockDashboardByFolder({
    "parent-call": rankedParentWorstFirst,
    "leader-dimas": rankedLeaderWorstFirst,
  });
  vi.mocked(generateSidakAgentForecast).mockResolvedValue(
    forecastResponse(forecastEntry("improving")),
  );
});

describe("SIDAK agent quickview contract", () => {
  it("represents ranking scopes and deterministic forecast context", () => {
    const response: SidakAgentQuickviewResponse = {
      context: {
        agentId: "agent-1",
        year: 2026,
        serviceType: "call",
        periodMode: "ytd",
      },
      combinedTeam: {
        rank: 8,
        total: 64,
        scopeId: "folder-parent",
        scopeLabel: "Tim Call",
        basis: "least_findings_ytd",
      },
      leaderTeam: {
        rank: 2,
        total: 12,
        scopeId: "folder-child",
        scopeLabel: "Leader Dimas",
        basis: "least_findings_ytd",
      },
      forecast: {
        status: "improving",
        label: "Membaik",
        supportingText: "Temuan diproyeksikan turun",
        findingsSlope: -1.25,
        sourcePointCount: 5,
        confidence: "high",
        horizonMonths: 3,
      },
    };

    expect(response.context.periodMode).toBe("ytd");
    expect(response.forecast?.horizonMonths).toBe(3);
  });
});

describe("getSidakAgentQuickview", () => {
  it("resolves combined and leader cohorts without using worst-first dashboard order", async () => {
    const result = await getSidakAgentQuickview(baseParams);

    expect(result.combinedTeam).toMatchObject({
      rank: 1,
      total: 3,
      scopeId: "parent-call",
      scopeLabel: "Tim Call",
      basis: "least_findings_ytd",
    });
    expect(result.leaderTeam).toMatchObject({
      rank: 1,
      total: 2,
      scopeId: "leader-dimas",
      scopeLabel: "Leader Dimas",
      basis: "least_findings_ytd",
    });
  });

  it("gives tied agents the same rank and counts only strictly fewer findings", async () => {
    mockDashboardByFolder({
      "parent-call": [
        { ...rankedParentWorstFirst[0], defects: 4 },
        { ...rankedParentWorstFirst[1], defects: 1 },
        { ...rankedParentWorstFirst[2], defects: 1 },
      ],
      "leader-dimas": [
        { ...rankedLeaderWorstFirst[0], defects: 4 },
        { ...rankedLeaderWorstFirst[1], defects: 1 },
      ],
    });

    const tied = await getSidakAgentQuickview(baseParams);
    expect(tied.combinedTeam?.rank).toBe(1);

    participantState.data = {
      id: "agent-2",
      batch_name: "Leader Dimas",
      tim: "Tim Call",
    };
    const otherTied = await getSidakAgentQuickview({
      ...baseParams,
      agentId: "agent-2",
      accessibleAgentIds: ["agent-1", "agent-2", "agent-3"],
    });
    expect(otherTied.combinedTeam?.rank).toBe(1);

    participantState.data = {
      id: "agent-3",
      batch_name: "Leader Dimas",
      tim: "Tim Call",
    };
    const third = await getSidakAgentQuickview({
      ...baseParams,
      agentId: "agent-3",
      accessibleAgentIds: ["agent-1", "agent-2", "agent-3"],
    });
    expect(third.combinedTeam?.rank).toBe(3);
  });

  it.each([
    ["deny-all", []],
    ["inaccessible agent", ["agent-2"]],
  ] as const)(
    "rejects %s access before participant or downstream calls",
    async (_label, accessibleAgentIds) => {
      await expect(
        getSidakAgentQuickview({
          ...baseParams,
          accessibleAgentIds: [...accessibleAgentIds],
        }),
      ).rejects.toThrow("Agent tidak dapat diakses.");

      expect(supabaseFrom).not.toHaveBeenCalled();
      expect(getAllFolders).not.toHaveBeenCalled();
      expect(getDashboardData).not.toHaveBeenCalled();
      expect(generateSidakAgentForecast).not.toHaveBeenCalled();
    },
  );

  it("accepts the exact string service request contract", async () => {
    await getSidakAgentQuickview(stringServiceParams);

    expect(resolveScopedServiceType).toHaveBeenCalledWith("call", null);
  });

  it("prefers the duplicate child label whose parent matches participant.tim", async () => {
    vi.mocked(getAllFolders).mockResolvedValue([
      { id: "parent-chat", name: "Tim Chat", parent_id: null },
      { id: "leader-chat", name: "Leader Dimas", parent_id: "parent-chat" },
      ...folders,
    ]);

    await getSidakAgentQuickview(baseParams);

    expect(getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({ folder_ids: ["leader-dimas"] }),
    );
    expect(generateSidakAgentForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ folderIds: ["parent-call"] }),
      }),
    );
  });

  it("uses access-scoped folders, agent ids, and services for dashboard and forecast", async () => {
    const filterScope = {
      agentIds: ["agent-1", "agent-4"],
      allowedFolders: folders,
      allowedServices: ["chat" as const],
      serviceTypeLocked: true,
    };
    vi.mocked(resolveScopedServiceType).mockReturnValue("chat");

    const result = await getSidakAgentQuickview({
      ...baseParams,
      requestedServiceType: "call",
      filterScope,
    });

    expect(getAllFolders).not.toHaveBeenCalled();
    expect(result.context.serviceType).toBe("chat");
    expect(getDashboardData).toHaveBeenCalledWith({
      service_type: "chat",
      folder_ids: ["parent-call"],
      year: 2026,
      agent_ids: ["agent-1", "agent-4"],
      allowedServiceTypes: ["chat"],
      limit: 0,
    });
    expect(generateSidakAgentForecast).toHaveBeenCalledWith({
      request: {
        year: 2026,
        serviceType: "chat",
        folderIds: ["parent-call"],
        startMonth: 1,
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-1", "agent-4"],
      allowedServiceTypes: ["chat"],
    });
  });

  it.each([
    ["improving", "Membaik", "Temuan diproyeksikan turun", -1.25, 5],
    ["declining", "Memburuk", "Temuan diproyeksikan naik", 1.25, 5],
    ["stable", "Stabil/Stagnan", "Perubahan temuan belum signifikan", 0.1, 5],
    [
      "insufficient_data",
      "Data belum cukup",
      "Butuh minimal 2 periode audit",
      null,
      1,
    ],
  ] as const)(
    "maps %s forecast status to approved copy",
    async (status, label, supportingText, expectedSlope, sourcePointCount) => {
      vi.mocked(generateSidakAgentForecast).mockResolvedValue(
        forecastResponse(
          forecastEntry(status, {
            findingsSlope:
              status === "declining" ? 1.25 : status === "stable" ? 0.1 : -1.25,
            sourcePointCount,
            confidence: sourcePointCount < 2 ? "low" : "high",
          }),
        ),
      );

      const result = await getSidakAgentQuickview(baseParams);

      expect(result.forecast).toEqual({
        status,
        label,
        supportingText,
        findingsSlope: expectedSlope,
        sourcePointCount,
        confidence: sourcePointCount < 2 ? "low" : "high",
        horizonMonths: 3,
      });
    },
  );

  it("returns successful segments when one ranking promise rejects", async () => {
    vi.mocked(getDashboardData).mockImplementation(async (params) => {
      if (params.folder_ids?.[0] === "parent-call") {
        throw new Error("combined ranking unavailable");
      }
      return {
        topAgents: rankedLeaderWorstFirst,
      } as Awaited<ReturnType<typeof getDashboardData>>;
    });

    const result = await getSidakAgentQuickview(baseParams);

    expect(result.combinedTeam).toBeNull();
    expect(result.leaderTeam).toMatchObject({
      rank: 1,
      scopeId: "leader-dimas",
    });
    expect(result.forecast).toMatchObject({
      status: "improving",
      label: "Membaik",
    });
  });

  it("returns null forecast when forecast generation rejects while ranks survive", async () => {
    vi.mocked(generateSidakAgentForecast).mockRejectedValue(
      new Error("forecast unavailable"),
    );

    const result = await getSidakAgentQuickview(baseParams);

    expect(result.combinedTeam).toMatchObject({
      rank: 1,
      scopeId: "parent-call",
    });
    expect(result.leaderTeam).toMatchObject({
      rank: 1,
      scopeId: "leader-dimas",
    });
    expect(result.forecast).toBeNull();
  });

  it("returns null ranks when folder catalog rejects and forecasts without a folder filter", async () => {
    vi.mocked(getAllFolders).mockRejectedValue(
      new Error("folder catalog unavailable"),
    );

    const result = await getSidakAgentQuickview(baseParams);

    expect(result.combinedTeam).toBeNull();
    expect(result.leaderTeam).toBeNull();
    expect(getDashboardData).not.toHaveBeenCalled();
    expect(generateSidakAgentForecast).toHaveBeenCalledWith({
      request: {
        year: 2026,
        serviceType: "call",
        folderIds: undefined,
        startMonth: 1,
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-1", "agent-4"],
      allowedServiceTypes: undefined,
    });
    expect(result.forecast).toMatchObject({
      status: "improving",
      label: "Membaik",
    });
  });

  it("executes ranking once and reuses it when combined and leader scope match", async () => {
    participantState.data = {
      id: "agent-1",
      batch_name: "Tim Call",
      tim: "Tim Call",
    };

    const result = await getSidakAgentQuickview(baseParams);

    expect(getDashboardData).toHaveBeenCalledTimes(1);
    expect(result.combinedTeam).toEqual(result.leaderTeam);
    expect(result.combinedTeam?.scopeId).toBe("parent-call");
  });
});
