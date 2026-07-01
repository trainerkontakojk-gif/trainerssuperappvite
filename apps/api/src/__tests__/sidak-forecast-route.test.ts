import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import * as sidakService from "../services/sidak-service";

vi.mock("../services/sidak-service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../services/sidak-service")>();
  return {
    ...original,
    getAccessibleAgentIds: vi.fn().mockResolvedValue(["agent-1"]),
    getAccessibleSidakFilters: vi
      .fn()
      .mockResolvedValue({ allowedServices: ["call", "chat"] }),
    generateSidakAgentForecast: vi.fn().mockResolvedValue({
      improvingAgents: [],
      decliningAgents: [],
      stableAgents: [],
      watchlistAgents: [],
      summary: {
        totalEligible: 0,
        improvingCount: 0,
        decliningCount: 0,
        stableCount: 0,
        watchlistCount: 0,
        latestPeriodLabel: "Mar 26",
      },
    }),
  };
});

import { sidakForecast } from "../routes/sidak/forecast";

const app = new Hono<{ Variables: { user: any; profile: any } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-id" });
  c.set("profile", { role: "leader" });
  await next();
});
app.route("/", sidakForecast);

describe("Sidak Forecast Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards filters and access scope to the deterministic agent forecast service", async () => {
    const res = await app.request("/forecast/agents", {
      method: "POST",
      body: JSON.stringify({
        year: 2026,
        serviceType: "call",
        folderIds: ["11111111-1111-1111-1111-111111111111"],
        startMonth: 1,
        endMonth: 3,
        horizonMonths: 3,
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(sidakService.generateSidakAgentForecast).toHaveBeenCalledWith({
      request: {
        year: 2026,
        serviceType: "call",
        folderIds: ["11111111-1111-1111-1111-111111111111"],
        startMonth: 1,
        endMonth: 3,
        horizonMonths: 3,
      },
      accessibleAgentIds: ["agent-1"],
      allowedServiceTypes: ["call", "chat"],
    });
  });

  it("fails closed when a leader has no accessible agents", async () => {
    vi.mocked(sidakService.getAccessibleAgentIds).mockResolvedValueOnce([]);

    const res = await app.request("/forecast/agents", {
      method: "POST",
      body: JSON.stringify({ year: 2026, serviceType: "call" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(403);
    expect(sidakService.generateSidakAgentForecast).not.toHaveBeenCalled();
  });

  it("coerces a first-load call service to the scoped leader service", async () => {
    vi.mocked(sidakService.getAccessibleSidakFilters).mockResolvedValueOnce({
      allowedServices: ["chat"],
    } as any);

    const res = await app.request("/forecast/agents", {
      method: "POST",
      body: JSON.stringify({ year: 2026, serviceType: "call" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(sidakService.generateSidakAgentForecast).toHaveBeenCalledWith({
      request: {
        year: 2026,
        serviceType: "chat",
      },
      accessibleAgentIds: ["agent-1"],
      allowedServiceTypes: ["chat"],
    });
  });

  it("returns 400 for invalid month ranges", async () => {
    const res = await app.request("/forecast/agents", {
      method: "POST",
      body: JSON.stringify({
        year: 2026,
        serviceType: "call",
        startMonth: 0,
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });
});
