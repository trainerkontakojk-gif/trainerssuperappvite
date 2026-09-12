import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { ProfilerPageHeader } from "../routes/profiler/components/ProfilerPageHeader";

describe("ProfilerPageHeader", () => {
  it("keeps compact slide headers limited to navigation and controls", () => {
    render(
      <ProfilerPageHeader
        backHref="/profiler"
        backLabel="Kembali ke workspace KTP"
        eyebrow="Profiler slides"
        title="Tinjau profil peserta dalam format slide yang siap dibagikan."
        description="Pilih batch dan peserta, sesuaikan orientasi tampilan, lalu simpan slide sebagai gambar atau PDF."
        icon={<span aria-hidden="true">icon</span>}
        compact
        actions={<button type="button">Simpan</button>}
      />,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Tinjau profil peserta dalam format slide yang siap dibagikan.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Profiler slides")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Kembali ke workspace KTP" }),
    ).toBeVisible();
  });
});
