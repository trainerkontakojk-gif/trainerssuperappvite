import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelefunSystemTab } from "../routes/telefun/components/settings/TelefunSystemTab";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";

const RETIRED_READINESS = {
  status: "ready" as const,
  openai: { enabled: true, configured: true, ready: true },
};

describe("TelefunSystemTab Gemini-only UI", () => {
  it("shows only active Gemini models and no OpenAI readiness or transport controls", () => {
    render(
      <TelefunSystemTab
        localSettings={DEFAULT_TELEFUN_SETTINGS}
        setLocalSettings={vi.fn()}
        selectedTelefunModel={DEFAULT_TELEFUN_SETTINGS.telefunModelId}
        setSelectedTelefunModel={vi.fn()}
        providerReadiness={RETIRED_READINESS}
        webRtcCapability={{
          enabled: true,
          allowed: true,
          modelId: "gpt-realtime-2.1",
          transport: "openai-webrtc",
          modelIds: ["gpt-realtime-2.1"],
        }}
      />,
    );

    expect(screen.getByText("Gemini 3.1 Flash Live")).toBeInTheDocument();
    expect(screen.getByText("Gemini 3.0 Flash Live")).toBeInTheDocument();
    expect(screen.queryByText(/GPT Realtime|OpenAI|WebRTC|kesiapan/i)).toBeNull();
    expect(screen.getAllByRole("button")).not.toHaveLength(0);
  });

  it("keeps the model selector usable even when retired readiness says ready", () => {
    const setSelected = vi.fn();
    render(
      <TelefunSystemTab
        localSettings={DEFAULT_TELEFUN_SETTINGS}
        setLocalSettings={vi.fn()}
        selectedTelefunModel={DEFAULT_TELEFUN_SETTINGS.telefunModelId}
        setSelectedTelefunModel={setSelected}
        providerReadiness={RETIRED_READINESS}
      />,
    );
    expect(screen.getByText("Model AI untuk Telefun")).toBeInTheDocument();
  });
});
