import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoveFolderModal } from "../routes/profiler/components/table/MoveFolderModal";

const years = [{ id: "year-2026", label: "Tahun 2026" }];
const folders = Array.from({ length: 20 }, (_, index) => ({
  id: `folder-${index}`,
  name: index === 0 ? "Folder aktif" : `Tim Tujuan ${index}`,
  year_id: "year-2026",
  parent_id: null,
}));

describe("MoveFolderModal", () => {
  it("keeps the confirmation footer visible when the folder list is long", () => {
    render(
      <MoveFolderModal
        selectedIds={["peserta-1", "peserta-2"]}
        currentBatch="Folder aktif"
        folders={folders}
        years={years}
        onClose={vi.fn()}
        onMoved={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const folderContent = dialog.querySelector(".overflow-y-auto");
    const footer = dialog.querySelector('[data-slot="dialog-footer"]');

    expect(dialog).toHaveClass(
      "!flex",
      "flex-col",
      "h-[min(92dvh,52rem)]",
      "max-h-[calc(100dvh-2rem)]",
      "overflow-hidden",
    );
    expect(folderContent).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(footer).toHaveClass("shrink-0");
    expect(
      screen.getByRole("button", { name: "Konfirmasi pemindahan" }),
    ).toBeVisible();
  });
});
