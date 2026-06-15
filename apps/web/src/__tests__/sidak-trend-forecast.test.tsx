import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DashboardTrendPanel from "../routes/dashboard/DashboardTrendPanel";
import ParamTrendChart from "../components/sidak/ParamTrendChart";
import { sidakClient, unwrapResponse } from "../lib/api";
import React from "react";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children, data }: any) => (
    <div data-testid="area-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: ({ dataKey, data }: any) => (
    <div
      data-testid={`area-${dataKey}`}
      data-series={data ? JSON.stringify(data) : ""}
    />
  ),
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
}));

// Mock API
vi.mock("../lib/api", () => ({
  sidakClient: {
    dashboard: {
      forecast: {
        $post: vi.fn(),
      },
    },
  },
  unwrapResponse: vi.fn(),
}));

vi.mock("../../components/ui/MonthRangePicker", () => ({
  MonthRangePicker: () => <div data-testid="month-range-picker" />,
}));

describe("DashboardTrendPanel Forecast", () => {
  const mockTrendData: any = {
    labels: ["Jan 26", "Feb 26"],
    totalData: [10, 15],
    serviceData: { call: [10, 15] },
    activeServices: ["call"],
    serviceSummary: { call: { totalDefects: 25, auditedAgents: 5 } },
    totalSummary: { totalDefects: 25, auditedAgents: 5, activeServiceCount: 1 },
  };

  const mockForecastResult = {
    series: {
      total: {
        scope: { type: "total", label: "Total Temuan" },
        historical: [
          { label: "Jan 26", value: 10 },
          { label: "Feb 26", value: 15 },
        ],
        forecast: [{ label: "Mar 26", value: 20 }],
        summary: {
          direction: "up",
          projectedChange: 5,
          projectedChangePercent: 33.3,
          confidence: "high",
        },
        status: "ready",
      },
      parameters: {
        "Etika Bertelepon": {
          scope: {
            type: "parameter",
            parameterId: "Etika Bertelepon",
            label: "Etika Bertelepon",
          },
          historical: [],
          forecast: [{ label: "Mar 26", value: 4 }],
          summary: {
            direction: "up",
            projectedChange: 1,
            projectedChangePercent: 33.3,
            confidence: "low",
          },
          status: "ready",
        },
      },
    },
    insight: { text: "Tren meningkat.", status: "generated" },
    cache: {
      status: "refreshed",
      filterKey: "filter",
      dataFingerprint: "data",
    },
    generatedAt: "2026-06-14T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sidakClient.dashboard.forecast.$post).mockResolvedValue(
      {} as any,
    );
    vi.mocked(unwrapResponse).mockResolvedValue({
      status: "missing",
      snapshot: null,
    });
  });

  it("renders Update Prediksi button", () => {
    render(
      <DashboardTrendPanel
        serviceTrendMap={{ all: mockTrendData } as any}
        availableYears={[2026]}
        selectedYear={2026}
        trendStartMonth={1}
        trendEndMonth={2}
        trendLoading={false}
        localTrendData={null}
        onYearChange={() => {}}
        onRangeChange={() => {}}
      />
    );

    expect(screen.getByText(/Update Prediksi/i)).toBeInTheDocument();
  });

  it("calls forecast API when button is clicked", async () => {
    vi.mocked(unwrapResponse)
      .mockResolvedValueOnce({ status: "missing", snapshot: null })
      .mockResolvedValueOnce({ status: "ready", snapshot: mockForecastResult });

    render(
      <DashboardTrendPanel
        serviceTrendMap={{ all: mockTrendData } as any}
        availableYears={[2026]}
        selectedYear={2026}
        trendStartMonth={1}
        trendEndMonth={2}
        trendLoading={false}
        localTrendData={null}
        onYearChange={() => {}}
        onRangeChange={() => {}}
      />
    );

    const button = screen.getByText(/Update Prediksi/i);
    await waitFor(() => {
      expect(sidakClient.dashboard.forecast.$post).toHaveBeenCalledWith({
        json: expect.objectContaining({ cacheOnly: true }),
      });
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(sidakClient.dashboard.forecast.$post).toHaveBeenCalledWith({
        json: expect.objectContaining({
          forceRefresh: true,
          cacheOnly: false,
        }),
      });
      expect(screen.getByText(/Insight Forecast/i)).toBeInTheDocument();
      expect(screen.getByText(/Tren meningkat./i)).toBeInTheDocument();
    });

    const chartData = JSON.parse(
      screen.getByTestId("area-chart").getAttribute("data-chart") || "[]",
    );
    expect(chartData.map((point: any) => point.name)).toEqual([
      "Jan 26",
      "Feb 26",
      "Mar 26",
    ]);
    expect(chartData[1]).toMatchObject({
      actual_Total: 15,
      forecast_Total: 15,
    });
    expect(chartData[2]).toMatchObject({
      actual_Total: null,
      forecast_Total: 20,
    });
  });

  it("shows stale attention when cache lookup reports changed data", async () => {
    vi.mocked(unwrapResponse).mockResolvedValueOnce({
      status: "stale",
      snapshot: null,
    });

    render(
      <DashboardTrendPanel
        serviceTrendMap={{ all: mockTrendData } as any}
        availableYears={[2026]}
        selectedYear={2026}
        trendStartMonth={1}
        trendEndMonth={2}
        trendLoading={false}
        localTrendData={null}
        onYearChange={() => {}}
        onRangeChange={() => {}}
      />
    );

    expect(
      await screen.findByRole("button", {
        name: "Data baru — Perbarui Prediksi",
      }),
    ).toBeInTheDocument();
  });

  it("retains stale attention if force refresh fails", async () => {
    vi.mocked(unwrapResponse).mockResolvedValueOnce({
      status: "stale",
      snapshot: null,
    });

    render(
      <DashboardTrendPanel
        serviceTrendMap={{ all: mockTrendData } as any}
        availableYears={[2026]}
        selectedYear={2026}
        trendStartMonth={1}
        trendEndMonth={2}
        trendLoading={false}
        localTrendData={null}
        onYearChange={() => {}}
        onRangeChange={() => {}}
      />
    );

    const button = await screen.findByRole("button", {
      name: "Data baru — Perbarui Prediksi",
    });

    vi.mocked(unwrapResponse).mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Data baru — Perbarui Prediksi" })).toBeInTheDocument();
    });
  });

  it("disables button if data is insufficient", () => {
    const limitedData = { ...mockTrendData, labels: ["Jan 26"], totalData: [10] };
    render(
      <DashboardTrendPanel
        serviceTrendMap={{ all: limitedData } as any}
        availableYears={[2026]}
        selectedYear={2026}
        trendStartMonth={1}
        trendEndMonth={1}
        trendLoading={false}
        localTrendData={null}
        onYearChange={() => {}}
        onRangeChange={() => {}}
      />
    );

    const button = screen.getByText(/Update Prediksi/i);
    expect(button).toBeDisabled();
  });

  it("places parameter forecast on future months instead of historical month indexes", () => {
    render(
      <ParamTrendChart
        labels={["Jan 26", "Feb 26", "Mar 26", "Apr 26", "Mei 26"]}
        datasets={[
          {
            label: "Total Temuan",
            data: [164, 129, 130, 122, 80],
            isTotal: true,
          },
        ]}
        showParameters
        forecastResult={{
          scope: { type: "total" },
          historical: [
            { label: "Jan 26", value: 164 },
            { label: "Feb 26", value: 129 },
            { label: "Mar 26", value: 130 },
            { label: "Apr 26", value: 122 },
            { label: "Mei 26", value: 80 },
          ],
          forecast: [
            { label: "Jun 26", value: 65.8 },
            { label: "Jul 26", value: 51.7 },
            { label: "Agt 26", value: 37.5 },
          ],
          summary: {},
          status: "ready",
        } as any}
      />,
    );

    const chartData = JSON.parse(
      screen.getByTestId("area-chart").getAttribute("data-chart") || "[]",
    );

    expect(chartData.map((point: any) => point.name)).toEqual([
      "Jan 26",
      "Feb 26",
      "Mar 26",
      "Apr 26",
      "Mei 26",
      "Jun 26",
      "Jul 26",
      "Agt 26",
    ]);
    expect(chartData[4]).toMatchObject({
      actual_dataset_0: 80,
      forecast_dataset_0: 80,
    });
    expect(chartData[5]).toMatchObject({
      actual_dataset_0: null,
      forecast_dataset_0: 65.8,
    });
    expect(screen.getByTestId("area-forecast_dataset_0")).toHaveAttribute(
      "data-series",
      "",
    );
  });
});
