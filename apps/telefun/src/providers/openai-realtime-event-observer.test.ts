import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

import {
  OpenAIRealtimeAdapter,
  type OpenAIRealtimeAdapterCallbacks,
  type OpenAIRealtimeSocketLike,
} from "./OpenAIRealtimeAdapter.js";
import { parseTelefunSessionConfigure } from "../server-protocol.js";
import {
  SidebandEventObserver,
  type SidebandEventObserverOptions,
} from "../realtime-webrtc/sideband-event-observer.js";
import { TranscriptCollector } from "../transcript.js";
import {
  createOpenAIUsageAccumulator,
  observeOpenAIUsage,
  summarizeOpenAIUsageAccumulator,
} from "../usage.js";
import { createOpenAIRealtimeEventObserver } from "./openai-realtime-event-observer.js";

const RESPONSE_USAGE = {
  total_tokens: 12,
  input_tokens: 5,
  output_tokens: 7,
  input_token_details: {
    text_tokens: 5,
    audio_tokens: 0,
    cached_tokens: 0,
  },
  output_token_details: { text_tokens: 7, audio_tokens: 0 },
};

const EVENTS: unknown[] = [
  { type: "input_audio_buffer.speech_started" },
  { type: "input_audio_buffer.speech_stopped" },
  {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "input-1",
    delta: "Halo",
  },
  {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "input-1",
    transcript: "Halo dunia",
    usage: { type: "tokens", input_tokens: 2, output_tokens: 1 },
  },
  {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "input-1",
    transcript: "Halo dunia",
    usage: { type: "tokens", input_tokens: 2, output_tokens: 1 },
  },
  {
    type: "response.output_audio.delta",
    response_id: "response-1",
    delta: "AA==",
  },
  {
    type: "response.output_audio_transcript.delta",
    event_id: "output-delta-1",
    item_id: "output-1",
    delta: "Selamat ",
  },
  {
    type: "response.output_audio_transcript.delta",
    event_id: "output-delta-2",
    item_id: "output-1",
    delta: "pagi",
  },
  {
    type: "response.output_audio_transcript.delta",
    event_id: "output-delta-2",
    item_id: "output-1",
    delta: "pagi",
  },
  {
    type: "response.output_audio_transcript.done",
    event_id: "output-done-1",
    item_id: "output-1",
    transcript: "Selamat pagi",
  },
  {
    type: "response.output_audio_transcript.done",
    event_id: "output-done-duplicate",
    item_id: "output-1",
    transcript: "Selamat pagi",
  },
  {
    type: "response.output_audio_transcript.done",
    event_id: "output-done-only",
    item_id: "output-done-only",
    transcript: "Done only",
  },
  {
    type: "response.done",
    response: { id: "response-1", status: "completed", usage: RESPONSE_USAGE },
  },
  {
    type: "response.done",
    response: { id: "response-1", status: "completed", usage: RESPONSE_USAGE },
  },
  {
    type: "response.done",
    response: { id: "response-cancelled", status: "cancelled" },
  },
  {
    type: "response.done",
    response: { id: "response-incomplete", status: "incomplete" },
  },
  {
    type: "response.done",
    response: { id: "response-failed", status: "failed" },
  },
  { type: "response.cancelled", response_id: "response-cancelled" },
  {
    type: "response.function_call_arguments.delta",
    event_id: "tool-delta-1",
    response_id: "response-tool",
    call_id: "call-tool-1",
    delta: '{"ticketId":',
  },
  {
    type: "response.function_call_arguments.done",
    event_id: "tool-done-1",
    response_id: "response-tool",
    call_id: "call-tool-1",
    name: "lookup_ticket",
    arguments: '{"ticketId":"T-1"}',
  },
  {
    type: "response.function_call_arguments.done",
    event_id: "tool-done-duplicate",
    response_id: "response-tool",
    call_id: "call-tool-1",
    name: "lookup_ticket",
    arguments: '{"ticketId":"T-1"}',
  },
  { type: "unknown.event", secret: "must not escape" },
  { type: "response.done", response: null },
  null,
];

