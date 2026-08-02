import {
  observeOpenAIUsage,
  type OpenAIUsageAccumulator,
} from "../usage.js";
import type { TranscriptCollector } from "../transcript.js";
import {
  createOpenAIRealtimeEventObserver,
  type OpenAIRealtimeEventCallbacks,
  type OpenAIRealtimeObserverCapacity,
  type OpenAIRealtimeProviderErrorSignal,
  type OpenAIRealtimeResponseDone,
  type OpenAIRealtimeToolEvent,
} from "../providers/openai-realtime-event-observer.js";

export type SidebandDiagnostic =
  | { type: "malformed_json" }
  | { type: "frame_too_large" }
  | { type: "malformed_event" }
  | { type: "unknown_event"; eventType: string }
  | ({ type: "provider_error" } & OpenAIRealtimeProviderErrorSignal)
  | { type: "response_not_completed"; responseId: string; status: string }
  | OpenAIRealtimeObserverCapacity;

export interface SidebandEventObserverOptions {
  transcript: TranscriptCollector;
  usage: OpenAIUsageAccumulator;
  now?: () => number;
  maxDedupeEntries?: number;
  onActivity?: () => void;
  onStartAiSpeaking?: () => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onResponseDone?: (event: OpenAIRealtimeResponseDone) => boolean;
  onResponseNotCompleted?: (event: {
    responseId: string;
    status: string;
  }) => void;
  onProviderError?: (signal: OpenAIRealtimeProviderErrorSignal) => void;
  onToolEvent?: (event: OpenAIRealtimeToolEvent) => void;
  onDiagnostic?: (diagnostic: SidebandDiagnostic) => void;
  onCapacityExceeded?: (capacity: OpenAIRealtimeObserverCapacity) => void;
}

export class SidebandEventObserver {
  private readonly observer: ReturnType<
    typeof createOpenAIRealtimeEventObserver
  >;

  constructor(private readonly options: SidebandEventObserverOptions) {
    const callbacks: OpenAIRealtimeEventCallbacks = {
      appendTranscript: (entry) => options.transcript.append(entry),
      observeUsage: (observation, observedAtMs) =>
        observeOpenAIUsage(options.usage, observation, observedAtMs),
      startAiSpeaking: () => options.onStartAiSpeaking?.(),
      completeTurn: () => options.transcript.completeTurn("consumer"),
      interruptTurn: () => options.transcript.interruptTurn(),
      notifyActivity: () => options.onActivity?.(),
      notifyTurnComplete: () => options.onTurnComplete?.(),
      notifyInterrupted: () => options.onInterrupted?.(),
      onResponseDone: (event) => options.onResponseDone?.(event) ?? false,
      onResponseNotCompleted: (event) => {
        options.onResponseNotCompleted?.(event);
        options.onDiagnostic?.({ type: "response_not_completed", ...event });
      },
      onProviderError: (signal) => {
        options.onProviderError?.(signal);
        options.onDiagnostic?.({ type: "provider_error", ...signal });
      },
      onToolEvent: (event) => options.onToolEvent?.(event),
      onMalformedEvent: () => options.onDiagnostic?.({ type: "malformed_event" }),
      onUnknownEvent: (eventType) =>
        options.onDiagnostic?.({ type: "unknown_event", eventType }),
      onCapacityExceeded: (capacity) => {
        options.onDiagnostic?.(capacity);
        options.onCapacityExceeded?.(capacity);
      },
    };
    this.observer = createOpenAIRealtimeEventObserver({
      callbacks,
      now: options.now,
      maxDedupeEntries: options.maxDedupeEntries,
    });
  }

  observe(value: unknown): void {
    if (isNonAuthoritativeAudioEvent(value)) return;
    this.observer.observe(value, this.options.now?.() ?? Date.now());
  }
}

function isNonAuthoritativeAudioEvent(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { type?: unknown }).type === "response.output_audio.delta",
  );
}
