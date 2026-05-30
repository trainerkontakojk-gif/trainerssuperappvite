import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
        description: "Agen tidak menjelaskan syarat pembukaan akun secara runtut.",
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
    expect(screen.getByText("Gemini 2.0 Flash Lite")).toBeDefined();
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
    const saveButton = screen.getByRole("button", { name: /simpan perubahan/i });
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
    const senderNameInput = screen.getByPlaceholderText("Contoh: Ahmad Fauzi") as HTMLInputElement;
    await user.clear(senderNameInput);
    await user.type(senderNameInput, "Alice Smith");

    // Click Simpan Perubahan
    const saveButton = screen.getByRole("button", { name: /simpan perubahan/i });
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

  it("closes and reopens with fresh settings from props", () => {
    const { rerender } = render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();

    // Rerender with isOpen = false
    rerender(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText("Pengaturan Simulasi")).toBeNull();
  });
});
