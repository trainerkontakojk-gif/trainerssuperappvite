// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";

const draftState = vi.hoisted(() => ({
  handleClose: vi.fn(),
  handleSave: vi.fn(),
}));

vi.mock("../routes/telefun/hooks/useTelefunProviderReadiness", () => ({
  useTelefunProviderReadiness: () => ({
    status: "ready",
    openai: { enabled: true, configured: true, ready: true },
  }),
}));
vi.mock("../routes/telefun/hooks/useTelefunWebRtcCapability", () => ({
  useTelefunWebRtcCapability: () => ({ status: "unavailable" }),
}));
vi.mock(
  "../routes/telefun/components/settings/useTelefunSettingsDraft",
  () => ({
    useTelefunSettingsDraft: () => ({
      activeTab: "scenarios",
      setActiveTab: vi.fn(),
      localSettings: DEFAULT_TELEFUN_SETTINGS,
      setLocalSettings: vi.fn(),
      selectedTelefunModel: DEFAULT_TELEFUN_SETTINGS.telefunModelId,
      selectedTelefunTransport: DEFAULT_TELEFUN_SETTINGS.telefunTransport,
      setSelectedTelefunModel: vi.fn(),
      setSelectedTelefunTransport: vi.fn(),
      scenarioForm: {},
      consumerForm: {},
      handleSelectAll: vi.fn(),
      handleUnselectAll: vi.fn(),
      handleToggleScenario: vi.fn(),
      handleDeleteScenario: vi.fn(),
      handleSelectConsumerType: vi.fn(),
      handleDeleteConsumer: vi.fn(),
      handleSave: draftState.handleSave,
      handleClose: draftState.handleClose,
    }),
  }),
);
vi.mock("../routes/telefun/components/settings/TelefunScenariosTab", () => ({
  TelefunScenariosTab: () => <div />,
}));
vi.mock("../routes/telefun/components/settings/TelefunConsumersTab", () => ({
  TelefunConsumersTab: () => <div />,
}));
vi.mock("../routes/telefun/components/settings/TelefunIdentityTab", () => ({
  TelefunIdentityTab: () => <div />,
}));
vi.mock("../routes/telefun/components/settings/TelefunSystemTab", () => ({
  TelefunSystemTab: () => <div />,
}));

import { SettingsModal } from "../routes/telefun/components/SettingsModal";

describe("Telefun SettingsModal accessibility", () => {
  it("provides dialog semantics, Escape close, and focus restoration", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const view = render(
      <SettingsModal
        isOpen
        onClose={draftState.handleClose}
        settings={DEFAULT_TELEFUN_SETTINGS}
        onSave={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Pengaturan Simulasi",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(draftState.handleClose).toHaveBeenCalled();

    view.rerender(
      <SettingsModal
        isOpen={false}
        onClose={draftState.handleClose}
        settings={DEFAULT_TELEFUN_SETTINGS}
        onSave={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
