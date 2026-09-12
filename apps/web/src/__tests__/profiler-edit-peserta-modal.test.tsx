import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProfilerPeserta } from "@trainers/types";

import { EditPesertaModal } from "../routes/profiler/components/table/EditPesertaModal";

const peserta: ProfilerPeserta = {
  id: "peserta-1",
  batch_name: "Batch 2026",
  nomor_urut: 1,
  nama: "Peserta dengan nama panjang untuk uji modal",
  tim: "Tim Operasional",
  jabatan: "cso",
};

describe("EditPesertaModal", () => {
  it("keeps the profile modal bounded while its tab content scrolls", () => {
    render(
      <EditPesertaModal
        peserta={peserta}
        timList={["Tim Operasional"]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
        onFrameUpdated={vi.fn()}
        onPhotoUpdated={vi.fn()}
        isReadOnly
      />,
    );

    const dialog = screen.getByRole("dialog");
    const tabs = dialog.querySelector('[data-slot="tabs"]');
    const contentRegion = screen.getByRole("region", {
      name: "Konten profil peserta",
    });

    expect(dialog).toHaveClass("flex", "flex-col", "overflow-hidden");
    expect(dialog).toHaveClass("!w-[calc(100vw-2rem)]", "!max-w-4xl");
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]");
    expect(
      screen.getByRole("heading", { name: "Profil peserta" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("textbox", { name: "Nama lengkap *" }),
    ).not.toHaveFocus();
    expect(tabs).toHaveClass("min-w-0", "flex-col");
    expect(contentRegion).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(screen.getByText("Nama lengkap *")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Simpan perubahan" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batal" })).toBeVisible();
  });
});
