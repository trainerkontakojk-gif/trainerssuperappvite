import {
  buildGeminiReconnectSetupMessage,
  extractGeminiTranscriptionChunks,
  getGeminiGoAwayTimeLeftSeconds,
  getSessionResumptionHandle,
  hasGeminiSetupComplete,
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  type ValidatedTelefunSessionConfigure,
} from "../server-protocol.js";
import {
  createProductionRealtimeToolDispatcher,
  type RealtimeToolDispatcher,
} from "../tools/RealtimeToolDispatcher.js";
import type {
  RealtimeProviderAdapter,
  RealtimeProviderLifecycleCallbacks,
} from "./RealtimeProviderAdapter.js";

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_MAX_QUEUED_MESSAGES = 256;
const DEFAULT_MAX_QUEUED_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_TOOL_CALLS_PER_MESSAGE = 32;
const DEFAULT_MAX_TOOL_CALLS_PER_SESSION = 256;
const DEFAULT_MAX_TOOL_CANCELLATIONS_PER_MESSAGE = 32;

export interface GeminiSocketLike {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: { toString(): string }) => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  on(
    event: "close",
    listener: (code: number, reason: { toString(): string }) => void,
  ): this;
}

export interface GeminiLiveAdapterCallbacks extends RealtimeProviderLifecycleCallbacks {
  observeUsage(metadata: unknown, observedAtMs: number): void;
  onDiagnostic(diagnostic: GeminiAdapterDiagnostic): void;
}

export type GeminiAdapterDiagnostic =
  | {
      type: "queue_overflow";
      queuedMessages: number;
      queuedBytes: number;
    }
  | { type: "upstream_error" }
  | {
      type: "tool_call_capacity_exceeded";
      scope:
        | "message"
        | "session"
        | "cancellation_message"
        | "cancellation_session";
      limit: number;
    };

export interface GeminiLiveAdapterOptions {
  configuration: ValidatedTelefunSessionConfigure;
  createSocket: () => GeminiSocketLike;
  callbacks: GeminiLiveAdapterCallbacks;
  maxQueuedMessages?: number;
  maxQueuedBytes?: number;
  toolDispatcher?: RealtimeToolDispatcher;
  maxToolCallsPerMessage?: number;
  maxToolCallsPerSession?: number;
  maxToolCancellationsPerMessage?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

interface QueuedMessage {
  raw: string;
  bytes: number;
}

export class GeminiLiveAdapter implements RealtimeProviderAdapter {
  private readonly maxQueuedMessages: number;
  private readonly maxQueuedBytes: number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly toolDispatcher: RealtimeToolDispatcher;
  private readonly maxToolCallsPerMessage: number;
  private readonly maxToolCallsPerSession: number;
  private readonly maxToolCancellationsPerMessage: number;
  private socket: GeminiSocketLike | null = null;
  private socketOpen = false;
  private setupComplete = false;
  private pendingMessages: QueuedMessage[] = [];
  private postSetupQueue: QueuedMessage[] = [];
  private queuedMessages = 0;
  private queuedBytes = 0;
  private cachedSetupMessage: string | null = null;
  private latestSessionHandle: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private clientClosed = false;
  private terminated = false;
  private readonly knownToolCalls = new Set<string>();
  private readonly cancelledToolCalls = new Set<string>();

  constructor(private readonly options: GeminiLiveAdapterOptions) {
    this.maxQueuedMessages =
      options.maxQueuedMessages ?? DEFAULT_MAX_QUEUED_MESSAGES;
    this.maxQueuedBytes = options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
    this.setTimeoutFn = options.setTimeout ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? clearTimeout;
    this.setIntervalFn = options.setInterval ?? setInterval;
    this.clearIntervalFn = options.clearInterval ?? clearInterval;
    this.toolDispatcher =
      options.toolDispatcher ?? createProductionRealtimeToolDispatcher();
    this.maxToolCallsPerMessage =
      options.maxToolCallsPerMessage ?? DEFAULT_MAX_TOOL_CALLS_PER_MESSAGE;
    this.maxToolCallsPerSession =
      options.maxToolCallsPerSession ?? DEFAULT_MAX_TOOL_CALLS_PER_SESSION;
    this.maxToolCancellationsPerMessage =
      options.maxToolCancellationsPerMessage ??
      DEFAULT_MAX_TOOL_CANCELLATIONS_PER_MESSAGE;
  }

