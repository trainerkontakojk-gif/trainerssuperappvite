import type { SessionMetrics } from "@trainers/types";
import {
  OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS,
  OPENAI_WEBRTC_DEFAULT_TIMEOUT_MS,
  OPENAI_WEBRTC_DATA_CHANNEL_LABEL,
  type OpenAIWebRtcCallOutcome,
  type OpenAIWebRtcControlEvent,
  type OpenAIWebRtcDataChannelLike,
  type OpenAIWebRtcDependencies,
  type OpenAIWebRtcEvent,
  type OpenAIWebRtcPeerConnectionLike,
  type OpenAIWebRtcSessionConfig,
  type OpenAIWebRtcState,
  type OpenAIWebRtcStreamLike,
  type OpenAIWebRtcTrackLike,
  isUuid,
} from "./contracts";
import {
  buildOpenAIWebRtcBrokerCallUrl,
  createOpenAIWebRtcBrokerCall,
  deleteOpenAIWebRtcBrokerCall,
} from "./brokerApi";
import {
  clearAudioElement,
  closeDataChannelOnce,
  closePeerConnectionOnce,
  getTracksFromStream,
  stopTracksOnce,
} from "./cleanup";
import { parseOpenAIWebRtcDataChannelMessage } from "./events";
import { OpenAIWebRtcInterruptionController } from "./interruptionController";
import {
  calculateRecordingVolumeConsistency,
  OpenAIWebRtcRecordingGraph,
  type OpenAIWebRtcRecordingResult,
} from "./recording";
import {
  buildWebRtcRecoveryPlan,
  type WebRtcRecoveryCause,
} from "./recovery-policy";
import {
  createHoldTrackerState,
  endHold,
  finalizeActiveHold,
  startHold,
  summarizeHoldMetrics,
  type HoldTrackerState,
} from "../holdMetrics";

type DataChannelMessageEvent = { data: string };
type TerminalState = "ended" | "failed";
type TerminationSource =
  | "user"
  | "timeout"
  | "unmount"
  | "provider_error"
  | "peer_state"
  | "ice_state"
  | "data_channel_close"
  | "microphone_ended"
  | "connect_timeout"
  | "connect_failure"
  | "broker_cleanup";

export type { TerminationSource };
type ConnectErrorStage =
  | "get_user_media"
  | "recording_start"
  | "create_offer"
  | "set_local_description"
  | "broker_request"
  | "set_remote_description"
  | "wait_for_peer";

type CodedError = Error & { code?: string };

type OpenAIInterruptionControlKind =
  | "response.cancel"
  | "output_audio_buffer.clear"
  | "conversation.item.truncate";

type OpenAIInterruptionControlCorrelation = {
  kind: OpenAIInterruptionControlKind;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isSafeControlEvent(event: OpenAIWebRtcControlEvent): boolean {
  if (event.type === "response.cancel") {
    return event.response_id.length > 0;
  }
  if (
    event.type === "response.create" ||
    event.type === "output_audio_buffer.clear"
  ) {
    return true;
  }
  if (event.type === "conversation.item.truncate") {
    return (
      typeof event.item_id === "string" &&
      event.item_id.length > 0 &&
      event.content_index === 0 &&
      Number.isFinite(event.audio_end_ms) &&
      event.audio_end_ms >= 0
    );
  }
  if (event.type !== "conversation.item.create") return false;
  const text = event.item.content[0]?.text;
  return (
    event.item.type === "message" &&
    event.item.role === "system" &&
    event.item.content.length === 1 &&
    typeof text === "string" &&
    text.startsWith("[TELEFUN_CONTROL:TIME_CUE]")
  );
}

function createCodedError(
  message: string,
  code: string,
  cause?: unknown,
): CodedError {
  const error = new Error(message, { cause }) as CodedError;
  error.code = code;
  return error;
}

function wrapCodedError(
  error: unknown,
  code: string,
  fallbackMessage: string,
): CodedError {
  const sourceMessage =
    error instanceof Error ? error.message : fallbackMessage;
  const wrapped = createCodedError(sourceMessage, code, error);
  if (error instanceof Error) wrapped.name = error.name;
  return wrapped;
}

const RECORDING_CALLBACK_TIMEOUT_MS = 10_000;
const MAX_CONNECT_DIAGNOSTIC_MESSAGE_LENGTH = 200;
const SESSION_DESCRIPTION_DIAGNOSTIC_PATTERN =
  /(?:\bsdp\b|\bsession\s*description\b|\bset(?:local|remote)description\b|\bice-(?:pwd|ufrag)\b|\b(?:candidate|fingerprint)\s*:|(?:^|[\r\n])[ \t]*(?:v|o|s|t|c|m|a)=)/im;

function getSafeConnectDiagnosticMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  if (SESSION_DESCRIPTION_DIAGNOSTIC_PATTERN.test(message)) {
    return "session_description_parse_failed";
  }
  return message.slice(0, MAX_CONNECT_DIAGNOSTIC_MESSAGE_LENGTH);
}

