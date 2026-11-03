import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as dashboardDataService from "../services/sidak/dashboard-data";
import * as forecastStore from "../services/sidak/dashboard-forecast-store";
import * as geminiLib from "../lib/gemini";
import { generateSidakTrendForecast } from "../services/sidak/dashboard-forecast";

vi.mock("../services/sidak/dashboard-data", () => ({
  getDashboardData: vi.fn(),
}));

vi.mock("../services/sidak/dashboard-forecast-store", () => ({
  findForecastSnapshot: vi.fn(),
  listForecastFingerprints: vi.fn(),
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
    vi.mocked(forecastStore.listForecastFingerprints).mockResolvedValue({
      fingerprints: [],
      complete: true,
    });
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
    expect(
      result.snapshot?.series.total.forecast.map((point) => point.label),
    ).toEqual(["Apr 26", "Mei 26", "Jun 26"]);
    expect(Object.keys(result.snapshot!.series.parameters)).toEqual([
      "Etika Bertelepon",
      "Verifikasi Data",
    ]);
    expect(
      result.snapshot!.series.parameters["Etika Bertelepon"].summary.direction,
    ).toBe("up");
    expect(
      result.snapshot!.series.parameters["Verifikasi Data"].summary.direction,
    ).toBe("down");
    expect(geminiLib.generateGeminiContent).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(geminiLib.generateGeminiContent).mock.calls[0][0],
    ).not.toHaveProperty("temperature");
    expect(geminiLib.generateGeminiContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    );
    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledTimes(1);
    expect(result.snapshot!.cache.status).toBe("generated");
  });

  it("tells the narrative model that lower finding counts are improvements", async () => {
    await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      userId: "user-1",
    });

    const call = vi.mocked(geminiLib.generateGeminiContent).mock.calls[0]?.[0];
    expect(call?.systemInstruction).toContain(
      "Susun parameter dalam tiga blok: Perbaikan Terbesar, Risiko Terbesar, dan Stabil",
    );
    expect(call?.contents?.[0]?.parts?.[0]?.text).toContain(
      "Perbaikan Terbesar",
    );
    expect(call?.contents?.[0]?.parts?.[0]?.text).toContain("Risiko Terbesar");
    expect(call?.contents?.[0]?.parts?.[0]?.text).toContain("Stabil");
    expect(call?.contents?.[0]?.parts?.[0]?.text).toContain(
      "Etika Bertelepon (",
    );
  });

  it("normalizes the AI parameter section so delta details stay visible", async () => {
    vi.mocked(geminiLib.generateGeminiContent).mockResolvedValueOnce({
      success: true,
      text: `Berikut adalah analisis snapshot forecast SIDAK:

### **Ringkasan Eksekutif**
Total temuan menurun.

### **Analisis Parameter**
Stabil
---

### **Tindakan yang Dapat Dilakukan**
1. **Coaching:** Fokus pada area prioritas.

### **Disclaimer**
Data ini bersifat estimasi.`,
    });

    const result = await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      userId: "user-1",
    });

    expect(result.snapshot?.insight.text).toContain(
      "### **Analisis Parameter**",
    );
    expect(result.snapshot?.insight.text).toContain("Perbaikan Terbesar");
    expect(result.snapshot?.insight.text).toContain("Risiko Terbesar");
    expect(result.snapshot?.insight.text).toContain("Stabil");
    expect(result.snapshot?.insight.text).toMatch(/Etika Bertelepon \([+-]/);
    expect(result.snapshot?.insight.text).not.toContain("\n---\n");
  });

  it("versions the data fingerprint when forecast semantics change", async () => {
    await generateSidakTrendForecast({
      filters: { year: 2026 },
      horizonMonths: 3,
      userId: "user-1",
    });

    const legacyFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          total: [
            { periodId: "p1", label: "Jan 26", date: "", value: 10 },
            { periodId: "p2", label: "Feb 26", date: "", value: 15 },
            { periodId: "p3", label: "Mar 26", date: "", value: 20 },
          ],
          parameters: {
            "Etika Bertelepon": [
              { periodId: "p1", label: "Jan 26", date: "", value: 2 },
              { periodId: "p2", label: "Feb 26", date: "", value: 4 },
              { periodId: "p3", label: "Mar 26", date: "", value: 6 },
            ],
            "Verifikasi Data": [
              { periodId: "p1", label: "Jan 26", date: "", value: 5 },
              { periodId: "p2", label: "Feb 26", date: "", value: 3 },
              { periodId: "p3", label: "Mar 26", date: "", value: 1 },
            ],
          },
        }),
      )
      .digest("hex");

    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        dataFingerprint: expect.not.stringMatching(
          new RegExp(`^${legacyFingerprint}$`),
        ),
      }),
    );
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
    expect(result.snapshot?.insight).toEqual({
      text: null,
      status: "unavailable",
    });
    expect(forecastStore.saveForecastSnapshot).toHaveBeenCalledTimes(1);
  });
});
