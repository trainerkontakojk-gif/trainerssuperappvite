import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
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
  const dashboardData = {
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
      labels: ["Jan 26", "Feb 26", "Mar 26"],
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
  };

  const mockForecastResult = {
    series: {
      total: {
        scope: { type: "total", label: "Total Temuan" },
        historical: [],
        forecast: [
          { label: "Apr 26", date: "2026-04-01T00:00:00.000Z", value: 4 },
        ],
        summary: {
          direction: "up",
          projectedChange: 1,
          projectedChangePercent: 33.3,
          confidence: "low",
          method: "linear-regression",
          sourcePointCount: 3,
        },
        status: "ready",
      },
      parameters: {},
    },
    insight: {
      status: "generated",
      text: "Insight lama.",
    },
    cache: {
      status: "hit",
      filterKey: "filter",
      dataFingerprint: "old-data",
    },
    generatedAt: "2026-06-14T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useApi).mockReturnValue({
      data: dashboardData,
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);
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

  it("clears an old forecast immediately while changed data is being checked", async () => {
    let resolveLookup:
      | ((value: { status: "stale"; snapshot: null }) => void)
      | undefined;
    const pendingLookup = new Promise<{ status: "stale"; snapshot: null }>(
      (resolve) => {
        resolveLookup = resolve;
      },
    );

    vi.mocked(unwrapResponse)
      .mockResolvedValueOnce({
        status: "fresh",
        snapshot: mockForecastResult,
      })
      .mockImplementationOnce(() => pendingLookup);

    const view = render(<SidakDashboardPage />);

    expect(await screen.findByText("Insight lama.")).toBeInTheDocument();

    vi.mocked(useApi).mockReturnValue({
      data: {
        ...dashboardData,
        paramTrend: {
          ...dashboardData.paramTrend,
          datasets: [
            { label: "Critical", data: [1, 2, 4], isTotal: false },
            { label: "Total", data: [1, 2, 4], isTotal: true },
          ],
        },
      },
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);

    view.rerender(<SidakDashboardPage />);

    await waitFor(() => {
      expect(screen.queryByText("Insight lama.")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Update Prediksi" }),
      ).toBeInTheDocument();
    });

    resolveLookup?.({ status: "stale", snapshot: null });
    expect(
      await screen.findByRole("button", {
        name: "Data baru — Perbarui Prediksi",
      }),
    ).toBeInTheDocument();
  });
});
