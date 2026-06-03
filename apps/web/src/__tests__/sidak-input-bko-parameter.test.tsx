import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SidakInputManualForm from "../components/sidak/SidakInputManualForm";
import IndicatorDropdown from "../components/sidak/IndicatorDropdown";
import type { QAIndicator } from "@trainers/types";

describe("Sidak BKO Parameter resolver frontend UX", () => {
  const dummyEntries = [
    {
      uid: "e1",
      indicator_id: "",
      nilai: 3,
      ketidaksesuaian: "",
      sebaiknya: "",
    },
  ];

  it("renders a warning and disables the dropdown when activeIndicators is empty", () => {
    render(
      <SidakInputManualForm
        entries={dummyEntries}
        noTiket=""
        onSetNoTiket={vi.fn()}
        onUpdateEntry={vi.fn()}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        activeIndicators={[]}
        scoringMode="no_category"
        saving={false}
        previewing={false}
      />,
    );

    // Verify warning text is displayed
    expect(
      screen.getByText("Belum ada parameter untuk layanan dan periode ini."),
    ).toBeInTheDocument();

    // Verify the select button is disabled
    const dropdownButton = screen.getByRole("button", {
      name: "— Pilih parameter —",
    });
    expect(dropdownButton).toBeDisabled();
    expect(dropdownButton).toHaveClass("opacity-50");
  });

  it("does not show warning and enables the dropdown when activeIndicators contains items", () => {
    const activeIndicators: QAIndicator[] = [
      {
        id: "gi-bko-1",
        service_type: "bko",
        name: "Indikator BKO A",
        category: "none",
        bobot: 1.0,
        has_na: false,
      },
    ];

    render(
      <SidakInputManualForm
        entries={dummyEntries}
        noTiket=""
        onSetNoTiket={vi.fn()}
        onUpdateEntry={vi.fn()}
        onAddEntry={vi.fn()}
        onRemoveEntry={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        activeIndicators={activeIndicators}
        scoringMode="no_category"
        saving={false}
        previewing={false}
      />,
    );

    // Verify warning text is NOT displayed
    expect(
      screen.queryByText("Belum ada parameter untuk layanan dan periode ini."),
    ).not.toBeInTheDocument();

    // Verify the select button is enabled
    const dropdownButton = screen.getByRole("button", {
      name: "— Pilih parameter —",
    });
    expect(dropdownButton).not.toBeDisabled();
    expect(dropdownButton).not.toHaveClass("opacity-50");
  });
});
