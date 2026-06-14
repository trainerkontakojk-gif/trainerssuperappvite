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
    generateSidakTrendForecast: vi.fn().mockResolvedValue({
      status: "fresh",
      snapshot: {
        series: { total: {}, parameters: {} },
        insight: { text: "Insight", status: "generated" },
        cache: { status: "generated" },
        generatedAt: "2026-06-14T00:00:00.000Z",
      },
    }),
  };
});

import { sidakDashboard } from "../routes/sidak/dashboard";

const app = new Hono<{ Variables: { user: any; profile: any } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-id" });
  c.set("profile", { role: "leader" });
  await next();
});
app.route("/", sidakDashboard);

describe("Sidak Dashboard Forecast Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a batch snapshot and injects leader authorization scope", async () => {
    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({
        filters: { year: 2026, serviceType: "call" },
        horizonMonths: 3,
        forceRefresh: false,
        cacheOnly: false,
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(sidakService.generateSidakTrendForecast).toHaveBeenCalledWith({
      filters: {
        year: 2026,
        serviceType: "call",
        agentIds: ["agent-1"],
        allowedServiceTypes: ["call", "chat"],
      },
      horizonMonths: 3,
      forceRefresh: false,
      cacheOnly: false,
      userId: "test-user-id",
    });
  });

  it("accepts force refresh without a single-series scope", async () => {
    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({
        filters: {},
        forceRefresh: true,
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(sidakService.generateSidakTrendForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRefresh: true,
      }),
    );
  });

  it("accepts cache-only lookup for page reload restoration", async () => {
    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({ filters: {}, cacheOnly: true }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(sidakService.generateSidakTrendForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheOnly: true,
        forceRefresh: false,
      }),
    );
  });

  it("returns 400 for a horizon above six months", async () => {
    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({ filters: {}, horizonMonths: 7 }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  it("fails closed when a restricted user has no accessible agents", async () => {
    vi.mocked(sidakService.getAccessibleAgentIds).mockResolvedValueOnce([]);

    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({ filters: {} }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(403);
    expect(sidakService.generateSidakTrendForecast).not.toHaveBeenCalled();
  });

  it("returns the forecast lookup envelope unchanged", async () => {
    const res = await app.request("/dashboard/forecast", {
      method: "POST",
      body: JSON.stringify({ filters: {}, cacheOnly: true }),
      headers: { "Content-Type": "application/json" },
    });

    const body = await res.json();
    expect(body.data.status).toBe("fresh");
    expect(body.data.snapshot.insight.text).toBe("Insight");
  });
});