export class OpenAIWebRtcSession {
  private peer: OpenAIWebRtcPeerConnectionLike | null = null;
  private dataChannel: OpenAIWebRtcDataChannelLike | null = null;
  private localStream: OpenAIWebRtcStreamLike | null = null;
  private remoteStream: OpenAIWebRtcStreamLike | null = null;
  private readonly localTracks = new Set<OpenAIWebRtcTrackLike>();
  private readonly remoteTracks = new Set<OpenAIWebRtcTrackLike>();
  private readonly connectTimeoutMs: number;
  private readonly deleteTimeoutMs: number;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private brokerCallDeleted = false;
  private brokerDeletePromise: Promise<void> | null = null;
  private brokerCleanupRequested = false;
  private brokerCleanupOutcome: OpenAIWebRtcCallOutcome | undefined;
  private lateBrokerCleanupRetryRequested = false;
  private requestedTerminalState: TerminalState | null = null;
  private finalizationPromise: Promise<void> | null = null;
  private shutdownRequested = false;
  private peerConnectedResolve: (() => void) | null = null;
  private peerConnectedReject: ((error: Error) => void) | null = null;
  private failureError: Error | null = null;
  private failureReported = false;
  private playbackBlocked = false;
  private muted = false;
  private held = false;
  private recordingGraph: OpenAIWebRtcRecordingGraph | null = null;
  private sessionStartTime = 0;
  private hasConnected = false;
  private recoveryNotified = false;
  private openAiSentInterruptionEventIds = new Map<
    string,
    OpenAIInterruptionControlCorrelation
  >();
  private openAiControlSequence = 0;
  private speechSegments: SessionMetrics["speechSegments"] = [];
  private currentSpeechSegmentStartMs: number | null = null;
  private totalSpeakingMs = 0;
  private holdTracker: HoldTrackerState = createHoldTrackerState();
  private readonly interruptionController: OpenAIWebRtcInterruptionController;
  private _state: OpenAIWebRtcState = "idle";
  private terminationSource: TerminationSource | null = null;
  private connectStageField: ConnectErrorStage | null = null;

  constructor(
    private readonly config: OpenAIWebRtcSessionConfig,
    private readonly deps: OpenAIWebRtcDependencies,
  ) {
    this.connectTimeoutMs =
      config.connectTimeoutMs ?? OPENAI_WEBRTC_DEFAULT_TIMEOUT_MS;
    this.deleteTimeoutMs =
      config.deleteTimeoutMs ?? OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS;
    this.interruptionController = new OpenAIWebRtcInterruptionController({
      audioElement: deps.audioElement,
      sendControlEvent: (event) => this.sendControlEvent(event),
      onAudibilityChange: (audible) =>
        this.notify(deps.onRemotePlaybackChange, audible),
      canActivatePlayback: () => !this.shutdownRequested,
    });
  }

  get state(): OpenAIWebRtcState {
    return this._state;
  }

