import type {
  OpenAIWebRtcAudioElementLike,
  OpenAIWebRtcControlEvent,
  OpenAIWebRtcEvent,
} from "./contracts";

const MAX_LIFECYCLE_IDS = 4_096;

type OpenAIWebRtcInterruptionDependencies = {
  audioElement: OpenAIWebRtcAudioElementLike;
  sendControlEvent: (event: OpenAIWebRtcControlEvent) => boolean;
  onAudibilityChange?: (audible: boolean) => void;
  canActivatePlayback?: () => boolean;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Owns the browser-only OpenAI output lifecycle. Provider response generation,
 * HTML-media playback, and actually played audio are deliberately separate
 * states so stale events and silent buffers cannot become interruption targets.
 */
export class OpenAIWebRtcInterruptionController {
  private audibleResponseId: string | null = null;
  private audibleItemId: string | null = null;
  private audibleItemPlayedStartMs = 0;
  private readonly seenResponseIds = new Set<string>();
  private readonly responseOrder = new Map<string, number>();
  private readonly responseItemIds = new Map<string, string>();
  private readonly inProgressResponseIds = new Set<string>();
  private readonly cancelledResponseIds = new Set<string>();
  private readonly clearedResponseIds = new Set<string>();
  private readonly truncatedItemIds = new Set<string>();
  private readonly interruptedResponseIds = new Set<string>();
  private mediaAttached = false;
  private held = false;
  private playbackActive = false;
  private playedMs = 0;
  private lastWallTimeMs: number | null = null;
  private lastMediaTimeMs: number | null = null;
  private lastAudibilityNotification = false;
  private interruptionTotal = 0;
  private nextResponseOrder = 0;
  private latestAudibleResponseOrder = 0;

  constructor(private readonly deps: OpenAIWebRtcInterruptionDependencies) {}

  public get interruptionCount(): number {
    return this.interruptionTotal;
  }

  public get hasInProgressResponse(): boolean {
    return this.inProgressResponseIds.size > 0;
  }

  public isResponseInProgress(responseId: string): boolean {
    return this.inProgressResponseIds.has(responseId);
  }

  public handleProviderEvent(event: OpenAIWebRtcEvent): void {
    if (event.kind !== "event") return;
    const payload = event.payload;

    if (event.type === "response.created") {
      const response = isRecordValue(payload.response)
        ? payload.response
        : null;
      const responseId = stringValue(response?.id);
      if (!responseId || this.seenResponseIds.has(responseId)) return;
      if (!this.rememberResponseId(responseId)) return;
      this.inProgressResponseIds.add(responseId);
      return;
    }

    if (
      event.type === "response.output_item.added" ||
      event.type === "response.output_audio.delta"
    ) {
      this.handleOutputItem(
        payload,
        event.type === "response.output_item.added",
      );
      return;
    }

    if (event.type === "output_audio_buffer.started") {
      const responseId = stringValue(payload.response_id);
      if (!responseId || !this.seenResponseIds.has(responseId)) return;
      const responseOrder = this.responseOrder.get(responseId);
      if (
        responseOrder === undefined ||
        responseOrder <= this.latestAudibleResponseOrder ||
        responseId === this.audibleResponseId
      ) {
        return;
      }
      this.latestAudibleResponseOrder = responseOrder;
      this.audibleResponseId = responseId;
      this.audibleItemId = this.responseItemIds.get(responseId) ?? null;
      this.audibleItemPlayedStartMs = this.getPlayedPositionMs();
      this.notifyAudibilityChange();
      return;
    }

    if (
      event.type === "output_audio_buffer.stopped" ||
      event.type === "output_audio_buffer.cleared"
    ) {
      const responseId = stringValue(payload.response_id);
      if (responseId) this.clearAudibleResponse(responseId);
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      this.interruptAudibleResponse();
      return;
    }

    if (event.type === "response.cancelled") {
      const response = isRecordValue(payload.response)
        ? payload.response
        : null;
      const responseId =
        stringValue(payload.response_id) ?? stringValue(response?.id);
      if (!responseId) return;
      this.cancelledResponseIds.add(responseId);
      this.inProgressResponseIds.delete(responseId);
      return;
    }

    if (event.type === "response.done") {
      const response = isRecordValue(payload.response)
        ? payload.response
        : null;
      const responseId =
        stringValue(payload.response_id) ?? stringValue(response?.id);
      if (!responseId || !this.seenResponseIds.has(responseId)) return;
      this.inProgressResponseIds.delete(responseId);
      const status = stringValue(response?.status);
      if (status && status !== "completed") {
        this.cancelledResponseIds.add(responseId);
      }
    }
  }

  public attachRemoteMedia(): void {
    this.mediaAttached = true;
    this.bindAudioHandlers();
    this.notifyAudibilityChange();
  }

  public setHeld(held: boolean): void {
    this.held = held;
    if (held) this.setPlaybackActive(false);
    else this.notifyAudibilityChange();
  }

  public setPlaybackActive(active: boolean): void {
    if (!active) {
      if (this.playbackActive) this.getPlayedPositionMs();
      this.playbackActive = false;
      this.lastWallTimeMs = null;
      this.lastMediaTimeMs = null;
      this.notifyAudibilityChange();
      return;
    }

    if (this.playbackActive) this.getPlayedPositionMs();
    this.playbackActive = true;
    this.lastWallTimeMs = Date.now();
    this.lastMediaTimeMs = this.getAudioElementTimeMs();
    this.notifyAudibilityChange();
  }

  public cleanup(): void {
    this.setPlaybackActive(false);
    this.mediaAttached = false;
    this.audibleResponseId = null;
    this.audibleItemId = null;
    this.notifyAudibilityChange();
    const audio = this.deps.audioElement;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.onwaiting = null;
    audio.onstalled = null;
  }

  private handleOutputItem(
    payload: Record<string, unknown>,
    requireAssistantMessage: boolean,
  ): void {
    const responseId = stringValue(payload.response_id);
    const item = isRecordValue(payload.item) ? payload.item : null;
    const itemId = stringValue(item?.id) ?? stringValue(payload.item_id);
    if (!responseId || !itemId) return;
    if (
      requireAssistantMessage &&
      (item?.type !== "message" || item.role !== "assistant")
    ) {
      return;
    }
    if (!this.seenResponseIds.has(responseId)) {
      if (!this.rememberResponseId(responseId)) return;
      this.inProgressResponseIds.add(responseId);
    }
    if (this.responseItemIds.has(responseId)) return;
    this.responseItemIds.set(responseId, itemId);
    if (responseId === this.audibleResponseId && !this.audibleItemId) {
      this.audibleItemId = itemId;
    }
  }

  private rememberResponseId(responseId: string): boolean {
    if (this.seenResponseIds.size >= MAX_LIFECYCLE_IDS) return false;
    this.seenResponseIds.add(responseId);
    this.responseOrder.set(responseId, ++this.nextResponseOrder);
    return true;
  }

  private interruptAudibleResponse(): void {
    const responseId = this.audibleResponseId;
    if (!responseId || !this.isAudible()) return;
    const audioEndMs = Math.max(
      0,
      Math.round(this.getPlayedPositionMs() - this.audibleItemPlayedStartMs),
    );
    if (audioEndMs <= 0) return;

    let interrupted = false;
    if (
      this.inProgressResponseIds.has(responseId) &&
      !this.cancelledResponseIds.has(responseId) &&
      this.deps.sendControlEvent({
        type: "response.cancel",
        response_id: responseId,
      })
    ) {
      this.cancelledResponseIds.add(responseId);
      interrupted = true;
    }

    if (
      !this.clearedResponseIds.has(responseId) &&
      this.deps.sendControlEvent({ type: "output_audio_buffer.clear" })
    ) {
      this.clearedResponseIds.add(responseId);
      interrupted = true;
    }

    const itemId = this.audibleItemId;
    if (
      itemId &&
      !this.truncatedItemIds.has(itemId) &&
      this.deps.sendControlEvent({
        type: "conversation.item.truncate",
        item_id: itemId,
        content_index: 0,
        audio_end_ms: audioEndMs,
      })
    ) {
      this.truncatedItemIds.add(itemId);
      interrupted = true;
    }

    if (interrupted && !this.interruptedResponseIds.has(responseId)) {
      this.interruptedResponseIds.add(responseId);
      this.interruptionTotal += 1;
    }
  }

  private clearAudibleResponse(responseId: string): void {
    if (responseId !== this.audibleResponseId) return;
    this.audibleResponseId = null;
    this.audibleItemId = null;
    this.audibleItemPlayedStartMs = this.getPlayedPositionMs();
    this.notifyAudibilityChange();
  }

  private bindAudioHandlers(): void {
    const audio = this.deps.audioElement;
    audio.onplaying = () => {
      if (!this.held && (this.deps.canActivatePlayback?.() ?? true)) {
        this.setPlaybackActive(true);
      }
    };
    audio.onpause = () => this.setPlaybackActive(false);
    audio.onended = () => this.setPlaybackActive(false);
    audio.onwaiting = () => this.setPlaybackActive(false);
    audio.onstalled = () => this.setPlaybackActive(false);
    audio.ontimeupdate = () => {
      if (this.playbackActive) this.getPlayedPositionMs();
    };
  }

  private isAudible(): boolean {
    const audio = this.deps.audioElement;
    return Boolean(
      this.mediaAttached &&
      audio.srcObject &&
      this.playbackActive &&
      this.audibleResponseId &&
      !this.held &&
      !audio.muted &&
      audio.paused !== true &&
      audio.ended !== true &&
      (audio.readyState === undefined || audio.readyState >= 2),
    );
  }

  private getPlayedPositionMs(): number {
    const now = Date.now();
    if (this.playbackActive) {
      const mediaTimeMs = this.getAudioElementTimeMs();
      if (mediaTimeMs !== null) {
        if (this.lastMediaTimeMs !== null) {
          this.playedMs += Math.max(0, mediaTimeMs - this.lastMediaTimeMs);
        }
        this.lastMediaTimeMs = mediaTimeMs;
      } else if (this.lastWallTimeMs !== null) {
        this.playedMs += Math.max(0, now - this.lastWallTimeMs);
      }
      this.lastWallTimeMs = now;
    }
    return this.playedMs;
  }

  private getAudioElementTimeMs(): number | null {
    const value = this.deps.audioElement.currentTime;
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value * 1_000
      : null;
  }

  private notifyAudibilityChange(): void {
    const audible = this.isAudible();
    if (audible === this.lastAudibilityNotification) return;
    this.lastAudibilityNotification = audible;
    try {
      this.deps.onAudibilityChange?.(audible);
    } catch {
      // Playback observers are not lifecycle authorities.
    }
  }
}
