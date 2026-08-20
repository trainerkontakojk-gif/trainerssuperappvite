import type { TelefunAppSettings } from "../telefunSettings";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import type { SessionMetrics, SpeechSegment } from "@trainers/types";
import {
  createHoldTrackerState,
  startHold,
  endHold,
  finalizeActiveHold,
  getActiveHoldSnapshot,
  summarizeHoldMetrics,
  type HoldTrackerState,
} from "./holdMetrics";
import { LiveSessionDrain } from "./liveSessionDrain";
import {
  normalizeTelefunWebSocketUrl,
  mapTelefunCloseEvent,
  buildTelefunLiveSetupMessage,
  buildRealtimeAudioMessage,
  buildSessionEndRequest,
  buildAudioStreamEndMessage,
  buildTelefunAuthMessage,
  shouldSendRealtimeAudio,
  extractGeminiInlineAudioChunks,
  processInputAudioFrame,
  TELEFUN_CLIENT_CLOSE_CODE,
  TELEFUN_CLIENT_CLOSE_REASON,
  shouldReportTelefunCloseError,
  getTelefunAudioConfiguration,
  buildTelefunSessionConfigure,
  buildOpenAiInputAudioAppend,
  buildOpenAiSystemInputItem,
  buildGeminiRealtimeTextMessage,
  buildOpenAiResponseCreate,
  buildOpenAiResponseCancel,
  buildOpenAiConversationItemTruncate,
  parseOpenAiRealtimeEvent,
} from "./liveProtocol";
import {
  buildTelefunLiveSystemInstruction,
  getTimeCueInstruction,
} from "./promptBuilder";
import { resolveVoiceForModel } from "../telefunVoiceRegistry";

interface WebkitAudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface OpenAiPlaybackSegment {
  responseId: string;
  itemId: string;
  start: number;
  end: number;
  source: AudioBufferSourceNode;
}

interface OpenAiPlaybackOwner {
  responseId?: string;
  itemId?: string;
}

export class LiveSession {
  private readonly audioConfiguration: ReturnType<
    typeof getTelefunAudioConfiguration
  >;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private agentMediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private agentRecordedChunks: Blob[] = [];
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private agentOnlyDestination: MediaStreamAudioDestinationNode | null = null;

  private isMuted: boolean = false;
  private isHeld: boolean = false;
  private nextStartTime: number = 0;
  private sessionStartTime: number = 0;
  private isAiSpeaking: boolean = false;
  private sessionState: TelefunSessionState = "idle";
  private isSetupComplete: boolean = false;
  private hasAuthenticated: boolean = false;
  private hasConfigured: boolean = false;
  private pendingGeminiSetup: ReturnType<
    typeof buildTelefunLiveSetupMessage
  > | null = null;

  // Playback source tracking — prevents AI audio overlap
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private pendingTurnCompletion: boolean = false;
  private hasSentFirstUserAudio: boolean = false;
  private hasReceivedFirstModelAudio: boolean = false;
  private openAiPlaybackSegments: OpenAiPlaybackSegment[] = [];
  private openAiActiveResponseId: string | null = null;
  private openAiPendingCompletionResponseId: string | null = null;
  private openAiTerminalResponseIds: Set<string> = new Set();
  private openAiInterruptedResponseKeys: Set<string> = new Set();
  private openAiTruncatedItems: Set<string> = new Set();

  // Volume Throttling
  private lastVolumeEmitMs: number = 0;
  private lastVolumeBucket: number = -1;
  private readonly MIN_VOLUME_EMIT_MS = 200;
  private readonly MAX_VOLUME_SAMPLES = 1000;

  // Setup Timeout
  private setupTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CONNECT_SETUP_TIMEOUT_MS = 15000;

  // Stalled Response Watchdog
  private stalledWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastModelActivityMs: number = 0;
  private readonly STALLED_RESPONSE_START_MS = 20000;
  private readonly STALLED_RESPONSE_MID_MS = 25000;
  private readonly RECORDING_FINALIZATION_TIMEOUT_MS = 10_000;

  private intentionalClose = false;
  private hasStoppedRecording = false;
  private hasCleanedUpAudio = false;
  private lastLocalError: Error | null = null;
  private disconnectPromise: Promise<void> | null = null;

  // Recording finalization promise ensures disconnect waits for onRecordingComplete.
  private recordingFinalizationPromise: Promise<void> = Promise.resolve();
  private resolveRecordingFinalization: (() => void) | null = null;

