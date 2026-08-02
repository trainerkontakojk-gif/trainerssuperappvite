import type { SessionMetrics } from "@trainers/types";
import {
  OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS,
  OPENAI_WEBRTC_DEFAULT_TIMEOUT_MS,
  OPENAI_WEBRTC_DATA_CHANNEL_LABEL,
  type OpenAIWebRtcCallOutcome,
  type OpenAIWebRtcControlEvent,
  type OpenAIWebRtcDataChannelLike,
  type OpenAIWebRtcDependencies,
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
import {
  calculateRecordingVolumeConsistency,
  OpenAIWebRtcRecordingGraph,
  type OpenAIWebRtcRecordingResult,
} from "./recording";
import {
  buildWebRtcRecoveryPlan,
  type WebRtcRecoveryCause,
} from "./recovery-policy";

type DataChannelMessageEvent = { data: string };
type TerminalState = "ended" | "failed";
const RECORDING_CALLBACK_TIMEOUT_MS = 10_000;

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
  private _state: OpenAIWebRtcState = "idle";

  constructor(
    private readonly config: OpenAIWebRtcSessionConfig,
    private readonly deps: OpenAIWebRtcDependencies,
  ) {
    this.connectTimeoutMs =
      config.connectTimeoutMs ?? OPENAI_WEBRTC_DEFAULT_TIMEOUT_MS;
    this.deleteTimeoutMs =
      config.deleteTimeoutMs ?? OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS;
  }

  get state(): OpenAIWebRtcState {
    return this._state;
  }

  public async connect(): Promise<void> {
    this.validateConfig();
    if (this._state !== "idle") {
      throw new Error("WebRTC session is already running.");
    }

    try {
      this.setState("acquiring_media");
      const localStream = await this.deps.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
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

      this.setState("creating_offer");
      const peer = this.peer;
      if (!peer) {
        throw this.createShutdownError();
      }
      const offer = await peer.createOffer();
      this.assertActive();
      await peer.setLocalDescription(offer);
      this.assertActive();

      if (!offer.sdp) {
        throw new Error("Browser offer SDP is missing.");
      }

      this.setState("brokering_sdp");
      this.abortController = new AbortController();
      this.startConnectTimeout();
      this.setState("connecting");
      this.assertActive();

      const { answerSdp } = await createOpenAIWebRtcBrokerCall({
        fetch: this.deps.fetch,
        brokerHttpBaseUrl: this.config.brokerHttpBaseUrl,
        sessionId: this.config.sessionId,
        accessToken: this.config.accessToken,
        offerSdp: offer.sdp,
        signal: this.abortController.signal,
        onBrokerResponse: () => {
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
      });

      this.assertActive();
      const activePeer = this.peer;
      if (!activePeer) {
        throw this.createShutdownError();
      }
      await activePeer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
      this.assertActive();
      await this.waitForPeerConnected(activePeer);
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error("WebRTC connection failed.");
      await this.fail(normalizedError);
      throw normalizedError;
    } finally {
      this.clearConnectTimeout();
    }
  }

  public end(outcome?: OpenAIWebRtcCallOutcome): Promise<void> {
    return this.finalize(
      outcome === "failed" ||
        outcome === "network_lost" ||
        outcome === "orphaned"
        ? "failed"
        : "ended",
      undefined,
      outcome,
    );
  }

  public cleanup(): Promise<void> {
    return this.finalize("ended");
  }

  public async retryPlayback(): Promise<boolean> {
    return this.playRemoteAudio();
  }

  public setMute(muted: boolean): void {
    this.muted = muted || this.shutdownRequested;
    this.applyLocalTrackState();
  }

  public setHold(held: boolean): void {
    this.held = held;
    this.applyLocalTrackState();
    this.deps.audioElement.muted = held;
  }

  public sendControlEvent(event: OpenAIWebRtcControlEvent): boolean {
    if (
      this.shutdownRequested ||
      this.dataChannel?.readyState !== "open" ||
      !this.dataChannel.send
    ) {
      return false;
    }
    this.dataChannel.send(JSON.stringify(event));
    return true;
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
        new Error("Microphone track ended."),
        "device_unplugged",
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
        this.recordingGraph?.attachRemoteStream(this.remoteStream);
        this.deps.audioElement.srcObject = this
          .remoteStream as unknown as MediaProvider;
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
        );
      }
    };
  }

  private bindDataChannelHandlers(channel: OpenAIWebRtcDataChannelLike): void {
    channel.onmessage = (event: DataChannelMessageEvent) => {
      try {
        const parsed = parseOpenAIWebRtcDataChannelMessage(event.data);
        this.notify(this.deps.onEvent, parsed);
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
      );
    };
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
    if (!this.remoteStream || this.shutdownRequested) return false;
    try {
      await this.deps.audioElement.play();
      this.playbackBlocked = false;
      return true;
    } catch {
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
      this.handleAsyncFailure(new Error("WebRTC connection timed out."));
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
  ): void {
    void this.fail(
      error,
      cause === "provider_error" ? "failed" : "network_lost",
      cause,
    ).catch(() => {
      /* fail is best effort and must never become an unhandled rejection */
    });
  }

  private async fail(
    error: Error,
    outcome: OpenAIWebRtcCallOutcome = "failed",
    cause: WebRtcRecoveryCause = "provider_error",
  ): Promise<void> {
    await this.finalize("failed", error, outcome, cause);
  }

  private finalize(
    terminalState: TerminalState,
    failureError?: Error,
    cleanupOutcome?: OpenAIWebRtcCallOutcome,
    recoveryCause: WebRtcRecoveryCause = "provider_error",
  ): Promise<void> {
    if (this.finalizationPromise) {
      return this.finalizationPromise;
    }

    const wasConnected = this.hasConnected;
    if (!this.requestedTerminalState) {
      this.requestedTerminalState = terminalState;
    }
    const requestedTerminalState = this.requestedTerminalState;
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
    const volumeSamples = this.recordingGraph?.getVolumeSamples() ?? [];
    return {
      speechSegments: [],
      totalSpeakingMs: 0,
      totalSilenceMs: sessionDurationMs,
      deadAirCount: 0,
      interruptionCount: 0,
      volumeSamples,
      volumeConsistency: calculateRecordingVolumeConsistency(volumeSamples),
      inputTranscriptionChunks: [],
      sessionDurationMs,
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
