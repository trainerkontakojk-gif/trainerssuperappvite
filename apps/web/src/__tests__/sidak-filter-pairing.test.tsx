import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import React from "react";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../components/sidak/KpiCard", () => ({
  default: () => <div />,
}));

vi.mock("../components/sidak/ParamTrendChart", () => ({
  default: () => <div />,
}));

vi.mock("../components/sidak/ParetoChart", () => ({
  default: () => <div />,
}));

vi.mock("../components/sidak/FatalDonutChart", () => ({
  default: () => <div />,
}));

vi.mock("../components/sidak/ServiceBarChart", () => ({
  default: () => <div />,
}));

import SidakDashboardPage from "../routes/sidak/dashboard";
import SidakRankingPage from "../routes/sidak/ranking";

const mockFolders = [
  { id: "team-call-id", nama: "Tim Call", name: "Tim Call" },
  { id: "team-whatsapp-id", nama: "Tim Whatsapp", name: "Tim Whatsapp" },
  { id: "team-email-id", nama: "Tim Email", name: "Tim Email" },
  { id: "team-mix-id", nama: "Tim Mix", name: "Tim Mix" },
  { id: "team-bko-id", nama: "Tim BKO", name: "Tim BKO" },
];

const mockDashboardData = {
  summary: {
    totalDefects: 10,
    avgDefectsPerAudit: 1.5,
    avgAgentScore: 90,
    complianceRate: 100,
    complianceCount: 5,
    totalAgents: 5,
  },
  topAgents: [],
  paretoData: [],
  donutData: { critical: 0, nonCritical: 0, total: 0 },
  paramTrend: { labels: [], datasets: [] },
  sparklines: {
    "total-defects": [],
    "avg-defects": [],
    "avg-score": [],
    compliance: [],
  },
  serviceData: [],
  availableYears: [2026],
  currentYear: 2026,
  folders: mockFolders,
};

const mockRankingData = {
  rankings: [],
  periods: [],
  folders: mockFolders,
  availableYears: [2026],
  availableServices: ["call", "chat", "email", "cso", "pencatatan", "bko"],
};

const filteredFolderData = {
  ...mockDashboardData,
  folders: [mockFolders[0]],
};

const filteredRankingData = {
  ...mockRankingData,
  folders: [mockFolders[0]],
};

describe("SIDAK default filter pairing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("Dashboard: keeps full folder options after API shrinks to the selected folder, then switches to the paired folder", async () => {
    useApiMock.mockImplementation((path: string) => ({
      data: path.includes("folder_ids=team-call-id")
        ? filteredFolderData
        : mockDashboardData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SidakDashboardPage />);

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];

    expect(selects[0]).toHaveValue("call");
    expect(selects[1]).toHaveValue("team-call-id");
    expect(
      Array.from(selects[1].options).some(
        (option) => option.value === "team-whatsapp-id",
      ),
    ).toBe(true);

    fireEvent.change(selects[0], { target: { value: "chat" } });
    expect(selects[0]).toHaveValue("chat");
    expect(selects[1]).toHaveValue("team-whatsapp-id");
  });

  it("Ranking: keeps full folder options after API shrinks to the selected folder, then switches to the paired folder", async () => {
    useApiMock.mockImplementation((path: string) => ({
      data: path.includes("folder=team-call-id")
        ? filteredRankingData
        : mockRankingData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<SidakRankingPage />);

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const serviceSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "call"),
    )!;
    const folderSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "team-call-id"),
    )!;

    expect(serviceSelect).toBeDefined();
    expect(folderSelect).toBeDefined();
    expect(serviceSelect).toHaveValue("call");
    expect(folderSelect).toHaveValue("team-call-id");
    expect(
      Array.from(folderSelect.options).some(
        (option) => option.value === "team-whatsapp-id",
      ),
    ).toBe(true);

    fireEvent.change(serviceSelect, { target: { value: "chat" } });
    expect(serviceSelect).toHaveValue("chat");
    expect(folderSelect).toHaveValue("team-whatsapp-id");
  });
});
