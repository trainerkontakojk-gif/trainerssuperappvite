import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/pdkt/components/SettingsModal";
import { CreateEmailModal } from "../routes/pdkt/components/CreateEmailModal";
import { HistoryModal } from "../routes/pdkt/components/HistoryModal";
import type { PdktAppSettings as AppSettings } from "../routes/pdkt/pdktSettings";

vi.mock("../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    pdktClient: {
      "generate-identity": { $post: vi.fn() },
      "generate-template": { $post: vi.fn() },
    },
    unwrapResponse: async (v: unknown) => v,
  };
});

const baseSettings: AppSettings = {
  scenarios: [],
  consumerTypes: [],
  enableImageGeneration: true,
  globalConsumerTypeId: "random",
  selectedModel: "gemini-3.1-flash-lite",
  consumerNameMentionPattern: "random",
  writingStyleMode: "training",
};

function dialogClasses(): string {
  const dialog = document.querySelector('[data-slot="dialog-content"]');
  expect(dialog).toBeTruthy();
  return dialog?.getAttribute("class") ?? "";
}

function renderSettings(
  overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {},
) {
  render(
    <SettingsModal
      isOpen
      onClose={() => {}}
      settings={baseSettings}
      onSave={async () => {}}
      defaultScenarios={[]}
      defaultConsumerTypes={[]}
      {...overrides}
    />,
  );
}

describe("PDKT settings and riwayat dialog shell", () => {
  it("keeps the settings dialog wide instead of collapsing to sm:max-w-sm", () => {
    renderSettings();

    const classes = dialogClasses();
    // `sm:max-w-sm` dari DialogContent dasar wajib dinetralkan, kalau tidak
    // modal gepeng 24rem di desktop.
    expect(classes).toContain("max-w-5xl");
    expect(classes).toContain("sm:max-w-5xl");
    expect(classes).toContain("w-[calc(100vw-2rem)]");
    expect(classes).not.toContain("sm:max-w-sm");
  });

  it("keeps the riwayat dialog wide instead of collapsing to sm:max-w-sm", () => {
    render(
      <HistoryModal
        isOpen
        onClose={() => {}}
        history={[]}
        onSelectSession={() => {}}
        onDeleteSession={() => {}}
        onClearHistory={() => {}}
      />,
    );

    const classes = dialogClasses();
    expect(classes).toContain("max-w-3xl");
    expect(classes).toContain("sm:max-w-3xl");
    expect(classes).not.toContain("sm:max-w-sm");
  });

  it("keeps the create-email dialog wide instead of collapsing to sm:max-w-sm", () => {
    render(
      <CreateEmailModal
        isOpen
        onClose={() => {}}
        scenarios={[]}
        onCreate={() => {}}
        isLoading={false}
      />,
    );

    const classes = dialogClasses();
    expect(classes).toContain("max-w-lg");
    expect(classes).toContain("sm:max-w-lg");
    expect(classes).not.toContain("sm:max-w-sm");
  });

  it("portals the dialogs into the route container so they stay above the mailbox overlay", () => {
    renderSettings();
    const container = document.querySelector(".contents");
    expect(container).toBeTruthy();
    expect(
      container?.querySelector('[data-slot="dialog-content"]'),
    ).toBeTruthy();
  });

  it("renders the settings tabs as a real tablist", async () => {
    const user = userEvent.setup();
    renderSettings();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Masalah",
      "Karakter",
      "Identitas",
      "Sistem",
    ]);

    await user.click(screen.getByRole("tab", { name: "Sistem" }));
    expect(
      screen.getByRole("radiogroup", { name: "Mode penulisan" }),
    ).toBeTruthy();
  });

  it("still renders riwayat rows when config or emails are missing", () => {
    const broken = [
      {
        id: "h-1",
        timestamp: new Date().toISOString(),
        config: null,
        emails: null,
        evaluation: null,
        evaluationStatus: "completed",
      },
      {
        id: "h-2",
        timestamp: new Date().toISOString(),
        config: { scenarios: null, consumerType: null },
        emails: [{ subject: "Halo" }],
        evaluation: { score: 80 },
        evaluationStatus: "completed",
      },
    ];
    render(
      <HistoryModal
        isOpen
        onClose={() => {}}
        history={broken as never}
        onSelectSession={() => {}}
        onDeleteSession={() => {}}
        onClearHistory={() => {}}
      />,
    );

    expect(screen.getByText(/Riwayat Simulasi PDKT/i)).toBeTruthy();
    expect(screen.getByText("Tanpa Subjek")).toBeTruthy();
    expect(screen.getByText("Halo")).toBeTruthy();
  });
});