  connect(): void {
    if (this.socket || this.clientClosed || this.terminated) return;
    this.setupSocket();
    this.keepaliveTimer = this.setIntervalFn(() => {
      if (this.socket?.readyState === SOCKET_OPEN) this.socket.ping();
    }, 30_000);
  }

  handleClientMessage(message: unknown): void {
    if (this.clientClosed || this.terminated) return;
    if (!isGeminiForwardableMessage(message)) return;

    if (isGeminiSetupMessage(message)) {
      if (this.cachedSetupMessage) return;
      const canonicalSetup = JSON.stringify(
        buildCanonicalGeminiSetup(
          this.options.configuration,
          this.toolDispatcher,
        ),
      );
      this.cachedSetupMessage = canonicalSetup;
      this.sendOrQueuePending(canonicalSetup);
      return;
    }

    let raw: string;
    try {
      raw = JSON.stringify(message);
    } catch {
      return;
    }

    if (this.setupComplete) {
      this.sendOrQueuePending(raw);
      return;
    }
    this.enqueue(this.postSetupQueue, raw);
  }

  close(code = 1000, reason = "Provider adapter closed"): void {
    if (this.clientClosed) return;
    this.clientClosed = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.setupComplete = false;
    if (
      socket &&
      (socket.readyState === SOCKET_OPEN ||
        socket.readyState === SOCKET_CONNECTING)
    ) {
      socket.close(code, reason);
    }
  }

  isReady(): boolean {
    return this.setupComplete;
  }

  private setupSocket(): void {
    const socket = this.options.createSocket();
    this.socket = socket;

    socket.on("open", () => {
      if (this.socket !== socket || this.clientClosed || this.terminated)
        return;
      this.socketOpen = true;

      if (this.reconnectAttempts > 0) {
        const reconnectSetup = buildGeminiReconnectSetupMessage(
          this.cachedSetupMessage,
          this.latestSessionHandle,
        );
        if (reconnectSetup) socket.send(reconnectSetup);
      }

      this.flushPendingMessages(socket);
    });

    socket.on("message", (data) => {
      if (this.socket !== socket || this.clientClosed || this.terminated)
        return;
      this.handleUpstreamMessage(data.toString());
    });

    socket.on("error", () => {
      if (this.socket !== socket || this.clientClosed || this.terminated)
        return;
      this.options.callbacks.onDiagnostic({ type: "upstream_error" });
    });

    socket.on("close", (code, reason) => {
      if (this.socket !== socket || this.clientClosed || this.terminated)
        return;
      this.socketOpen = false;
      this.setupComplete = false;

      if (code !== 1000 && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, 8_000);
        this.forwardControl({
          type: "session_reconnecting",
          reason: "gemini_close",
          code,
        });
        this.scheduleReconnect(delay);
        return;
      }

      this.finishWithUpstreamClose(code, reason.toString());
    });
  }

  private handleUpstreamMessage(raw: string): void {
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(raw) as Record<string, any>;
    } catch {
      return;
    }

    const observedAtMs = Date.now();
    if (parsed.usageMetadata) {
      this.options.callbacks.observeUsage(parsed.usageMetadata, observedAtMs);
    }

    if (parsed.toolCall !== undefined) {
      this.handleToolCall(parsed.toolCall);
      return;
    }
    if (parsed.toolCallCancellation !== undefined) {
      this.handleToolCallCancellation(parsed.toolCallCancellation);
      return;
    }

    if (hasGeminiSetupComplete(parsed)) {
      const resumed = this.reconnectAttempts > 0;
      this.setupComplete = true;
      this.reconnectAttempts = 0;
      if (resumed) this.forwardControl({ type: "session_resumed" });
      this.flushPostSetupMessages();
    }

    const transcriptChunks = extractGeminiTranscriptionChunks(parsed);
    for (const chunk of transcriptChunks) {
      this.options.callbacks.appendTranscript({
        speaker: chunk.speaker,
        text: chunk.text,
        observedAtMs,
      });
    }

