import { createHash } from "node:crypto";
import type { ValidatedTelefunSessionConfigure } from "../server-protocol.js";
import {
  createProductionRealtimeToolDispatcher,
  type RealtimeToolDispatcher,
} from "../tools/RealtimeToolDispatcher.js";
import {
  createOpenAIRealtimeEventObserver,
  isOpenAIRealtimeEventType,
  type OpenAIRealtimeEventObserver,
  type OpenAIRealtimeResponseDone,
  type OpenAIRealtimeToolEvent,
} from "./openai-realtime-event-observer.js";
import {
  OpenAIRealtimeToolCoordinator,
  type OpenAIRealtimeToolCoordinatorDiagnostic,
} from "./openai-realtime-tool-coordinator.js";
import type {
  RealtimeProviderAdapter,
  RealtimeProviderLifecycleCallbacks,
} from "./RealtimeProviderAdapter.js";

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const DEFAULT_MAX_QUEUED_MESSAGES = 256;
const DEFAULT_MAX_QUEUED_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_CLIENT_MESSAGE_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOOL_ARGUMENT_BYTES = 64 * 1024;
const DEFAULT_MAX_PENDING_TOOL_CALLS = 32;
const DEFAULT_MAX_TOOL_CALLS_PER_RESPONSE = 32;
const DEFAULT_MAX_TOOL_CALLS_PER_SESSION = 256;
// Speaking response IDs are terminal WS media state. Keep them independently
// bounded with 60-minute headroom; do not reuse the observer's per-scope limit.
const DEFAULT_MAX_SPEAKING_RESPONSE_ENTRIES = 4_096;
const DEFAULT_MAX_OUTPUT_AUDIO_BYTES = 3 * 1024 * 1024;

export const OPENAI_REALTIME_CONNECT_TIMEOUT_MS = 10_000;
export const OPENAI_REALTIME_KEEPALIVE_MS = 30_000;

export interface OpenAIRealtimeSocketLike {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: { toString(): string }) => void): this;
  on(event: "error", listener: (error: unknown) => void): this;
  on(
    event: "close",
    listener: (code: number, reason: { toString(): string }) => void,
  ): this;
  on(event: "pong", listener: () => void): this;
  removeAllListeners?(): this;
}

export interface OpenAIRealtimeSocketOptions {
  headers: Record<string, string>;
}

export type OpenAIUsageObservation =
  | {
      source: "openai_realtime_response";
      id: string;
      usage: Record<string, unknown>;
    }
  | {
      source: "openai_input_transcription";
      id: string;
      usage: Record<string, unknown>;
    };

export type OpenAIAdapterDiagnostic =
  | {
      type: "queue_overflow";
      queuedMessages: number;
      queuedBytes: number;
    }
  | {
      type: "client_event_rejected";
      eventType: string;
      reason: "unsupported_type" | "invalid_payload" | "message_too_large";
    }
  | { type: "connect_timeout" }
  | { type: "upstream_socket_error" }
  | {
      type: "upstream_error";
      errorType: string;
      code: string;
      message: string;
    }
  | {
      type: "rate_limits_updated";
      rateLimits: Array<{
        name: string;
        limit: number;
        remaining: number;
        resetSeconds: number;
      }>;
    }
  | OpenAIRealtimeToolCoordinatorDiagnostic
  | {
      type: "observer_capacity_exceeded";
      scope: string;
      limit: number;
    }
  | { type: "transcription_failed"; itemId?: string; code?: string }
  | {
      type: "response_not_completed";
      responseId: string;
      status: string;
    }
  | { type: "malformed_event" }
  | { type: "unknown_event"; eventType: string };

export interface OpenAIRealtimeAdapterCallbacks extends RealtimeProviderLifecycleCallbacks {
  observeUsage(observation: OpenAIUsageObservation, observedAtMs: number): void;
  onDiagnostic(diagnostic: OpenAIAdapterDiagnostic): void;
  onResponseDone?(event: OpenAIRealtimeResponseDone): void;
  onToolEvent?(event: OpenAIRealtimeToolEvent): void;
}