class ParitySocket extends EventEmitter implements OpenAIRealtimeSocketLike {
  readyState = 0;
  sent: string[] = [];
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.readyState = 3;
  }
  terminate() {
    this.readyState = 3;
  }
  ping() {}
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  receive(event: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
}

function parityConfiguration() {
  const parsed = parseTelefunSessionConfigure({
    type: "telefun_session_configure",
    modelId: "gpt-realtime-2.1",
    transport: "openai-audio",
    voice: "marin",
    instructions: "Parity fixture",
    inputAudio: { format: "pcm16", sampleRate: 24_000 },
    responsePacingMode: "realistic",
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function createParitySink() {
  const transcript = new TranscriptCollector(0);
  const usage = createOpenAIUsageAccumulator();
  const snapshot = {
    responseStatuses: [] as Array<{ id: string; status: string }>,
    toolCalls: [] as Array<{ phase: "delta" | "done"; responseId?: string; callId: string }>,
    callbacks: {
      activity: 0,
      startAiSpeaking: 0,
      completedTurns: 0,
      interruptedTurns: 0,
      turnCompleteNotifications: 0,
      interruptedNotifications: 0,
    },
  };
  return { transcript, usage, snapshot };
}

function runActualAdapterFixture(events: unknown[]) {
  const sink = createParitySink();
  const socket = new ParitySocket();
  const callbacks: OpenAIRealtimeAdapterCallbacks = {
    forwardToClient: vi.fn(),
    observeUsage: (observation, observedAtMs) =>
      observeOpenAIUsage(sink.usage, observation, observedAtMs),
    appendTranscript: (entry) => sink.transcript.append(entry),
    startAiSpeaking: () => sink.snapshot.callbacks.startAiSpeaking++,
    completeTurn: () => {
      sink.snapshot.callbacks.completedTurns++;
      sink.transcript.completeTurn("consumer");
    },
    interruptTurn: () => {
      sink.snapshot.callbacks.interruptedTurns++;
      sink.transcript.interruptTurn();
    },
    notifyActivity: () => sink.snapshot.callbacks.activity++,
    notifyTurnComplete: () => sink.snapshot.callbacks.turnCompleteNotifications++,
    notifyInterrupted: () => sink.snapshot.callbacks.interruptedNotifications++,
    onFinalClose: vi.fn(),
    onDiagnostic: vi.fn(),
    onResponseDone: (event) => sink.snapshot.responseStatuses.push({ id: event.responseId, status: event.status }),
    onToolEvent: (event) => sink.snapshot.toolCalls.push({ phase: event.phase, responseId: event.responseId, callId: event.callId }),
  };
  const adapter = new OpenAIRealtimeAdapter({
    configuration: parityConfiguration(),
    apiKey: "server-key",
    userId: "parity-user",
    createSocket: () => socket,
    callbacks,
    now: () => 1_000,
  });
  const connected = adapter.connect();
  socket.open();
  socket.receive({ type: "session.updated", session: {} });
  return connected.then(() => {
    for (const event of events) socket.receive(event);
    sink.transcript.flush(1_000);
    adapter.close();
    const aggregate = summarizeOpenAIUsageAccumulator(sink.usage);
    return {
      transcript: sink.transcript.snapshot(),
      usage: {
        responseCount: aggregate?.responseCount ?? 0,
        inputTokens: aggregate?.inputTokens,
        outputTokens: aggregate?.outputTokens,
        transcriptionObservationCount: aggregate?.rawUsageMetadata.transcription_observation_count ?? 0,
      },
      ...sink.snapshot,
    };
  });
}

function runActualSidebandFixture(events: unknown[]) {
  const sink = createParitySink();
  const options: SidebandEventObserverOptions = {
    transcript: sink.transcript,
    usage: sink.usage,
    now: () => 1_000,
    onActivity: () => sink.snapshot.callbacks.activity++,
    onStartAiSpeaking: () => sink.snapshot.callbacks.startAiSpeaking++,
    onTurnComplete: () => {
      sink.snapshot.callbacks.completedTurns++;
      sink.snapshot.callbacks.turnCompleteNotifications++;
    },
    onInterrupted: () => {
      sink.snapshot.callbacks.interruptedTurns++;
      sink.snapshot.callbacks.interruptedNotifications++;
    },
    onResponseDone: (event) => {
      sink.snapshot.responseStatuses.push({ id: event.responseId, status: event.status });
      return false;
    },
    onToolEvent: (event) => sink.snapshot.toolCalls.push({ phase: event.phase, responseId: event.responseId, callId: event.callId }),
  };
  const observer = new SidebandEventObserver(options);
  for (const event of events) observer.observe(event);
  sink.transcript.flush(1_000);
  const aggregate = summarizeOpenAIUsageAccumulator(sink.usage);
  return {
    transcript: sink.transcript.snapshot(),
    usage: {
      responseCount: aggregate?.responseCount ?? 0,
      inputTokens: aggregate?.inputTokens,
      outputTokens: aggregate?.outputTokens,
      transcriptionObservationCount: aggregate?.rawUsageMetadata.transcription_observation_count ?? 0,
    },
    ...sink.snapshot,
  };
}

describe("OpenAI Realtime event observer", () => {
  it("does not capacity-fail a normal 60-minute cadence of 3,600 completed items", () => {
    const onCapacityExceeded = vi.fn();
    const observer = createOpenAIRealtimeEventObserver({
      callbacks: {
        appendTranscript: vi.fn(),
        observeUsage: vi.fn(),
        completeTurn: vi.fn(),
        interruptTurn: vi.fn(),
        notifyActivity: vi.fn(),
        notifyTurnComplete: vi.fn(),
        notifyInterrupted: vi.fn(),
        onCapacityExceeded,
      },
      now: () => 1_000,
    });

    for (let index = 0; index < 3_600; index += 1) {
      observer.observe({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: `input-${index}`,
        transcript: "input",
      });
      observer.observe({
        type: "response.output_audio_transcript.delta",
        event_id: `delta-${index}`,
        item_id: `output-${index}`,
        delta: "output",
      });
      observer.observe({
        type: "response.output_audio_transcript.done",
        item_id: `output-${index}`,
        transcript: "output",
      });
      observer.observe({
        type: "response.done",
        response: { id: `response-${index}`, status: "completed" },
      });
    }

    expect(onCapacityExceeded).not.toHaveBeenCalled();
  });

  it("suppresses duplicate done and late duplicate deltas after an output item completes", () => {
    const appendTranscript = vi.fn();
    const observer = createOpenAIRealtimeEventObserver({
      callbacks: {
        appendTranscript,
        observeUsage: vi.fn(),
        completeTurn: vi.fn(),
        interruptTurn: vi.fn(),
        notifyActivity: vi.fn(),
        notifyTurnComplete: vi.fn(),
        notifyInterrupted: vi.fn(),
      },
    });

    observer.observe({
      type: "response.output_audio_transcript.delta",
      event_id: "delta-1",
      item_id: "output-1",
      delta: "Hello",
    });
    observer.observe({
      type: "response.output_audio_transcript.done",
      item_id: "output-1",
      transcript: "Hello",
    });
    observer.observe({
      type: "response.output_audio_transcript.done",
      item_id: "output-1",
      transcript: "Hello",
    });
    observer.observe({
      type: "response.output_audio_transcript.delta",
      event_id: "late-delta-1",
      item_id: "output-1",
      delta: " late",
    });

    expect(appendTranscript).toHaveBeenCalledOnce();
    expect(appendTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ speaker: "consumer", text: "Hello" }),
    );
  });

  it("fails closed at a configured small terminal capacity", () => {
    const onCapacityExceeded = vi.fn();
    const observer = createOpenAIRealtimeEventObserver({
      maxDedupeEntries: 1,
      callbacks: {
        appendTranscript: vi.fn(),
        observeUsage: vi.fn(),
        completeTurn: vi.fn(),
        interruptTurn: vi.fn(),
        notifyActivity: vi.fn(),
        notifyTurnComplete: vi.fn(),
        notifyInterrupted: vi.fn(),
        onCapacityExceeded,
      },
    });

    observer.observe({
      type: "response.done",
      response: { id: "response-1", status: "completed" },
    });
    observer.observe({
      type: "response.done",
      response: { id: "response-2", status: "completed" },
    });

    expect(onCapacityExceeded).toHaveBeenCalledWith({
      type: "observer_capacity_exceeded",
      scope: "response_ids",
      limit: 1,
    });
    observer.observe({
      type: "response.done",
      response: { id: "response-3", status: "completed" },
    });
    expect(onCapacityExceeded).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "response.done cancelled then response.cancelled",
      [
        { type: "response.done", response: { id: "response-order", status: "cancelled" } },
        { type: "response.cancelled", response_id: "response-order" },
      ],
    ],
    [
      "response.cancelled then response.done cancelled",
      [
        { type: "response.cancelled", response_id: "response-order" },
        { type: "response.done", response: { id: "response-order", status: "cancelled" } },
      ],
    ],
  ])("interrupts cancelled responses exactly once when %s", (_label, events) => {
    const interruptTurn = vi.fn();
    const notifyInterrupted = vi.fn();
    const observer = createOpenAIRealtimeEventObserver({
      callbacks: {
        appendTranscript: vi.fn(),
        observeUsage: vi.fn(),
        completeTurn: vi.fn(),
        interruptTurn,
        notifyActivity: vi.fn(),
        notifyTurnComplete: vi.fn(),
        notifyInterrupted,
      },
    });

    for (const event of events) observer.observe(event);

    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(notifyInterrupted).toHaveBeenCalledTimes(1);
  });

  it("interrupts repeated response.cancelled events without a response_id exactly once", () => {
    const interruptTurn = vi.fn();
    const notifyInterrupted = vi.fn();
    const observer = createOpenAIRealtimeEventObserver({
      callbacks: {
        appendTranscript: vi.fn(),
        observeUsage: vi.fn(),
        completeTurn: vi.fn(),
        interruptTurn,
        notifyActivity: vi.fn(),
        notifyTurnComplete: vi.fn(),
        notifyInterrupted,
      },
    });

    observer.observe({ type: "response.cancelled" });
    observer.observe({ type: "response.cancelled" });

    expect(interruptTurn).toHaveBeenCalledTimes(1);
    expect(notifyInterrupted).toHaveBeenCalledTimes(1);
  });

  it("drives actual adapter socket and sideband wrapper through equivalent fixtures", async () => {
    const parityEvents = EVENTS.filter(
      (event) => (event as { type?: string } | null)?.type !== "response.output_audio.delta",
    );
    const wsSnapshot = await runActualAdapterFixture(parityEvents);
    const sidebandSnapshot = runActualSidebandFixture(parityEvents);

    expect(sidebandSnapshot).toEqual(wsSnapshot);
    expect(wsSnapshot).toMatchObject({
      transcript: [
        { speaker: "agent", text: "Halo dunia", startMs: 1_000 },
        { speaker: "consumer", text: "Selamat pagiDone only", startMs: 1_000 },
      ],
      usage: {
        responseCount: 1,
        inputTokens: 5,
        outputTokens: 7,
        transcriptionObservationCount: 1,
      },
      responseStatuses: [
        { id: "response-1", status: "completed" },
        { id: "response-cancelled", status: "cancelled" },
        { id: "response-incomplete", status: "incomplete" },
        { id: "response-failed", status: "failed" },
      ],
      toolCalls: [
        { phase: "delta", responseId: "response-tool", callId: "call-tool-1" },
        { phase: "done", responseId: "response-tool", callId: "call-tool-1" },
      ],
      callbacks: {
        activity: 3,
        startAiSpeaking: 0,
        completedTurns: 1,
        interruptedTurns: 4,
        turnCompleteNotifications: 1,
        interruptedNotifications: 4,
      },
    });
  });
});
