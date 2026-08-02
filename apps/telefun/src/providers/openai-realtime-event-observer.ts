import { createHash } from "node:crypto";

const MAX_EVENT_ID_LENGTH = 512;
const MAX_RESPONSE_ID_LENGTH = 256;
const MAX_ITEM_ID_LENGTH = 256;
const MAX_CALL_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 64 * 1024;

// A 60-minute call can legitimately complete one response/item per second.
// Terminal IDs are never evicted, so these independent limits provide headroom
// without making active delta streams lifetime-sized stores.
const DEFAULT_MAX_RESPONSE_TERMINALS = 4_096;
const DEFAULT_MAX_INPUT_ITEMS = 4_096;
const DEFAULT_MAX_OUTPUT_COMPLETED_ITEMS = 4_096;
const DEFAULT_MAX_INTERRUPTED_RESPONSES = 4_096;
const DEFAULT_MAX_OUTPUT_TRANSCRIPT_EVENTS_PER_ITEM = 256;
const DEFAULT_MAX_TOOL_EVENTS_PER_CALL = 256;
const DEFAULT_MAX_TOOL_CALLS_PER_SESSION = 256;
const DEFAULT_MAX_ACTIVE_OUTPUT_ITEMS = 256;
const DEFAULT_MAX_ACTIVE_TOOL_CALLS = 32;

const OPENAI_REALTIME_EVENT_TYPES = new Set([
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.delta",
  "conversation.item.input_audio_transcription.completed",
  "response.output_audio.delta",
  "response.output_audio_transcript.delta",
  "response.output_audio_transcript.done",
  "response.done",
  "response.cancelled",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
  "error",
]);

export function isOpenAIRealtimeEventType(type: string): boolean {
  return OPENAI_REALTIME_EVENT_TYPES.has(type);
}

export type OpenAIRealtimeToolEvent = {
  phase: "delta" | "done";
  responseId?: string;
  callId: string;
  delta?: string;
  name?: string;
  arguments?: string;
};

export type OpenAIRealtimeResponseDone = {
  responseId: string;
  status: string;
  usage?: Record<string, unknown>;
};

export type OpenAIRealtimeProviderErrorSignal = {
  code: string;
};

export type OpenAIRealtimeObserverCapacity = {
  type: "observer_capacity_exceeded";
  scope: string;
  limit: number;
};

export interface OpenAIRealtimeEventCallbacks {
  appendTranscript(entry: {
    speaker: "agent" | "consumer";
    text: string;
    observedAtMs: number;
  }): void;
  observeUsage(
    observation: {
      source: "openai_realtime_response" | "openai_input_transcription";
      id: string;
      usage: Record<string, unknown>;
    },
    observedAtMs: number,
  ): void;
  /** Media forwarding and speaking state remain owned by the WS adapter. */
  startAiSpeaking?(): void;
  completeTurn(): void;
  interruptTurn(): void;
  notifyActivity(): void;
  notifyTurnComplete(): void;
  notifyInterrupted(): void;
  onToolEvent?(event: OpenAIRealtimeToolEvent): void;
  /** Return true when the caller consumed this response to send tool output. */
  onResponseDone?(event: OpenAIRealtimeResponseDone): boolean;
  onResponseNotCompleted?(event: {
    responseId: string;
    status: string;
  }): void;
  onProviderError?(signal: OpenAIRealtimeProviderErrorSignal): void;
  onMalformedEvent?(): void;
  onUnknownEvent?(eventType: string): void;
  onCapacityExceeded?(capacity: OpenAIRealtimeObserverCapacity): void;
}

export interface OpenAIRealtimeEventObserver {
  observe(
    value: unknown,
    observedAtMs?: number,
  ): { eventType: string; suppressClientForward: boolean } | null;
}

type InputCompletionState = {
  transcriptObserved: boolean;
  usageObserved: boolean;
};
type OutputTranscriptState = {
  eventIds: BoundedDedupeSet;
  hasDelta: boolean;
};

class BoundedDedupeSet {
  private readonly values = new Set<string>();

  constructor(private readonly limit: number) {}

  has(value: string): boolean {
    return this.values.has(value);
  }

  add(value: string): boolean {
    if (this.values.has(value)) return true;
    if (this.values.size >= this.limit) return false;
    this.values.add(value);
    return true;
  }
}

class BoundedDedupeMap<T> {
  private readonly values = new Map<string, T>();

  constructor(private readonly limit: number) {}

  get(key: string): T | undefined {
    return this.values.get(key);
  }

