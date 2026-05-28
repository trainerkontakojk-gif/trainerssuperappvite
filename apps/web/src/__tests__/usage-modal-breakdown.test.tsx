import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UsageModal } from "../components/UsageModal";
import * as useApiModule from "../hooks/useApi";

vi.mock("../hooks/useApi", () => ({
  getApi: vi.fn(),
}));

describe("UsageModal — simulation/review breakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders simulation and review cost cards when data is available", async () => {
    (useApiModule.getApi as any).mockResolvedValue({
      totalCalls: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalTokens: 8000,
      totalCostIdr: 50000,
      simulationCostIdr: 30000,
      reviewCostIdr: 20000,
      periodLabel: "Mei 2026",
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
      expect(screen.getByText("Biaya Simulasi")).toBeTruthy();
    });
    expect(screen.getByText("Biaya Penilaian AI")).toBeTruthy();
    expect(screen.getByText("Rp 30.000")).toBeTruthy();
    expect(screen.getByText("Rp 20.000")).toBeTruthy();
  });

  it("shows session delta with simulation/review split", async () => {
    (useApiModule.getApi as any).mockResolvedValue({
      totalCalls: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalTokens: 8000,
      totalCostIdr: 50000,
      simulationCostIdr: 30000,
      reviewCostIdr: 20000,
      periodLabel: "Mei 2026",
    });

    render(
      <UsageModal
        isOpen={true}
        onClose={vi.fn()}
        module="pdkt"
        sessionDelta={{
          costIdr: 5000,
          totalTokens: 1000,
          totalCalls: 2,
          simulationCostIdr: 3000,
          reviewCostIdr: 2000,
        }}
        sessionDeltaPending={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Simulasi \+Rp/)).toBeTruthy();
    });
    expect(screen.getByText(/Penilaian AI \+Rp/)).toBeTruthy();
  });

  it("shows pending state when sessionDeltaPending is true", async () => {
    (useApiModule.getApi as any).mockResolvedValue({
      totalCalls: 5,
      totalInputTokens: 2000,
      totalOutputTokens: 1000,
      totalTokens: 3000,
      totalCostIdr: 20000,
      simulationCostIdr: 15000,
      reviewCostIdr: 5000,
      periodLabel: "Mei 2026",
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

  it("hides simulation/review cards when values are 0", async () => {
    (useApiModule.getApi as any).mockResolvedValue({
      totalCalls: 3,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalTokens: 1500,
      totalCostIdr: 8000,
      simulationCostIdr: 0,
      reviewCostIdr: 0,
      periodLabel: "Mei 2026",
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
    // When both are 0, the cards show "-" dash
    const simCards = screen.getAllByText("-");
    expect(simCards.length).toBeGreaterThanOrEqual(2);
  });
});