export interface OpenAIRealtimeAdapterOptions {
  configuration: ValidatedTelefunSessionConfigure;
  apiKey: string;
  userId: string;
  createSocket: (
    url: string,
    options: OpenAIRealtimeSocketOptions,
  ) => OpenAIRealtimeSocketLike;
  callbacks: OpenAIRealtimeAdapterCallbacks;
  maxQueuedMessages?: number;
  maxQueuedBytes?: number;
  maxClientMessageBytes?: number;
  maxToolArgumentBytes?: number;
  maxPendingToolCalls?: number;
  maxToolCallsPerResponse?: number;
  maxToolCallsPerSession?: number;
  maxObserverDedupeEntries?: number;
  maxSpeakingResponseEntries?: number;
  maxOutputAudioBytes?: number;
  now?: () => number;
  toolDispatcher?: RealtimeToolDispatcher;
  connectTimeoutMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

interface QueuedClientMessage {
  raw: string;
  bytes: number;
}

type NormalizedClientMessage = Record<string, unknown> & { type: string };

export function buildOpenAISafetyIdentifier(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function buildSafeOpenAIDiagnosticLogMetadata(
  diagnostic: OpenAIAdapterDiagnostic,
): Record<string, unknown> {
  if (diagnostic.type === "upstream_error") {
    return {
      type: diagnostic.type,
      errorType: diagnostic.errorType,
      code: diagnostic.code,
    };
  }
  return diagnostic;
}

export function buildOpenAIRealtimeSessionUpdate(
  configuration: ValidatedTelefunSessionConfigure,
  toolDispatcher: Pick<RealtimeToolDispatcher, "getDefinitions"> =
    createProductionRealtimeToolDispatcher(),
) {
  const sampleRate = configuration.model.realtime.inputSampleRateHz;
  const tools = toolDispatcher.getDefinitions().map((definition) => ({
    type: "function" as const,
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
  }));
  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: configuration.model.id,
      instructions: configuration.configure.instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: sampleRate },
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: {
            type: "audio/pcm",
            rate: configuration.model.realtime.outputSampleRateHz,
          },
          voice: configuration.configure.voice,
        },
      },
      ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
    },
  } as const;
}

export class OpenAIRealtimeAdapter implements RealtimeProviderAdapter {
  private readonly maxQueuedMessages: number;
  private readonly maxQueuedBytes: number;
  private readonly maxClientMessageBytes: number;
  private readonly maxToolArgumentBytes: number;
  private readonly maxPendingToolCalls: number;
  private readonly maxToolCallsPerResponse: number;
  private readonly maxToolCallsPerSession: number;
  private readonly maxOutputAudioBytes: number;
  private readonly maxSpeakingResponseEntries: number;
  private readonly toolCoordinator: OpenAIRealtimeToolCoordinator;
  private readonly outputAudioResponses = new Set<string>();
  private readonly connectTimeoutMs: number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly eventObserver: OpenAIRealtimeEventObserver;
  private socket: OpenAIRealtimeSocketLike | null = null;
  private connectionPromise: Promise<void> | null = null;
  private resolveConnection: (() => void) | null = null;
  private rejectConnection: ((error: Error) => void) | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private maxSessionTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: QueuedClientMessage[] = [];
  private queuedBytes = 0;
  private ready = false;
  private socketOpen = false;
  private awaitingPong = false;
  private closed = false;
  private terminated = false;

