import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentProfileBar from "../components/sidak/AgentProfileBar";

function renderProfile() {
  return render(
    <AgentProfileBar
      nama="Mas Bayu Mardiaz"
      tim="Siti Nur Anisa"
      batchName="cca"
      jabatan="Telepon"
      bergabungDate={null}
      fotoUrl={null}
      role="leader"
      onRefresh={vi.fn()}
      onExport={vi.fn()}
      onInputAudit={vi.fn()}
    />,
  );
}

describe("AgentProfileBar", () => {
  it("offers four named report download formats", () => {
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

    expect(
      screen.getByRole("menuitem", { name: /html interaktif/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /html statis/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /html interaktif/i }));
    expect(onExport).toHaveBeenLastCalledWith("html-interactive");
  });

  it("keeps the open menu outside the profile card clipping context", () => {
    renderProfile();

    fireEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu.closest(".overflow-hidden")).toBeNull();
    expect(menu).toHaveClass("z-50");
  });

  it("uses one wrapped H1 and keeps quickview outside the identity bar", () => {
    const onRefresh = vi.fn();
    render(
      <AgentProfileBar
        nama="Nama agen yang sangat panjang untuk uji pembungkusan"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl={null}
        role="leader"
        onRefresh={onRefresh}
        onExport={vi.fn()}
        onInputAudit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Nama agen yang sangat panjang untuk uji pembungkusan",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quickview performa agent" })).toBeNull();
    expect(screen.getByRole("button", { name: /muat ulang profil agen/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /muat ulang profil agen/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("gives a profile photo enough visual weight", () => {
    const { container } = render(
      <AgentProfileBar
        nama="Mas Bayu Mardiaz"
        tim="Siti Nur Anisa"
        batchName="cca"
        jabatan="Telepon"
        bergabungDate={null}
        fotoUrl="https://example.test/agent.jpg"
        role="leader"
        onExport={vi.fn()}
        onInputAudit={vi.fn()}
      />,
    );

    const avatar = container.querySelector('[data-slot="avatar"]');
    expect(avatar).toHaveClass("!size-24", "sm:!size-28");
  });
});
