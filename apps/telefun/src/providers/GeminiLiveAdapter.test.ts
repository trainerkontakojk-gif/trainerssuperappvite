import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseTelefunSessionConfigure } from "../server-protocol.js";
import { RealtimeToolDispatcher } from "../tools/RealtimeToolDispatcher.js";
import {
  GeminiLiveAdapter,
  type GeminiLiveAdapterCallbacks,
  type GeminiSocketLike,
} from "./GeminiLiveAdapter.js";

class FakeGeminiSocket extends EventEmitter implements GeminiSocketLike {
  readyState = 0;
  sent: string[] = [];
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = 3;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? ""));
  });
  ping = vi.fn();

  send(message: string) {
    this.sent.push(message);
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  receive(message: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  upstreamClose(code: number, reason = "") {
    this.readyState = 3;
    this.emit("close", code, Buffer.from(reason));
  }
}

function validatedGeminiConfigure() {
  const parsed = parseTelefunSessionConfigure({
    type: "telefun_session_configure",
    modelId: "gemini-3.1-flash-live-preview",
    transport: "gemini-live",
    voice: "Kore",
    instructions: "Roleplay test",
    inputAudio: { format: "pcm16", sampleRate: 16_000 },
    responsePacingMode: "realistic",
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function createCallbacks(): GeminiLiveAdapterCallbacks {
  return {
    forwardToClient: vi.fn(),
    observeUsage: vi.fn(),
    appendTranscript: vi.fn(),
    startAiSpeaking: vi.fn(),
    completeTurn: vi.fn(),
    interruptTurn: vi.fn(),
    notifyActivity: vi.fn(),
    notifyTurnComplete: vi.fn(),
    notifyInterrupted: vi.fn(),
    onFinalClose: vi.fn(),
    onDiagnostic: vi.fn(),
  };
}

function createHarness(options?: {
  maxQueuedMessages?: number;
  maxQueuedBytes?: number;
  toolDispatcher?: RealtimeToolDispatcher;
  maxToolCallsPerMessage?: number;
  maxToolCallsPerSession?: number;
  maxToolCancellationsPerMessage?: number;
}) {
  const sockets: FakeGeminiSocket[] = [];
  const callbacks = createCallbacks();
  const adapter = new GeminiLiveAdapter({
    configuration: validatedGeminiConfigure(),
    createSocket: () => {
      const socket = new FakeGeminiSocket();
      sockets.push(socket);
      return socket;
    },
    callbacks,
    maxQueuedMessages: options?.maxQueuedMessages,
    maxQueuedBytes: options?.maxQueuedBytes,
    toolDispatcher: options?.toolDispatcher,
    maxToolCallsPerMessage: options?.maxToolCallsPerMessage,
    maxToolCallsPerSession: options?.maxToolCallsPerSession,
    maxToolCancellationsPerMessage: options?.maxToolCancellationsPerMessage,
  });
  return { adapter, sockets, callbacks };
}

const SETUP = {
  setup: {
    model: "models/client-controlled-model",
    generationConfig: {
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "ClientVoice" } },
      },
    },
    systemInstruction: { parts: [{ text: "Client-controlled instructions" }] },
  },
};
const AUDIO = { realtimeInput: { audio: { data: "AA==" } } };

describe("GeminiLiveAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves setup gating and flushes queued media only after setupComplete", () => {
    const { adapter, sockets, callbacks } = createHarness();
    adapter.connect();
    const socket = sockets[0];

    adapter.handleClientMessage(SETUP);
    adapter.handleClientMessage(AUDIO);
    expect(socket.sent).toEqual([]);

    socket.open();
    const canonicalSetup = JSON.parse(socket.sent[0]);
    expect(canonicalSetup).toMatchObject({
      setup: {
        model: "models/gemini-3.1-flash-live-preview",
        generationConfig: {
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
        systemInstruction: { parts: [{ text: "Roleplay test" }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: {},
      },
    });
    expect(JSON.stringify(canonicalSetup)).not.toContain(
      "client-controlled-model",
    );
    expect(JSON.stringify(canonicalSetup)).not.toContain("ClientVoice");
    expect(JSON.stringify(canonicalSetup)).not.toContain(
      "Client-controlled instructions",
    );
    expect(canonicalSetup.setup).not.toHaveProperty("tools");
    expect(adapter.isReady()).toBe(false);

    socket.receive({ setupComplete: {} });
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1])).toEqual(AUDIO);
    expect(adapter.isReady()).toBe(true);
    expect(callbacks.forwardToClient).toHaveBeenCalledWith(
      JSON.stringify({ setupComplete: {} }),
    );
  });

  it("advertises only injected allowlisted backend tools", () => {
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: {
          type: "object",
          properties: { ticketId: { type: "string" } },
          required: ["ticketId"],
          additionalProperties: false,
        },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler: vi.fn(),
      },
    ]);
    const { adapter, sockets } = createHarness({ toolDispatcher });
    adapter.connect();
    adapter.handleClientMessage(SETUP);
    sockets[0].open();

    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({
      setup: {
        tools: [
          {
            functionDeclarations: [
              {
                name: "lookup_ticket",
                description: "Look up one ticket.",
                parameters: {
                  type: "object",
                  properties: { ticketId: { type: "string" } },
                  required: ["ticketId"],
                  additionalProperties: false,
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("executes Gemini tool calls on the backend once and never forwards them to the browser", async () => {
    const handler = vi.fn(async (args: { ticketId: string }) => ({
      status: "found",
      ticketId: args.ticketId,
    }));
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets, callbacks } = createHarness({ toolDispatcher });
    adapter.connect();
    sockets[0].open();

    const toolCall = {
      toolCall: {
        functionCalls: [
          {
            id: "call_1",
            name: "lookup_ticket",
            args: { ticketId: "T-100" },
          },
        ],
      },
    };
    sockets[0].receive(toolCall);

    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      toolResponse: {
        functionResponses: [
          {
            id: "call_1",
            name: "lookup_ticket",
            response: {
              ok: true,
              output: { status: "found", ticketId: "T-100" },
            },
          },
        ],
      },
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(callbacks.forwardToClient).not.toHaveBeenCalled();

    sockets[0].receive(toolCall);
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(2));
    expect(JSON.parse(sockets[0].sent[1])).toEqual(
      JSON.parse(sockets[0].sent[0]),
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("suppresses Gemini tool responses cancelled while a handler is in flight", async () => {
    let resolveHandler!: (value: { status: string }) => void;
    const handler = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets, callbacks } = createHarness({ toolDispatcher });
    adapter.connect();
    sockets[0].open();
    sockets[0].receive({
      toolCall: {
        functionCalls: [
          {
            id: "call_cancelled",
            name: "lookup_ticket",
            args: { ticketId: "T-100" },
          },
        ],
      },
    });
    expect(handler).toHaveBeenCalledOnce();

    sockets[0].receive({
      toolCallCancellation: { ids: ["call_cancelled"] },
    });
    resolveHandler({ status: "found" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sockets[0].sent).toEqual([]);
    expect(callbacks.forwardToClient).not.toHaveBeenCalled();
  });

  it("replays a cached Gemini tool response after session resumption without rerunning its handler", async () => {
    vi.useFakeTimers();
    const handler = vi.fn(async () => ({ status: "found" }));
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets } = createHarness({ toolDispatcher });
    const toolCall = {
      toolCall: {
        functionCalls: [
          {
            id: "call_resumed",
            name: "lookup_ticket",
            args: { ticketId: "T-100" },
          },
        ],
      },
    };

    adapter.connect();
    adapter.handleClientMessage(SETUP);
    const first = sockets[0];
    first.open();
    first.receive({ setupComplete: {} });
    first.receive(toolCall);
    await vi.advanceTimersByTimeAsync(0);
    expect(first.sent).toHaveLength(2);
    first.receive({
      sessionResumptionUpdate: { resumable: true, newHandle: "resume-tools" },
    });
    first.upstreamClose(1011, "reconnect");

    await vi.advanceTimersByTimeAsync(1_000);
    const second = sockets[1];
    second.open();
    second.receive({ setupComplete: {} });
    second.receive(toolCall);
    await vi.advanceTimersByTimeAsync(0);

    expect(second.sent).toHaveLength(2);
    expect(JSON.parse(second.sent[1])).toEqual(JSON.parse(first.sent[1]));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns structured Gemini errors for unknown, invalid, and failed tool calls", async () => {
    const handler = vi.fn(async () => {
      throw new Error("secret database detail");
    });
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string().min(1) }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets, callbacks } = createHarness({ toolDispatcher });
    adapter.connect();
    sockets[0].open();
    sockets[0].receive({
      toolCall: {
        functionCalls: [
          { id: "call_unknown", name: "unknown_tool", args: {} },
          { id: "call_invalid", name: "lookup_ticket", args: {} },
          {
            id: "call_failed",
            name: "lookup_ticket",
            args: { ticketId: "T-1" },
          },
        ],
      },
    });

    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));
    const sent = JSON.parse(sockets[0].sent[0]);
    expect(sent.toolResponse.functionResponses).toEqual([
      {
        id: "call_unknown",
        name: "unknown_tool",
        response: {
          ok: false,
          error: {
            code: "unknown_tool",
            message: "Tool is not available in this Telefun session",
          },
        },
      },
      {
        id: "call_invalid",
        name: "lookup_ticket",
        response: {
          ok: false,
          error: {
            code: "invalid_arguments",
            message: "Tool arguments did not match the approved schema",
          },
        },
      },
      {
        id: "call_failed",
        name: "lookup_ticket",
        response: {
          ok: false,
          error: {
            code: "handler_error",
            message: "Tool execution failed safely",
          },
        },
      },
    ]);
    expect(JSON.stringify(sent)).not.toContain("secret database detail");
    expect(callbacks.forwardToClient).not.toHaveBeenCalled();
  });

  it("fails closed before allocating handlers for an oversized functionCalls message", () => {
    const handler = vi.fn();
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets, callbacks } = createHarness({ toolDispatcher });
    adapter.connect();
    sockets[0].open();

    sockets[0].receive({
      toolCall: {
        functionCalls: Array.from({ length: 1_000 }, (_, index) => ({
          id: `call_large_${index}`,
          name: "lookup_ticket",
          args: { ticketId: `T-${index}` },
        })),
      },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(callbacks.onDiagnostic).toHaveBeenCalledWith({
      type: "tool_call_capacity_exceeded",
      scope: "message",
      limit: 32,
    });
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
    expect(sockets[0].close).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
    expect(callbacks.forwardToClient).not.toHaveBeenCalled();
  });

  it("fails closed when new tool call IDs exceed the session cap", async () => {
    const handler = vi.fn(async () => ({ status: "found" }));
    const toolDispatcher = new RealtimeToolDispatcher([
      {
        name: "lookup_ticket",
        description: "Look up one ticket.",
        parameters: { type: "object" },
        schema: z.object({ ticketId: z.string() }).strict(),
        handler,
      },
    ]);
    const { adapter, sockets, callbacks } = createHarness({
      toolDispatcher,
      maxToolCallsPerSession: 1,
    });
    adapter.connect();
    sockets[0].open();
    sockets[0].receive({
      toolCall: {
        functionCalls: [
          {
            id: "call_first",
            name: "lookup_ticket",
            args: { ticketId: "T-1" },
          },
        ],
      },
    });
    await vi.waitFor(() => expect(sockets[0].sent).toHaveLength(1));

    sockets[0].receive({
      toolCall: {
        functionCalls: [
          {
            id: "call_second",
            name: "lookup_ticket",
            args: { ticketId: "T-2" },
          },
        ],
      },
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(callbacks.onDiagnostic).toHaveBeenCalledWith({
      type: "tool_call_capacity_exceeded",
      scope: "session",
      limit: 1,
    });
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
  });

  it("fails closed before tracking an oversized cancellation message", () => {
    const { adapter, sockets, callbacks } = createHarness();
    adapter.connect();
    sockets[0].open();

    sockets[0].receive({
      toolCallCancellation: {
        ids: Array.from({ length: 1_000 }, (_, index) => `call_${index}`),
      },
    });

    expect(callbacks.onDiagnostic).toHaveBeenCalledWith({
      type: "tool_call_capacity_exceeded",
      scope: "cancellation_message",
      limit: 32,
    });
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
    expect(sockets[0].close).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
    expect(callbacks.forwardToClient).not.toHaveBeenCalled();
  });

  it("fails closed instead of ignoring cancellation IDs after the session cap", () => {
    const { adapter, sockets, callbacks } = createHarness({
      maxToolCallsPerSession: 1,
    });
    adapter.connect();
    sockets[0].open();
    sockets[0].receive({
      toolCallCancellation: { ids: ["call_first"] },
    });
    sockets[0].receive({
      toolCallCancellation: { ids: ["call_second"] },
    });

    expect(callbacks.onDiagnostic).toHaveBeenCalledWith({
      type: "tool_call_capacity_exceeded",
      scope: "cancellation_session",
      limit: 1,
    });
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
  });

  it("preserves transcription speakers, usage, turn, interruption, and activity callbacks", () => {
    const { adapter, sockets, callbacks } = createHarness();
    adapter.connect();
    sockets[0].open();

    const observedAt = Date.now();
    sockets[0].receive({
      usageMetadata: { promptTokenCount: 3 },
      serverContent: {
        inputTranscription: { text: "Halo dari agent" },
        outputTranscription: { text: "Halo dari consumer" },
        modelTurn: { parts: [{ text: "Halo" }] },
        turnComplete: true,
        interrupted: true,
      },
    });

    expect(callbacks.observeUsage).toHaveBeenCalledWith(
      { promptTokenCount: 3 },
      expect.any(Number),
    );
    expect(callbacks.appendTranscript).toHaveBeenNthCalledWith(1, {
      speaker: "agent",
      text: "Halo dari agent",
      observedAtMs: expect.any(Number),
    });
    expect(callbacks.appendTranscript).toHaveBeenNthCalledWith(2, {
      speaker: "consumer",
      text: "Halo dari consumer",
      observedAtMs: expect.any(Number),
    });
    expect(callbacks.startAiSpeaking).toHaveBeenCalledOnce();
    expect(callbacks.completeTurn).toHaveBeenCalledOnce();
    expect(callbacks.interruptTurn).toHaveBeenCalledOnce();
    expect(callbacks.notifyActivity).toHaveBeenCalledOnce();
    expect(callbacks.notifyTurnComplete).toHaveBeenCalledOnce();
    expect(callbacks.notifyInterrupted).toHaveBeenCalledOnce();
    expect(Date.now()).toBeGreaterThanOrEqual(observedAt);
  });

  it("reconnects with the latest resumption handle and ignores stale socket events", async () => {
    vi.useFakeTimers();
    const { adapter, sockets, callbacks } = createHarness();
    adapter.connect();
    const first = sockets[0];
    adapter.handleClientMessage(SETUP);
    first.open();
    first.receive({ setupComplete: {} });
    first.receive({
      sessionResumptionUpdate: { resumable: true, newHandle: "resume-1" },
    });
    first.receive({ goAway: { timeLeft: "10s" } });

    await vi.advanceTimersByTimeAsync(250);

    expect(sockets).toHaveLength(2);
    const second = sockets[1];
    second.open();
    expect(JSON.parse(second.sent[0])).toMatchObject({
      setup: { sessionResumption: { handle: "resume-1" } },
    });

    const forwardedBeforeStaleEvent = vi.mocked(callbacks.forwardToClient).mock
      .calls.length;
    first.receive({ serverContent: { turnComplete: true } });
    expect(callbacks.forwardToClient).toHaveBeenCalledTimes(
      forwardedBeforeStaleEvent,
    );

    second.receive({ setupComplete: {} });
    expect(callbacks.forwardToClient).toHaveBeenCalledWith(
      JSON.stringify({ type: "session_resumed" }),
    );
  });

  it("fails closed when the pre-setup queue exceeds its safe bound", () => {
    const { adapter, sockets, callbacks } = createHarness({
      maxQueuedMessages: 1,
      maxQueuedBytes: 1_024,
    });
    adapter.connect();
    sockets[0].open();

    adapter.handleClientMessage(AUDIO);
    adapter.handleClientMessage(AUDIO);

    expect(callbacks.onDiagnostic).toHaveBeenCalledWith({
      type: "queue_overflow",
      queuedMessages: 1,
      queuedBytes: expect.any(Number),
    });
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(
      1011,
      "Realtime provider message queue exceeded safe limit",
    );
    expect(sockets[0].close).toHaveBeenCalled();
  });

  it("stops keepalive pings after the adapter is closed", async () => {
    vi.useFakeTimers();
    const { adapter, sockets } = createHarness();
    adapter.connect();
    sockets[0].open();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets[0].ping).toHaveBeenCalledOnce();

    adapter.close(1000, "test complete");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets[0].ping).toHaveBeenCalledOnce();
  });

  it("stops after the bounded reconnect attempts are exhausted", async () => {
    vi.useFakeTimers();
    const { adapter, sockets, callbacks } = createHarness();
    adapter.connect();
    sockets[0].open();

    sockets[0].upstreamClose(1011, "failure-1");
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1].open();
    sockets[1].upstreamClose(1011, "failure-2");
    await vi.advanceTimersByTimeAsync(2_000);
    sockets[2].open();
    sockets[2].upstreamClose(1011, "failure-3");
    await vi.advanceTimersByTimeAsync(4_000);
    sockets[3].open();
    sockets[3].upstreamClose(1011, "failure-4");

    expect(sockets).toHaveLength(4);
    expect(callbacks.onFinalClose).toHaveBeenCalledOnce();
    expect(callbacks.onFinalClose).toHaveBeenCalledWith(1011, "failure-4");
  });
});