  constructor(private readonly options: OpenAIRealtimeAdapterOptions) {
    this.maxQueuedMessages =
      options.maxQueuedMessages ?? DEFAULT_MAX_QUEUED_MESSAGES;
    this.maxQueuedBytes = options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
    this.maxClientMessageBytes =
      options.maxClientMessageBytes ?? DEFAULT_MAX_CLIENT_MESSAGE_BYTES;
    this.maxToolArgumentBytes =
      options.maxToolArgumentBytes ?? DEFAULT_MAX_TOOL_ARGUMENT_BYTES;
    this.maxPendingToolCalls =
      options.maxPendingToolCalls ?? DEFAULT_MAX_PENDING_TOOL_CALLS;
    this.maxToolCallsPerResponse =
      options.maxToolCallsPerResponse ?? DEFAULT_MAX_TOOL_CALLS_PER_RESPONSE;
    this.maxToolCallsPerSession =
      options.maxToolCallsPerSession ?? DEFAULT_MAX_TOOL_CALLS_PER_SESSION;
    this.maxSpeakingResponseEntries =
      options.maxSpeakingResponseEntries ?? DEFAULT_MAX_SPEAKING_RESPONSE_ENTRIES;
    this.maxOutputAudioBytes =
      options.maxOutputAudioBytes ?? DEFAULT_MAX_OUTPUT_AUDIO_BYTES;
    this.toolCoordinator = new OpenAIRealtimeToolCoordinator({
      dispatcher:
        options.toolDispatcher ?? createProductionRealtimeToolDispatcher(),
      maxToolArgumentBytes: this.maxToolArgumentBytes,
      maxPendingToolCalls: this.maxPendingToolCalls,
      maxToolCallsPerResponse: this.maxToolCallsPerResponse,
      maxToolCallsPerSession: this.maxToolCallsPerSession,
      onDiagnostic: (diagnostic) => options.callbacks.onDiagnostic(diagnostic),
      onCapacityExceeded: (scope, limit) => {
        const message =
          scope === "pending"
            ? "OpenAI Realtime tool-call buffer exceeded safe limit"
            : "OpenAI Realtime tool-call capacity exceeded safe limit";
        this.finishReadySession(1011, message, true);
        void limit;
      },
      canSend: () => {
        const socket = this.socket;
        return Boolean(
          socket &&
            this.isCurrentSocket(socket) &&
            socket.readyState === SOCKET_OPEN,
        );
      },
      send: (message) => this.socket?.send(message),
    });
    this.eventObserver = createOpenAIRealtimeEventObserver({
      ...(options.maxObserverDedupeEntries === undefined
        ? {}
        : { maxDedupeEntries: options.maxObserverDedupeEntries }),
      maxToolCallsPerSession: this.maxToolCallsPerSession,
      callbacks: {
        appendTranscript: (entry) => options.callbacks.appendTranscript(entry),
        observeUsage: (observation, observedAtMs) =>
          options.callbacks.observeUsage(observation, observedAtMs),
        completeTurn: () => options.callbacks.completeTurn(),
        interruptTurn: () => options.callbacks.interruptTurn(),
        notifyActivity: () => options.callbacks.notifyActivity(),
        notifyTurnComplete: () => options.callbacks.notifyTurnComplete(),
        notifyInterrupted: () => options.callbacks.notifyInterrupted(),
        onToolEvent: (event) => {
          options.callbacks.onToolEvent?.(event);
          this.toolCoordinator.handleEvent(event);
        },
        onResponseDone: (event) => {
          options.callbacks.onResponseDone?.(event);
          return this.toolCoordinator.handleResponseDone(event);
        },
        onResponseNotCompleted: ({ responseId, status }) =>
          options.callbacks.onDiagnostic({
            type: "response_not_completed",
            responseId,
            status: sanitizeShortText(status),
          }),
        onMalformedEvent: () =>
          options.callbacks.onDiagnostic({ type: "malformed_event" }),
        onUnknownEvent: (eventType) =>
          options.callbacks.onDiagnostic({
            type: "unknown_event",
            eventType: sanitizeEventType(eventType),
          }),
        onCapacityExceeded: (capacity) => {
          options.callbacks.onDiagnostic(capacity);
          this.finishReadySession(
            1011,
            "OpenAI Realtime event observer exceeded safe capacity",
            true,
          );
        },
      },
    });
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? OPENAI_REALTIME_CONNECT_TIMEOUT_MS;
    this.setTimeoutFn = options.setTimeout ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? clearTimeout;
    this.setIntervalFn = options.setInterval ?? setInterval;
    this.clearIntervalFn = options.clearInterval ?? clearInterval;
  }

