import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMicrophoneActivity } from "../routes/telefun/components/useMicrophoneActivity";

class MockAnalyserNode {
  fftSize = 64;
  frequencyBinCount = 32;
  connect = vi.fn();
  disconnect = vi.fn();
  getByteTimeDomainData = vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 2 === 0 ? 128 : 180;
    }
  });
}

function setupWebAudioMock() {
  const mockAnalyser = new MockAnalyserNode();
  const mockSource = { connect: vi.fn(), disconnect: vi.fn() };

  const mockAudioContext = {
    state: "running",
    createMediaStreamSource: vi.fn(() => mockSource),
    createAnalyser: vi.fn(() => mockAnalyser),
    close: vi.fn().mockResolvedValue(undefined),
  };

  function MockAudioContextConstructor() {
    return mockAudioContext;
  }
  vi.stubGlobal("AudioContext", MockAudioContextConstructor);
  vi.stubGlobal("webkitAudioContext", undefined);

  return { mockAnalyser, mockSource, mockAudioContext };
}

function createMockMediaDevices(
  stream: { getTracks: () => { stop: () => void }[] } | null,
) {
  const mock = {
    getUserMedia: vi.fn().mockResolvedValue(stream),
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: mock,
    configurable: true,
    writable: true,
  });
  return mock;
}

describe("useMicrophoneActivity", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns isSupported=false when AudioContext is not available", () => {
    vi.stubGlobal("AudioContext", undefined);

    const { result } = renderHook(() =>
      useMicrophoneActivity({ active: true, muted: false }),
    );

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isListening).toBe(false);
    expect(result.current.level).toBe(0);
    expect(result.current.bars).toEqual([]);
  });

  it("returns isSupported=false when getUserMedia is not available", () => {
    setupWebAudioMock();
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMicrophoneActivity({ active: true, muted: false }),
    );

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it("returns inactive bars when muted is true", () => {
    setupWebAudioMock();
    createMockMediaDevices(null);

    const { result } = renderHook(() =>
      useMicrophoneActivity({ active: true, muted: true }),
    );

    expect(result.current.isListening).toBe(false);
    expect(result.current.level).toBe(0);
    expect(result.current.bars).toEqual([]);
  });

  it("starts listening when active and not muted", async () => {
    setupWebAudioMock();
    createMockMediaDevices({ getTracks: () => [{ stop: vi.fn() }] });

    const { result } = renderHook(
      ({ active, muted }: { active: boolean; muted: boolean }) =>
        useMicrophoneActivity({ active, muted }),
      { initialProps: { active: true, muted: false } },
    );

    await vi.waitFor(
      () => {
        if (result.current.isListening) return true;
        if (result.current.error) throw new Error(result.current.error);
        if (!result.current.isSupported) throw new Error("not supported");
        throw new Error(`waiting... level=${result.current.level}`);
      },
      { timeout: 3000, interval: 50 },
    );

    expect(result.current.isListening).toBe(true);
    expect(result.current.isSupported).toBe(true);
  });

  it("reuses an injected transport stream and never stops its tracks", async () => {
    const { mockSource, mockAnalyser, mockAudioContext } = setupWebAudioMock();
    const stop = vi.fn();
    const injectedStream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    const mediaDevices = createMockMediaDevices(null);
    mediaDevices.getUserMedia.mockRejectedValue(new Error("second capture"));

    const { result, unmount } = renderHook(() =>
      useMicrophoneActivity({
        active: true,
        muted: false,
        stream: injectedStream,
      }),
    );

    await waitFor(() => expect(result.current.isListening).toBe(true));
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    unmount();
    expect(stop).not.toHaveBeenCalled();
    expect(mockSource.disconnect).toHaveBeenCalled();
    expect(mockAnalyser.disconnect).toHaveBeenCalled();
    expect(mockAudioContext.close).toHaveBeenCalled();
  });

  it("stops microphone resources on unmount", async () => {
    const { mockSource, mockAnalyser, mockAudioContext } = setupWebAudioMock();
    const stop = vi.fn();
    const mediaDevices = createMockMediaDevices({
      getTracks: () => [{ stop }],
    });

    const { result, unmount } = renderHook(() =>
      useMicrophoneActivity({ active: true, muted: false }),
    );

    await waitFor(() => {
      expect(mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(result.current.isListening).toBe(true);
    });

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(mockSource.disconnect).toHaveBeenCalled();
    expect(mockAnalyser.disconnect).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(mockAudioContext.close).toHaveBeenCalled();
  });

  it("does not leak AudioContext when microphone permission fails", async () => {
    const { mockAudioContext } = setupWebAudioMock();
    createMockMediaDevices(null).getUserMedia.mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );

    const { result } = renderHook(() =>
      useMicrophoneActivity({ active: true, muted: false }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Permission denied");
    });

    expect(mockAudioContext.close).not.toHaveBeenCalled();
    expect(result.current.level).toBe(0);
    expect(result.current.bars).toEqual([]);
  });

  it("returns inactive state when not active", () => {
    setupWebAudioMock();
    createMockMediaDevices({ getTracks: () => [{ stop: vi.fn() }] });

    const { result } = renderHook(() =>
      useMicrophoneActivity({ active: false, muted: false }),
    );

    expect(result.current.isListening).toBe(false);
    expect(result.current.level).toBe(0);
    expect(result.current.bars).toEqual([]);
  });
});
