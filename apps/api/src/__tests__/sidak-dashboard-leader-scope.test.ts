import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { resolveScopedServiceType } from "../services/sidak-service";

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

// ─── Hoisted mock references (available inside vi.mock factory) ────────────────
const hoistedMock = vi.hoisted(() => ({
  dashboardData: vi.fn().mockResolvedValue({
    periods: [],
    folders: [],
    summary: { totalDefects: 0, avgDefectsPerAudit: 0, avgAgentScore: 90, complianceRate: 100, complianceCount: 0, totalAgents: 5 },
    serviceData: [],
    topAgents: [],
    paretoData: [],
    donutData: { critical: 0, nonCritical: 0, total: 0 },
    availableServices: ["chat"],
    sparklines: {},
    paramTrend: { labels: [], datasets: [] },
  }),
  accessibleFilters: vi.fn().mockResolvedValue({
    allowedServices: ["chat"],
    allowedFolders: [],
    agentIds: ["leader-agent-1"],
    serviceTypeLocked: true,
  }),
}));

vi.mock("../services/sidak-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/sidak-service")>();
  return {
    ...original,
    getAccessibleAgentIds: vi.fn().mockResolvedValue(["leader-agent-1"]),
    getAccessibleSidakFilters: hoistedMock.accessibleFilters,
    getPeriods: vi.fn().mockResolvedValue([{ id: "uuid-1234", year: 2026, month: 5, label: "05/2026" }]),
    getAvailableYears: vi.fn().mockResolvedValue([2026]),
    getDashboardData: hoistedMock.dashboardData,
  };
});

// Import the router under test
import { sidak } from "../routes/sidak";

// Build a Hono application to wrap context
const app = new Hono<{ Variables: { user: any; profile: any } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "leader-user-id" });
  c.set("profile", { role: "leader" });
  await next();
});
app.route("/", sidak);

describe("Sidak Dashboard Leader Service Scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves stale call service to the first allowed leader service", () => {
    expect(
      resolveScopedServiceType("call", {
        allowedServices: ["chat"],
        agentIds: ["leader-agent-1"],
        allowedFolders: [],
        serviceTypeLocked: true,
      }),
    ).toBe("chat");
  });

  it("coerces service_type to first allowed service when leader scope restricts it", async () => {
    // Leader with only "chat" access, requests "call"
    const res = await app.request("/dashboard?service_type=call&year=2026");

    expect(res.status).toBe(200);

    // Assert getDashboardData was called with coerced service_type="chat"
    expect(hoistedMock.dashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: "chat",
        allowedServiceTypes: ["chat"],
      }),
    );
  });

  it("does not coerce service_type when it matches the allowed services", async () => {
    // Leader with only "chat" access, requests "chat"
    const res = await app.request("/dashboard?service_type=chat&year=2026");

    expect(res.status).toBe(200);

    // Assert getDashboardData was called with the same service_type="chat"
    expect(hoistedMock.dashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: "chat",
        allowedServiceTypes: ["chat"],
      }),
    );
  });

  it("does not coerce service_type for admin/trainer (no scope restriction)", async () => {
    // Override mock to return null (admin/trainer has no scope)
    hoistedMock.accessibleFilters.mockResolvedValueOnce(null);

    const res = await app.request("/dashboard?service_type=email&year=2026");

    expect(res.status).toBe(200);

    // Assert getDashboardData was called with original service_type="email"
    expect(hoistedMock.dashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: "email",
        allowedServiceTypes: undefined,
      }),
    );
  });
});