  connect(): Promise<void> {
    if (this.connectionPromise) return this.connectionPromise;
    if (this.closed || this.terminated) {
      return Promise.reject(
        new Error("OpenAI Realtime adapter is already closed"),
      );
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnection = resolve;
      this.rejectConnection = reject;
    });

    try {
      const modelId = encodeURIComponent(this.options.configuration.model.id);
      const url = `wss://api.openai.com/v1/realtime?model=${modelId}`;
      const socket = this.options.createSocket(url, {
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "OpenAI-Safety-Identifier": buildOpenAISafetyIdentifier(
            this.options.userId,
          ),
        },
      });
      this.socket = socket;
      this.attachSocket(socket);
      this.connectTimer = this.setTimeoutFn(() => {
        if (this.ready || this.closed || this.terminated) return;
        this.options.callbacks.onDiagnostic({ type: "connect_timeout" });
        this.failBeforeReady("OpenAI Realtime connection timed out");
      }, this.connectTimeoutMs);
    } catch {
      this.failBeforeReady("OpenAI Realtime connection failed");
    }

    return this.connectionPromise;
  }

  handleClientMessage(message: unknown): void {
    if (this.closed || this.terminated) return;
    const normalized = this.normalizeClientMessage(message);
    if (!normalized) return;

    const raw = JSON.stringify(normalized);
    const bytes = Buffer.byteLength(raw, "utf8");
    if (bytes > this.maxClientMessageBytes) {
      this.rejectClientEvent(normalized.type, "message_too_large");
      return;
    }

    if (this.ready && this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(raw);
      return;
    }

    if (
      this.queue.length + 1 > this.maxQueuedMessages ||
      this.queuedBytes + bytes > this.maxQueuedBytes
    ) {
      this.failQueueOverflow();
      return;
    }
    this.queue.push({ raw, bytes });
    this.queuedBytes += bytes;
  }

  close(code = 1000, reason = "OpenAI Realtime adapter closed"): void {
    if (this.closed || this.terminated) return;
    this.closed = true;
    this.ready = false;
    this.rejectPendingConnection("OpenAI Realtime adapter closed");
    this.cleanupTimers();
    this.closeSocket(code, reason, false);
    this.clearQueue();
  }

  isReady(): boolean {
    return this.ready;
  }

  private attachSocket(socket: OpenAIRealtimeSocketLike): void {
    socket.on("open", () => {
      if (!this.isCurrentSocket(socket)) return;
      this.socketOpen = true;
      socket.send(
        JSON.stringify(
          buildOpenAIRealtimeSessionUpdate(
            this.options.configuration,
            this.toolCoordinator,
          ),
        ),
      );
    });

    socket.on("message", (data) => {
      if (!this.isCurrentSocket(socket)) return;
      this.handleUpstreamMessage(data.toString());
    });

    socket.on("pong", () => {
      if (!this.isCurrentSocket(socket)) return;
      this.awaitingPong = false;
    });

    socket.on("error", () => {
      if (!this.isCurrentSocket(socket)) return;
      this.options.callbacks.onDiagnostic({ type: "upstream_socket_error" });
      if (!this.ready) {
        this.failBeforeReady("OpenAI Realtime connection failed");
        return;
      }
      this.finishReadySession(
        1011,
        "OpenAI Realtime session disconnected; start a new call",
        true,
      );
    });

    socket.on("close", () => {
      if (!this.isCurrentSocket(socket)) return;
      this.socketOpen = false;
      if (!this.ready) {
        this.failBeforeReady(
          "OpenAI Realtime closed before session readiness",
          false,
        );
        return;
      }
      this.finishReadySession(
        1011,
        "OpenAI Realtime session disconnected; start a new call",
        false,
      );
    });
  }

  private handleUpstreamMessage(raw: string): void {
    let event: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed)) throw new Error("not an object");
      event = parsed;
    } catch {
      this.options.callbacks.onDiagnostic({ type: "malformed_event" });
      return;
    }

    const type = typeof event.type === "string" ? event.type : "";
    const observedAtMs = this.options.now?.() ?? Date.now();

    if (type === "session.updated") {
      if (!this.ready) this.markReady();
      this.options.callbacks.forwardToClient(raw);
      return;
    }
    if (type === "session.created" || type === "response.created") {
      this.options.callbacks.forwardToClient(raw);
      return;
    }
    if (type === "response.output_audio.delta") {
      this.handleOutputAudioEvent(event, raw);
      return;
    }
    if (type === "error") {
      this.handleErrorEvent(event);
      if (!this.ready) {
        this.failBeforeReady("OpenAI Realtime session setup failed");
      }
      return;
    }
    if (isOpenAIRealtimeEventType(type)) {
      const result = this.eventObserver.observe(event, observedAtMs);
      if (result && !result.suppressClientForward) {
        this.options.callbacks.forwardToClient(raw);
      }
      return;
    }
    if (type === "conversation.item.input_audio_transcription.failed") {
      const error = isRecord(event.error) ? event.error : {};
      this.options.callbacks.onDiagnostic({
        type: "transcription_failed",
        ...stringProperty(event, "item_id", "itemId"),
        ...stringProperty(error, "code", "code"),
      });
      this.options.callbacks.forwardToClient(raw);
      return;
    }
    if (type === "rate_limits.updated") {
      this.handleRateLimits(event);
      return;
    }
    this.options.callbacks.onDiagnostic({
      type: "unknown_event",
      eventType: type ? sanitizeEventType(type) : "missing",
    });
  }

  private markReady(): void {
    if (this.closed || this.terminated) return;
    this.ready = true;
    this.clearConnectTimer();
    const resolve = this.resolveConnection;
    this.resolveConnection = null;
    this.rejectConnection = null;
    resolve?.();
    this.startSessionTimers();
    this.flushQueue();
  }

  private handleOutputAudioEvent(
    event: Record<string, unknown>,
    raw: string,
  ): void {
    const delta = typeof event.delta === "string" ? event.delta : null;
    const maxEncodedAudioLength = Math.ceil(this.maxOutputAudioBytes / 3) * 4;
    if (
      !delta ||
      delta.length > maxEncodedAudioLength ||
      !isValidBase64(delta)
    ) {
      this.options.callbacks.onDiagnostic({ type: "malformed_event" });
      return;
    }
    const decoded = Buffer.from(delta, "base64");
    if (decoded.byteLength > this.maxOutputAudioBytes) {
      this.options.callbacks.onDiagnostic({ type: "malformed_event" });
      return;
    }
    const responseId = boundedStringValue(event.response_id, 256) ?? "unknown";
    if (!this.outputAudioResponses.has(responseId)) {
      if (this.outputAudioResponses.size >= this.maxSpeakingResponseEntries) {
        this.options.callbacks.onDiagnostic({
          type: "observer_capacity_exceeded",
          scope: "output_audio_responses",
          limit: this.maxSpeakingResponseEntries,
        });
        this.finishReadySession(
          1011,
          "OpenAI Realtime event observer exceeded safe capacity",
          true,
        );
        return;
      }
      this.outputAudioResponses.add(responseId);
      this.options.callbacks.startAiSpeaking();
    }
    this.options.callbacks.forwardToClient(raw);
  }

  private startSessionTimers(): void {
    this.keepaliveTimer = this.setIntervalFn(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== SOCKET_OPEN) return;
      if (this.awaitingPong) {
        socket.terminate();
        this.finishReadySession(
          1011,
          "OpenAI Realtime heartbeat timed out; start a new call",
          false,
        );
        return;
      }
      this.awaitingPong = true;
      socket.ping();
    }, OPENAI_REALTIME_KEEPALIVE_MS);

    const realtime = this.options.configuration.model.realtime;
    const maxSessionMinutes =
      "maxSessionMinutes" in realtime ? realtime.maxSessionMinutes : undefined;
    if (maxSessionMinutes) {
      this.maxSessionTimer = this.setTimeoutFn(
        () => {
          this.finishReadySession(
            1000,
            "OpenAI Realtime maximum session duration reached",
            true,
          );
        },
        maxSessionMinutes * 60 * 1_000,
      );
    }
  }

  private normalizeClientMessage(
    value: unknown,
  ): NormalizedClientMessage | null {
    if (!isRecord(value) || typeof value.type !== "string") {
      this.rejectClientEvent("missing", "invalid_payload");
      return null;
    }

    const eventType = sanitizeEventType(value.type);
    if (value.type === "input_audio_buffer.append") {
      if (typeof value.audio !== "string" || !isValidBase64(value.audio)) {
        this.rejectClientEvent(eventType, "invalid_payload");
        return null;
      }
      return { type: value.type, audio: value.audio };
    }
    if (value.type === "response.create") return { type: value.type };
    if (value.type === "response.cancel") return { type: value.type };
    if (value.type === "conversation.item.truncate") {
      if (
        typeof value.item_id !== "string" ||
        !Number.isInteger(value.content_index) ||
        (value.content_index as number) < 0 ||
        typeof value.audio_end_ms !== "number" ||
        !Number.isFinite(value.audio_end_ms) ||
        value.audio_end_ms < 0
      ) {
        this.rejectClientEvent(eventType, "invalid_payload");
        return null;
      }
      return {
        type: value.type,
        item_id: value.item_id,
        content_index: value.content_index,
        audio_end_ms: value.audio_end_ms,
      };
    }
    if (value.type === "conversation.item.create") {
      const item = isRecord(value.item) ? value.item : null;
      const content = item && Array.isArray(item.content) ? item.content : null;
      if (
        !item ||
        item.type !== "message" ||
        (item.role !== "user" && item.role !== "system") ||
        !content ||
        content.length === 0 ||
        !content.every(
          (part) =>
            isRecord(part) &&
            part.type === "input_text" &&
            typeof part.text === "string" &&
            part.text.trim().length > 0,
        )
      ) {
        this.rejectClientEvent(eventType, "invalid_payload");
        return null;
      }
      if (
        item.role === "system" &&
        (content.length !== 1 ||
          !String((content[0] as Record<string, unknown>).text).startsWith(
            "[TELEFUN_CONTROL:TIME_CUE]",
          ))
      ) {
        this.rejectClientEvent(eventType, "invalid_payload");
        return null;
      }
      return {
        type: value.type,
        item: {
          type: "message",
          role: item.role,
          content: content.map((part) => ({
            type: "input_text",
            text: (part as Record<string, unknown>).text,
          })),
        },
      };
    }

    this.rejectClientEvent(eventType, "unsupported_type");
    return null;
  }

  private handleRateLimits(event: Record<string, unknown>): void {
    const input = Array.isArray(event.rate_limits) ? event.rate_limits : [];
    const rateLimits = input.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const name = stringValue(entry.name);
      const limit = numberValue(entry.limit);
      const remaining = numberValue(entry.remaining);
      const resetSeconds = numberValue(entry.reset_seconds);
      if (
        name === null ||
        limit === null ||
        remaining === null ||
        resetSeconds === null
      ) {
        return [];
      }
      return [{ name, limit, remaining, resetSeconds }];
    });
    this.options.callbacks.onDiagnostic({
      type: "rate_limits_updated",
      rateLimits,
    });
  }

  private handleErrorEvent(event: Record<string, unknown>): void {
    const error = isRecord(event.error) ? event.error : {};
    const errorType = sanitizeShortText(stringValue(error.type) ?? "unknown");
    const code = sanitizeShortText(stringValue(error.code) ?? "unknown");
    const message = this.redactSensitiveText(
      stringValue(error.message) ?? "OpenAI Realtime request failed",
    );
    this.options.callbacks.onDiagnostic({
      type: "upstream_error",
      errorType,
      code,
      message,
    });
    this.options.callbacks.forwardToClient(
      JSON.stringify({
        type: "error",
        error: { type: errorType, code, message },
      }),
    );
  }

  private redactSensitiveText(value: string): string {
    return value
      .replaceAll(this.options.apiKey, "[redacted]")
      .replaceAll(this.options.userId, "[redacted]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 240);
  }

  private rejectClientEvent(
    eventType: string,
    reason: "unsupported_type" | "invalid_payload" | "message_too_large",
  ): void {
    this.options.callbacks.onDiagnostic({
      type: "client_event_rejected",
      eventType: sanitizeEventType(eventType),
      reason,
    });
  }

  private flushQueue(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== SOCKET_OPEN) return;
    while (this.queue.length > 0 && this.ready && !this.terminated) {
      const message = this.queue.shift();
      if (!message) continue;
      this.queuedBytes -= message.bytes;
      socket.send(message.raw);
    }
  }

  private failQueueOverflow(): void {
    if (this.closed || this.terminated) return;
    this.terminated = true;
    this.options.callbacks.onDiagnostic({
      type: "queue_overflow",
      queuedMessages: this.queue.length,
      queuedBytes: this.queuedBytes,
    });
    this.options.callbacks.onFinalClose(
      1011,
      "OpenAI Realtime client queue exceeded safe limit",
    );
    this.rejectPendingConnection(
      "OpenAI Realtime client queue exceeded safe limit",
    );
    this.cleanupTimers();
    this.closeSocket(1011, "OpenAI Realtime client queue overflow", false);
    this.clearQueue();
  }

  private failBeforeReady(reason: string, closeSocket = true): void {
    if (this.closed || this.terminated) return;
    this.terminated = true;
    this.ready = false;
    this.rejectPendingConnection(reason);
    this.cleanupTimers();
    if (closeSocket) {
      this.closeSocket(1011, "OpenAI Realtime connection failed", false);
    } else {
      this.socket?.removeAllListeners?.();
      this.socket = null;
    }
    this.clearQueue();
  }

  private finishReadySession(
    code: number,
    reason: string,
    closeSocket: boolean,
  ): void {
    if (this.closed || this.terminated) return;
    this.terminated = true;
    this.ready = false;
    this.cleanupTimers();
    if (closeSocket) this.closeSocket(code, reason, false);
    else this.socket = null;
    this.clearQueue();
    this.options.callbacks.onFinalClose(code, reason);
  }

  private rejectPendingConnection(reason: string): void {
    const reject = this.rejectConnection;
    this.resolveConnection = null;
    this.rejectConnection = null;
    reject?.(new Error(reason));
  }

  private closeSocket(
    code: number,
    reason: string,
    forceTerminate: boolean,
  ): void {
    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    if (!socket) return;
    if (socket.removeAllListeners) {
      socket.removeAllListeners();
      // `ws` emits an error while aborting a CONNECTING handshake. Retain a
      // sink after detaching adapter listeners so cleanup cannot surface an
      // unhandled EventEmitter error.
      socket.on("error", () => undefined);
    }
    if (forceTerminate) {
      socket.terminate();
      return;
    }
    if (
      socket.readyState === SOCKET_OPEN ||
      socket.readyState === SOCKET_CONNECTING
    ) {
      socket.close(code, reason);
    }
  }

  private cleanupTimers(): void {
    this.clearConnectTimer();
    if (this.keepaliveTimer) {
      this.clearIntervalFn(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.maxSessionTimer) {
      this.clearTimeoutFn(this.maxSessionTimer);
      this.maxSessionTimer = null;
    }
    this.awaitingPong = false;
  }

  private clearConnectTimer(): void {
    if (!this.connectTimer) return;
    this.clearTimeoutFn(this.connectTimer);
    this.connectTimer = null;
  }

  private clearQueue(): void {
    this.queue = [];
    this.queuedBytes = 0;
  }

  private isCurrentSocket(socket: OpenAIRealtimeSocketLike): boolean {
    return this.socket === socket && !this.closed && !this.terminated;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
    value,
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function boundedStringValue(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringProperty(
  record: Record<string, unknown>,
  sourceKey: string,
  targetKey: string,
): Record<string, string> {
  const value = stringValue(record[sourceKey]);
  return value ? { [targetKey]: sanitizeShortText(value) } : {};
}

function sanitizeEventType(value: string): string {
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : "unknown";
}

function sanitizeShortText(value: string): string {
  return value.replace(/[^a-zA-Z0-9_. -]/g, "").slice(0, 120) || "unknown";
}
