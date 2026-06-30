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

vi.mock("../components/sidak/ParamTrendChart", () => ({
  default: (props: any) => (
    <div data-testid="param-trend-chart-props">
      {JSON.stringify({
        hideTotal: props.hideTotal,
        forecastScopes:
          props.forecastResults?.map((series: any) => ({
            type: series.scope?.type ?? null,
            parameterId: series.scope?.parameterId ?? null,
          })) ??
          (props.forecastResult
            ? [
                {
                  type: props.forecastResult.scope?.type ?? null,
                  parameterId: props.forecastResult.scope?.parameterId ?? null,
                },
              ]
            : []),
      })}
    </div>
  ),
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

  const multiParameterDashboardData = {
    ...dashboardData,
    paramTrend: {
      labels: ["Jan 26", "Feb 26", "Mar 26"],
      datasets: [
        { label: "Critical", data: [1, 2, 3], isTotal: false },
        { label: "Greeting", data: [2, 1, 2], isTotal: false },
        { label: "Closing", data: [3, 2, 1], isTotal: false },
        { label: "Total", data: [6, 5, 6], isTotal: true },
      ],
    },
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

  mockForecastResult.series.parameters = {
    Critical: {
      scope: {
        type: "parameter",
        parameterId: "Critical",
        label: "Critical",
      },
      historical: [],
      forecast: [
        { label: "Apr 26", date: "2026-04-01T00:00:00.000Z", value: 5 },
      ],
      summary: {
        direction: "up",
        projectedChange: 2,
        projectedChangePercent: 66.7,
        confidence: "low",
        method: "linear-regression",
        sourcePointCount: 3,
      },
      status: "ready",
    },
    Greeting: {
      scope: {
        type: "parameter",
        parameterId: "Greeting",
        label: "Greeting",
      },
      historical: [],
      forecast: [
        { label: "Apr 26", date: "2026-04-01T00:00:00.000Z", value: 3 },
      ],
      summary: {
        direction: "up",
        projectedChange: 1,
        projectedChangePercent: 50,
        confidence: "low",
        method: "linear-regression",
        sourcePointCount: 3,
      },
      status: "ready",
    },
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

  it("toggles an existing forecast without clearing the snapshot", async () => {
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "fresh",
      snapshot: mockForecastResult,
    });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    expect(await screen.findByText("Insight lama.")).toBeInTheDocument();
    expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
      '"type":"total"',
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Sembunyikan Prediksi" }),
    );

    expect(screen.queryByText("Insight lama.")).not.toBeInTheDocument();
    expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
      '"forecastScopes":[]',
    );
    expect(
      screen.getByRole("button", { name: "Tampilkan Prediksi" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Tampilkan Prediksi" }),
    );

    expect(await screen.findByText("Insight lama.")).toBeInTheDocument();
    expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
      '"type":"total"',
    );
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

  it("limits visible parameters to two and unlocks another after one is unselected", async () => {
    vi.mocked(useApi).mockReturnValue({
      data: multiParameterDashboardData,
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "missing",
      snapshot: null,
    });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    const criticalButton = screen.getByRole("button", { name: /Critical/i });
    const greetingButton = screen.getByRole("button", { name: /Greeting/i });
    const closingButton = screen.getByRole("button", { name: /Closing/i });
    const totalButton = screen.getByRole("button", { name: /Total Temuan/i });

    expect(totalButton).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(totalButton);
    await userEvent.click(criticalButton);
    await userEvent.click(greetingButton);

    expect(closingButton).toBeDisabled();
    expect(totalButton).toBeDisabled();

    await userEvent.click(criticalButton);

    expect(closingButton).not.toBeDisabled();
    expect(totalButton).not.toBeDisabled();
  });

  it("passes two parameter forecasts without auto-including total after total is turned off", async () => {
    vi.mocked(useApi).mockReturnValue({
      data: multiParameterDashboardData,
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "fresh",
      snapshot: mockForecastResult,
    });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Total Temuan/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Critical/i }));
    await userEvent.click(screen.getByRole("button", { name: /Greeting/i }));

    await waitFor(() => {
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"parameterId":"Critical"',
      );
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"parameterId":"Greeting"',
      );
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"hideTotal":true',
      );
      expect(
        screen.getByTestId("param-trend-chart-props"),
      ).not.toHaveTextContent('"type":"total"');
    });
  });

  it("lets total temuan compare with one parameter and blocks a second parameter", async () => {
    vi.mocked(useApi).mockReturnValue({
      data: multiParameterDashboardData,
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "fresh",
      snapshot: mockForecastResult,
    });

    await act(async () => {
      render(<SidakDashboardPage />);
    });

    const totalButton = screen.getByRole("button", { name: /Total Temuan/i });
    const criticalButton = screen.getByRole("button", { name: /Critical/i });
    const greetingButton = screen.getByRole("button", { name: /Greeting/i });

    await userEvent.click(criticalButton);

    expect(totalButton).toHaveAttribute("aria-pressed", "true");
    expect(greetingButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"type":"total"',
      );
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"parameterId":"Critical"',
      );
      expect(screen.getByTestId("param-trend-chart-props")).toHaveTextContent(
        '"hideTotal":false',
      );
    });
  });
});
