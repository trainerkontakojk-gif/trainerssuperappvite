import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentProfileBar from "../components/sidak/AgentProfileBar";

describe("AgentProfileBar export dropdown", () => {
  it("offers separate interactive and static HTML downloads", () => {
    const onExport = vi.fn();
    render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onExport={onExport}
        onInputAudit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));

    const interactiveOption = screen.getByRole("menuitem", {
      name: /html interaktif/i,
    });
    expect(interactiveOption).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /html statis/i }),
    ).toBeVisible();

    fireEvent.click(interactiveOption);
    expect(onExport).toHaveBeenLastCalledWith("html-interactive");
  });

  it("keeps the open menu outside the profile card clipping context", () => {
    render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onExport={vi.fn()}
        onInputAudit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeVisible();
    expect(menu.closest(".overflow-hidden")).toBeNull();
    expect(menu.closest(".overflow-visible")).toHaveClass("z-50");
  });
});