  public async connect(): Promise<void> {
    this.validateConfig();
    if (this._state !== "idle") {
      throw new Error("WebRTC session is already running.");
    }

    let connectStage: ConnectErrorStage = "get_user_media";
    this.connectStageField = connectStage;
    try {
      this.setState("acquiring_media");
      let localStream: OpenAIWebRtcStreamLike;
      try {
        localStream = await this.deps.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
      } catch (error) {
        throw wrapCodedError(
          error,
          "microphone_access_failed",
          "Microphone access failed.",
        );
      }
      if (this.shutdownRequested) {
        stopTracksOnce(getTracksFromStream(localStream));
        throw this.createShutdownError();
      }
      this.localStream = localStream;
      const activeLocalStream = this.localStream;
      if (!activeLocalStream) {
        throw this.createShutdownError();
      }
      this.sessionStartTime = Date.now();
      this.notify(this.deps.onLocalStream, localStream);
      this.localTracks.clear();
      this.recordingGraph = new OpenAIWebRtcRecordingGraph(
        this.deps,
        (volume) => this.notify(this.deps.onVolumeChange, volume),
      );
      connectStage = "recording_start";
      this.connectStageField = connectStage;
      await this.recordingGraph.start(activeLocalStream);
      for (const track of getTracksFromStream(this.localStream)) {
        this.localTracks.add(track);
        this.bindLocalTrackHandler(track);
      }
      this.applyLocalTrackState();

      this.peer = new this.deps.RTCPeerConnection();
      this.bindPeerHandlers(this.peer);
      this.dataChannel = this.peer.createDataChannel(
        OPENAI_WEBRTC_DATA_CHANNEL_LABEL,
      );
      this.bindDataChannelHandlers(this.dataChannel);

      for (const track of this.localTracks) {
        this.peer.addTrack(track, activeLocalStream);
      }

      connectStage = "create_offer";
      this.connectStageField = connectStage;
      this.setState("creating_offer");
      const peer = this.peer;
      if (!peer) {
        throw this.createShutdownError();
      }
      let offer: RTCSessionDescriptionInit;
      try {
        offer = await peer.createOffer();
      } catch (error) {
        throw wrapCodedError(
          error,
          "webrtc_offer_failed",
          "Browser offer creation failed.",
        );
      }
      this.assertActive();

      if (!offer.sdp) {
        throw createCodedError(
          "Browser offer SDP is missing.",
          "webrtc_offer_failed",
        );
      }

      connectStage = "set_local_description";
      this.connectStageField = connectStage;
      try {
        await peer.setLocalDescription(offer);
      } catch (error) {
        throw wrapCodedError(
          error,
          "webrtc_offer_failed",
          "Browser local description failed.",
        );
      }
      this.assertActive();

      this.setState("brokering_sdp");
      this.abortController = new AbortController();
      this.startConnectTimeout();
      this.setState("connecting");
      this.assertActive();

      connectStage = "broker_request";
      this.connectStageField = connectStage;
      const { answerSdp } = await createOpenAIWebRtcBrokerCall({
        onBrokerRequestStarted: () =>
          this.warnConnectStage("broker_request_started"),
        onBrokerResponse: () => {
          this.warnConnectStage("broker_response");
          // A POST can resolve after DELETE has already terminalized the
          // browser session. It may need one broker-only cleanup retry, but it
          // must never restart recording callback/resource finalization.
          if (
            (this.shutdownRequested || this.brokerCleanupRequested) &&
            !this.brokerCallDeleted &&
            !this.brokerDeletePromise &&
            !this.lateBrokerCleanupRetryRequested
          ) {
            this.lateBrokerCleanupRetryRequested = true;
            void this.requestBrokerDelete(this.brokerCleanupOutcome).catch(
              () => {
                /* explicit lifecycle retry remains the owner after this bounded attempt */
              },
            );
          }
        },
        fetch: this.deps.fetch,
        brokerHttpBaseUrl: this.config.brokerHttpBaseUrl,
        sessionId: this.config.sessionId,
        accessToken: this.config.accessToken,
        offerSdp: offer.sdp,
        signal: this.abortController.signal,
      });

      this.assertActive();
      const activePeer = this.peer;
      if (!activePeer) {
        throw this.createShutdownError();
      }
      connectStage = "set_remote_description";
      this.connectStageField = connectStage;
      await activePeer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
      this.assertActive();
      connectStage = "wait_for_peer";
      this.connectStageField = connectStage;
      await this.waitForPeerConnected(activePeer);
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error("WebRTC connection failed.");
      this.connectStageField = connectStage;
      if (
        this.state !== "ending" &&
        this.state !== "ended" &&
        this.state !== "failed"
      ) {
        this.warnConnectStage(connectStage, normalizedError);
      }
      await this.fail(
        normalizedError,
        "failed",
        "provider_error",
        "connect_failure",
      );
      throw normalizedError;
    } finally {
      this.clearConnectTimeout();
    }
  }

  public end(
    outcome?: OpenAIWebRtcCallOutcome,
    terminationSource?: TerminationSource,
  ): Promise<void> {
    return this.finalize(
      outcome === "failed" ||
        outcome === "network_lost" ||
        outcome === "orphaned"
        ? "failed"
        : "ended",
      undefined,
      outcome,
      "provider_error",
      terminationSource ?? (outcome === undefined ? "user" : "provider_error"),
    );
  }

  public cleanup(): Promise<void> {
    return this.finalize(
      "ended",
      undefined,
      undefined,
      "provider_error",
      "unmount",
    );
  }

  public async retryPlayback(): Promise<boolean> {
    return this.playRemoteAudio();
  }

  public setMute(muted: boolean): void {
    this.muted = muted || this.shutdownRequested;
    this.applyLocalTrackState();
  }

  public setHold(held: boolean): void {
    const relativeNow = this.getRelativeSessionTimeMs();
    this.holdTracker = held
      ? startHold(this.holdTracker, relativeNow)
      : endHold(this.holdTracker, relativeNow);
    this.held = this.holdTracker.active !== null;
    this.applyLocalTrackState();
    this.deps.audioElement.muted = this.held;
    this.interruptionController.setHeld(this.held);
    if (!this.held && this.remoteStream) {
      void this.playRemoteAudio();
    }
  }

