import React from "react";
import { render, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import SidakSelectionCard from "../components/sidak/SidakSelectionCard";
import SidakSelectionGrid from "../components/sidak/SidakSelectionGrid";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("SidakSelectionGrid", () => {
  it("renders selection cards in a responsive grid", () => {
    render(
      <SidakSelectionGrid testId="folder-selection-grid">
        <SidakSelectionCard
          icon={<FolderOpen className="h-5 w-5" />}
          title="Tim Call"
          subtitle="12 agen"
          onClick={vi.fn()}
          testId="folder-selection-card"
        />
      </SidakSelectionGrid>,
    );

    const grid = screen.getByTestId("folder-selection-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).toContain("xl:grid-cols-3");
    expect(screen.getByText("Tim Call")).toBeInTheDocument();
    expect(screen.getByText("12 agen")).toBeInTheDocument();
  });
});
