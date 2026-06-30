import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SidakForecastPage from "../routes/sidak/forecast";
import { sidakClient, unwrapResponse } from "../lib/api";
import { useApi } from "../hooks/useApi";

vi.mock("../lib/api", () => ({
  sidakClient: {
    dashboard: {
      forecast: {
        $post: vi.fn(),
      },
    },
    forecast: {
      agents: {
        $post: vi.fn(),
      },
    },
  },
  unwrapResponse: vi.fn(),
}));

vi.mock("../hooks/useApi", () => ({
  useApi: vi.fn(),
}));

vi.mock("../components/sidak/ParamTrendChart", () => ({
  default: () => <div data-testid="service-forecast-chart" />,
}));

vi.mock("../components/sidak/ForecastActionButton", () => ({
  ForecastActionButton: (props: any) => (
    <button type="button" onClick={props.onClick}>
      {props.status === "stale"
        ? "Data baru — Perbarui Prediksi"
        : props.status === "fresh"
          ? "Perbarui Prediksi"
          : "Update Prediksi"}
    </button>
  ),
}));

describe("SidakForecastPage", () => {
  const dashboardData = {
    periods: [
      { id: "p1", month: 1, year: 2026, label: "Jan 26", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "p2", month: 2, year: 2026, label: "Feb 26", created_at: "2026-02-01T00:00:00.000Z" },
      { id: "p3", month: 3, year: 2026, label: "Mar 26", created_at: "2026-03-01T00:00:00.000Z" },
    ],
    folders: [
      { id: "folder-call", name: "Tim Call", parent_id: null },
      { id: "folder-call-qa", name: "Tim Call - QA", parent_id: "folder-call" },
    ],
    summary: null,
    serviceData: [],
    topAgents: [],
    paretoData: [],
    donutData: null,
    paramTrend: {
      labels: ["Jan 26", "Feb 26", "Mar 26"],
      datasets: [
        { label: "Total Temuan", data: [12, 10, 8], isTotal: true },
      ],
    },
    periodMetrics: [],
    sparklines: {},
    availableYears: [2026],
    currentYear: 2026,
    availableServices: ["call"],
  };

  const serviceForecast = {
    status: "fresh",
    snapshot: {
      series: {
        total: {
          scope: { type: "total", label: "Total Temuan" },
          historical: [
            { periodId: "p1", label: "Jan 26", date: "2026-01-01T00:00:00.000Z", value: 12 },
            { periodId: "p2", label: "Feb 26", date: "2026-02-01T00:00:00.000Z", value: 10 },
            { periodId: "p3", label: "Mar 26", date: "2026-03-01T00:00:00.000Z", value: 8 },
          ],
          forecast: [
            { label: "Apr 26", date: "2026-04-01T00:00:00.000Z", value: 7 },
            { label: "Mei 26", date: "2026-05-01T00:00:00.000Z", value: 6 },
            { label: "Jun 26", date: "2026-06-01T00:00:00.000Z", value: 5 },
          ],
          summary: {
            direction: "down",
            projectedChange: -3,
            projectedChangePercent: -37.5,
            confidence: "high",
            method: "linear-regression",
            sourcePointCount: 3,
          },
          status: "ready",
        },
        parameters: {},
      },
      insight: {
        text: "Insight snapshot.",
        status: "generated",
      },
      cache: {
        status: "hit",
        filterKey: "filter",
        dataFingerprint: "fingerprint",
      },
      generatedAt: "2026-06-14T00:00:00.000Z",
    },
  };

  const agentForecast = {
    improvingAgents: [
      {
        agentId: "agent-a",
        nama: "Agent A",
        tim: "Tim Call",
        batchName: "Tim Call",
        jabatan: "spv",
        foto_url: null,
        latestPeriodLabel: "Mar 26",
        latestScore: 82,
        latestFindingsCount: 4,
        latestCriticalFindingsCount: 1,
        projectedScore: 87,
        projectedScoreChange: 5,
        projectedFindings: 2,
        projectedFindingsChange: -2,
        projectedCriticalFindings: 1,
        projectedCriticalFindingsChange: 0,
        sourcePointCount: 3,
        forecastStatus: "improving",
        confidence: "high",
        historical: [],
      },
    ],
    decliningAgents: [
      {
        agentId: "agent-b",
        nama: "Agent B",
        tim: "Tim Call",
        batchName: "Tim Call",
        jabatan: "spv",
        foto_url: null,
        latestPeriodLabel: "Mar 26",
        latestScore: 91,
        latestFindingsCount: 1,
        latestCriticalFindingsCount: 0,
        projectedScore: 84,
        projectedScoreChange: -7,
        projectedFindings: 4,
        projectedFindingsChange: 3,
        projectedCriticalFindings: 1,
        projectedCriticalFindingsChange: 1,
        sourcePointCount: 3,
        forecastStatus: "declining",
        confidence: "medium",
        historical: [],
      },
    ],
    stableAgents: [
      {
        agentId: "agent-c",
        nama: "Agent C",
        tim: "Tim Call",
        batchName: "Tim Call",
        jabatan: "spv",
        foto_url: null,
        latestPeriodLabel: "Mar 26",
        latestScore: 88,
        latestFindingsCount: 2,
        latestCriticalFindingsCount: 0,
        projectedScore: 88.5,
        projectedScoreChange: 0.5,
        projectedFindings: 2,
        projectedFindingsChange: 0,
        projectedCriticalFindings: 0,
        projectedCriticalFindingsChange: 0,
        sourcePointCount: 3,
        forecastStatus: "stable",
        confidence: "medium",
        historical: [],
      },
    ],
    watchlistAgents: [
      {
        agentId: "agent-d",
        nama: "Agent D",
        tim: "Tim Call",
        batchName: "Tim Call",
        jabatan: "spv",
        foto_url: null,
        latestPeriodLabel: "Mar 26",
        latestScore: 90,
        latestFindingsCount: 1,
        latestCriticalFindingsCount: 0,
        projectedScore: 90,
        projectedScoreChange: 0,
        projectedFindings: 1,
        projectedFindingsChange: 0,
        projectedCriticalFindings: 0,
        projectedCriticalFindingsChange: 0,
        sourcePointCount: 1,
        forecastStatus: "insufficient_data",
        confidence: "low",
        historical: [],
      },
    ],
    summary: {
      totalEligible: 4,
      improvingCount: 1,
      decliningCount: 1,
      stableCount: 1,
      watchlistCount: 1,
      latestPeriodLabel: "Mar 26",
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

    vi.mocked(sidakClient.dashboard.forecast.$post).mockResolvedValue({
      kind: "service",
    } as any);
    vi.mocked(sidakClient.forecast.agents.$post).mockResolvedValue({
      kind: "agent",
    } as any);
    vi.mocked(unwrapResponse).mockImplementation(async (response: any) => {
      if (response?.kind === "service") return serviceForecast;
      if (response?.kind === "agent") return agentForecast;
      return response;
    });
  });

  it("renders the forecast filter bar, service chart area, and primary agent lanes", async () => {
    render(<SidakForecastPage />);

    expect(screen.getByText("Forecast")).toBeInTheDocument();
    expect(screen.getByText("Horizon", { selector: "label" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("service-forecast-chart")).toBeInTheDocument();
    });

    expect(
      await screen.findByRole("heading", { name: "Membaik" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Memburuk" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Agent A")).toBeInTheDocument();
    expect(screen.getByText("Agent B")).toBeInTheDocument();
  });

  it("keeps fresh forecast data visible across idle rerenders", async () => {
    const { rerender } = render(<SidakForecastPage />);

    expect(await screen.findByText("Agent A")).toBeInTheDocument();
    const initialServiceCallCount =
      vi.mocked(sidakClient.dashboard.forecast.$post).mock.calls.length;

    rerender(<SidakForecastPage />);

    expect(screen.getByText("Agent A")).toBeInTheDocument();
    expect(
      vi.mocked(sidakClient.dashboard.forecast.$post).mock.calls.length,
    ).toBe(initialServiceCallCount);
  });

  it("keeps child folder options visible after scoped dashboard rerenders", async () => {
    const scopedDashboardData = {
      ...dashboardData,
      folders: [{ id: "folder-call", name: "Tim Call", parent_id: null }],
    };

    const { rerender } = render(<SidakForecastPage />);

    expect(await screen.findByText("↳ Tim Call - QA")).toBeInTheDocument();

    vi.mocked(useApi).mockReturnValue({
      data: scopedDashboardData,
      loading: false,
      refetch: vi.fn(),
      error: null,
    } as any);

    rerender(<SidakForecastPage />);

    expect(screen.getByText("↳ Tim Call - QA")).toBeInTheDocument();
  });

  it("keeps state labels readable in dark mode", async () => {
    document.documentElement.classList.add("dark");
    render(<SidakForecastPage />);

    expect(
      await screen.findByRole("heading", { name: "Membaik" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pantauan", { selector: "span" })).toBeInTheDocument();
    document.documentElement.classList.remove("dark");
  });
});
