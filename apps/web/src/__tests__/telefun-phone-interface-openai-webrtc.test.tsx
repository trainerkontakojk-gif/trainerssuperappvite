// @vitest-environment jsdom
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

const transportState = vi.hoisted(() => ({
  create: vi.fn(),
  session: null as any,
  microphoneStream: null as MediaStream | null,
  observedStream: null as MediaStream | null,
  cleanup: vi.fn(),
}));

vi.mock("../routes/telefun/services/telefunTransport", () => ({
  createTelefunTransport: transportState.create,
  cleanupOpenAIWebRtcSession: transportState.cleanup,
  mapTelefunTransportError: (error: unknown) =>
    (error as { code?: string } | null)?.code === "provider_error"
      ? "Terjadi kesalahan pada layanan suara. Silakan coba lagi."
      : "Panggilan belum dapat dimulai. Silakan coba lagi.",
}));
vi.mock("../routes/telefun/components/useMicrophoneActivity", () => ({
  useMicrophoneActivity: (input: { stream?: MediaStream | null }) => {
    transportState.observedStream = input.stream ?? null;
    return {
      level: 0,
      bars: [],
      isSupported: true,
      isListening: false,
      error: null,
    };
  },
}));

import { PhoneInterface } from "../routes/telefun/components/PhoneInterface";

function createSession() {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    setMute: vi.fn(),
    setHold: vi.fn(),
    sendTimeCue: vi.fn(),
    retryPlayback: vi.fn(async () => true),
    onPlaybackBlocked: vi.fn(),
    onStatusChange: vi.fn(),
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onRecoveryRequired: vi.fn(),
    onAiSpeaking: vi.fn(),
    onVolumeChange: vi.fn(),
    onTimelineEvent: vi.fn(),
    onSessionCreated: vi.fn(),
    onLocalStream: vi.fn(),
  };
}

const config = {
  telefunTransport: "openai-webrtc",
  telefunModelId: "gpt-realtime-2.1",
  consumerTypes: [],
  consumerName: "Budi",
  maxCallDuration: 0,
} as unknown as TelefunAppSettings;

