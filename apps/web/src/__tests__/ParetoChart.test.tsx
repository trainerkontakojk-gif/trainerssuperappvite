import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParetoChart, { ParetoTooltip } from "../components/sidak/ParetoChart";

// Mock ResponsiveContainer to render children cleanly in testing-library/jsdom
vi.mock("recharts", async () => {
  const original = await vi.importActual<any>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

describe("ParetoChart", () => {
  it("renders the ParetoChart component and mock wrapper", () => {
    const { container } = render(
      <ParetoChart
        data={[
          {
            name: "Kesesuaian Data",
            fullName: "Kesesuaian Data pada Kertas Kerja",
            count: 32,
            cumulative: 89,
            category: "none",
          },
        ]}
        insight={null}
      />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  describe("ParetoTooltip", () => {
    it("renders BKO tooltip content with full parameter details for category: none", () => {
      render(
        <ParetoTooltip
          active
          serviceLabel="BKO"
          payload={[
            {
              dataKey: "count",
              value: 32,
              payload: {
                name: "Kesesuaian Data",
                fullName: "Kesesuaian Data pada Kertas Kerja",
                count: 32,
                cumulative: 89,
                category: "none",
              },
            },
          ]}
        />
      );

      expect(screen.getByText("BKO")).toBeInTheDocument();
      expect(screen.getByText("Kesesuaian Data pada Kertas Kerja")).toBeInTheDocument();
      expect(screen.getByText("Jumlah Temuan")).toBeInTheDocument();
      expect(screen.getByText("32")).toBeInTheDocument();
      expect(screen.getByText("Kumulatif")).toBeInTheDocument();
      expect(screen.getByText("89%")).toBeInTheDocument();
      expect(screen.getByText("No Category")).toBeInTheDocument();
    });

    it("renders correct label for critical category", () => {
      render(
        <ParetoTooltip
          active
          payload={[
            {
              dataKey: "count",
              value: 5,
              payload: {
                name: "Critical Info",
                fullName: "Critical Info Full",
                count: 5,
                cumulative: 20,
                category: "critical",
              },
            },
          ]}
        />
      );

      expect(screen.getByText("Critical Parameter")).toBeInTheDocument();
    });

    it("renders correct label for non-critical category", () => {
      render(
        <ParetoTooltip
          active
          payload={[
            {
              dataKey: "count",
              value: 12,
              payload: {
                name: "Non Critical Info",
                fullName: "Non Critical Info Full",
                count: 12,
                cumulative: 50,
                category: "non_critical",
              },
            },
          ]}
        />
      );

      expect(screen.getByText("Non-Critical Parameter")).toBeInTheDocument();
    });

    it("returns null when not active or has empty/invalid payload", () => {
      const { container: container1 } = render(
        <ParetoTooltip active={false} payload={[]} />
      );
      expect(container1.firstChild).toBeNull();

      const { container: container2 } = render(
        <ParetoTooltip active payload={[]} />
      );
      expect(container2.firstChild).toBeNull();
    });
  });
});