  // Callbacks
  public onStatusChange: (status: string) => void = () => {};
  public onStateChange: (state: TelefunSessionState) => void = () => {};
  public onError: (error: Error) => void = () => {};
  public onAiSpeaking: (speaking: boolean) => void = () => {};
  public onVolumeChange: (volume: number) => void = () => {};
  public onTimelineEvent: (event: TelefunTimelineEvent) => void = () => {};
  public onSessionCreated: (sessionId: string) => void = () => {};
  public onLocalStream: (stream: MediaStream | null) => void = () => {};
  public onPlaybackBlocked: () => void = () => {};
  public onRecordingComplete: (
    url: string | null,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: SessionMetrics,
  ) => void = () => {};

  // Metrics
  private speechSegments: SpeechSegment[] = [];
  private currentSpeechSegment: { startMs: number } | null = null;
  private totalSpeakingMs: number = 0;
  private totalSilenceMs: number = 0;
  private volumeSamples: number[] = [];
  private interruptionCount: number = 0;
  private deadAirCount: number = 0;
  private holdTracker: HoldTrackerState = createHoldTrackerState();

  constructor(private config: TelefunAppSettings) {
    this.audioConfiguration = getTelefunAudioConfiguration(
      config.telefunModelId,
    );
  }

  public async connect(accessToken: string) {
    if (this.config.telefunTransport === "openai-webrtc") {
      throw new Error(
        "Transport openai-webrtc harus menggunakan OpenAIWebRtcSession, bukan LiveSession.",
      );
    }

    try {
      this.setSessionState("connecting");
      this.onStatusChange("Menghubungkan...");

      if (!accessToken.trim()) {
        throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
      }

      // 1. Get User Media
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: this.audioConfiguration.inputSampleRateHz,
        },
      });
      this.onLocalStream(this.stream);

      // 2. Setup Audio Context
      const AudioContextCtor =
        window.AudioContext ||
        (window as WebkitAudioContextWindow).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Browser tidak mendukung AudioContext.");
      }
      this.audioContext = new AudioContextCtor({
        sampleRate: this.audioConfiguration.inputSampleRateHz,
      });

      // 3. Setup Recording
      this.setupRecorders();

      // 4. Setup Input Processing
      await this.setupInputProcessing();

      // 5. Connect WebSocket
      const wsBase = normalizeTelefunWebSocketUrl(
        import.meta.env.VITE_TELEFUN_WS_URL,
      );
      const wsUrl = new URL(wsBase);
      wsUrl.pathname = wsUrl.pathname.endsWith("/ws") ? wsUrl.pathname : "/ws";
      wsUrl.searchParams.delete("token");
      wsUrl.searchParams.delete("sessionId");
      console.log("[Telefun] WebSocket target:", {
        url: wsUrl.toString(),
        hasSessionId: Boolean(this.config.sessionId),
        transport: this.config.telefunTransport,
      });

      this.ws = new WebSocket(wsUrl.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.isSetupComplete = false;
        this.hasAuthenticated = false;
        this.hasConfigured = false;
        this.pendingGeminiSetup = null;
        this.hasSentFirstUserAudio = false;
        this.hasReceivedFirstModelAudio = false;
        this.lastModelActivityMs = Date.now();
        this.setSessionState("connecting");
        this.onStatusChange("Mengautentikasi sesi...");
        this.ws?.send(
          JSON.stringify(
            buildTelefunAuthMessage(accessToken, this.config.sessionId),
          ),
        );
        this.emitTimelineEvent("ws_open");
        this.startSetupTimeout();
        this.startStalledWatchdog();
      };

      this.ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.playPcm(
            new Uint8Array(event.data),
            this.audioConfiguration.outputSampleRateHz,
          );
        } else {
          try {
            const msg = JSON.parse(event.data);
            this.handleJsonMessage(msg);
          } catch {
            /* ignore */
          }
        }
      };

      this.ws.onerror = (_event) => {
        this.onError(new Error("WebSocket Error"));
      };

      this.ws.onclose = (event) => {
        this.clearSetupTimeout();
        this.stopStalledWatchdog();
        const mapped = mapTelefunCloseEvent(event);
        console.log("[Telefun] WebSocket closed:", {
          code: event.code,
          reason: event.reason,
          mapped,
        });
        this.setSessionState("ended");
        this.onStatusChange(
          mapped.severity === "normal" ? "Selesai" : "Terputus",
        );

        if (
          shouldReportTelefunCloseError({
            intentionalClose: this.intentionalClose,
            severity: mapped.severity,
          })
        ) {
          this.onError(this.lastLocalError ?? new Error(mapped.message));
        }

        this.stopRecordingOnce();
        this.cleanupAudio();
        this.emitTimelineEvent("ws_close", {
          code: event.code,
          reason: event.reason,
          severity: mapped.severity,
        });
      };
    } catch (err) {
      this.onError(err as Error);
    }
  }

  private handleJsonMessage(msg: any) {
    if (msg.type === "auth_ok") {
      if (this.intentionalClose) return;
      if (this.hasAuthenticated) return;
      if (
        typeof msg.sessionId !== "string" ||
        msg.sessionId.trim().length === 0
      ) {
        this.lastLocalError = new Error(
          "Server Telefun tidak mengembalikan session yang valid.",
        );
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.close(4001, "Invalid Authentication Response");
        } else {
          this.onError(this.lastLocalError);
        }
        return;
      }

      this.hasAuthenticated = true;
      this.config.sessionId = msg.sessionId;
      this.onSessionCreated(msg.sessionId);
      this.onStatusChange("Menyiapkan sesi suara...");
      this.sessionStartTime = Date.now();
      this.sendConfigure();
      this.emitTimelineEvent("auth_complete");
      return;
    }

    if (!this.hasAuthenticated) return;

    if (msg.type === "telefun_session_configured") {
      if (this.intentionalClose) return;
      if (this.hasConfigured) return;
      this.hasConfigured = true;
      if (this.config.telefunTransport === "openai-audio") {
        this.completeSetup();
      } else if (this.config.telefunTransport === "gemini-live") {
        this.sendSetup();
      }
      return;
    }

    if (!this.hasConfigured) return;

    if (this.config.telefunTransport === "openai-audio") {
      this.handleOpenAiMessage(msg);
      return;
    }
    if (this.config.telefunTransport !== "gemini-live") {
      return;
    }

    if (msg.type === "session_created" && msg.sessionId) {
      this.config.sessionId = msg.sessionId;
      this.onSessionCreated(msg.sessionId);
    }

    if (msg.setupComplete) {
      this.completeSetup();
    }

    if (msg.serverContent?.modelTurn?.parts) {
      if (this.pendingTurnCompletion) {
        this.stopActiveSources();
      }
      this.lastModelActivityMs = Date.now();
      this.setIsAiSpeaking(true);
      this.setSessionState("ai_speaking");
    }

    const chunks = extractGeminiInlineAudioChunks(
      msg,
      this.audioConfiguration.outputSampleRateHz,
    );
    for (const chunk of chunks) {
      this.playPcm(chunk.data, chunk.sampleRate);
      this.lastModelActivityMs = Date.now();
      if (!this.hasReceivedFirstModelAudio) {
        this.hasReceivedFirstModelAudio = true;
        this.emitTimelineEvent("first_model_audio_chunk");
      }
    }

    // Turn complete → defer isAiSpeaking(false) until queued sources drain
    if (msg.serverContent?.turnComplete) {
      this.pendingTurnCompletion = true;
      if (this.activeSources.size === 0) {
        this.setIsAiSpeaking(false);
        this.setSessionState("idle");
        this.pendingTurnCompletion = false;
      }
    }
    if (msg.type === "silence") {
      this.deadAirCount++;
    }
    if (msg.serverContent?.interrupted) {
      this.clearAiPlayback("server_interrupted");
      this.interruptionCount++;
      this.emitTimelineEvent("interrupted_received");
    }

    if (msg.type === "session_reconnecting") {
      this.lastModelActivityMs = Date.now();
      this.onStatusChange("Menyambung ulang...");
      this.emitTimelineEvent("session_reconnecting", {
        reason: msg.reason,
        code: msg.code,
        timeLeftSeconds: msg.timeLeftSeconds,
      });
    }

    if (msg.type === "session_resumed") {
      this.lastModelActivityMs = Date.now();
      this.onStatusChange("Tersambung");
      this.emitTimelineEvent("session_resumed");
    }
  }

  private handleOpenAiMessage(msg: unknown) {
    const event = parseOpenAiRealtimeEvent(msg);
    switch (event.kind) {
      case "session_created":
      case "session_updated":
      case "speech_stopped":
      case "transcript_delta":
      case "transcript_done":
        this.lastModelActivityMs = Date.now();
        return;
      case "response_created":
        if (event.responseId !== this.openAiActiveResponseId) {
          this.openAiActiveResponseId = event.responseId;
          this.pendingTurnCompletion = false;
          this.openAiPendingCompletionResponseId = null;
        }
        this.lastModelActivityMs = Date.now();
        return;
      case "audio_delta":
        if (event.responseId) {
          if (
            this.openAiActiveResponseId &&
            event.responseId !== this.openAiActiveResponseId
          ) {
            return;
          }
          this.openAiActiveResponseId = event.responseId;
        }
        this.lastModelActivityMs = Date.now();
        this.setIsAiSpeaking(true);
        this.setSessionState("ai_speaking");
        this.playPcm(event.data, event.sampleRate, {
          responseId: event.responseId,
          itemId: event.itemId,
        });
        if (!this.hasReceivedFirstModelAudio) {
          this.hasReceivedFirstModelAudio = true;
          this.emitTimelineEvent("first_model_audio_chunk");
        }
        return;
      case "turn_complete":
        if (!this.acceptOpenAiTerminalEvent(event.responseId)) return;
        if (event.status === "completed") {
          this.pendingTurnCompletion = true;
          this.openAiPendingCompletionResponseId = event.responseId;
          if (this.activeSources.size === 0) {
            this.finishOpenAiPlaybackCompletion();
          }
        } else {
          this.handleOpenAiInterruption(false, event.responseId);
        }
        return;
      case "speech_started":
        this.handleOpenAiInterruption(true, this.openAiActiveResponseId);
        return;
      case "response_cancelled":
        {
          const responseId = this.acceptOpenAiTerminalEvent(event.responseId);
          if (!responseId) return;
          this.handleOpenAiInterruption(false, responseId);
        }
        return;
      case "error":
        this.lastLocalError = new Error(event.message);
        this.onError(this.lastLocalError);
        return;
      case "unknown":
      case "invalid":
        return;
    }
  }

  private acceptOpenAiTerminalEvent(
    responseId: string | undefined,
  ): string | null {
    const resolvedResponseId = responseId ?? this.openAiActiveResponseId;
    if (
      !resolvedResponseId ||
      resolvedResponseId !== this.openAiActiveResponseId ||
      this.openAiTerminalResponseIds.has(resolvedResponseId)
    ) {
      return null;
    }
    this.openAiTerminalResponseIds.add(resolvedResponseId);
    return resolvedResponseId;
  }

  private handleOpenAiInterruption(
    sendCancel: boolean,
    responseId: string | null,
  ) {
    const playedSegment = this.selectOpenAiPlayedSegment();
    const hadActiveResponse = Boolean(
      responseId ||
      playedSegment ||
      this.activeSources.size > 0 ||
      this.isAiSpeaking,
    );
    const audioEndMs = playedSegment
      ? this.getOpenAiPlayedAudioEndMs(playedSegment)
      : 0;

    this.stopActiveSources();
    this.setIsAiSpeaking(false);
    this.setSessionState("idle");

    if (sendCancel && hadActiveResponse) {
      this.sendOpenAiEvent(buildOpenAiResponseCancel());
    }
    if (playedSegment && !this.openAiTruncatedItems.has(playedSegment.itemId)) {
      this.openAiTruncatedItems.add(playedSegment.itemId);
      this.sendOpenAiEvent(
        buildOpenAiConversationItemTruncate({
          itemId: playedSegment.itemId,
          audioEndMs,
        }),
      );
    }
    const interruptionKey =
      responseId ??
      playedSegment?.responseId ??
      playedSegment?.itemId ??
      "active";
    if (
      hadActiveResponse &&
      !this.openAiInterruptedResponseKeys.has(interruptionKey)
    ) {
      this.openAiInterruptedResponseKeys.add(interruptionKey);
      this.interruptionCount++;
      this.emitTimelineEvent("interrupted_received");
    }
  }

  private selectOpenAiPlayedSegment(): OpenAiPlaybackSegment | null {
    if (!this.audioContext) return null;
    const currentTime = this.audioContext.currentTime;
    const heardSegments = this.openAiPlaybackSegments.filter(
      (segment) => segment.start < currentTime && segment.end > segment.start,
    );
    if (heardSegments.length === 0) return null;

    const currentlyPlaying = heardSegments
      .filter((segment) => currentTime < segment.end)
      .sort((left, right) => right.start - left.start)[0];
    if (currentlyPlaying) return currentlyPlaying;

    return heardSegments.sort(
      (left, right) => right.end - left.end || right.start - left.start,
    )[0];
  }

  private getOpenAiPlayedAudioEndMs(
    playedSegment = this.selectOpenAiPlayedSegment(),
  ): number {
    if (!this.audioContext || !playedSegment) return 0;
    const currentTime = this.audioContext.currentTime;
    const playedSeconds = this.openAiPlaybackSegments
      .filter(
        (segment) =>
          segment.responseId === playedSegment.responseId &&
          segment.itemId === playedSegment.itemId,
      )
      .reduce(
        (total, segment) =>
          total +
          Math.max(0, Math.min(currentTime, segment.end) - segment.start),
        0,
      );
    return Math.max(0, Math.round(playedSeconds * 1000));
  }

  private finishOpenAiPlaybackCompletion() {
    this.pendingTurnCompletion = false;
    this.openAiPendingCompletionResponseId = null;
    this.setIsAiSpeaking(false);
    this.setSessionState("idle");
    this.resetOpenAiPlaybackTracking();
  }

  private resetOpenAiPlaybackTracking() {
    this.openAiPlaybackSegments = [];
    this.openAiActiveResponseId = null;
    this.openAiPendingCompletionResponseId = null;
  }

  private setupRecorders() {
    if (!this.audioContext || !this.stream) return;

    this.recordingDestination =
      this.audioContext.createMediaStreamDestination();
    this.agentOnlyDestination =
      this.audioContext.createMediaStreamDestination();

    const agentSource = this.audioContext.createMediaStreamSource(this.stream);
    agentSource.connect(this.agentOnlyDestination);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream, {
      mimeType,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };

    this.agentMediaRecorder = new MediaRecorder(
      this.agentOnlyDestination.stream,
      { mimeType },
    );
    this.agentMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.agentRecordedChunks.push(e.data);
    };

    this.mediaRecorder.start(1000);
    this.agentMediaRecorder.start(1000);
  }

  private async setupInputProcessing() {
    if (!this.audioContext || !this.stream || !this.recordingDestination)
      return;

    this.inputSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    this.inputSource.connect(this.analyser);
    this.inputSource.connect(this.recordingDestination);

    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule(
          "/audio-input-processor.js",
        );
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "telefun-audio-input-processor",
        );
        this.workletNode.port.onmessage = (event) => {
          this.handleInputAudioFrame(event.data as Float32Array);
        };
        this.inputSource.connect(this.workletNode);
        this.workletNode.connect(this.audioContext.destination);
        this.emitTimelineEvent("audio_worklet_enabled");
        return;
      } catch (error) {
        this.emitTimelineEvent("audio_worklet_fallback", {
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    this.setupInputProcessingFallback();
  }

  private setupInputProcessingFallback() {
    if (!this.audioContext || !this.inputSource) return;

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      this.handleInputAudioFrame(event.inputBuffer.getChannelData(0));
    };
    this.inputSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private handleInputAudioFrame(inputData: Float32Array) {
    const now = Date.now();
    const frame = processInputAudioFrame(inputData);

    if (
      frame.volumeBucket !== this.lastVolumeBucket ||
      now - this.lastVolumeEmitMs >= this.MIN_VOLUME_EMIT_MS
    ) {
      this.onVolumeChange(frame.volume);
      this.lastVolumeEmitMs = now;
      this.lastVolumeBucket = frame.volumeBucket;
    }
    if (this.volumeSamples.length < this.MAX_VOLUME_SAMPLES) {
      this.volumeSamples.push(frame.volume);
    }

    this.handleSpeechAndInterruptionState(now, frame.isSilent);

    const canSend = shouldSendRealtimeAudio({
      wsReady: !!(this.ws && this.ws.readyState === WebSocket.OPEN),
      setupComplete: this.isSetupComplete,
      muted: this.isMuted,
      held: this.isHeld,
    });

    if (!canSend) return;

    const audioMessage =
      this.config.telefunTransport === "openai-audio"
        ? buildOpenAiInputAudioAppend(frame.pcm16Buffer)
        : this.config.telefunTransport === "gemini-live"
          ? buildRealtimeAudioMessage(
              frame.pcm16Buffer,
              this.audioConfiguration.inputSampleRateHz,
            )
          : null;
    if (!audioMessage) return;
    this.ws!.send(JSON.stringify(audioMessage));
    if (!this.hasSentFirstUserAudio) {
      this.hasSentFirstUserAudio = true;
      this.emitTimelineEvent("first_user_audio_chunk_sent");
    }
  }

  private handleSpeechAndInterruptionState(now: number, isSilent: boolean) {
    // Speech Segments
    if (!isSilent) {
      if (!this.currentSpeechSegment) {
        this.currentSpeechSegment = { startMs: now };
        this.setSessionState("user_speaking");
      }
    } else if (this.currentSpeechSegment) {
      const endMs = now;
      const durationMs = endMs - this.currentSpeechSegment.startMs;
      if (durationMs > 200) {
        this.speechSegments.push({
          startMs: this.currentSpeechSegment.startMs,
          endMs,
          durationMs,
        });
        this.totalSpeakingMs += durationMs;
      }
      this.currentSpeechSegment = null;
      this.setSessionState("ai_thinking");
    }
  }

  /** Stop all active sources without touching isAiSpeaking state. */
  private stopActiveSources() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.pendingTurnCompletion = false;
  }

  /** Stop all active sources AND mark AI as not speaking. */
  private clearAiPlayback(_reason: string) {
    this.stopActiveSources();
    this.setIsAiSpeaking(false);
    this.setSessionState("idle");
    this.resetOpenAiPlaybackTracking();
  }

  private playPcm(
    data: Uint8Array,
    sampleRate = 24000,
    openAiOwner?: OpenAiPlaybackOwner,
  ) {
    if (
      !this.audioContext ||
      !this.recordingDestination ||
      this.isHeld ||
      this.intentionalClose
    ) {
      return;
    }

    const float32 = new Float32Array(data.length / 2);
    const view = new DataView(data.buffer);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(
      1,
      float32.length,
      sampleRate,
    );
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.connect(this.recordingDestination);
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.pendingTurnCompletion) {
        if (
          this.config.telefunTransport === "openai-audio" &&
          this.openAiPendingCompletionResponseId === this.openAiActiveResponseId
        ) {
          this.finishOpenAiPlaybackCompletion();
        } else if (this.config.telefunTransport === "gemini-live") {
          this.pendingTurnCompletion = false;
          this.setIsAiSpeaking(false);
          this.setSessionState("idle");
        }
      }
    };

    const startTime = Math.max(
      this.audioContext.currentTime,
      this.nextStartTime,
    );
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
    if (openAiOwner?.responseId && openAiOwner.itemId) {
      this.openAiPlaybackSegments.push({
        responseId: openAiOwner.responseId,
        itemId: openAiOwner.itemId,
        start: startTime,
        end: this.nextStartTime,
        source,
      });
    }
  }

  private completeSetup() {
    this.isSetupComplete = true;
    this.lastModelActivityMs = Date.now();
    this.clearSetupTimeout();
    this.setSessionState("ready");
    this.onStatusChange("Tersambung");
    this.emitTimelineEvent("setup_complete");
    this.emitTimelineEvent("setup_complete_received");
  }

  private buildProviderSessionMessages() {
    const resolvedIdentity = this.config.resolvedIdentity || {
      name: this.config.consumerName,
      gender:
        this.config.consumerGender === "male"
          ? "male"
          : ("female" as "male" | "female"),
      phone: this.config.identitySettings?.phoneNumber || "08123456789",
      city: this.config.identitySettings?.city || "Jakarta",
      voiceName: this.config.voiceName,
      signatureName: this.config.identitySettings?.signatureName || "",
    };

    const modelId =
      this.config.telefunModelId || "gemini-3.1-flash-live-preview";
    const setupVoiceName = resolveVoiceForModel({
      modelId,
      requestedVoice: resolvedIdentity.voiceName,
      gender: resolvedIdentity.gender,
    });

    const systemInstructionText = buildTelefunLiveSystemInstruction({
      identity: resolvedIdentity,
      scenario: this.config.activeScenario ?? this.config.scenarios[0],
      consumerType:
        this.config.activeConsumerType ?? this.config.consumerTypes[0],
      responsePacingMode: this.config.responsePacingMode || "realistic",
      simulationChallengeTypes: this.config.simulationChallengeTypes,
    });

    return {
      configure: buildTelefunSessionConfigure({
        modelId,
        voice: setupVoiceName,
        instructions: systemInstructionText,
        responsePacingMode: this.config.responsePacingMode || "realistic",
      }),
      setup:
        this.config.telefunTransport === "gemini-live"
          ? buildTelefunLiveSetupMessage({
              telefunModelId: modelId,
              voiceName: setupVoiceName,
              systemInstruction: systemInstructionText,
            })
          : null,
    };
  }

  private sendConfigure() {
    if (
      this.intentionalClose ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    )
      return;
    const messages = this.buildProviderSessionMessages();
    this.pendingGeminiSetup = messages.setup;
    this.ws.send(JSON.stringify(messages.configure));
  }

  private sendSetup() {
    if (
      this.intentionalClose ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    )
      return;
    const setup =
      this.pendingGeminiSetup ?? this.buildProviderSessionMessages().setup;
    this.pendingGeminiSetup = null;
    if (!setup) return;
    this.ws.send(JSON.stringify(setup));
    this.emitTimelineEvent("setup_sent");
  }

  private sendOpenAiEvent(event: unknown) {
    if (
      !this.intentionalClose &&
      this.hasConfigured &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private startSetupTimeout() {
    this.clearSetupTimeout();
    this.setupTimeoutTimer = setTimeout(() => {
      if (!this.isSetupComplete) {
        this.lastLocalError = new Error(
          "Koneksi gagal — waktu setup habis. Coba lagi.",
        );
        this.onError(this.lastLocalError);
        this.disconnect("timeout");
      }
    }, this.CONNECT_SETUP_TIMEOUT_MS);
  }

  private clearSetupTimeout() {
    if (this.setupTimeoutTimer) {
      clearTimeout(this.setupTimeoutTimer);
      this.setupTimeoutTimer = null;
    }
  }

  private startStalledWatchdog() {
    this.stopStalledWatchdog();
    this.stalledWatchdogTimer = setInterval(() => {
      if (!this.isSetupComplete) return;
      const elapsed = Date.now() - this.lastModelActivityMs;
      const watchdogResponseIsActive =
        this.config.telefunTransport !== "openai-audio" ||
        (this.openAiActiveResponseId !== null &&
          !this.openAiTerminalResponseIds.has(this.openAiActiveResponseId));
      if (
        this.sessionState === "ai_speaking" &&
        elapsed > this.STALLED_RESPONSE_MID_MS &&
        watchdogResponseIsActive
      ) {
        this.emitTimelineEvent("stalled_response_watchdog", {
          reason: "mid_response_timeout",
          elapsedMs: elapsed,
        });
        this.lastLocalError = new Error(
          "Respons AI terhenti. Panggilan akan diakhiri.",
        );
        this.onError(this.lastLocalError);
        this.disconnect("timeout");
      } else if (
        this.sessionState !== "ai_speaking" &&
        elapsed > this.STALLED_RESPONSE_START_MS
      ) {
        this.emitTimelineEvent("stalled_response_watchdog", {
          reason: "response_start_timeout",
          elapsedMs: elapsed,
        });
        this.lastModelActivityMs = Date.now(); // reset to avoid spamming
      }
    }, 1000);
  }

  private stopStalledWatchdog() {
    if (this.stalledWatchdogTimer) {
      clearInterval(this.stalledWatchdogTimer);
      this.stalledWatchdogTimer = null;
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    this.emitTimelineEvent("mute_changed", { muted });
  }

  public setHold(held: boolean) {
    const relativeNow = Math.max(0, Date.now() - this.sessionStartTime);
    this.holdTracker = held
      ? startHold(this.holdTracker, relativeNow)
      : endHold(this.holdTracker, relativeNow);
    this.isHeld = this.holdTracker.active !== null;
    if (held) {
      this.clearAiPlayback("hold_activated");
    }
    this.emitTimelineEvent("hold_state_changed", {
      held: this.isHeld,
      ...getActiveHoldSnapshot(this.holdTracker, relativeNow),
    });
  }

  private setIsAiSpeaking(speaking: boolean) {
    if (this.isAiSpeaking !== speaking) {
      this.isAiSpeaking = speaking;
      this.onAiSpeaking(speaking);
      if (speaking) this.emitTimelineEvent("playback_start");
      else this.emitTimelineEvent("playback_end");
    }
  }

  private setSessionState(state: TelefunSessionState) {
    if (this.sessionState !== state) {
      this.sessionState = state;
      this.onStateChange(state);
    }
  }

  private emitTimelineEvent(event: TelefunTimelineEvent["event"], meta?: any) {
    this.onTimelineEvent({
      event,
      ts: Date.now(),
      sessionId: "local",
      state: this.sessionState,
      meta,
    });
  }

  public disconnect(
    reason: "user" | "timeout" | "cleanup" = "user",
  ): Promise<void> {
    if (!this.disconnectPromise) {
      this.disconnectPromise = this.performDisconnect(reason);
    }
    return this.disconnectPromise;
  }

  private async performDisconnect(
    reason: "user" | "timeout" | "cleanup",
  ): Promise<void> {
    if (this.intentionalClose) return;
    const recordingFinalizationDeadline =
      Date.now() + this.RECORDING_FINALIZATION_TIMEOUT_MS;
    this.intentionalClose = true;
    this.clearSetupTimeout();
    this.stopStalledWatchdog();
    this.clearAiPlayback("disconnect");

    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.hasConfigured &&
      this.config.telefunTransport === "openai-audio"
    ) {
      this.ws.send(JSON.stringify(buildOpenAiResponseCancel()));
    }

    // Stop sending audio
    this.stopRecordingOnce();

    // Send drain handshake
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (
        this.hasConfigured &&
        this.config.telefunTransport === "gemini-live"
      ) {
        this.ws.send(JSON.stringify(buildAudioStreamEndMessage()));
      }
      this.ws.send(JSON.stringify(buildSessionEndRequest(reason)));

      const drain = new LiveSessionDrain(5000);
      this.ws.addEventListener(
        "message",
        (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "session_end_complete") {
              drain.complete();
            }
          } catch {
            /* skip */
          }
        },
        { once: true },
      );

      await drain.start();
    }

    // Close WebSocket after drain
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(TELEFUN_CLIENT_CLOSE_CODE, TELEFUN_CLIENT_CLOSE_REASON);
    }

    // Cleanup after drain
    this.cleanupAudio();
    this.emitTimelineEvent("disconnect", { reason });

    // Drain and recording finalization share one end-call budget. Starting a new
    // timeout here would make the worst case 5s drain + 10s callback wait.
    const remainingFinalizationMs = Math.max(
      0,
      recordingFinalizationDeadline - Date.now(),
    );
    if (remainingFinalizationMs === 0) return;

    let finalizationTimeout: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      this.recordingFinalizationPromise.catch(() => {}),
      new Promise<void>((resolve) => {
        finalizationTimeout = setTimeout(resolve, remainingFinalizationMs);
      }),
    ]);
    if (finalizationTimeout) clearTimeout(finalizationTimeout);
  }

  private stopRecordingOnce() {
    if (this.hasStoppedRecording) return;
    this.hasStoppedRecording = true;
    this.stopRecording();
  }

  private stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (
      this.agentMediaRecorder &&
      this.agentMediaRecorder.state !== "inactive"
    ) {
      this.agentMediaRecorder.stop();
    }

    // Create a new finalization promise that disconnect can await
    this.recordingFinalizationPromise = new Promise<void>((resolve) => {
      this.resolveRecordingFinalization = resolve;
    });

    // Give MediaRecorder onstop handlers time to flush their final chunks before building blobs.
    setTimeout(() => {
      this.emitRecording();
    }, 500);
  }

  private buildSessionMetrics(): SessionMetrics {
    const sessionEndMs = Math.max(0, Date.now() - this.sessionStartTime);
    this.holdTracker = finalizeActiveHold(this.holdTracker, sessionEndMs);
    return {
      speechSegments: this.speechSegments,
      totalSpeakingMs: this.totalSpeakingMs,
      totalSilenceMs: Math.max(
        0,
        Date.now() - this.sessionStartTime - this.totalSpeakingMs,
      ),
      deadAirCount: this.deadAirCount,
      interruptionCount: this.interruptionCount,
      volumeSamples: this.volumeSamples,
      volumeConsistency: this.calculateVolumeConsistency(),
      inputTranscriptionChunks: [],
      sessionDurationMs: Date.now() - this.sessionStartTime,
      hold: summarizeHoldMetrics(this.holdTracker),
    };
  }

  private async emitRecording(): Promise<void> {
    const fullBlob =
      this.recordedChunks.length > 0
        ? new Blob(this.recordedChunks, { type: "audio/webm" })
        : null;
    const agentBlob =
      this.agentRecordedChunks.length > 0
        ? new Blob(this.agentRecordedChunks, { type: "audio/webm" })
        : null;
    const url = fullBlob ? URL.createObjectURL(fullBlob) : null;

    const metrics = this.buildSessionMetrics();
    try {
      await this.onRecordingComplete(url, fullBlob, agentBlob, metrics);
    } catch (err) {
      console.error("[Telefun] onRecordingComplete error:", err);
    }
    // Resolve so disconnect() can finish after recording callback completes
    if (this.resolveRecordingFinalization) {
      this.resolveRecordingFinalization();
      this.resolveRecordingFinalization = null;
    }
  }

  private calculateVolumeConsistency(): number {
    if (this.volumeSamples.length === 0) return 0;
    const mean =
      this.volumeSamples.reduce((a, b) => a + b, 0) / this.volumeSamples.length;
    const variance =
      this.volumeSamples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      this.volumeSamples.length;
    const stdDev = Math.sqrt(variance);
    if (mean === 0) return 0;
    return Math.max(0, Math.min(100, 100 * (1 - stdDev / mean)));
  }

  private cleanupAudio() {
    if (this.hasCleanedUpAudio) return;
    this.hasCleanedUpAudio = true;
    this.clearAiPlayback("cleanup");
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
    }
    if (this.processor) this.processor.disconnect();
    if (this.analyser) this.analyser.disconnect();
    if (this.inputSource) this.inputSource.disconnect();
    if (this.audioContext) void this.audioContext.close().catch(() => {});
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.onLocalStream(null);
  }

  public retryPlayback(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public sendTimeCue(remainingSeconds: number) {
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const text = getTimeCueInstruction(activeConsumer, remainingSeconds);
    if (this.config.telefunTransport === "openai-audio") {
      this.sendOpenAiEvent(buildOpenAiSystemInputItem(text));
      this.sendOpenAiEvent(buildOpenAiResponseCreate());
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(buildGeminiRealtimeTextMessage(text)));
    }
    this.emitTimelineEvent("time_cue_prompt_sent", {
      type: "time_cue",
      remainingSeconds,
    });
  }
}
