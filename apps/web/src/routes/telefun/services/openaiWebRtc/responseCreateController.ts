import type { OpenAIWebRtcControlEvent, OpenAIWebRtcEvent } from "./contracts";

type ResponseCreateControlEvent = Extract<
  OpenAIWebRtcControlEvent,
  { type: "response.create" }
>;

type ManualResponseCreateBarrier = {
  marker: string;
  responseId: string | null;
};

type ResponseCreatedOrigin =
  | { kind: "manual"; marker: string; responseId: string }
  | { kind: "unknown" };

type ResponseCreateControllerDependencies = {
  canSendControlEvent: () => boolean;
  hasInProgressResponse: () => boolean;
  sendControlEventDirect: (event: OpenAIWebRtcControlEvent) => boolean;
};

const TELEFUN_RESPONSE_CREATE_METADATA_KEY = "telefun_response_create";
const TELEFUN_RESPONSE_CREATE_MARKER_PREFIX = "telefun-response-create-";
const MAX_TELEFUN_RESPONSE_CREATE_MARKER_SEQUENCE = 0xffffff;
const MAX_TELEFUN_RESPONSE_CREATE_MARKER_LENGTH =
  TELEFUN_RESPONSE_CREATE_MARKER_PREFIX.length + 6;
const MAX_COMMITTED_INPUT_ITEM_IDS = 4_096;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getCommittedInputItemId(event: OpenAIWebRtcEvent): string | undefined {
  if (event.kind !== "event" || event.type !== "input_audio_buffer.committed") {
    return undefined;
  }
  return stringValue(event.payload.item_id);
}

function getResponseCreatedOrigin(
  event: OpenAIWebRtcEvent,
): ResponseCreatedOrigin {
  if (event.kind !== "event" || event.type !== "response.created") {
    return { kind: "unknown" };
  }

  const response = isRecordValue(event.payload.response)
    ? event.payload.response
    : null;
  const responseId = stringValue(response?.id);
  if (!response || !responseId) return { kind: "unknown" };

  const metadata = isRecordValue(response.metadata) ? response.metadata : null;
  const marker = stringValue(metadata?.[TELEFUN_RESPONSE_CREATE_METADATA_KEY]);
  if (
    !metadata ||
    !marker ||
    marker.length > MAX_TELEFUN_RESPONSE_CREATE_MARKER_LENGTH ||
    Object.keys(metadata).length !== 1
  ) {
    return { kind: "unknown" };
  }

  return { kind: "manual", marker, responseId };
}

/**
 * Owns the single application authority for OpenAI response generation.
 * Server VAD only commits input; this controller serializes one marked
 * response.create behind committed-input and active-response barriers.
 */
export class OpenAIWebRtcResponseCreateController {
  private markerSequence = 0;
  private barrier: ManualResponseCreateBarrier | null = null;
  private pending: ResponseCreateControlEvent | null = null;
  private serverVadInputPending = false;
  private readonly committedInputItemIds = new Set<string>();
  private shutdownRequested = false;

  constructor(private readonly deps: ResponseCreateControllerDependencies) {}

  public send(event: ResponseCreateControlEvent): boolean {
    if (!this.deps.canSendControlEvent()) return false;
    if (this.pending || !this.isSafe()) {
      this.pending = event;
      return true;
    }
    return this.sendMarked(event);
  }

  public handleInputEvent(event: OpenAIWebRtcEvent): void {
    if (this.shutdownRequested || event.kind !== "event") return;
    if (event.type === "input_audio_buffer.speech_started") {
      this.serverVadInputPending = true;
      return;
    }
    if (event.type !== "input_audio_buffer.committed") return;

    const itemId = getCommittedInputItemId(event);
    if (!itemId || this.committedInputItemIds.has(itemId)) return;
    // A 60-minute Realtime session cannot legitimately need this many turns.
    // Fail closed instead of evicting an ID and risking duplicate generation.
    if (this.committedInputItemIds.size >= MAX_COMMITTED_INPUT_ITEM_IDS) return;

    this.committedInputItemIds.add(itemId);
    this.serverVadInputPending = false;
    if (this.pending) {
      this.flush();
      return;
    }
    this.send({ type: "response.create" });
  }

  public handleResponseCreated(event: OpenAIWebRtcEvent): void {
    const origin = getResponseCreatedOrigin(event);
    if (origin.kind !== "manual") return;

    const barrier = this.barrier;
    if (!barrier || barrier.marker !== origin.marker) return;
    if (barrier.responseId === null) barrier.responseId = origin.responseId;
  }

  public handleResponseTerminal(responseId: string | undefined): void {
    if (!responseId) return;
    if (this.barrier?.responseId === responseId) this.barrier = null;
  }

  public flush(): void {
    const pending = this.pending;
    if (!pending || !this.isSafe() || !this.deps.canSendControlEvent()) return;

    this.pending = null;
    if (!this.sendMarked(pending) && !this.shutdownRequested) {
      this.pending = pending;
    }
  }

  public shutdown(): void {
    this.shutdownRequested = true;
    this.pending = null;
    this.barrier = null;
    this.serverVadInputPending = false;
    this.committedInputItemIds.clear();
  }

  private sendMarked(event: ResponseCreateControlEvent): boolean {
    const marker = this.createMarker();
    this.barrier = { marker, responseId: null };
    const markedEvent: ResponseCreateControlEvent = {
      ...event,
      response: {
        metadata: {
          [TELEFUN_RESPONSE_CREATE_METADATA_KEY]: marker,
        },
      },
    };
    if (this.deps.sendControlEventDirect(markedEvent)) return true;
    this.barrier = null;
    return false;
  }

  private createMarker(): string {
    this.markerSequence =
      this.markerSequence >= MAX_TELEFUN_RESPONSE_CREATE_MARKER_SEQUENCE
        ? 1
        : this.markerSequence + 1;
    return `${TELEFUN_RESPONSE_CREATE_MARKER_PREFIX}${this.markerSequence.toString(36).padStart(6, "0")}`;
  }

  private isSafe(): boolean {
    return Boolean(
      !this.shutdownRequested &&
      this.barrier === null &&
      !this.deps.hasInProgressResponse() &&
      !this.serverVadInputPending,
    );
  }
}
