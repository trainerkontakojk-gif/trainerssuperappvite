import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonthRail from "../components/sidak/MonthRail";

describe("MonthRail", () => {
  it("exposes month, score, findings, and selection state to assistive technology", () => {
    const onMonthSelect = vi.fn();
    render(
      <MonthRail
        selectedMonth={5}
        onMonthSelect={onMonthSelect}
        summaries={[
          { month: 5, year: 2026, finalScore: 84.5, findingsCount: 2 },
          { month: 4, year: 2026, finalScore: 92, findingsCount: 0 },
        ]}
      />,
    );

    const may = screen.getByRole("button", {
      name: "Pilih bulan Mei 2026, skor 84.5 persen, 2 temuan, QA di bawah target 95 persen",
    });
    expect(may).toHaveAttribute("aria-pressed", "true");
    expect(may).toHaveClass("min-h-16");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pilih bulan Apr 2026, skor 92.0 persen, 0 temuan, QA di bawah target 95 persen",
      }),
    );
    expect(onMonthSelect).toHaveBeenCalledWith(4);
  });

  it("shows a compact warning icon for monthly scores below 95", () => {
    render(
      <MonthRail
        selectedMonth={1}
        onMonthSelect={vi.fn()}
        summaries={[
          { month: 1, year: 2026, finalScore: 94.9, findingsCount: 1 },
          { month: 2, year: 2026, finalScore: 95, findingsCount: 0 },
        ]}
      />,
    );

    expect(screen.getByText("QA di bawah target 95%")).toBeVisible();
    const warningIcon = screen.getByRole("img", {
      name: "Skor QA di bawah target 95 persen",
    });
    expect(warningIcon).toBeVisible();
    expect(warningIcon).not.toHaveClass("rounded-md");
    expect(screen.getAllByRole("img", { name: "Skor QA di bawah target 95 persen" })).toHaveLength(1);
  });
});
