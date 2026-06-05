import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, renderHook, waitFor } from "@testing-library/react";
import { MicrophoneActivityWaveform } from "../routes/telefun/components/MicrophoneActivityWaveform";
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

describe("MicrophoneActivityWaveform", () => {
  it("renders a compact waveform from bar levels", () => {
    render(
      <MicrophoneActivityWaveform
        bars={[0, 20, 60, 100]}
        active={true}
        tone="normal"
      />,
    );

    expect(screen.getByTestId("telefun-mic-waveform")).toBeTruthy();
    expect(screen.getAllByTestId("telefun-mic-waveform-bar")).toHaveLength(4);
  });

  it("renders quiet bars when inactive", () => {
    render(
      <MicrophoneActivityWaveform
        bars={[]}
        active={false}
        tone="silent"
      />,
    );

    expect(screen.getByTestId("telefun-mic-waveform")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders fallback quiet bars when bars array is empty", () => {
    render(
      <MicrophoneActivityWaveform
        bars={[]}
        active={true}
        tone="silent"
      />,
    );

    const bars = screen.getAllByTestId("telefun-mic-waveform-bar");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("applies silent tone styling", () => {
    render(
      <MicrophoneActivityWaveform
        bars={[10, 20, 30]}
        active={true}
        tone="silent"
      />,
    );

    const bars = screen.getAllByTestId("telefun-mic-waveform-bar");
    expect(bars.length).toBe(3);
  });

  it("applies danger tone styling", () => {
    render(
      <MicrophoneActivityWaveform
        bars={[80, 90, 100]}
        active={true}
        tone="danger"
      />,
    );

    expect(screen.getByTestId("telefun-mic-waveform")).toBeTruthy();
  });
});

function createMockMediaDevices(stream: { getTracks: () => { stop: () => void }[] } | null) {
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