describe("PhoneInterface OpenAI WebRTC transport", () => {
  beforeEach(() => {
    transportState.create.mockReset();
    transportState.session = null;
    transportState.microphoneStream = null;
    transportState.observedStream = null;
    transportState.cleanup.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubRingtoneAudio() {
    const oscillator = () => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });
    const context = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(oscillator),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    vi.stubGlobal("AudioContext", function AudioContext() {
      return context;
    });
    return context;
  }

  it("constructs the selected transport before ringing but waits to connect until ringing ends", async () => {
    vi.useFakeTimers();
    stubRingtoneAudio();
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    expect(transportState.create).toHaveBeenCalledOnce();
    expect(session.connect).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(session.connect).toHaveBeenCalledWith("token");
    vi.useRealTimers();
  });

  it("ends through the selected transport during ringing without connecting", async () => {
    vi.useFakeTimers();
    stubRingtoneAudio();
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Akhiri panggilan" }));
    expect(session.disconnect).toHaveBeenCalledWith("user");
    expect(session.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(session.connect).not.toHaveBeenCalled();
    expect(transportState.cleanup).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cleans up through the selected transport when unmounted during ringing", async () => {
    vi.useFakeTimers();
    stubRingtoneAudio();
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);

    const view = render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    view.unmount();
    expect(session.disconnect).toHaveBeenCalledWith("cleanup");
    expect(session.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(session.connect).not.toHaveBeenCalled();
    expect(transportState.cleanup).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("legacy capture is observed once through the callback without replacing getUserMedia", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    transportState.microphoneStream = stream;
    const originalGetUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: originalGetUserMedia },
    });
    const session = createSession();
    session.connect.mockImplementationOnce(async () => {
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      session.onLocalStream(captured);
    });
    transportState.create.mockReturnValueOnce(session);

    render(
      React.createElement(PhoneInterface, {
        config: { ...config, telefunTransport: "openai-audio" },
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(originalGetUserMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(transportState.observedStream).toBe(stream));
    expect(navigator.mediaDevices.getUserMedia).toBe(originalGetUserMedia);
  });

  it("does not transfer a recording URL when the parent has already abandoned the session", async () => {
    const session = {
      ...createSession(),
      onRecordingComplete: vi.fn(),
    };
    const retainObjectUrl = vi.fn(() => true);
    const onRecordingReady = vi.fn(async () => ({ retainObjectUrl: true }));
    transportState.create.mockReturnValueOnce(session);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
        onRecordingReady,
        retainObjectUrl,
        canRetainObjectUrl: false,
      }),
    );

    await session.onRecordingComplete("blob:abandoned", null, null, {
      sessionDurationMs: 0,
    });

    expect(onRecordingReady).toHaveBeenCalledOnce();
    expect(retainObjectUrl).not.toHaveBeenCalled();
  });

  it("selects WebRTC before connect and ends without legacy fallback", async () => {
    const session = createSession();
    transportState.session = session;
    transportState.create.mockReturnValueOnce(session);
    const onEndSession = vi.fn();

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession,
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalledWith("token"));
    expect(transportState.create).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ accessToken: "token" }),
    );

    session.onStatusChange("Tersambung");
    const endButton = screen.getByRole("button", { name: "Akhiri panggilan" });
    fireEvent.click(endButton);
    await waitFor(() =>
      expect(session.disconnect).toHaveBeenCalledWith("user"),
    );
    expect(onEndSession).toHaveBeenCalledWith(undefined);
  });

  it("keeps the call mounted and retries the same session after durable cleanup 503", async () => {
    const session = createSession();
    session.disconnect
      .mockRejectedValueOnce(
        new Error("Realtime call finalization unavailable"),
      )
      .mockResolvedValueOnce(undefined);
    transportState.create.mockReturnValueOnce(session);
    const onEndSession = vi.fn();

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession,
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalledWith("token"));
    fireEvent.click(screen.getByRole("button", { name: "Akhiri panggilan" }));

    const retryButton = await screen.findByRole("button", {
      name: "Coba lagi mengakhiri panggilan",
    });
    expect(onEndSession).not.toHaveBeenCalled();
    expect(session.disconnect).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButton);
    await waitFor(() => expect(session.disconnect).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onEndSession).toHaveBeenCalledOnce());
  });

  it("maps setup failures to safe copy without exposing implementation details", async () => {
    const constructorError = new Error(
      "Browser WebRTC is unavailable at https://secret.example.",
    );
    transportState.create.mockImplementationOnce(() => {
      throw constructorError;
    });
    transportState.cleanup.mockResolvedValueOnce(undefined);

    render(
      React.createElement(PhoneInterface, {
        config: {
          ...config,
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(transportState.create).toHaveBeenCalled());
    await waitFor(() =>
      expect(transportState.cleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
          accessToken: "token",
          fetch,
        }),
      ),
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "https://secret.example",
    );
  });

  it("keeps the retry action mounted and restores focus after a failed retry", async () => {
    const constructorError = new Error("Browser WebRTC is unavailable.");
    const onEndSession = vi.fn();
    let rejectRetry!: (error: unknown) => void;
    const retryAttempt = new Promise<void>((_resolve, reject) => {
      rejectRetry = reject;
    });
    transportState.create.mockImplementationOnce(() => {
      throw constructorError;
    });
    transportState.cleanup
      .mockRejectedValueOnce(
        new Error("Realtime call finalization unavailable"),
      )
      .mockImplementationOnce(() => retryAttempt);

    render(
      React.createElement(PhoneInterface, {
        config: {
          ...config,
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
        accessToken: "token",
        onEndSession,
      }),
    );

    await waitFor(() =>
      expect(transportState.cleanup).toHaveBeenCalledTimes(1),
    );
    expect(onEndSession).not.toHaveBeenCalled();
    const retryButton = await screen.findByRole("button", {
      name: "Coba lagi mengakhiri panggilan",
    });

    fireEvent.click(retryButton);
    expect(
      screen.getByRole("button", {
        name: "Coba lagi mengakhiri panggilan",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Coba lagi mengakhiri panggilan",
      }),
    ).toHaveAttribute("aria-busy", "true");
    rejectRetry(new Error("cleanup still unavailable"));
    await waitFor(() =>
      expect(transportState.cleanup).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Coba lagi mengakhiri panggilan",
        }),
      ).toHaveFocus(),
    );
    expect(onEndSession).not.toHaveBeenCalled();
  });

  it("shows an audio activation action only after autoplay is blocked", async () => {
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);
    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Aktifkan audio" })).toBeNull();
    session.onPlaybackBlocked();
    const activateAudio = await screen.findByRole("button", {
      name: "Aktifkan audio",
    });
    fireEvent.click(activateAudio);
    await waitFor(() => expect(session.retryPlayback).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Aktifkan audio" }),
      ).toBeNull(),
    );
  });

  it("renders terminal success and failure statuses accurately", async () => {
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);
    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalled());
    session.onStateChange("ended");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Selesai"),
    );

    session.onStatusChange("Gagal");
    session.onError(new Error("Koneksi gagal"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Panggilan belum dapat dimulai. Silakan coba lagi.",
      ),
    );
  });

  it("does not let a rejected connect overwrite an error already reported by onError", async () => {
    const session = createSession();
    session.connect.mockImplementationOnce(async () => {
      session.onError({ code: "provider_error" } as unknown as Error);
      throw { code: "unknown" };
    });
    transportState.create.mockReturnValueOnce(session);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Terjadi kesalahan pada layanan suara. Silakan coba lagi.",
      ),
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Panggilan belum dapat dimulai. Silakan coba lagi.",
    );
  });

  it("surfaces a network recovery discontinuity without silently recreating the call", async () => {
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);
    const onRecoveryRequired = vi.fn();
    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
        onRecoveryRequired,
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalled());
    session.onRecoveryRequired?.({
      outcome: "network_lost",
      requiresNewSessionBoundary: true,
      newAttemptId: "attempt-new",
      newSessionBoundaryId: "boundary-new",
      discontinuityId: "discontinuity-1",
      previousSessionId: "550e8400-e29b-41d4-a716-446655440000",
      previousAttemptId: "attempt-old",
      reason: "wifi_mobile_switch",
      createdAtMs: 123,
    });

    expect(onRecoveryRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        newAttemptId: "attempt-new",
        discontinuityId: "discontinuity-1",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Koneksi terputus. Sesi ini ditutup; buat sesi baru untuk melanjutkan.",
      ),
    );
    expect(session.connect).toHaveBeenCalledOnce();
  });

  it("uses microphone copy for a device-unplugged recovery", async () => {
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);
    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalled());
    session.onRecoveryRequired?.({
      outcome: "network_lost",
      requiresNewSessionBoundary: true,
      newAttemptId: "attempt-new",
      newSessionBoundaryId: "boundary-new",
      discontinuityId: "discontinuity-device",
      previousSessionId: config.sessionId ?? "session-previous",
      reason: "device_unplugged",
      createdAtMs: 123,
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.",
      ),
    );
  });

  it("uses cleanup on unmount and suppresses a rejected disconnect", async () => {
    const session = createSession();
    transportState.create.mockReturnValueOnce(session);
    const view = render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "token",
        onEndSession: vi.fn(),
      }),
    );

    await waitFor(() => expect(session.connect).toHaveBeenCalled());
    session.disconnect.mockRejectedValueOnce(new Error("cleanup failed"));
    const unhandled = vi.fn();
    const onUnhandledRejection = (reason: unknown, promise: Promise<unknown>) =>
      unhandled(reason, promise);
    process.on("unhandledRejection", onUnhandledRejection);
    view.unmount();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", onUnhandledRejection);
    expect(session.disconnect).toHaveBeenCalledWith("cleanup");
    expect(unhandled).not.toHaveBeenCalled();
    expect(transportState.create).toHaveBeenCalledTimes(1);
  });
});