    if (parsed.serverContent?.modelTurn?.parts) {
      this.options.callbacks.startAiSpeaking();
    }
    if (parsed.serverContent?.turnComplete) {
      this.options.callbacks.completeTurn();
    }
    if (parsed.serverContent?.interrupted) {
      this.options.callbacks.interruptTurn();
    }

    if (transcriptChunks.length > 0) {
      this.options.callbacks.notifyActivity();
    }
    if (parsed.serverContent?.turnComplete) {
      this.options.callbacks.notifyTurnComplete();
    }
    if (parsed.serverContent?.interrupted) {
      this.options.callbacks.notifyInterrupted();
    }

    const nextHandle = getSessionResumptionHandle(parsed);
    if (nextHandle) this.latestSessionHandle = nextHandle;

    const goAwaySeconds = getGeminiGoAwayTimeLeftSeconds(parsed);
    if (goAwaySeconds !== null) {
      this.forwardControl({
        type: "session_reconnecting",
        reason: "goAway",
        timeLeftSeconds: goAwaySeconds,
      });
      if (goAwaySeconds > 5 && !this.reconnectTimer) {
        this.scheduleReconnect(250);
      }
    }

    this.options.callbacks.forwardToClient(raw);
  }

  private handleToolCall(value: unknown): void {
    if (!isRecord(value) || !Array.isArray(value.functionCalls)) return;
    if (value.functionCalls.length > this.maxToolCallsPerMessage) {
      this.failToolCallCapacity("message", this.maxToolCallsPerMessage);
      return;
    }

    const callsInMessage = new Set<string>();
    const calls: Array<{ id: string; name: string; arguments: unknown }> = [];
    for (const candidate of value.functionCalls) {
      if (!isRecord(candidate)) continue;
      const id = typeof candidate.id === "string" ? candidate.id : null;
      const name = typeof candidate.name === "string" ? candidate.name : null;
      if (
        !id ||
        !name ||
        callsInMessage.has(id) ||
        this.cancelledToolCalls.has(id)
      ) {
        continue;
      }
      callsInMessage.add(id);
      if (!this.knownToolCalls.has(id)) {
        if (this.knownToolCalls.size >= this.maxToolCallsPerSession) {
          this.failToolCallCapacity("session", this.maxToolCallsPerSession);
          return;
        }
        this.knownToolCalls.add(id);
      }
      calls.push({ id, name, arguments: candidate.args });
    }
    if (calls.length === 0) return;

    void Promise.all(
      calls.map(async (call) => ({
        id: call.id,
        name: call.name,
        response: await this.toolDispatcher.execute({
          callId: call.id,
          name: call.name,
          arguments: call.arguments,
        }),
      })),
    ).then((functionResponses) => {
      if (this.clientClosed || this.terminated) return;
      const activeResponses = functionResponses.filter(
        (response) => !this.cancelledToolCalls.has(response.id),
      );
      if (activeResponses.length === 0) return;
      this.sendOrQueuePending(
        JSON.stringify({
          toolResponse: { functionResponses: activeResponses },
        }),
      );
    });
  }

  private handleToolCallCancellation(value: unknown): void {
    if (!isRecord(value) || !Array.isArray(value.ids)) return;
    if (value.ids.length > this.maxToolCancellationsPerMessage) {
      this.failToolCallCapacity(
        "cancellation_message",
        this.maxToolCancellationsPerMessage,
      );
      return;
    }
    for (const id of value.ids) {
      if (typeof id !== "string" || id.length === 0 || id.length > 256)
        continue;
      if (this.cancelledToolCalls.has(id)) continue;
      if (this.cancelledToolCalls.size >= this.maxToolCallsPerSession) {
        this.failToolCallCapacity(
          "cancellation_session",
          this.maxToolCallsPerSession,
        );
        return;
      }
      this.cancelledToolCalls.add(id);
    }
  }

  private failToolCallCapacity(
    scope:
      | "message"
      | "session"
      | "cancellation_message"
      | "cancellation_session",
    limit: number,
  ): void {
    if (this.clientClosed || this.terminated) return;
    this.terminated = true;
    this.options.callbacks.onDiagnostic({
      type: "tool_call_capacity_exceeded",
      scope,
      limit,
    });
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.setupComplete = false;
    if (
      socket &&
      (socket.readyState === SOCKET_OPEN ||
        socket.readyState === SOCKET_CONNECTING)
    ) {
      socket.close(1011, "Gemini Live tool-call capacity exceeded safe limit");
    }
    this.options.callbacks.onFinalClose(
      1011,
      "Gemini Live tool-call capacity exceeded safe limit",
    );
  }

  private scheduleReconnect(delay: number): void {
    if (this.clientClosed || this.terminated || this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (this.clientClosed || this.terminated) return;
      this.setupComplete = false;
      const previousSocket = this.socket;
      this.socket = null;
      this.socketOpen = false;
      if (
        previousSocket &&
        (previousSocket.readyState === SOCKET_OPEN ||
          previousSocket.readyState === SOCKET_CONNECTING)
      ) {
        previousSocket.close(1000, "Reconnecting Gemini session");
      }
      this.setupSocket();
    }, delay);
  }

  private sendOrQueuePending(raw: string): void {
    if (
      this.socket &&
      this.socketOpen &&
      this.socket.readyState === SOCKET_OPEN
    ) {
      this.socket.send(raw);
      return;
    }
    this.enqueue(this.pendingMessages, raw);
  }

  private flushPendingMessages(socket: GeminiSocketLike): void {
    while (this.pendingMessages.length > 0 && !this.terminated) {
      const message = this.shift(this.pendingMessages);
      if (!message) continue;
      try {
        const parsed = JSON.parse(message.raw);
        if (isGeminiSetupMessage(parsed) || this.setupComplete) {
          socket.send(message.raw);
        } else {
          this.enqueue(this.postSetupQueue, message.raw);
        }
      } catch {
        socket.send(message.raw);
      }
    }
  }

  private flushPostSetupMessages(): void {
    while (this.postSetupQueue.length > 0 && !this.terminated) {
      const message = this.shift(this.postSetupQueue);
      if (message) this.sendOrQueuePending(message.raw);
    }
  }

  private enqueue(queue: QueuedMessage[], raw: string): void {
    const bytes = Buffer.byteLength(raw, "utf8");
    if (
      this.queuedMessages + 1 > this.maxQueuedMessages ||
      this.queuedBytes + bytes > this.maxQueuedBytes
    ) {
      this.failQueueOverflow();
      return;
    }
    queue.push({ raw, bytes });
    this.queuedMessages += 1;
    this.queuedBytes += bytes;
  }

  private shift(queue: QueuedMessage[]): QueuedMessage | undefined {
    const message = queue.shift();
    if (!message) return undefined;
    this.queuedMessages -= 1;
    this.queuedBytes -= message.bytes;
    return message;
  }

  private failQueueOverflow(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.options.callbacks.onDiagnostic({
      type: "queue_overflow",
      queuedMessages: this.queuedMessages,
      queuedBytes: this.queuedBytes,
    });
    this.options.callbacks.onFinalClose(
      1011,
      "Realtime provider message queue exceeded safe limit",
    );
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (
      socket &&
      (socket.readyState === SOCKET_OPEN ||
        socket.readyState === SOCKET_CONNECTING)
    ) {
      socket.close(1011, "Realtime provider queue overflow");
    }
  }

  private finishWithUpstreamClose(code: number, reason: string): void {
    if (this.terminated) return;
    this.terminated = true;
    this.clearTimers();
    this.options.callbacks.onFinalClose(code, reason);
  }

  private forwardControl(message: Record<string, unknown>): void {
    this.options.callbacks.forwardToClient(JSON.stringify(message));
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepaliveTimer) {
      this.clearIntervalFn(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

export function buildCanonicalGeminiSetup(
  configuration: ValidatedTelefunSessionConfigure,
  toolDispatcher = createProductionRealtimeToolDispatcher(),
) {
  const functionDeclarations = toolDispatcher.getDefinitions();
  return {
    setup: {
      model: `models/${configuration.model.id}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: configuration.configure.voice,
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: configuration.configure.instructions }],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 300,
          silenceDurationMs: 950,
        },
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      ...(functionDeclarations.length > 0
        ? { tools: [{ functionDeclarations }] }
        : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
