import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─── Supabase Mock ─────────────────────────────────────────────────────────────
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
        return buildQuery(() => ({
          data: [{ id: "folder-1", name: "Folder A" }],
          error: null,
        }));
      }
      return buildQuery(() => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

// Mock sidak-service functions called by the route
import * as sidakService from "../services/sidak-service";

vi.mock("../services/sidak-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/sidak-service")>();
  return {
    ...original,
    getAccessibleAgentIds: vi.fn().mockResolvedValue(null),
    getAccessibleSidakFilters: vi.fn().mockResolvedValue(null),
    getPeriods: vi.fn().mockResolvedValue([{ id: "uuid-1234", year: 2026, month: 5, label: "05/2026" }]),
    getAvailableYears: vi.fn().mockResolvedValue([2026]),
    getDashboardData: vi.fn().mockResolvedValue({
      periods: [],
      folders: [],
      summary: {},
      serviceData: [],
      topAgents: [],
      paretoData: [],
      donutData: { critical: 0, nonCritical: 0, total: 0 },
      availableServices: ["call", "chat"],
    }),
  };
});

// Import the router under test
import { sidak } from "../routes/sidak";

// Build a Hono application to wrap context
const app = new Hono<{ Variables: { user: any; profile: any } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-id" });
  c.set("profile", { role: "admin" });
  await next();
});
app.route("/", sidak);

describe("Sidak Ranking Route monthly / YTD / All-Time filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes period_ids and year when period is a specific UUID", async () => {
    const res = await app.request("/ranking?period=uuid-1234&year=2026&service_type=call");
    expect(res.status).toBe(200);

    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: ["uuid-1234"],
        year: 2026,
        service_type: "call",
      })
    );
  });

  it("passes only year and leaves period_ids undefined when period is ytd", async () => {
    const res = await app.request("/ranking?period=ytd&year=2026&service_type=call");
    expect(res.status).toBe(200);

    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: undefined,
        year: 2026,
        service_type: "call",
      })
    );
  });

  it("passes year=undefined and period_ids=undefined when period is alltime", async () => {
    const res = await app.request("/ranking?period=alltime&year=2026&service_type=call");
    expect(res.status).toBe(200);

    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: undefined,
        year: undefined,
        service_type: "call",
      })
    );
  });

  it("defaults to ytd period when period parameter is omitted", async () => {
    const res = await app.request("/ranking?year=2026&service_type=call");
    expect(res.status).toBe(200);

    expect(sidakService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        period_ids: undefined,
        year: 2026,
        service_type: "call",
      })
    );
  });

  it("calculates rankChange comparing current YTD and previous YTD", async () => {
    // Mock getPeriods to return multiple periods
    vi.spyOn(sidakService, "getPeriods").mockResolvedValue([
      { id: "period-1", year: 2026, month: 1, label: "01/2026" },
      { id: "period-2", year: 2026, month: 2, label: "02/2026" },
    ]);

    // Mock supabaseAdmin from to return mock temuan findings in both periods
    const { supabaseAdmin } = await import("../lib/supabase");
    vi.spyOn(supabaseAdmin, "from").mockImplementation((tableName: string) => {
      if (tableName === "qa_temuan") {
        return buildQuery(() => ({
          data: [
            { period_id: "period-1" },
            { period_id: "period-2" },
          ],
          error: null,
        })) as any;
      }
      return buildQuery(() => ({ data: [], error: null })) as any;
    });

    // Spy on getDashboardData and return different rankings based on the input period_ids
    vi.spyOn(sidakService, "getDashboardData").mockImplementation(async (params: any) => {
      // If it is the previous YTD (only period-1)
      if (params.period_ids && params.period_ids.length === 1 && params.period_ids[0] === "period-1") {
        return {
          periods: [],
          folders: [],
          summary: {} as any,
          serviceData: [],
          topAgents: [
            { agentId: "agent-a", nama: "Agent A", defects: 5, score: 90, hasCritical: false },
            { agentId: "agent-b", nama: "Agent B", defects: 10, score: 80, hasCritical: false },
          ],
          paretoData: [],
          donutData: { critical: 0, nonCritical: 0, total: 0 },
          availableServices: ["call"],
        };
      }
      // If it is the current YTD (both periods, or period is ytd)
      return {
        periods: [],
        folders: [],
        summary: {} as any,
        serviceData: [],
        topAgents: [
          { agentId: "agent-b", nama: "Agent B", defects: 12, score: 78, hasCritical: false }, // rank 1 now
          { agentId: "agent-a", nama: "Agent A", defects: 6, score: 88, hasCritical: false }, // rank 2 now
        ],
        paretoData: [],
        donutData: { critical: 0, nonCritical: 0, total: 0 },
        availableServices: ["call"],
      };
    });

    const res = await app.request("/ranking?period=ytd&year=2026&service_type=call");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const rankings = body.data.rankings;
    // Agent B: was rank 2, now rank 1. rankChange = 2 - 1 = +1
    // Agent A: was rank 1, now rank 2. rankChange = 1 - 2 = -1
    expect(rankings[0].agentId).toBe("agent-b");
    expect(rankings[0].rankChange).toBe(1);
    expect(rankings[1].agentId).toBe("agent-a");
    expect(rankings[1].rankChange).toBe(-1);
  });
});
