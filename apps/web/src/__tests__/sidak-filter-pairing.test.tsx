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
  { id: "team-call-id", nama: "Tim Call", name: "Tim Call", parent_id: null },
  {
    id: "team-whatsapp-id",
    nama: "Tim Whatsapp",
    name: "Tim Whatsapp",
    parent_id: null,
  },
  { id: "team-email-id", nama: "Tim Email", name: "Tim Email", parent_id: null },
  { id: "team-mix-id", nama: "Tim Mix", name: "Tim Mix", parent_id: null },
  { id: "team-bko-id", nama: "Tim BKO", name: "Tim BKO", parent_id: null },
  {
    id: "batch-anis-id",
    nama: "Siti Nur Anisa",
    name: "Siti Nur Anisa",
    parent_id: "team-call-id",
  },
  {
    id: "batch-fahmi-id",
    nama: "Muhammad Fahmi Nasrulloh",
    name: "Muhammad Fahmi Nasrulloh",
    parent_id: "team-call-id",
  },
  {
    id: "batch-dwiana-id",
    nama: "Dwiana Amelia",
    name: "Dwiana Amelia",
    parent_id: "team-whatsapp-id",
  },
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
  folders: [mockFolders[0], mockFolders[5], mockFolders[6]],
};

const filteredRankingData = {
  ...mockRankingData,
  folders: [mockFolders[0], mockFolders[5], mockFolders[6]],
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

  it("Dashboard: keeps grouped folder options after API shrinks to the selected folder, then switches to the paired root folder", async () => {
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
    const serviceSelect = selects[0];
    const folderSelect = selects[1];

    expect(serviceSelect).toHaveValue("call");
    expect(folderSelect).toHaveValue("team-call-id");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "team-call-id",
      )?.text,
    ).toBe("Tim Call — Semua batch");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "batch-anis-id",
      )?.text,
    ).toBe("↳ Siti Nur Anisa");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "team-whatsapp-id",
      )?.text,
    ).toBe("Tim Whatsapp — Semua batch");

    fireEvent.change(serviceSelect, { target: { value: "chat" } });
    expect(serviceSelect).toHaveValue("chat");
    expect(folderSelect).toHaveValue("team-whatsapp-id");
  });

  it("Ranking: keeps grouped folder options after API shrinks to the selected folder, then switches to the paired root folder", async () => {
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
    const serviceSelect = selects.find((select) =>
      Array.from(select.options).some((option) => option.value === "call"),
    )!;
    const folderSelect = selects.find((select) =>
      Array.from(select.options).some(
        (option) => option.value === "team-call-id",
      ),
    )!;

    expect(serviceSelect).toBeDefined();
    expect(folderSelect).toBeDefined();
    expect(serviceSelect).toHaveValue("call");
    expect(folderSelect).toHaveValue("team-call-id");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "team-call-id",
      )?.text,
    ).toBe("Tim Call — Semua batch");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "batch-fahmi-id",
      )?.text,
    ).toBe("↳ Muhammad Fahmi Nasrulloh");
    expect(
      Array.from(folderSelect.options).find(
        (option) => option.value === "team-whatsapp-id",
      )?.text,
    ).toBe("Tim Whatsapp — Semua batch");

    fireEvent.change(serviceSelect, { target: { value: "chat" } });
    expect(serviceSelect).toHaveValue("chat");
    expect(folderSelect).toHaveValue("team-whatsapp-id");
  });
});
