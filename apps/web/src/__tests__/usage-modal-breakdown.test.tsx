import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UsageModal } from "../components/UsageModal";
import * as usageSummaryModule from "../lib/usage-summary";
import { emptyUsageBreakdown } from "../lib/usage-snapshot";

vi.mock("../lib/usage-summary", () => ({
  fetchUsageSummary: vi.fn(),
}));

describe("UsageModal — simulation/review breakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders breakdown rows when data is available", async () => {
    const mockBreakdown = emptyUsageBreakdown();
    mockBreakdown.simulation.costIdr = 30000;
    mockBreakdown.review.costIdr = 20000;

    (usageSummaryModule.fetchUsageSummary as any).mockResolvedValue({
      totalCalls: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalTokens: 8000,
      totalCostIdr: 50000,
      simulationCostIdr: 30000,
      reviewCostIdr: 20000,
      periodLabel: "Mei 2026",
      breakdown: mockBreakdown,
    });

    render(
      <UsageModal
        isOpen={true}
        onClose={vi.fn()}
        module="ketik"
        sessionDelta={null}
        sessionDeltaPending={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Simulasi")).toBeTruthy();
    });
    expect(screen.getByText("Penilaian AI")).toBeTruthy();
    expect(screen.getByText(/Rp\s?30\.000/)).toBeTruthy();
    expect(screen.getByText(/Rp\s?20\.000/)).toBeTruthy();
  });

  it("shows session delta with simulation/review split in breakdown rows", async () => {
    (usageSummaryModule.fetchUsageSummary as any).mockResolvedValue({
      totalCalls: 10,
      totalTokens: 8000,
      totalCostIdr: 50000,
    });

    const mockDeltaBreakdown = emptyUsageBreakdown();
    mockDeltaBreakdown.simulation.costIdr = 3000;
    mockDeltaBreakdown.review.costIdr = 2000;

    render(
      <UsageModal
        isOpen={true}
        onClose={vi.fn()}
        module="pdkt"
        sessionDelta={{
          costIdr: 5000,
          inputTokens: 800,
          outputTokens: 200,
          totalTokens: 1000,
          totalCalls: 2,
          simulationCostIdr: 3000,
          reviewCostIdr: 2000,
          breakdown: mockDeltaBreakdown,
        }}
        sessionDeltaPending={false}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Simulasi").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/\+Rp\s?3\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Penilaian AI").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+Rp\s?2\.000/).length).toBeGreaterThan(0);
  });

  it("shows pending state when sessionDeltaPending is true", async () => {
    (usageSummaryModule.fetchUsageSummary as any).mockResolvedValue({
      totalCalls: 5,
      totalTokens: 3000,
      totalCostIdr: 20000,
    });

    render(
      <UsageModal
        isOpen={true}
        onClose={vi.fn()}
        module="telefun"
        sessionDelta={null}
        sessionDeltaPending={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("masih diproses")).toBeTruthy();
    });
  });

  it("hides empty categories in breakdown rows", async () => {
    (usageSummaryModule.fetchUsageSummary as any).mockResolvedValue({
      totalCalls: 3,
      totalTokens: 1500,
      totalCostIdr: 8000,
      breakdown: emptyUsageBreakdown(),
    });

    render(
      <UsageModal
        isOpen={true}
        onClose={vi.fn()}
        module="ketik"
        sessionDelta={null}
        sessionDeltaPending={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Estimasi Biaya Bulan Ini")).toBeTruthy();
    });
    // Category rows should NOT be rendered if all are 0
    expect(screen.queryByText("Simulasi")).toBeNull();
    expect(screen.queryByText("Penilaian AI")).toBeNull();
  });
});
