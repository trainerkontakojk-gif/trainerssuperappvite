import { useEffect, useState } from "react";

export interface MicrophoneActivityState {
  level: number;
  bars: number[];
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
}

interface UseMicrophoneActivityInput {
  active: boolean;
  muted: boolean;
  barCount?: number;
  smoothing?: number;
}

function getMicrophoneErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name?: unknown }).name === "NotAllowedError"
  ) {
    return "Permission denied";
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

export function useMicrophoneActivity({
  active,
  muted,
  barCount = 24,
  smoothing = 0.4,
}: UseMicrophoneActivityInput): MicrophoneActivityState {
  const [state, setState] = useState<MicrophoneActivityState>({
    level: 0,
    bars: [],
    isSupported: true,
    isListening: false,
    error: null,
  });

  useEffect(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor || !navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, isSupported: false, isListening: false }));
      return;
    }

    if (!active || muted) {
      setState((prev) => ({
        ...prev,
        level: 0,
        bars: [],
        isListening: false,
      }));
      return;
    }

    let cancelled = false;
    const frameRef: { current: number | null } = { current: null };
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          cleanup();
          return;
        }

        audioContext = new AudioContextCtor();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;

        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let smoothedLevel = 0;

        function tick() {
          if (cancelled) return;

          analyser!.getByteTimeDomainData(data);

          const bars: number[] = [];
          let sumSquares = 0;

          for (let i = 0; i < barCount; i++) {
            const sampleIndex = Math.floor((i / barCount) * data.length);
            const sample = data[sampleIndex] ?? 128;
            const amplitude = Math.abs(sample - 128) / 128;
            sumSquares += amplitude * amplitude;
            bars.push(Math.round(Math.max(3, amplitude * 24)));
          }

          const rawLevel = Math.min(
            100,
            Math.round(Math.sqrt(sumSquares / barCount) * 180),
          );

          smoothedLevel = smoothedLevel * smoothing + rawLevel * (1 - smoothing);

          if (!cancelled) {
            setState({
              level: Math.round(smoothedLevel),
              bars,
              isSupported: true,
              isListening: true,
              error: null,
            });
          }

          frameRef.current = requestAnimationFrame(tick);
        }

        if (!cancelled) {
          setState((prev) => ({ ...prev, isListening: true }));
          frameRef.current = requestAnimationFrame(tick);
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isSupported: true,
            isListening: false,
            level: 0,
            bars: [],
            error: getMicrophoneErrorMessage(err),
          }));
        }
        cleanup();
      }
    }

    function cleanup() {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (source) {
        source.disconnect();
        source = null;
      }
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [active, muted, barCount, smoothing]);

  return state;
}
