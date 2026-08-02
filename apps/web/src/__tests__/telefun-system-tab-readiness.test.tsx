import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelefunSystemTab } from "../routes/telefun/components/settings/TelefunSystemTab";
import type { TelefunProviderReadinessState } from "../routes/telefun/hooks/useTelefunProviderReadiness";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";
import type { TelefunWebRtcCapability } from "../routes/telefun/services/telefunWebRtcCapability";

const READY: TelefunProviderReadinessState = {
  status: "ready",
  openai: { enabled: true, configured: true, ready: true },
};
const UNAVAILABLE: TelefunProviderReadinessState = {
  status: "unavailable",
  openai: { enabled: true, configured: false, ready: false },
};
const LOADING: TelefunProviderReadinessState = {
  status: "loading",
  openai: null,
};

function renderSystemTab(
  providerReadiness: TelefunProviderReadinessState,
  setSelectedTelefunModel = vi.fn(),
  webRtcCapability: TelefunWebRtcCapability | null = null,
) {
  render(
    <TelefunSystemTab
      localSettings={DEFAULT_TELEFUN_SETTINGS}
      setLocalSettings={vi.fn()}
      selectedTelefunModel={DEFAULT_TELEFUN_SETTINGS.telefunModelId}
      setSelectedTelefunModel={setSelectedTelefunModel}
      providerReadiness={providerReadiness}
      webRtcCapability={webRtcCapability}
    />,
  );
  return { setSelectedTelefunModel };
}

function modelButton(label: string) {
  const button = screen
    .getAllByRole("button")
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Model button not found: ${label}`);
  return button;
}

describe("TelefunSystemTab OpenAI readiness", () => {
  it("keeps Gemini enabled while OpenAI shows a neutral checking state", () => {
    renderSystemTab(LOADING);

    expect(modelButton("Gemini 3.1")).toBeEnabled();
    expect(modelButton("GPT Realtime 2.1")).toBeDisabled();
    expect(
      screen.getAllByText("Memeriksa kesiapan layanan OpenAI…"),
    ).toHaveLength(2);
  });

  it("keeps OpenAI visible but disabled with honest unavailable copy", () => {
    renderSystemTab(UNAVAILABLE);

    expect(modelButton("GPT Realtime 2.1")).toBeDisabled();
    expect(
      screen.getAllByText("Layanan OpenAI belum siap di Telefun."),
    ).toHaveLength(2);
  });

  it("keeps the WebRTC pilot model selectable without legacy readiness", () => {
    const setSelectedTelefunModel = vi.fn();
    renderSystemTab(UNAVAILABLE, setSelectedTelefunModel, {
      enabled: true,
      allowed: true,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
    });

    const fullModel = modelButton("GPT Realtime 2.1");
    expect(fullModel).toBeEnabled();
    fireEvent.click(fullModel);
    expect(setSelectedTelefunModel).toHaveBeenCalledWith("gpt-realtime-2.1");
  });

  it("uses keyboard-accessible radio buttons for response pacing", () => {
    renderSystemTab(READY);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getAllByRole("radio")[0]).toHaveTextContent("Natural");
    expect(screen.getAllByRole("radio")[1]).toHaveTextContent("Cepat");
  });

  it("enables both OpenAI cards only when all readiness flags are true", () => {
    const setSelectedTelefunModel = vi.fn();
    renderSystemTab(READY, setSelectedTelefunModel);
    const fullModel = modelButton("GPT Realtime 2.1");
    const miniModel = modelButton("GPT Realtime 2.1 Mini");

    expect(fullModel).toBeEnabled();
    expect(miniModel).toBeEnabled();
    fireEvent.click(fullModel);

    expect(setSelectedTelefunModel).toHaveBeenCalledWith("gpt-realtime-2.1");
  });
});
