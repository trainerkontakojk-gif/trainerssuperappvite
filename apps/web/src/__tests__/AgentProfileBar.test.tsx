/**
 * Dua test di bawah TIDAK terkait kontrak ekspor dan sengaja dibiarkan:
 * keduanya menutup perilaku komponen (tombol muat ulang, ukuran avatar) yang
 * belum punya pengganti E2E, jadi tidak boleh dihapus oleh aturan
 * "replace, then remove".
 *
 * Dua test yang DIHAPUS di Fase 5 (menu lima format dan menu tidak terpotong)
 * sudah digantikan oleh E2E unduhan nyata di
 * `apps/web/e2e/sidak-agent-report-download.spec.ts`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentProfileBar from "../components/sidak/AgentProfileBar";

describe("AgentProfileBar", () => {
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
    expect(
      screen.queryByRole("region", { name: "Quickview performa agent" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /muat ulang profil agen/i }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /muat ulang profil agen/i }),
    );
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
