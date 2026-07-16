import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IndicatorDropdown from "../components/sidak/IndicatorDropdown";

describe("IndicatorDropdown SLIK hierarchy", () => {
  const indicators = [
    {
      id: "data-verification",
      name: "Kesesuaian Data",
      parameter_group: "Kesesuaian verifikasi (Verifikasi)",
      category: "non_critical" as const,
      bobot: 0.15,
    },
    {
      id: "data-repeat",
      name: "Kesesuaian Data",
      parameter_group: "Kesesuaian Verifikasi Ulang (Penarikan)",
      category: "non_critical" as const,
      bobot: 0.15,
    },
  ];

  it("keeps duplicate leaf labels distinct under their parent parameters", () => {
    render(
      <IndicatorDropdown value="" indicators={indicators} onChange={vi.fn()} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "— Pilih parameter —" }),
    );

    expect(
      screen.getByText("Kesesuaian verifikasi (Verifikasi)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Kesesuaian Verifikasi Ulang (Penarikan)"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("option", { name: /Kesesuaian Data/ }),
    ).toHaveLength(2);
  });

  it("shows the full parent and sub-parameter label after selection", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <IndicatorDropdown
        value=""
        indicators={indicators}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "— Pilih parameter —" }),
    );
    fireEvent.click(
      screen.getAllByRole("option", { name: /Kesesuaian Data/ })[1],
    );

    expect(onChange).toHaveBeenCalledWith("data-repeat");

    rerender(
      <IndicatorDropdown
        value="data-repeat"
        indicators={indicators}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: /Kesesuaian Verifikasi Ulang \(Penarikan\) — Kesesuaian Data/,
      }),
    ).toBeInTheDocument();
  });
});