  set(key: string, value: T): boolean {
    if (!this.canSet(key)) return false;
    this.values.set(key, value);
    return true;
  }

  canSet(key: string): boolean {
    return this.values.has(key) || this.values.size < this.limit;
  }

  delete(key: string): void {
    this.values.delete(key);
  }
}

function boundedLimit(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(value ?? fallback));
}

function dedupeKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createOpenAIRealtimeEventObserver(options: {
  callbacks: OpenAIRealtimeEventCallbacks;
  now?: () => number;
  /** Legacy test/config override. Granular limits should be preferred. */
  maxDedupeEntries?: number;
  maxResponseTerminals?: number;
  maxInputItems?: number;
  maxOutputCompletedItems?: number;
  maxInterruptedResponses?: number;
  maxOutputTranscriptEventsPerItem?: number;
  maxToolEventsPerCall?: number;
  maxToolCallsPerSession?: number;
  maxActiveOutputItems?: number;
  maxActiveToolCalls?: number;
}): OpenAIRealtimeEventObserver {
  const legacyLimit = options.maxDedupeEntries;
  const limit = (configured: number | undefined, fallback: number): number =>
    boundedLimit(legacyLimit ?? configured, fallback);
  const responseLimit = limit(options.maxResponseTerminals, DEFAULT_MAX_RESPONSE_TERMINALS);
  const inputLimit = limit(options.maxInputItems, DEFAULT_MAX_INPUT_ITEMS);
  const outputCompletedLimit = limit(
    options.maxOutputCompletedItems,
    DEFAULT_MAX_OUTPUT_COMPLETED_ITEMS,
  );
  const interruptionLimit = limit(
    options.maxInterruptedResponses,
    DEFAULT_MAX_INTERRUPTED_RESPONSES,
  );
  const outputEventLimit = limit(
    options.maxOutputTranscriptEventsPerItem,
    DEFAULT_MAX_OUTPUT_TRANSCRIPT_EVENTS_PER_ITEM,
  );
  const toolEventLimit = limit(
    options.maxToolEventsPerCall,
    DEFAULT_MAX_TOOL_EVENTS_PER_CALL,
  );
  const toolCallLimit = limit(
    options.maxToolCallsPerSession,
    DEFAULT_MAX_TOOL_CALLS_PER_SESSION,
  );
  const activeOutputLimit = limit(
    options.maxActiveOutputItems,
    DEFAULT_MAX_ACTIVE_OUTPUT_ITEMS,
  );
  const activeToolLimit = limit(
    options.maxActiveToolCalls,
    DEFAULT_MAX_ACTIVE_TOOL_CALLS,
  );

  // Input completion and optional transcription usage share one terminal item
  // record, so one normal input item consumes one bounded key, not two.
  const inputItems = new BoundedDedupeMap<InputCompletionState>(inputLimit);
  // Active output item event IDs are released at done. Completed item IDs stay
  // forever (within this call) so late duplicates can never be re-admitted.
  const activeOutputTranscriptItems = new Map<string, OutputTranscriptState>();
  const outputTranscriptCompletedItems = new BoundedDedupeSet(outputCompletedLimit);
  const responseTerminals = new BoundedDedupeMap<boolean>(responseLimit);
  const interruptedResponses = new BoundedDedupeSet(interruptionLimit);
  // Tool event IDs are scoped to an active call and released at done. Completed
  // call IDs remain bounded by the existing 256-call session policy.
  const activeToolEventIds = new Map<string, BoundedDedupeSet>();
  const completedToolCalls = new BoundedDedupeSet(toolCallLimit);
  const now = options.now ?? Date.now;
  const { callbacks } = options;
  let failedClosed = false;

  const failCapacity = (scope: string, limitValue: number): false => {
    if (!failedClosed) {
      failedClosed = true;
      callbacks.onCapacityExceeded?.({
        type: "observer_capacity_exceeded",
        scope,
        limit: limitValue,
      });
    }
    return false;
  };

  const remember = (
    store: BoundedDedupeSet,
    value: string,
    scope: string,
    limitValue: number,
  ): boolean => {
    if (store.has(value)) return true;
    return store.add(value) || failCapacity(scope, limitValue);
  };

  const rememberMap = <T>(
    store: BoundedDedupeMap<T>,
    key: string,
    value: T,
    scope: string,
    limitValue: number,
  ): boolean => store.set(key, value) || failCapacity(scope, limitValue);

  const interruptResponseByKey = (responseKey: string): void => {
    if (!remember(interruptedResponses, responseKey, "interrupted_responses", interruptionLimit)) return;
    callbacks.interruptTurn();
    callbacks.notifyInterrupted();
  };

  const malformed = (): null => {
    callbacks.onMalformedEvent?.();
    return null;
  };

  return {
    observe(value, observedAtMs = now()) {
      if (failedClosed) return null;
      const event = asRecord(value);
      if (!event) return malformed();
      const eventType = boundedString(event.type, MAX_EVENT_ID_LENGTH);
      if (!eventType) return malformed();

      if (eventType === "error") {
        const error = asRecord(event.error);
        const code =
          (error &&
            (boundedString(error.code, MAX_EVENT_ID_LENGTH) ??
              boundedString(error.type, MAX_EVENT_ID_LENGTH))) ??
          "unknown";
        callbacks.onProviderError?.({ code: safeEventType(code) });
        return { eventType, suppressClientForward: true };
      }
      if (eventType === "input_audio_buffer.speech_started") {
        callbacks.notifyActivity();
        // Speech-start is an activity edge, not a response identity. Every
        // provider speech-start must interrupt the active turn.
        callbacks.interruptTurn();
        callbacks.notifyInterrupted();
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "input_audio_buffer.speech_stopped") {
        callbacks.notifyActivity();
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "conversation.item.input_audio_transcription.delta") {
        if (!boundedString(event.delta, MAX_TEXT_LENGTH)) return malformed();
        callbacks.notifyActivity();
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const itemId = boundedString(event.item_id, MAX_ITEM_ID_LENGTH);
        const transcript = boundedString(event.transcript, MAX_TEXT_LENGTH);
        if (!itemId) return malformed();
        const itemKey = dedupeKey(itemId);
        let state = inputItems.get(itemKey);
        if (!state) {
          state = { transcriptObserved: false, usageObserved: false };
          if (!rememberMap(inputItems, itemKey, state, "input_transcript_items", inputLimit)) return null;
        }
        if (transcript && !state.transcriptObserved) {
          state.transcriptObserved = true;
          callbacks.appendTranscript({ speaker: "agent", text: transcript, observedAtMs });
        }
        const usage = asRecord(event.usage);
        if (usage && !state.usageObserved) {
          state.usageObserved = true;
          callbacks.observeUsage(
            { source: "openai_input_transcription", id: itemId, usage },
            observedAtMs,
          );
        }
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "response.output_audio.delta") {
        // Output audio is media. The adapter validates and forwards it without
        // passing it through transcript/usage normalization.
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "response.output_audio_transcript.delta") {
        const delta = boundedString(event.delta, MAX_TEXT_LENGTH);
        const itemId = boundedString(event.item_id, MAX_ITEM_ID_LENGTH);
        if (!delta || !itemId) return malformed();
        const itemKey = dedupeKey(itemId);
        if (outputTranscriptCompletedItems.has(itemKey)) {
          return { eventType, suppressClientForward: false };
        }
        let state = activeOutputTranscriptItems.get(itemKey);
        if (!state) {
          if (activeOutputTranscriptItems.size >= activeOutputLimit) {
            failCapacity("active_output_transcript_items", activeOutputLimit);
            return null;
          }
          state = { eventIds: new BoundedDedupeSet(outputEventLimit), hasDelta: false };
          activeOutputTranscriptItems.set(itemKey, state);
        }
        const eventId = boundedString(event.event_id, MAX_EVENT_ID_LENGTH);
        if (eventId) {
          const eventKey = dedupeKey(eventId);
          if (state.eventIds.has(eventKey)) {
            return { eventType, suppressClientForward: false };
          }
          if (!remember(state.eventIds, eventKey, "output_transcript_events", outputEventLimit)) {
            return null;
          }
        }
        state.hasDelta = true;
        callbacks.appendTranscript({ speaker: "consumer", text: delta, observedAtMs });
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "response.output_audio_transcript.done") {
        const itemId = boundedString(event.item_id, MAX_ITEM_ID_LENGTH);
        if (!itemId) return malformed();
        const itemKey = dedupeKey(itemId);
        if (outputTranscriptCompletedItems.has(itemKey)) {
          return { eventType, suppressClientForward: false };
        }
        const state = activeOutputTranscriptItems.get(itemKey);
        if (
          !remember(
            outputTranscriptCompletedItems,
            itemKey,
            "output_transcript_done_items",
            outputCompletedLimit,
          )
        ) return null;
        activeOutputTranscriptItems.delete(itemKey);
        const transcript = boundedString(event.transcript, MAX_TEXT_LENGTH);
        if (transcript && !state?.hasDelta) {
          callbacks.appendTranscript({ speaker: "consumer", text: transcript, observedAtMs });
        }
        return { eventType, suppressClientForward: false };
      }
      if (eventType === "response.done") {
        const response = asRecord(event.response);
        const responseId = response && boundedString(response.id, MAX_RESPONSE_ID_LENGTH);
        if (!responseId) return malformed();
        const responseKey = dedupeKey(responseId);
        const previous = responseTerminals.get(responseKey);
        if (previous !== undefined) {
          return { eventType, suppressClientForward: previous };
        }
        if (!responseTerminals.canSet(responseKey)) {
          failCapacity("response_ids", responseLimit);
          return null;
        }
        const status = boundedString(response.status, MAX_EVENT_ID_LENGTH) ?? "unknown";
        const usage = asRecord(response.usage);
        const normalized = { responseId, status, ...(usage ? { usage } : {}) };
        const handledToolCalls = callbacks.onResponseDone?.(normalized) ?? false;
        if (!rememberMap(responseTerminals, responseKey, handledToolCalls, "response_ids", responseLimit)) return null;
        if (usage) {
          callbacks.observeUsage(
            { source: "openai_realtime_response", id: responseId, usage },
            observedAtMs,
          );
        }
        if (status === "completed") {
          if (!handledToolCalls) {
            callbacks.completeTurn();
            callbacks.notifyTurnComplete();
          }
        } else if (!interruptedResponses.has(responseKey)) {
          callbacks.onResponseNotCompleted?.({ responseId, status });
          interruptResponseByKey(responseKey);
        }
        return { eventType, suppressClientForward: handledToolCalls };
      }
      if (eventType === "response.cancelled") {
        const responseId = boundedString(event.response_id, MAX_RESPONSE_ID_LENGTH);
        const responseKey = dedupeKey(responseId ?? "active");
        if (interruptedResponses.has(responseKey)) {
          return { eventType, suppressClientForward: false };
        }
        interruptResponseByKey(responseKey);
        return { eventType, suppressClientForward: false };
      }
      if (
        eventType === "response.function_call_arguments.delta" ||
        eventType === "response.function_call_arguments.done"
      ) {
        const callId = boundedString(event.call_id, MAX_CALL_ID_LENGTH);
        const responseId = boundedString(event.response_id, MAX_RESPONSE_ID_LENGTH);
        const eventId = boundedString(event.event_id, MAX_EVENT_ID_LENGTH);
        if (!callId) return malformed();
        const callKey = dedupeKey(callId);
        if (completedToolCalls.has(callKey)) {
          return { eventType, suppressClientForward: true };
        }
        let activeEvents = activeToolEventIds.get(callKey);
        if (eventId) {
          if (!activeEvents) {
            if (activeToolEventIds.size >= activeToolLimit) {
              failCapacity("active_tool_calls", activeToolLimit);
              return null;
            }
            activeEvents = new BoundedDedupeSet(toolEventLimit);
            activeToolEventIds.set(callKey, activeEvents);
          }
          const eventKey = dedupeKey(eventId);
          if (activeEvents.has(eventKey)) {
            return { eventType, suppressClientForward: true };
          }
          if (!remember(activeEvents, eventKey, "tool_event_ids", toolEventLimit)) return null;
        }
        if (eventType.endsWith(".delta")) {
          const delta = boundedString(event.delta, MAX_TEXT_LENGTH);
          if (delta === null) return malformed();
          callbacks.onToolEvent?.({
            phase: "delta",
            ...(responseId ? { responseId } : {}),
            callId,
            delta,
          });
        } else {
          const name = boundedString(event.name, MAX_EVENT_ID_LENGTH);
          const args = boundedString(event.arguments, MAX_TEXT_LENGTH);
          if (!responseId || !name) return malformed();
          if (!remember(completedToolCalls, callKey, "completed_tool_calls", toolCallLimit)) return null;
          activeToolEventIds.delete(callKey);
          callbacks.onToolEvent?.({
            phase: "done",
            responseId,
            callId,
            name,
            ...(args !== null ? { arguments: args } : {}),
          });
        }
        return { eventType, suppressClientForward: true };
      }

      callbacks.onUnknownEvent?.(safeEventType(eventType));
      return null;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function safeEventType(value: string): string {
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : "unknown";
}
