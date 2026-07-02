import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/pdkt/components/SettingsModal";
import type { PdktAppSettings as AppSettings } from "../routes/pdkt/pdktSettings";

// Mock framer-motion to avoid animation issues in tests
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

// Mock toast notifications
vi.mock("../../../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("PDKT SettingsModal Characterization Tests", () => {
  const initialSettings: AppSettings = {
    scenarios: [
      {
        id: "s-1",
        category: "Kepatuhan",
        title: "Kepatuhan SOP Pembukaan Akun",
        description:
          "Agen tidak menjelaskan syarat pembukaan akun secara runtut.",
        isActive: true,
      },
    ],
    consumerTypes: [
      {
        id: "c-1",
        name: "Nasabah Ramah",
        description: "Nasabah kooperatif dan berbicara sopan.",
        difficulty: "Easy",
      },
    ],
    enableImageGeneration: true,
    globalConsumerTypeId: "random",
    selectedModel: "gemini-3.1-flash-lite",
    consumerNameMentionPattern: "random",
    writingStyleMode: "training",
    customIdentity: {
      senderName: "Jane Doe",
      email: "jane@example.com",
      city: "Bandung",
      bodyName: "Jane Doe",
    },
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    settings: initialSettings,
    onSave: vi.fn(),
    defaultScenarios: initialSettings.scenarios,
    defaultConsumerTypes: initialSettings.consumerTypes,
  };

  it("opens settings modal and selects a different model", async () => {
    const user = userEvent.setup();
    render(<SettingsModal {...defaultProps} />);

    // Click on System Tab (Sistem)
    const systemTabButton = screen.getByText("Sistem");
    await user.click(systemTabButton);

    // Verify model option is visible
    expect(screen.getByText("Gemini 3.1 Flash Lite")).toBeDefined();
    expect(screen.getByText("Gemini 3.5 Flash")).toBeDefined();
    expect(screen.getByText("DeepSeek V4 Pro")).toBeDefined();
  });

  it("edits writing style mode and calls onSave with updated value", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    // Click on System Tab (Sistem)
    const systemTabButton = screen.getByText("Sistem");
    await user.click(systemTabButton);

    // Click the Realistis writing style card
    const realisticCard = screen.getByText("Realistis");
    await user.click(realisticCard);

    // Click Simpan Perubahan
    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        writingStyleMode: "realistic",
      }),
    );
  });

  it("edits custom identity and preserves scenario list", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    // Click on Identitas Tab (Identitas)
    const identityTabButton = screen.getByText("Identitas");
    await user.click(identityTabButton);

    // Edit sender name
    const senderNameInput = screen.getByPlaceholderText(
      "Contoh: Ahmad Fauzi",
    ) as HTMLInputElement;
    await user.clear(senderNameInput);
    await user.type(senderNameInput, "Alice Smith");

    // Click Simpan Perubahan
    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customIdentity: expect.objectContaining({
          senderName: "Alice Smith",
        }),
        scenarios: initialSettings.scenarios,
      }),
    );
  });

  it("opens the scenario wizard on step 1 with an optional step 2", async () => {
    const user = userEvent.setup();
    render(<SettingsModal {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    expect(screen.getByRole("button", { name: /langkah 1/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /langkah 2/i })).toBeDefined();
    expect(
      screen.getAllByText("Detail Lanjutan (Opsional)").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /buka detail/i })).toBeDefined();
  });

  it("reopens step 2 and surfaces invalid recipient errors on save", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Wizard Test",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
      ),
      "Deskripsi wizard test",
    );

    await user.click(screen.getByRole("button", { name: /lanjut ke detail/i }));
    await user.click(screen.getByRole("button", { name: /tambah alamat/i }));

    const recipientInput = screen.getByPlaceholderText(
      "alamat.tujuan@domain.com",
    );
    await user.type(recipientInput, "not-an-email");

    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();

    await user.click(
      screen.getAllByRole("button", { name: /kembali ke info dasar/i })[0],
    );
    expect(
      screen.getAllByRole("button", { name: /lanjut ke detail/i }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^simpan$/i }));

    expect(
      screen.getAllByRole("button", { name: /kembali ke info dasar/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();
    expect(onSaveMock).not.toHaveBeenCalled();
  });

  it("saves a scenario directly from step 1 without opening advanced fields", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Step 1 Save Test",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
      ),
      "Disimpan langsung dari langkah 1",
    );

    await user.click(screen.getByRole("button", { name: /^simpan$/i }));

    expect(screen.getByText("Step 1 Save Test")).toBeDefined();
    expect(screen.queryByRole("button", { name: /buka detail/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            title: "Step 1 Save Test",
            description: "Disimpan langsung dari langkah 1",
          }),
        ]),
      }),
    );
  }, 15000);

  it("accepts PDF evidence attachments in the scenario wizard", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();
    const { container } = render(
      <SettingsModal {...defaultProps} onSave={onSaveMock} />,
    );

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "PDF Evidence Test",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
      ),
      "Skenario dengan lampiran bukti PDF.",
    );

    await user.click(screen.getByRole("button", { name: /lanjut ke detail/i }));

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.getAttribute("accept")).toContain("application/pdf");

    const pdf = new File(["%PDF-1.4 evidence"], "bukti.pdf", {
      type: "application/pdf",
    });
    await user.upload(fileInput!, pdf);

    await waitFor(() => {
      expect(screen.getByText("PDF")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: /^simpan$/i }));
    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            title: "PDF Evidence Test",
            attachmentImages: [
              expect.stringMatching(/^data:application\/pdf;base64,/),
            ],
          }),
        ]),
      }),
    );
  }, 15000);

  it("closes and reopens with fresh settings from props", () => {
    const { rerender } = render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();

    // Rerender with isOpen = false
    rerender(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Pengaturan Simulasi")).toBeNull();
  });
});
