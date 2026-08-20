import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/ketik/components/SettingsModal";
import type { KetikAppSettings } from "@trainers/types";
import { ApiError } from "../lib/api";
import { notify } from "../lib/toast";

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
vi.mock("../lib/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("KETIK SettingsModal Characterization Tests", () => {
  const initialSettings: KetikAppSettings = {
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
        difficulty: "Mudah",
      },
    ],
    quickTemplates: [
      {
        id: "qt-1",
        keyword: "salam",
        content: "Halo, ada yang bisa dibantu?",
      },
    ],
    activeConsumerTypeId: "random",
    identitySettings: {
      displayName: "Jane Doe",
      signatureName: "Jane",
      phoneNumber: "08123456789",
      city: "Bandung",
    },
    selectedModel: "gemini-3.1-flash-lite",
    simulationDuration: 5,
    responsePacingMode: "realistic",
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    settings: initialSettings,
    onSave: vi.fn().mockResolvedValue(undefined),
  };

  it("opens settings modal and selects a different model", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn().mockResolvedValue(undefined);
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    // Click on System Tab (Sistem)
    const systemTabButton = screen.getByText("Sistem");
    await user.click(systemTabButton);

    const expectedModels = [
      "Gemini 3.7 Flash",
      "Gemini 3.5 Flash Lite",
      "GPT 5.6 Luna",
      "GPT 5.4 Mini",
    ];

    expectedModels.forEach((name) => {
      expect(screen.getByText(name)).toBeDefined();
    });
    expect(screen.queryByText(/OpenRouter/i)).toBeNull();
    expect(screen.queryByText(/DeepSeek/i)).toBeNull();
    expect(screen.getAllByText("Gemini").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);

    const gemini35Card = screen.getByText("Gemini 3.5 Flash Lite");
    await user.click(gemini35Card);

    // Click Save Changes (Simpan Perubahan)
    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModel: "gemini-3.5-flash-lite",
      }),
    );
  });

  it("edits simulation duration and calls onSave with updated value", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn().mockResolvedValue(undefined);
    const customProps = {
      ...defaultProps,
      settings: {
        ...initialSettings,
        simulationDuration: 12,
      },
      onSave: onSaveMock,
    };
    render(<SettingsModal {...customProps} />);

    // Click on System Tab (Sistem)
    const systemTabButton = screen.getByText("Sistem");
    await user.click(systemTabButton);

    // Click Kustom button to trigger population of customInputValue with "12"
    const kustomButton = screen.getByText("Kustom");
    await user.click(kustomButton);

    // Edit input - value is now "12"
    const input = screen.getByDisplayValue("12") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "20");
    await user.tab(); // Blur trigger validation

    // Click Simpan Perubahan
    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        simulationDuration: 20,
      }),
    );
  });

  it("opens custom duration input from a preset value and saves more than fifteen minutes", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn().mockResolvedValue(undefined);
    render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

    await user.click(screen.getByText("Sistem"));
    await user.click(screen.getByRole("button", { name: "Kustom" }));

    const input = screen.getByDisplayValue("5") as HTMLInputElement;
    expect(input).toBe(document.activeElement);

    await user.clear(input);
    await user.type(input, "20");
    await user.tab();

    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        simulationDuration: 20,
      }),
    );
  });

  it("shows saved custom duration immediately when the system tab is opened", async () => {
    const user = userEvent.setup();
    render(
      <SettingsModal
        {...defaultProps}
        settings={{ ...initialSettings, simulationDuration: 20 }}
      />,
    );

    await user.click(screen.getByText("Sistem"));

    expect(screen.getByDisplayValue("20")).toBeDefined();
  });

  it("shows and updates the KETIK scenario description character counter", async () => {
    const user = userEvent.setup();
    const { container } = render(<SettingsModal {...defaultProps} />);

    await user.click(screen.getByText("Masalah"));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    const description = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;
    expect(screen.getByText("0 / 12.000")).toBeDefined();
    expect(description).toHaveAttribute("maxLength", "12000");
    expect(description).toHaveAttribute(
      "aria-describedby",
      "ketik-scenario-description-counter",
    );
    expect(description).toHaveAttribute("id", "ketik-scenario-description");
    expect(screen.getByLabelText("Deskripsi Masalah")).toBe(description);

    fireEvent.change(description, { target: { value: "Deskripsi baru" } });
    expect(screen.getByText("14 / 12.000")).toBeDefined();

    await user.clear(description);
    expect(screen.getByText("0 / 12.000")).toBeDefined();
  });

  it("does not truncate a loaded over-limit KETIK scenario description", async () => {
    const { container } = render(
      <SettingsModal
        {...defaultProps}
        settings={{
          ...initialSettings,
          scenarios: [
            {
              ...initialSettings.scenarios[0],
              description: "x".repeat(12_001),
            },
          ],
        }}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Masalah"));
    const scenarioCard = screen
      .getByText(initialSettings.scenarios[0].title)
      .closest("div.flex.items-start");
    await user.click(scenarioCard!.querySelectorAll("button")[1]);

    const description = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement;
    expect(description.value).toHaveLength(12_001);
    expect(screen.getByText("12.001 / 12.000")).toBeDefined();
  });

  it("closes and reopens with fresh settings from props", () => {
    const { rerender } = render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();

    // Rerender with isOpen = false
    rerender(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Pengaturan Simulasi")).toBeNull();
  });

  it("accumulates out-of-order image reads and blocks save until reads finish", async () => {
    class ControlledFileReader {
      static instances: ControlledFileReader[] = [];
      result: string | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        ControlledFileReader.instances.push(this);
      }

      complete(result: string) {
        this.result = result;
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", ControlledFileReader);
    try {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<SettingsModal {...defaultProps} onSave={onSave} />);
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await user.selectOptions(screen.getByRole("combobox"), "Kepatuhan");
      await user.type(
        screen.getByPlaceholderText("Contoh: Gagal Transfer"),
        "Lampiran",
      );
      await user.type(screen.getByLabelText("Deskripsi Masalah"), "Deskripsi");

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [
            new File(["one"], "one.png", { type: "image/png" }),
            new File(["two"], "two.png", { type: "image/png" }),
          ],
        },
      });
      expect(ControlledFileReader.instances).toHaveLength(2);
      const localSave = screen.getByRole("button", { name: /^Simpan$/ });
      expect(localSave).toBeDisabled();
      await user.click(localSave);
      expect(screen.getByRole("button", { name: /^Simpan$/ })).toBeDisabled();

      ControlledFileReader.instances[1].complete("data:image/png;base64,two");
      ControlledFileReader.instances[0].complete("data:image/png;base64,one");
      await waitFor(() => expect(localSave).not.toBeDisabled());
      await user.click(screen.getByRole("button", { name: /^Simpan$/ }));
      await user.click(
        screen.getByRole("button", { name: /simpan perubahan/i }),
      );

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          scenarios: expect.arrayContaining([
            expect.objectContaining({
              images: [
                "data:image/png;base64,two",
                "data:image/png;base64,one",
              ],
            }),
          ]),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("notifies once when a FileReader error is followed by loadend", async () => {
    class ControlledFileReader {
      static instance: ControlledFileReader;
      result: string | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        ControlledFileReader.instance = this;
      }

      readAsDataURL() {}

      failThenFinish() {
        this.onerror?.();
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", ControlledFileReader);
    vi.mocked(notify.error).mockClear();
    try {
      const user = userEvent.setup();
      render(<SettingsModal {...defaultProps} />);
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await user.selectOptions(screen.getByRole("combobox"), "Kepatuhan");
      await user.type(
        screen.getByPlaceholderText("Contoh: Gagal Transfer"),
        "Lampiran",
      );
      await user.type(screen.getByLabelText("Deskripsi Masalah"), "Deskripsi");

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [new File(["bad"], "bad.png", { type: "image/png" })],
        },
      });
      ControlledFileReader.instance.failThenFinish();

      expect(notify.error).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the modal retryable and prevents duplicate settings saves", async () => {
    let rejectSave!: (error: Error) => void;
    const savePromise = new Promise<void>((_, reject) => {
      rejectSave = reject;
    });
    const onSave = vi.fn().mockReturnValue(savePromise);
    const user = userEvent.setup();
    render(<SettingsModal {...defaultProps} onSave={onSave} />);

    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    rejectSave(new Error("network failure"));
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });

  it("shows changed-elsewhere guidance for a settings conflict and retains the modal", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(new ApiError("SETTINGS_CONFLICT", "stale settings"));
    render(<SettingsModal {...defaultProps} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        expect.stringContaining("diubah di tempat lain"),
      ),
    );
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });

  it(
    "adds a quick template without mutating original settings",
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      const onSaveMock = vi.fn().mockResolvedValue(undefined);
      render(<SettingsModal {...defaultProps} onSave={onSaveMock} />);

      // Click Template Tab (Template)
      const templateTabButton = screen.getByText("Template");
      await user.click(templateTabButton);

      // Click "Tambah Template"
      const addTemplateBtn = screen.getByText(/tambah template/i);
      await user.click(addTemplateBtn);

      // Fill form
      const keywordInput = screen.getByPlaceholderText("contoh: salam");
      const contentInput = screen.getByPlaceholderText(
        "Masukkan isi pesan yang akan muncul saat shortcut dipanggil...",
      );
      await user.type(keywordInput, "terima-kasih");
      await user.type(contentInput, "Terima kasih banyak atas bantuan Anda!");

      // Save Template (form level button)
      const saveTemplateBtn = screen.getByRole("button", { name: "Simpan" });
      await user.click(saveTemplateBtn);

      // Save Settings (modal level button)
      const saveSettingsButton = screen.getByRole("button", {
        name: /simpan perubahan/i,
      });
      await user.click(saveSettingsButton);

      expect(onSaveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          quickTemplates: [
            ...initialSettings.quickTemplates,
            expect.objectContaining({
              keyword: "terima-kasih",
              content: "Terima kasih banyak atas bantuan Anda!",
            }),
          ],
        }),
      );
    },
  );
});
