import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditTemuanModal from "../components/sidak/EditTemuanModal";

const form = {
  nilai: 2,
  ketidaksesuaian: "Jawaban belum lengkap",
  sebaiknya: "Tambahkan verifikasi sebelum menutup tiket",
};

describe("EditTemuanModal", () => {
  it("focuses the dialog, closes on Escape, and traps Tab focus", async () => {
    const onClose = vi.fn();
    render(
      <EditTemuanModal
        open
        indicatorName="Akurasi Jawaban"
        form={form}
        submitting={false}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    const closeButton = screen.getByRole("button", { name: "Tutup edit temuan" });
    const saveButton = screen.getByRole("button", { name: "Simpan Perubahan" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(saveButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
