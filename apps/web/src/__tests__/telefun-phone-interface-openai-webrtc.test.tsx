// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

const transportState = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../routes/telefun/services/telefunTransport", () => ({
  createTelefunTransport: transportState.create,
  mapTelefunTransportError: () => "Panggilan belum dapat dimulai. Silakan coba lagi.",
}));
vi.mock("../routes/telefun/components/useMicrophoneActivity", () => ({
  useMicrophoneActivity: () => ({ level: 0, bars: [], isSupported: true, isListening: false, error: null }),
}));
import { PhoneInterface } from "../routes/telefun/components/PhoneInterface";

function session() {
  return {
    connect: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    setMute: vi.fn(), setHold: vi.fn(), sendTimeCue: vi.fn(), retryPlayback: vi.fn(async () => true),
    onPlaybackBlocked: vi.fn(), onStatusChange: vi.fn(), onStateChange: vi.fn(), onError: vi.fn(),
    onRecoveryRequired: vi.fn(), onAiSpeaking: vi.fn(), onVolumeChange: vi.fn(), onTimelineEvent: vi.fn(),
    onSessionCreated: vi.fn(), onLocalStream: vi.fn(),
  };
}

const config = {
  telefunTransport: "openai-webrtc",
  telefunModelId: "gpt-realtime-2.1",
  consumerTypes: [], consumerName: "Budi", maxCallDuration: 0,
} as unknown as TelefunAppSettings;

describe("PhoneInterface retired provider compatibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transportState.create.mockReset();
    vi.stubGlobal("AudioContext", class {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() { return { type: "sine", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }; }
      createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
      close = vi.fn(async () => undefined);
    });
  });
  afterEach(() => vi.useRealTimers());

  it("never constructs or connects a WebRTC transport for a historical config", async () => {
    const activeSession = session();
    transportState.create.mockReturnValue(activeSession);
    render(<PhoneInterface config={config} accessToken="token" onEndSession={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(2_500));

    expect(activeSession.connect).toHaveBeenCalledWith("token");
    expect(transportState.create).toHaveBeenCalledWith(config, expect.objectContaining({ accessToken: "token" }));
  });

  it("uses the same normal transport lifecycle for a crafted OpenAI audio config", async () => {
    const activeSession = session();
    transportState.create.mockReturnValue(activeSession);
    render(<PhoneInterface config={{ ...config, telefunTransport: "openai-audio" }} accessToken="token" onEndSession={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(2_500));
    expect(activeSession.connect).toHaveBeenCalledWith("token");
    fireEvent.click(screen.getByRole("button", { name: "Akhiri panggilan" }));
    expect(activeSession.disconnect).toHaveBeenCalledWith("user");
  });

  it("preserves retryable cleanup behavior without exposing provider starts", async () => {
    const activeSession = session();
    activeSession.disconnect.mockRejectedValueOnce(new Error("cleanup failed"));
    transportState.create.mockReturnValue(activeSession);
    render(<PhoneInterface config={config} accessToken="token" onEndSession={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(2_500));
    expect(activeSession.connect).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Akhiri panggilan" }));
    });
    expect(screen.getByRole("button", { name: "Coba lagi mengakhiri panggilan" })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Coba lagi mengakhiri panggilan" })));
    expect(activeSession.disconnect).toHaveBeenCalledTimes(2);
  });
});
