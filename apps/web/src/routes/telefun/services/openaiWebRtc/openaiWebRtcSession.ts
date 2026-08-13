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
} from "./brokerApi";
import { deleteOpenAIWebRtcBrokerCallWithTimeout } from "./brokerCleanup";
import {
  clearAudioElement,
  closeDataChannelOnce,
  closePeerConnectionOnce,
  createOpenAIWebRtcRemoteStream,
  getTracksFromStream,
  stopTracksOnce,
} from "./cleanup";
import { parseOpenAIWebRtcDataChannelMessage } from "./events";
import { OpenAIWebRtcInterruptionController } from "./interruptionController";
import { OpenAIWebRtcResponseCreateController } from "./responseCreateController";
import {
  createOpenAIWebRtcCodedError as createCodedError,
  wrapOpenAIWebRtcCodedError as wrapCodedError,
  warnOpenAIWebRtcConnectStage,
  type OpenAIWebRtcConnectStage as ConnectErrorStage,
} from "./connectDiagnostics";
import { OpenAIWebRtcRecordingGraph } from "./recording";
import { finalizeOpenAIWebRtcRecording } from "./recordingFinalizer";
import {
  buildWebRtcRecoveryPlan,
  type WebRtcRecoveryCause,
} from "./recovery-policy";
import { OpenAIWebRtcSessionMetricsTracker } from "./sessionMetricsTracker";

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
type OpenAIInterruptionControlKind =
  | "response.cancel"
  | "output_audio_buffer.clear";

type OpenAIInterruptionControlCorrelation = {
  kind: OpenAIInterruptionControlKind;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getResponseIdFromEvent(event: OpenAIWebRtcEvent): string | undefined {
  if (event.kind !== "event") return undefined;
  const response = isRecordValue(event.payload.response)
    ? event.payload.response
    : null;
  return stringValue(event.payload.response_id) ?? stringValue(response?.id);
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
  private hasConnected = false;
  private recoveryNotified = false;
  private openAiSentInterruptionEventIds = new Map<
    string,
    OpenAIInterruptionControlCorrelation
  >();
  private openAiControlSequence = 0;
  private readonly metricsTracker = new OpenAIWebRtcSessionMetricsTracker();
  private readonly interruptionController: OpenAIWebRtcInterruptionController;
  private readonly responseCreateController: OpenAIWebRtcResponseCreateController;
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
    this.responseCreateController = new OpenAIWebRtcResponseCreateController({
      canSendControlEvent: () => this.canSendControlEvent(),
      hasInProgressResponse: () =>
        this.interruptionController.hasInProgressResponse,
      sendControlEventDirect: (event) => this.sendControlEventDirect(event),
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
      this.metricsTracker.start();
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
          warnOpenAIWebRtcConnectStage("broker_request_started"),
        onBrokerResponse: () => {
          warnOpenAIWebRtcConnectStage("broker_response");
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
        warnOpenAIWebRtcConnectStage(connectStage, normalizedError);
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
    this.held = this.metricsTracker.setHeld(held);
    this.applyLocalTrackState();
    this.deps.audioElement.muted = this.held;
    this.interruptionController.setHeld(this.held);
    if (!this.held && this.remoteStream) {
      void this.playRemoteAudio();
    }
  }

  public sendControlEvent(event: OpenAIWebRtcControlEvent): boolean {
    if (!isSafeControlEvent(event)) return false;
    if (event.type === "response.create") {
      return this.responseCreateController.send(event);
    }
    return this.sendControlEventDirect(event);
  }

  private canSendControlEvent(): boolean {
    return Boolean(
      !this.shutdownRequested &&
      this.dataChannel?.readyState === "open" &&
      this.dataChannel.send,
    );
  }

  private sendControlEventDirect(event: OpenAIWebRtcControlEvent): boolean {
    const dataChannel = this.dataChannel;
    if (
      this.shutdownRequested ||
      dataChannel?.readyState !== "open" ||
      !dataChannel.send
    ) {
      return false;
    }
    const controlKind: OpenAIInterruptionControlKind | undefined =
      event.type === "response.cancel" ||
      event.type === "output_audio_buffer.clear"
        ? event.type
        : undefined;
    const shouldCorrelateError = controlKind !== undefined;
    const eventId =
      shouldCorrelateError && !event.event_id
        ? `telefun-webrtc-control-${++this.openAiControlSequence}`
        : event.event_id;
    const outbound = eventId ? { ...event, event_id: eventId } : event;
    try {
      dataChannel.send(JSON.stringify(outbound));
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
    // Recovery is limited to the exact benign race where a response finishes
    // before its correlated cancel is handled. WebRTC output-buffer clear owns
    // transcript truncation, so no explicit item-truncate race exists here.
    this.openAiSentInterruptionEventIds.delete(eventId);
    if (error?.type !== "invalid_request_error") return false;
    return (
      correlation.kind === "response.cancel" &&
      error.code === "response_cancel_not_active"
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
          this.remoteStream = createOpenAIWebRtcRemoteStream(
            Array.from(this.remoteTracks),
            this.deps.mediaStreamFactory,
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
    if (this.shutdownRequested || event.kind !== "event") return;

    const terminalResponseId =
      event.type === "response.done" || event.type === "response.cancelled"
        ? getResponseIdFromEvent(event)
        : undefined;
    const responseWasInProgress = terminalResponseId
      ? this.interruptionController.isResponseInProgress(terminalResponseId)
      : false;

    if (event.type === "input_audio_buffer.speech_started") {
      this.metricsTracker.recordSpeechStarted();
    } else if (event.type === "input_audio_buffer.speech_stopped") {
      this.metricsTracker.recordSpeechStopped();
    }
    this.responseCreateController.handleInputEvent(event);

    this.interruptionController.handleProviderEvent(event);
    if (event.type === "response.created") {
      this.responseCreateController.handleResponseCreated(event);
    } else if (
      (event.type === "response.done" || event.type === "response.cancelled") &&
      responseWasInProgress
    ) {
      this.responseCreateController.handleResponseTerminal(terminalResponseId);
      this.responseCreateController.flush();
    }
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
    this.invalidateResponseCreateBarriers();
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

    this.brokerDeletePromise = deleteOpenAIWebRtcBrokerCallWithTimeout({
      fetch: this.deps.fetch,
      brokerHttpBaseUrl: this.config.brokerHttpBaseUrl,
      sessionId: this.config.sessionId,
      accessToken: this.config.accessToken,
      outcome: this.brokerCleanupOutcome,
      timeoutMs: this.deleteTimeoutMs,
    }).then(
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

  private finalizeRecording(): Promise<void> {
    return finalizeOpenAIWebRtcRecording({
      graph: this.recordingGraph,
      deps: this.deps,
      buildMetrics: (volumeSamples) =>
        this.metricsTracker.build({
          volumeSamples,
          interruptionCount: this.interruptionController.interruptionCount,
        }),
      onError: (error) => this.notifyError(error),
    });
  }

  private invalidateResponseCreateBarriers(): void {
    this.responseCreateController.shutdown();
  }

  private async cleanupResources(): Promise<void> {
    this.invalidateResponseCreateBarriers();
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
