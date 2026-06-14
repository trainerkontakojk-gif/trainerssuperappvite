import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SidakDashboardPage from "../routes/sidak/dashboard";
import { unwrapResponse } from "../lib/api";
import { useApi } from "../hooks/useApi";

vi.mock("../lib/api", () => ({
  sidakClient: {
    dashboard: {
      forecast: {
        $post: vi.fn().mockResolvedValue({}),
      },
    },
  },
  unwrapResponse: vi.fn(),
}));

vi.mock("../hooks/useApi", () => ({
  useApi: vi.fn(),
}));

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

describe("SidakDashboardPage forecast state", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useApi).mockReturnValue({
      data: {
        summary: {
          totalAgents: 10,
          totalDefects: 20,
          avgDefectsPerAudit: 2,
          avgAgentScore: 80,
          complianceRate: 50,
          complianceCount: 5,
        },
        topAgents: [],
        donutData: { critical: 5, nonCritical: 15, total: 20 },
        paramTrend: {
          labels: ["Jan", "Feb", "Mar"], // at least 2 points
          datasets: [
            { label: "Critical", data: [1, 2, 3], isTotal: false },
            { label: "Total", data: [1, 2, 3], isTotal: true },
          ],
        },
        paretoData: [],
        sparklines: {},
        folders: [],
        periods: [],
        availableServices: ["call"],
        availableYears: [2026],
      },
      loading: false,
      refetch: vi.fn(),
      error: null,
    });
  });

  it("shows stale attention when cache lookup reports changed data", async () => {
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "stale",
      snapshot: null,
    });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    expect(
      await screen.findByRole("button", {
        name: "Data baru — Perbarui Prediksi",
      }),
    ).toBeInTheDocument();
  });

  it("refreshes forecast and changes button to fresh state when clicked", async () => {
    const mockForecastResult = {
      cache: {
        status: "hit",
        timestamp: new Date().toISOString(),
      },
      insight: {
        status: "missing",
      },
      series: {
        total: {
          scope: { type: "total" },
          forecast: [1, 2, 3],
          lower: [0, 1, 2],
          upper: [2, 3, 4],
          summary: {
            direction: "stable",
            magnitude: "0%",
            message: "Stable",
            isConcerning: false,
          },
        },
        parameters: {},
      },
    };

    vi.mocked(unwrapResponse)
      .mockResolvedValueOnce({ status: "stale", snapshot: null })
      .mockResolvedValueOnce({ status: "fresh", snapshot: mockForecastResult });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    const button = await screen.findByRole("button", {
      name: "Data baru — Perbarui Prediksi",
    });

    await act(async () => {
      await userEvent.click(button);
    });

    expect(
      await screen.findByRole("button", {
        name: "Perbarui Prediksi",
      }),
    ).toBeInTheDocument();
  });
});
