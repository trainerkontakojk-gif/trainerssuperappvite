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
import type { SessionMetrics } from "@trainers/types";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

const liveSessionState = vi.hoisted(() => ({
  instances: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    setMute: ReturnType<typeof vi.fn>;
    setHold: ReturnType<typeof vi.fn>;
    sendTimeCue: ReturnType<typeof vi.fn>;
    onRecordingComplete: (
      url: string | null,
      fullBlob: Blob | null,
      agentBlob: Blob | null,
      metrics: SessionMetrics,
    ) => void | Promise<void>;
  }>,
}));

vi.mock("../routes/telefun/services/liveSession", () => ({
  LiveSession: class MockLiveSession {
    connect = vi.fn();
    disconnect = vi.fn();
    setMute = vi.fn();
    setHold = vi.fn();
    sendTimeCue = vi.fn();
    onStatusChange = vi.fn();
    onStateChange = vi.fn();
    onError = vi.fn();
    onAiSpeaking = vi.fn();
    onVolumeChange = vi.fn();
    onTimelineEvent = vi.fn();
    onSessionCreated = vi.fn();
    onRecordingComplete = vi.fn();

    constructor() {
      liveSessionState.instances.push(this);
    }
  },
}));

vi.mock("../routes/telefun/components/useMicrophoneActivity", () => ({
  useMicrophoneActivity: () => ({
    level: 0,
    status: "idle",
  }),
}));

import { PhoneInterface } from "../routes/telefun/components/PhoneInterface";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const config = {
  telefunTransport: "gemini-live",
  consumerTypes: [],
  consumerName: "Budi",
  maxCallDuration: 0,
} as unknown as TelefunAppSettings;

describe("PhoneInterface end-call finalization", () => {
  beforeEach(() => {
    liveSessionState.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("memanggil disconnect sekali dan menunda navigasi sampai finalization resolve", async () => {
    const finalization = createDeferred();
    const onEndSession = vi.fn();

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "test-access-token",
        onEndSession,
        onRecordingReady: vi.fn(),
      }),
    );

    await waitFor(() => expect(liveSessionState.instances).toHaveLength(1));
    const session = liveSessionState.instances[0];
    expect(session.connect).toHaveBeenCalledWith("test-access-token");
    session.disconnect.mockReturnValue(finalization.promise);

    const endButton = screen.getByRole("button", {
      name: "Akhiri panggilan",
    });
    fireEvent.click(endButton);
    fireEvent.click(endButton);

    expect(session.disconnect).toHaveBeenCalledTimes(1);
    expect(onEndSession).not.toHaveBeenCalled();
    expect(endButton).toBeDisabled();
    expect(screen.getByText("Mengakhiri...")).not.toHaveClass("hidden");
    expect(screen.getByText("Mengakhiri panggilan...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aktifkan hold" }),
    ).toBeDisabled();
    expect(screen.getByTitle("Mute Microphone")).toBeDisabled();

    await act(async () => {
      finalization.resolve();
      await finalization.promise;
    });

    expect(onEndSession).toHaveBeenCalledTimes(1);
  });

  it("menampilkan label Hangup pada mobile saat panggilan aktif", async () => {
    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "test-access-token",
        onEndSession: vi.fn(),
        onRecordingReady: vi.fn(),
      }),
    );

    await waitFor(() => expect(liveSessionState.instances).toHaveLength(1));

    expect(screen.getByText("Hangup")).not.toHaveClass("hidden");
  });

  it("timeout dan klik user tetap memakai satu disconnect", async () => {
    vi.useFakeTimers();
    const finalization = createDeferred();
    const onEndSession = vi.fn();

    render(
      React.createElement(PhoneInterface, {
        config: { ...config, maxCallDuration: 1 / 60 },
        accessToken: "test-access-token",
        onEndSession,
        onRecordingReady: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(liveSessionState.instances).toHaveLength(1);

    const session = liveSessionState.instances[0];
    session.disconnect.mockReturnValue(finalization.promise);
    act(() => {
      (
        session as typeof session & { onStatusChange: (status: string) => void }
      ).onStatusChange("Tersambung");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(session.disconnect).toHaveBeenCalledTimes(1);
    expect(session.disconnect).toHaveBeenCalledWith("timeout");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mengakhiri panggilan, harap tunggu",
      }),
    );
    expect(session.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      finalization.resolve();
      await finalization.promise;
    });
    expect(onEndSession).toHaveBeenCalledWith("timeout");
  });

  it("meneruskan signature onRecordingComplete ke onRecordingReady secara lengkap", async () => {
    const onRecordingReady = vi.fn().mockResolvedValue(undefined);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "test-access-token",
        onEndSession: vi.fn(),
        onRecordingReady,
      }),
    );

    await waitFor(() => expect(liveSessionState.instances).toHaveLength(1));
    const session = liveSessionState.instances[0];
    const fullBlob = new Blob(["full"]);
    const agentBlob = new Blob(["agent"]);
    const metrics = { sessionDurationMs: 1234 } as SessionMetrics;

    await session.onRecordingComplete(
      "blob:recording",
      fullBlob,
      agentBlob,
      metrics,
    );

    expect(onRecordingReady).toHaveBeenCalledWith(
      "blob:recording",
      "Budi",
      expect.any(Number),
      fullBlob,
      agentBlob,
      metrics,
    );
  });

  it("menggunakan sessionDurationMs sebagai durasi final saat counter UI berhenti selama reconnect", async () => {
    const onRecordingReady = vi.fn().mockResolvedValue(undefined);

    render(
      React.createElement(PhoneInterface, {
        config,
        accessToken: "test-access-token",
        onEndSession: vi.fn(),
        onRecordingReady,
      }),
    );

    await waitFor(() => expect(liveSessionState.instances).toHaveLength(1));
    const session = liveSessionState.instances[0];
    const metrics = { sessionDurationMs: 509_027 } as SessionMetrics;

    await session.onRecordingComplete(null, null, null, metrics);

    expect(onRecordingReady).toHaveBeenCalledWith(
      null,
      "Budi",
      509,
      null,
      null,
      metrics,
    );
  });
});

describe("LiveSession disconnect idempotency", () => {
  it("mengembalikan Promise yang sama untuk panggilan duplikat", async () => {
    const actual = await vi.importActual<
      typeof import("../routes/telefun/services/liveSession")
    >("../routes/telefun/services/liveSession");
    const session = new actual.LiveSession(config);
    Object.assign(session, {
      ws: null,
      cleanupAudio: vi.fn(),
    });

    const first = session.disconnect("user");
    const second = session.disconnect("user");

    expect(second).toBe(first);
    await Promise.all([first, second]);
  });
});
