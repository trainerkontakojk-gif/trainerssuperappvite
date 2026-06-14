import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dashboardDataService from "../services/sidak/dashboard-data";
import * as forecastStore from "../services/sidak/dashboard-forecast-store";
import * as geminiLib from "../lib/gemini";
import { generateSidakTrendForecast } from "../services/sidak/dashboard-forecast";

vi.mock("../services/sidak/dashboard-data", () => ({
  getDashboardData: vi.fn(),
}));

vi.mock("../services/sidak/dashboard-forecast-store", () => ({
  findForecastSnapshot: vi.fn(),
  hasForecastSnapshotForFilter: vi.fn(),
  saveForecastSnapshot: vi.fn(),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(),
}));

describe("dashboard batch forecast service", () => {
  const dashboardData: any = {
    periods: [
      { id: "p1", month: 1, year: 2026, start_date: "2026-01-01" },
      { id: "p2", month: 2, year: 2026, start_date: "2026-02-01" },
      { id: "p3", month: 3, year: 2026, start_date: "2026-03-01" },
    ],
    periodMetrics: [
      { periodId: "p1", label: "Jan 26", total: 10 },
      { periodId: "p2", label: "Feb 26", total: 15 },
      { periodId: "p3", label: "Mar 26", total: 20 },
    ],
    paramTrend: {
      labels: ["Jan 26", "Feb 26", "Mar 26"],
      datasets: [
        { label: "Total Temuan", data: [10, 15, 20], isTotal: true },
        { label: "Etika Bertelepon", data: [2, 4, 6], isTotal: false },
        { label: "Verifikasi Data", data: [5, 3, 1], isTotal: false },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardDataService.getDashboardData).mockResolvedValue(
      dashboardData,
    );
    vi.mocked(forecastStore.findForecastSnapshot).mockResolvedValue(null);
    vi.mocked(forecastStore.hasForecastSnapshotForFilter).mockResolvedValue(false);
    vi.mocked(forecastStore.saveForecastSnapshot).mockImplementation(
      async (snapshot) => snapshot.payload,
    );
    vi.mocked(geminiLib.generateGeminiContent).mockResolvedValue({
      success: true,
      text: "Insight keseluruhan.",
    });
  });

  it("generates total and every parameter in one snapshot with one AI call", async () => {
    const result = (await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      userId: "user-1",
    }))!;

    expect(result.status).toBe("fresh");
    expect(result.snapshot?.series.total.forecast.map((point) => point.label)).toEqual([
      "Apr 26",
      "Mei 26",
      "Jun 26",
    ]);
    expect(Object.keys(result.snapshot!.series.parameters)).toEqual([
      "Etika Bertelepon",
      "Verifikasi Data",
    ]);
    expect(result.snapshot!.series.parameters["Etika Bertelepon"].summary.direction).toBe(
      "up",
    );
    expect(result.snapshot!.series.parameters["Verifikasi Data"].summary.direction).toBe(
      "down",
    );
    expect(geminiLib.generateGeminiContent).toHaveBeenCalledTimes(1);
    expect(geminiLib.generateGeminiContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.1-flash-lite",
        temperature: 0.3,
      }),
    );
    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledTimes(1);
    expect(result.snapshot!.cache.status).toBe("generated");
  });

  it("returns a matching persisted snapshot without calling Gemini", async () => {
    const cached = {
      series: {
        total: {
          scope: { type: "total", label: "Total Temuan" },
          historical: [],
          forecast: [],
          summary: {},
          status: "ready",
        },
        parameters: {},
      },
      insight: { text: "Cached", status: "generated" },
      cache: {
        status: "generated",
        filterKey: "filter",
        dataFingerprint: "data",
      },
      generatedAt: "2026-06-14T00:00:00.000Z",
    } as any;
    vi.mocked(forecastStore.findForecastSnapshot).mockResolvedValue(cached);

    const result = (await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      userId: "user-1",
    })) as any;

    expect(result.status).toBe("fresh");
    expect(result.snapshot?.insight.text).toBe("Cached");
    expect(result.snapshot?.cache.status).toBe("hit");
    expect(geminiLib.generateGeminiContent).not.toHaveBeenCalled();
    expect(forecastStore.saveForecastSnapshot).not.toHaveBeenCalled();
  });

  it("returns missing when no snapshot exists for the filter", async () => {
    vi.mocked(forecastStore.hasForecastSnapshotForFilter).mockResolvedValue(false);
    const result = await generateSidakTrendForecast({
      filters: { year: 2026 },
      cacheOnly: true,
      userId: "user-1",
    });

    expect(result).toEqual({ status: "missing", snapshot: null });
    expect(geminiLib.generateGeminiContent).not.toHaveBeenCalled();
    expect(forecastStore.saveForecastSnapshot).not.toHaveBeenCalled();
  });

  it("returns stale when current fingerprint misses but the filter has an older snapshot", async () => {
    vi.mocked(forecastStore.hasForecastSnapshotForFilter).mockResolvedValue(true);

    const result = await generateSidakTrendForecast({
      filters: { year: 2026 },
      cacheOnly: true,
      userId: "user-1",
    });

    expect(result).toEqual({ status: "stale", snapshot: null });
    expect(geminiLib.generateGeminiContent).not.toHaveBeenCalled();
  });

  it("force refresh bypasses cache and marks the new snapshot refreshed", async () => {
    vi.mocked(forecastStore.findForecastSnapshot).mockResolvedValue({} as any);

    const result = (await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      forceRefresh: true,
      userId: "user-1",
    }))!;

    expect(forecastStore.findForecastSnapshot).not.toHaveBeenCalled();
    expect(geminiLib.generateGeminiContent).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("fresh");
    expect(result.snapshot?.cache.status).toBe("refreshed");
  });

  it("passes agent authorization scope into dashboard data and cache identity", async () => {
    await generateSidakTrendForecast({
      filters: {
        year: 2026,
        agentIds: ["agent-b", "agent-a"],
        allowedServiceTypes: ["chat", "call"],
      },
      horizonMonths: 3,
      userId: "leader-1",
    });

    expect(dashboardDataService.getDashboardData).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_ids: ["agent-b", "agent-a"],
        allowedServiceTypes: ["chat", "call"],
      }),
    );
    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        filterKey: expect.any(String),
        dataFingerprint: expect.any(String),
      }),
    );
  });

  it("keeps numeric forecasts available when Gemini fails", async () => {
    vi.mocked(geminiLib.generateGeminiContent).mockResolvedValue({
      success: false,
      error: "AI unavailable",
    });

    const result = (await generateSidakTrendForecast({
      filters: {},
      userId: "user-1",
    }))!;

    expect(result.status).toBe("fresh");
    expect(result.snapshot?.series.total.forecast).toHaveLength(3);
    expect(result.snapshot?.insight).toEqual({ text: null, status: "unavailable" });
    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledTimes(1);
  });
});