  public sendControlEvent(event: OpenAIWebRtcControlEvent): boolean {
    if (!isSafeControlEvent(event)) return false;
    if (
      this.shutdownRequested ||
      this.dataChannel?.readyState !== "open" ||
      !this.dataChannel.send
    ) {
      return false;
    }
    const controlKind: OpenAIInterruptionControlKind | undefined =
      event.type === "response.cancel" ||
      event.type === "output_audio_buffer.clear" ||
      event.type === "conversation.item.truncate"
        ? event.type
        : undefined;
    const shouldCorrelateError = controlKind !== undefined;
    const eventId =
      shouldCorrelateError && !event.event_id
        ? `telefun-webrtc-control-${++this.openAiControlSequence}`
        : event.event_id;
    const outbound = eventId ? { ...event, event_id: eventId } : event;
    try {
      this.dataChannel.send(JSON.stringify(outbound));
      if (shouldCorrelateError && eventId) {
        this.rememberOpenAiLifecycleId(
          this.openAiSentInterruptionEventIds,
          eventId,
          { kind: controlKind },
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  public isRecoverableControlError(event: OpenAIWebRtcEvent): boolean {
    if (event.kind !== "event" || event.type !== "error") return false;
    const error = isRecordValue(event.payload.error)
      ? event.payload.error
      : null;
    const eventId = stringValue(error?.event_id);
    if (!eventId) {
      return false;
    }
    const correlation = this.openAiSentInterruptionEventIds.get(eventId);
    if (!correlation) return false;

    // Every correlated provider error settles its bounded correlation state.
    // Recovery is limited to two exact, benign interruption races: a response
    // can finish before cancel is handled, or buffer clear can advance provider
    // state before the following explicit item truncate is handled.
    this.openAiSentInterruptionEventIds.delete(eventId);
    if (error?.type !== "invalid_request_error") return false;
    return (
      (correlation.kind === "response.cancel" &&
        error.code === "response_cancel_not_active") ||
      (correlation.kind === "conversation.item.truncate" &&
        error.code === "item_truncate_invalid_item_id")
    );
  }

  private applyLocalTrackState(): void {
    const enabled = !this.muted && !this.held;
    for (const track of this.localTracks) {
      if ("enabled" in track) track.enabled = enabled;
    }
  }

  private bindLocalTrackHandler(track: OpenAIWebRtcTrackLike): void {
    track.onended = () => {
      if (this.shutdownRequested) return;
      this.handleAsyncFailure(
        createCodedError("Microphone track ended.", "device_unplugged"),
        "device_unplugged",
        "microphone_ended",
      );
    };
  }

  private validateConfig(): void {
    if (!this.config.accessToken.trim()) {
      throw new Error("Access token is required.");
    }
    if (!isUuid(this.config.sessionId)) {
      throw new Error("Session ID must be a UUID.");
    }
    buildOpenAIWebRtcBrokerCallUrl(
      this.config.brokerHttpBaseUrl,
      this.config.sessionId,
    );
    if (this.config.requireSecureTransport) {
      const brokerUrl = new URL(this.config.brokerHttpBaseUrl);
      if (brokerUrl.protocol !== "https:") {
        throw new Error("OpenAI WebRTC broker must use HTTPS.");
      }
    }
  }

  private bindPeerHandlers(peer: OpenAIWebRtcPeerConnectionLike): void {
    peer.ontrack = (event) => {
      if (this.shutdownRequested) {
        // Keep a late receiver track owned by cleanup; ending must not stop
        // media before the broker has durably terminalized the attempt.
        this.remoteTracks.add(event.track);
        return;
      }
      try {
        if (this.remoteTracks.has(event.track)) return;
        this.remoteTracks.add(event.track);
        const providedStream = event.streams[0];
        if (!this.remoteStream && providedStream) {
          this.remoteStream = providedStream;
        } else if (
          this.remoteStream?.addTrack &&
          !this.remoteStream.getTracks().includes(event.track)
        ) {
          this.remoteStream.addTrack(event.track);
        } else if (!this.remoteStream) {
          this.remoteStream = this.createRemoteStream(
            Array.from(this.remoteTracks),
          );
        }

        if (!this.remoteStream) {
          throw new Error("Remote WebRTC stream is unavailable.");
        }
        event.track.onended = () =>
          this.interruptionController.setPlaybackActive(false);
        this.recordingGraph?.attachRemoteStream(this.remoteStream);
        this.deps.audioElement.srcObject = this
          .remoteStream as unknown as MediaProvider;
        this.interruptionController.attachRemoteMedia();
        void this.playRemoteAudio();
      } catch (error) {
        this.handleAsyncFailure(
          error instanceof Error
            ? error
            : new Error("Remote audio setup failed."),
        );
      }
    };

    peer.onconnectionstatechange = () => {
      if (this.shutdownRequested) {
        return;
      }
      if (peer.connectionState === "connected") {
        this.markPeerConnected();
        return;
      }
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected" ||
        peer.connectionState === "closed"
      ) {
        this.handleAsyncFailure(
          new Error("Peer connection failed."),
          "network_lost",
          "peer_state",
        );
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (this.shutdownRequested) {
        return;
      }
      if (peer.iceConnectionState === "failed") {
        this.handleAsyncFailure(
          new Error("ICE connection failed."),
          "network_lost",
          "ice_state",
        );
      }
    };
  }

  private bindDataChannelHandlers(channel: OpenAIWebRtcDataChannelLike): void {
    channel.onmessage = (event: DataChannelMessageEvent) => {
      try {
        const parsed = parseOpenAIWebRtcDataChannelMessage(event.data);
        this.notify(this.deps.onEvent, parsed);
        this.handleDataChannelEvent(parsed);
      } catch (error) {
        this.handleAsyncFailure(
          error instanceof Error
            ? error
            : new Error("Data channel event handling failed."),
        );
      }
    };

    channel.onclose = () => {
      if (this.shutdownRequested) {
        return;
      }
      this.handleAsyncFailure(
        new Error("Data channel closed."),
        "network_lost",
        "data_channel_close",
      );
    };
  }

  private handleDataChannelEvent(event: OpenAIWebRtcEvent): void {
    if (event.kind !== "event") return;
    if (event.type === "input_audio_buffer.speech_started") {
      this.recordSpeechStarted();
    } else if (event.type === "input_audio_buffer.speech_stopped") {
      this.recordSpeechStopped();
    }
    this.interruptionController.handleProviderEvent(event);
  }

  private recordSpeechStarted(): void {
    if (this.currentSpeechSegmentStartMs === null) {
      this.currentSpeechSegmentStartMs = this.getRelativeSessionTimeMs();
    }
  }

  private recordSpeechStopped(): void {
    if (this.currentSpeechSegmentStartMs === null) return;
    const endMs = this.getRelativeSessionTimeMs();
    const durationMs = Math.max(0, endMs - this.currentSpeechSegmentStartMs);
    if (durationMs > 200) {
      this.speechSegments.push({
        startMs: this.currentSpeechSegmentStartMs,
        endMs,
        durationMs,
      });
      this.totalSpeakingMs += durationMs;
    }
    this.currentSpeechSegmentStartMs = null;
  }

  private finalizeSpeechSegment(sessionEndMs: number): void {
    if (this.currentSpeechSegmentStartMs === null) return;
    const durationMs = Math.max(
      0,
      sessionEndMs - this.currentSpeechSegmentStartMs,
    );
    if (durationMs > 200) {
      this.speechSegments.push({
        startMs: this.currentSpeechSegmentStartMs,
        endMs: sessionEndMs,
        durationMs,
      });
      this.totalSpeakingMs += durationMs;
    }
    this.currentSpeechSegmentStartMs = null;
  }

  private getRelativeSessionTimeMs(): number {
    return this.sessionStartTime
      ? Math.max(0, Date.now() - this.sessionStartTime)
      : 0;
  }

  private rememberOpenAiLifecycleId(
    store: Map<string, OpenAIInterruptionControlCorrelation>,
    value: string,
    correlation: OpenAIInterruptionControlCorrelation,
  ): boolean {
    if (store.has(value)) return true;
    if (store.size >= 4_096) return false;
    store.set(value, correlation);
    return true;
  }

  private warnConnectStage(
    stage: ConnectErrorStage | "broker_request_started" | "broker_response",
    error?: unknown,
  ): void {
    const value =
      error && typeof error === "object"
        ? (error as { name?: unknown; code?: unknown; message?: unknown })
        : undefined;
    try {
      console.warn({
        stage,
        name: typeof value?.name === "string" ? value.name : undefined,
        code: typeof value?.code === "string" ? value.code : undefined,
        message: getSafeConnectDiagnosticMessage(value?.message),
      });
    } catch {
      // Observability must never block connect failure handling.
    }
  }

  private setState(state: OpenAIWebRtcState): void {
    if (this._state === state) {
      return;
    }
    this._state = state;
    this.notify(this.deps.onStateChange, state);
  }

  private notify<T>(
    callback: ((value: T) => void) | undefined,
    value: T,
  ): void {
    try {
      callback?.(value);
    } catch {
      /* consumer callbacks are observers, never lifecycle authorities */
    }
  }

  private notifyError(error: Error): void {
    this.notify(this.deps.onError, error);
  }

  private async playRemoteAudio(): Promise<boolean> {
    if (!this.remoteStream || this.shutdownRequested || this.held) return false;
    try {
      await this.deps.audioElement.play();
      this.playbackBlocked = false;
      this.interruptionController.setPlaybackActive(true);
      return true;
    } catch {
      this.interruptionController.setPlaybackActive(false);
      if (!this.playbackBlocked) {
        this.playbackBlocked = true;
        this.notify(this.deps.onPlaybackBlocked, undefined);
      }
      return false;
    }
  }

  private startConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimeoutId = setTimeout(() => {
      this.handleAsyncFailure(
        new Error("WebRTC connection timed out."),
        "provider_error",
        "connect_timeout",
      );
    }, this.connectTimeoutMs);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  private assertActive(): void {
    if (this.shutdownRequested) {
      throw this.createShutdownError();
    }
  }

  private createShutdownError(): Error {
    return new Error("WebRTC session was shut down.");
  }

  private waitForPeerConnected(
    peer: OpenAIWebRtcPeerConnectionLike,
  ): Promise<void> {
    if (peer.connectionState === "connected") {
      this.markPeerConnected();
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.peerConnectedResolve = resolve;
      this.peerConnectedReject = reject;
      if (peer.connectionState === "connected") {
        this.markPeerConnected();
      }
    });
  }

  private markPeerConnected(): void {
    this.hasConnected = true;
    this.setState("connected");
    this.peerConnectedResolve?.();
    this.peerConnectedResolve = null;
    this.peerConnectedReject = null;
  }

  private handleAsyncFailure(
    error: Error,
    cause: WebRtcRecoveryCause = "provider_error",
    terminationSource: TerminationSource = "provider_error",
  ): void {
    void this.fail(
      error,
      cause === "provider_error" ? "failed" : "network_lost",
      cause,
      terminationSource,
    ).catch(() => {
      /* fail is best effort and must never become an unhandled rejection */
    });
  }

  private async fail(
    error: Error,
    outcome: OpenAIWebRtcCallOutcome = "failed",
    cause: WebRtcRecoveryCause = "provider_error",
    terminationSource?: TerminationSource,
  ): Promise<void> {
    await this.finalize("failed", error, outcome, cause, terminationSource);
  }

  private finalize(
    terminalState: TerminalState,
    failureError?: Error,
    cleanupOutcome?: OpenAIWebRtcCallOutcome,
    recoveryCause: WebRtcRecoveryCause = "provider_error",
    terminationSource?: TerminationSource,
  ): Promise<void> {
    if (this.finalizationPromise) {
      return this.finalizationPromise;
    }

    const wasConnected = this.hasConnected;
    if (!this.requestedTerminalState) {
      this.requestedTerminalState = terminalState;
    }
    const requestedTerminalState = this.requestedTerminalState;
    // Capture pre-terminal evidence before any state mutation so the
    // observability log stays truthful about where the session was.
    const preTerminalState = this._state;
    const preTerminalStage = this.hasConnected
      ? "connected"
      : (this.connectStageField ?? this._state);
    if (this._state !== "ended" && this._state !== "failed") {
      this.setState("ending");
    }
    if (requestedTerminalState === "failed") {
      this.failureError =
        failureError ??
        this.failureError ??
        new Error("WebRTC session failed.");
      this.brokerCleanupOutcome = cleanupOutcome ?? "failed";
    } else if (this._state !== "failed") {
      if (this._state !== "ending") {
        this.setState("ending");
      }
      if (!wasConnected && this.brokerCleanupOutcome === undefined) {
        this.brokerCleanupOutcome = "failed";
      }
    }

    this.brokerCleanupRequested = true;
    this.shutdownRequested = true;
    this.clearConnectTimeout();
    this.abortController?.abort();
    this.peerConnectedReject?.(
      this.failureError ?? new Error("WebRTC session ended."),
    );
    this.peerConnectedResolve = null;
    this.peerConnectedReject = null;

    // Stop sending microphone audio, but keep every graph, track, peer, and
    // remote stream alive until durable server termination and recording have
    // completed. This ordering is the WebRTC recording contract.
    this.muted = true;
    this.applyLocalTrackState();

    if (this.failureError && !this.failureReported) {
      this.failureReported = true;
      this.notifyError(this.failureError);
    }

    const outcome: OpenAIWebRtcCallOutcome | undefined =
      this.brokerCleanupOutcome;

    if (this.terminationSource === null) {
      this.terminationSource =
        terminationSource ??
        (terminalState === "ended" ? "user" : "provider_error");
      try {
        // One bounded client-side log at the first terminalization owner,
        // before the broker DELETE is issued. Observability only; never
        // lifecycle.
        console.warn("[Telefun] OpenAI WebRTC termination", {
          terminationSource: this.terminationSource,
          stage: preTerminalStage,
          state: preTerminalState,
          hasConnected: this.hasConnected,
          peerState: this.peer?.connectionState ?? null,
          iceState: this.peer?.iceConnectionState ?? null,
          dataChannelState: this.dataChannel?.readyState ?? null,
          requestedOutcome: this.brokerCleanupOutcome,
        });
      } catch {
        // Loggers are observers, never lifecycle authorities.
      }
    }

    const finalizationPromise = (async () => {
      await this.requestBrokerDelete(outcome);
      await this.finalizeRecording();
      await this.cleanupResources();
      this.setState(requestedTerminalState);
      if (
        this.brokerCleanupOutcome === "network_lost" &&
        !this.recoveryNotified
      ) {
        this.recoveryNotified = true;
        this.notify(
          this.deps.onRecoveryRequired,
          buildWebRtcRecoveryPlan({
            sessionId: this.config.sessionId,
            cause:
              recoveryCause === "provider_error"
                ? "network_lost"
                : recoveryCause,
          }),
        );
      }
    })();
    this.finalizationPromise = finalizationPromise;
    void finalizationPromise.catch(() => {
      if (this.finalizationPromise === finalizationPromise) {
        this.finalizationPromise = null;
      }
    });

    return finalizationPromise;
  }

  private requestBrokerDelete(
    outcome?: OpenAIWebRtcCallOutcome,
  ): Promise<void> {
    this.brokerCleanupRequested = true;
    if (
      outcome === "failed" ||
      outcome === "network_lost" ||
      outcome === "orphaned"
    ) {
      this.brokerCleanupOutcome = outcome;
    }
    if (this.brokerCallDeleted) {
      return Promise.resolve();
    }
    if (this.brokerDeletePromise) {
      return this.brokerDeletePromise;
    }

    this.brokerDeletePromise = this.deleteBrokerCall(
      this.brokerCleanupOutcome,
    ).then(
      () => {
        this.brokerCallDeleted = true;
        try {
          this.deps.onCleanupConfirmed?.();
        } catch {
          /* cleanup confirmation observers never control finalization */
        }
      },
      (error: unknown) => {
        this.brokerDeletePromise = null;
        this.notifyError(new Error("OpenAI WebRTC cleanup request failed."));
        throw error;
      },
    );
    return this.brokerDeletePromise;
  }

  private async deleteBrokerCall(
    outcome?: OpenAIWebRtcCallOutcome,
  ): Promise<void> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error("OpenAI WebRTC cleanup timed out."));
      }, this.deleteTimeoutMs);
    });

    try {
      await Promise.race([
        deleteOpenAIWebRtcBrokerCall({
          fetch: this.deps.fetch,
          brokerHttpBaseUrl: this.config.brokerHttpBaseUrl,
          sessionId: this.config.sessionId,
          accessToken: this.config.accessToken,
          outcome,
          signal: controller.signal,
        }),
        timeout,
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async finalizeRecording(): Promise<void> {
    const graph = this.recordingGraph;
    let result: OpenAIWebRtcRecordingResult;
    try {
      result = graph
        ? await graph.stop()
        : { fullBlob: null, agentBlob: null, recordingError: null };
    } catch (error) {
      result = {
        fullBlob: null,
        agentBlob: null,
        recordingError:
          error instanceof Error
            ? error
            : new Error("WebRTC recording stop failed."),
      };
    }
    const url = graph?.createFullObjectUrl(result.fullBlob) ?? null;
    const metrics = this.buildSessionMetrics();
    let callbackResult: { retainObjectUrl?: boolean } | void = undefined;
    let callbackTimedOut = false;
    let callbackTimedOutWithPageOwner = false;

    if (this.deps.onRecordingComplete) {
      const timeoutMarker = Symbol("recording-callback-timeout");
      const callbackPromise = Promise.resolve().then(() =>
        this.deps.onRecordingComplete!(
          url,
          result.fullBlob,
          result.agentBlob,
          metrics,
          graph && !result.recordingError ? "ready" : "failed",
        ),
      );
      // A callback may finish after the bounded lifecycle wait and publish a
      // fallback owner. Keep the URL alive until that callback settles; the
      // continuation below performs the eventual single ownership decision.
      void callbackPromise.then(
        (lateResult) => {
          if (!callbackTimedOut) return;
          // The page owner is responsible for abandonment after navigation.
          // If it already released this URL, the late callback must not revoke
          // the same URL a second time.
          if (callbackTimedOutWithPageOwner && !this.isObjectUrlRetained(url)) {
            return;
          }
          this.reconcileObjectUrl(url, lateResult, graph);
        },
        () => {
          if (!callbackTimedOut) return;
          this.notifyError(new Error("WebRTC recording callback failed."));
          if (callbackTimedOutWithPageOwner && !this.isObjectUrlRetained(url)) {
            return;
          }
          this.reconcileObjectUrl(url, undefined, graph);
        },
      );

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        callbackResult = await Promise.race([
          callbackPromise,
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(timeoutMarker),
              RECORDING_CALLBACK_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (error) {
        if (error === timeoutMarker) {
          callbackTimedOut = true;
          callbackTimedOutWithPageOwner = this.isObjectUrlRetained(url);
          this.notifyError(new Error("WebRTC recording callback timed out."));
        } else {
          callbackResult = { retainObjectUrl: true };
          this.notifyError(
            error instanceof Error
              ? error
              : new Error("WebRTC recording callback failed."),
          );
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      if (callbackTimedOut) return;
    }

    this.reconcileObjectUrl(url, callbackResult, graph);
  }

  private isObjectUrlRetained(url: string | null): boolean {
    if (!url) return false;
    try {
      return this.deps.isObjectUrlRetained?.(url) === true;
    } catch {
      return false;
    }
  }

  private reconcileObjectUrl(
    url: string | null,
    callbackResult: { retainObjectUrl?: boolean } | void,
    graph: OpenAIWebRtcRecordingGraph | null,
  ): void {
    const retainedByOwner =
      callbackResult?.retainObjectUrl === true && this.isObjectUrlRetained(url);
    if (!retainedByOwner) graph?.revokeObjectUrl(url);
  }

  private buildSessionMetrics(): SessionMetrics {
    const sessionDurationMs = this.sessionStartTime
      ? Math.max(0, Date.now() - this.sessionStartTime)
      : 0;
    this.finalizeSpeechSegment(sessionDurationMs);
    this.holdTracker = finalizeActiveHold(this.holdTracker, sessionDurationMs);
    const volumeSamples = this.recordingGraph?.getVolumeSamples() ?? [];
    return {
      speechSegments: this.speechSegments,
      totalSpeakingMs: this.totalSpeakingMs,
      totalSilenceMs: Math.max(0, sessionDurationMs - this.totalSpeakingMs),
      deadAirCount: 0,
      interruptionCount: this.interruptionController.interruptionCount,
      volumeSamples,
      volumeConsistency: calculateRecordingVolumeConsistency(volumeSamples),
      inputTranscriptionChunks: [],
      sessionDurationMs,
      hold: summarizeHoldMetrics(this.holdTracker),
    };
  }

  private createRemoteStream(
    tracks: OpenAIWebRtcTrackLike[],
  ): OpenAIWebRtcStreamLike {
    if (this.deps.mediaStreamFactory) {
      return this.deps.mediaStreamFactory(tracks);
    }
    if (typeof MediaStream === "undefined") {
      throw new Error("Browser MediaStream is unavailable.");
    }
    return new MediaStream(
      tracks as unknown as MediaStreamTrack[],
    ) as unknown as OpenAIWebRtcStreamLike;
  }

  private async cleanupResources(): Promise<void> {
    this.detachHandlers();
    await this.recordingGraph?.dispose();
    this.recordingGraph = null;
    closeDataChannelOnce(this.dataChannel);
    closePeerConnectionOnce(this.peer);
    if (this.localStream) {
      stopTracksOnce(this.localStream.getTracks());
    } else {
      stopTracksOnce(this.localTracks);
    }
    stopTracksOnce(this.remoteTracks);
    for (const track of this.remoteTracks) track.onended = null;
    this.interruptionController.cleanup();
    this.openAiSentInterruptionEventIds.clear();
    try {
      clearAudioElement(this.deps.audioElement);
    } catch {
      /* best-effort media cleanup */
    }
    this.localTracks.clear();
    this.remoteTracks.clear();
    this.notify(this.deps.onLocalStream, null);
    this.playbackBlocked = false;
    this.deps.audioElement.muted = false;
    this.dataChannel = null;
    this.peer = null;
    this.localStream = null;
    this.remoteStream = null;
  }

  private detachHandlers(): void {
    if (this.peer) {
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      this.peer.oniceconnectionstatechange = null;
    }
    if (this.dataChannel) {
      this.dataChannel.onmessage = null;
      this.dataChannel.onclose = null;
    }
  }
}
