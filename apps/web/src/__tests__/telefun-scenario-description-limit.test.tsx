import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/telefun/components/SettingsModal";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";

vi.mock("framer-motion", async () => {
  const actual = (await vi.importActual("framer-motion")) as any;
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

vi.mock("../routes/telefun/hooks/useTelefunProviderReadiness", () => ({
  useTelefunProviderReadiness: () => ({
    status: "unavailable",
    openai: null,
  }),
}));

describe("Telefun scenario description characterization", () => {
  it("keeps the description unbounded and editable with long text", async () => {
    const user = userEvent.setup();
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        settings={DEFAULT_TELEFUN_SETTINGS}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Masalah" }));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    const descriptionLabel = screen.getByText("Deskripsi Masalah");
    const descriptionField = descriptionLabel.parentElement;
    const description = descriptionField?.querySelector("textarea") as HTMLTextAreaElement;

    expect(description).toBeInTheDocument();
    expect(description).not.toHaveAttribute("maxLength");
    expect(descriptionField?.textContent ?? "").not.toMatch(/\d+\s*\/\s*\d+/);

    const longText = "Penjelasan masalah yang tetap dapat diedit. ".repeat(20);
    await user.type(description, "Dapat diedit.");
    fireEvent.change(description, { target: { value: longText } });

    expect(description).toHaveValue(longText);
  });
});
