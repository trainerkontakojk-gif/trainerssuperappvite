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
});
