import { render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../components/sidak/KpiCard", () => ({
  default: ({
    label,
    value,
    delta,
  }: {
    label: string;
    value: string | number;
    delta: { text: string; comparisonLabel: string } | null;
  }) => (
    <div data-testid={`kpi-${label}`}>
      <span>{value}</span>
      <span>{delta ? `${delta.text} ${delta.comparisonLabel}` : "Belum ada pembanding"}</span>
    </div>
  ),
}));

vi.mock("../components/sidak/ParamTrendChart", () => ({
  default: () => <div data-testid="param-trend-chart" />,
}));

vi.mock("../components/sidak/ParetoChart", () => ({
  default: () => <div data-testid="pareto-chart" />,
}));

vi.mock("../components/sidak/FatalDonutChart", () => ({
  default: () => <div data-testid="fatal-donut-chart" />,
}));

vi.mock("../components/sidak/ServiceBarChart", () => ({
  default: () => <div data-testid="service-bar-chart" />,
}));

import SidakDashboardPage from "../routes/sidak/dashboard";

const mockDashboardData = {
  summary: {
    totalDefects: 529,
    avgDefectsPerAudit: 6.8,
    avgAgentScore: 99.5,
    complianceRate: 100,
    complianceCount: 78,
    totalAgents: 18,
  },
  topAgents: [
    {
      agentId: "a-1",
      nama: "Noor Qodiri Mobarok",
      batch: "Tim Email",
      defects: 41,
      score: 89,
      hasCritical: true,
    },
    {
      agentId: "a-2",
      nama: "Susi Ayu",
      batch: "Tim Call",
      defects: 32,
      score: 92.7,
      hasCritical: true,
    },
    {
      agentId: "a-3",
      nama: "Ujang Usman",
      batch: "Tim Telepon",
      defects: 39,
      score: 90.3,
      hasCritical: true,
    },
  ],
  paretoData: [
    {
      name: "Kemampuan Pencatatan",
      fullName: "Kemampuan Pencatatan",
      count: 118,
      cumulative: 43,
      category: "critical",
    },
  ],
  donutData: {
    critical: 35,
    nonCritical: 21,
    total: 56,
  },
  paramTrend: {
    labels: ["Jan 26", "Feb 26", "Mar 26", "Apr 26", "Mei 26"],
    datasets: [
      {
        label: "Total Temuan",
        data: [180, 145, 132, 133, 128],
        isTotal: true,
      },
      {
        label: "Kemampuan Pencatat...",
        data: [40, 35, 32, 31, 28],
        isTotal: false,
      },
    ],
  },
  sparklines: {
    "total-defects": [
      { label: "Apr 26", value: 110 },
      { label: "Mei 26", value: 128 },
    ],
    "avg-defects": [
      { label: "Apr 26", value: 7.1 },
      { label: "Mei 26", value: 6.8 },
    ],
    "avg-score": [
      { label: "Apr 26", value: 99.3 },
      { label: "Mei 26", value: 99.5 },
    ],
    compliance: [
      { label: "Apr 26", value: 98.6, count: 73, totalAudited: 74 },
      { label: "Mei 26", value: 100, count: 78, totalAudited: 78 },
    ],
  },
  serviceData: [
    {
      name: "Call",
      displayName: "Call",
      total: 120,
      severity: "Critical",
      serviceType: "call",
    },
  ],
  availableYears: [2024, 2025, 2026],
  currentYear: 2026,
  folders: [
    { id: "ALL", name: "Semua Tim" },
    { id: "team-1", name: "Tim Email" },
  ],
};

describe("SIDAK dashboard legacy parity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the legacy dashboard copy, defaults, and leaderboard link", () => {
    useApiMock.mockReturnValue({
      data: mockDashboardData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakDashboardPage />);

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0]).toHaveValue("call");
    expect(selects[1]).toHaveValue("ALL");
    expect(selects[2]).toHaveValue("2026");
    expect(selects[3]).toHaveValue("1");
    expect(selects[4]).toHaveValue("5");

    const leaderboardLink = screen.getByRole("link", { name: "Lihat Semua" });
    expect(leaderboardLink).toHaveAttribute(
      "href",
      "/sidak/ranking?service=call&year=2026",
    );
    expect(
      screen.getByRole("heading", { name: "Top Agen (Temuan)" }),
    ).toBeInTheDocument();

    expect(screen.getByTestId("kpi-Rata-rata Skor")).toHaveTextContent("99.5%Naik 0.2 poin vs Apr 26");
    expect(screen.getByTestId("kpi-Rata-rata Kepatuhan")).toHaveTextContent("100.0%Naik 1.4 poin vs Apr 26");
  });

  it("renders a legacy-style loading skeleton on initial load", () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<SidakDashboardPage />);

    expect(
      screen.queryByText("Memuat data dashboard..."),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="sidak-dashboard-skeleton"]')).toBeInTheDocument();
  });
});
