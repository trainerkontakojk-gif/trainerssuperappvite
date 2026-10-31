import {
  normalizeTelefunBrowserSelection,
  type TelefunAppSettings,
} from "../telefunSettings";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import { DEFAULT_TELEFUN_LIVE_MODEL_ID } from "@trainers/types";
import type {
  SessionMetrics,
  SpeechSegment,
  TelefunMuteInterval,
} from "@trainers/types";
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
import { AgentSilenceCueTimer } from "./agentSilenceCueTimer";
import {
  AudioCleanupPendingError,
  acquireTelefunAudio,
  closeTelefunAudioContexts,
  type TelefunAudioOwner,
} from "./audioDisposal";
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
  buildGeminiRealtimeTextMessage,
  buildGeminiToneContextMessage,
} from "./liveProtocol";
import {
  buildTelefunLiveSystemInstruction,
  getHoldEndInstruction,
  getTimeCueInstruction,
} from "./promptBuilder";
import { resolveVoiceForModel } from "../telefunVoiceRegistry";
import {
  getNonverbalClipKinds,
  prefetchNonverbalClips,
} from "./nonverbalClips";
import {
  directTone,
  type NonverbalClipKind,
  type ToneMoment,
} from "./toneDirector";

/** Opus at 32 kbps is clear for speech and ~4x smaller than the default. */
const RECORDING_BITS_PER_SECOND = 32_000;

/** Small initial/recovery runway; queued PCM itself remains sample-adjacent. */
const PLAYBACK_START_LEAD_SECONDS = 0.24;

interface WebkitAudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class LiveSession {
  private config: TelefunAppSettings;
  private readonly audioConfiguration: ReturnType<
    typeof getTelefunAudioConfiguration
  >;
  private ws: WebSocket | null = null;
  /** Provider input and agent-only capture remain at the canonical 16 kHz. */
  private audioContext: AudioContext | null = null;
  /** Playback and full-call mix follow the browser's native output rate. */
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private outputMicSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private agentMediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private agentRecordedChunks: Blob[] = [];
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private agentOnlyDestination: MediaStreamAudioDestinationNode | null = null;
  private readonly stoppedRecorders = new WeakSet<MediaRecorder>();
  private readonly failedRecorderTracks = new Set<"full_call" | "agent_only">();
  private pendingRecorderStops = new Map<
    MediaRecorder,
    "full_call" | "agent_only"
  >();
  private recorderStopPromise: Promise<void> = Promise.resolve();
  private recordingCaptureFailed = false;
  private captureFailureReported = false;
  private hasEmittedRecording = false;

  private isMuted: boolean = false;
  private isHeld: boolean = false;
  private readonly agentSilenceCueTimer = new AgentSilenceCueTimer({
    isReady: () => this.canSendAgentSilenceCue(),
    onCue: () => this.sendAgentSilenceCue(),
  });
  private nextStartTime: number = 0;
  private sessionStartTime: number = 0;
  private isAiSpeaking: boolean = false;
  private sessionState: TelefunSessionState = "idle";
  private isSetupComplete: boolean = false;
  /**
   * The connection is prepared while the phone rings. Until the agent picks
   * up, nothing is recorded, no microphone audio is sent and the call is not
   * reported as connected.
   */
  private isPickedUp: boolean = true;
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
  private hasSentOpeningTone: boolean = false;
  private consumerTurnsCompleted: number = 0;
  private turnsSinceLastClip: number = 0;
  private nonverbalClips = new Map<string, Uint8Array>();
  private pendingClip: NonverbalClipKind | null = null;
  private readonly nextClipVariant = new Map<NonverbalClipKind, 1 | 2>();
  private nonverbalUnavailableEmitted = false;

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
  private readonly AUDIO_CLEANUP_RESERVE_MS = 2_000;
  private readonly AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 1_500;
  private readonly AUDIO_WORKLET_LOAD_TIMEOUT_MS = 5_000;

  private intentionalClose = false;
  private hasStoppedRecording = false;
  private hasCleanedUpAudio = false;
  private audioOwner: TelefunAudioOwner | null = null;
  private microphoneRequest: Promise<MediaStream> | null = null;
  private lastLocalError: Error | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private shutdownFailed = false;
  private shutdownDeadline = 0;
  private activeDrain: LiveSessionDrain | null = null;

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
  private muteStartedAtMs: number | null = null;
  private muteIntervals: TelefunMuteInterval[] = [];

  constructor(config: TelefunAppSettings) {
    const selection = normalizeTelefunBrowserSelection(
      config.telefunModelId,
      config.telefunTransport,
    );
    this.config = {
      ...config,
      telefunModelId: selection.model.id,
      telefunTransport: "gemini-live",
    };
    this.audioConfiguration = getTelefunAudioConfiguration(selection.model.id);
  }

  public async connect(
    accessToken: string,
    options: { pickUp?: Promise<void>; microphoneDeviceId?: string } = {},
  ) {
    if (options.pickUp) {
      this.isPickedUp = false;
      void options.pickUp.then(() => this.pickUp());
    }
    try {
      this.setSessionState("connecting");
      this.onStatusChange("Menghubungkan...");

      if (!accessToken.trim()) {
        throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
      }

      // Admission is held outside the component, including after unmount or
      // failed startup. Never create another graph/mic over retained audio.
      this.audioOwner = await acquireTelefunAudio();
      if (this.intentionalClose) {
        await this.cleanupAudio(Date.now() + 1_000);
        return;
      }
      await this.prefetchNonverbalAudio();
      if (this.intentionalClose) {
        await this.cleanupAudio(Date.now() + 1_000);
        return;
      }

      // Create and ask both contexts to resume before awaiting microphone
      // permission, while the call-start gesture is still available.
      const AudioContextCtor =
        window.AudioContext ||
        (window as WebkitAudioContextWindow).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Browser tidak mendukung AudioContext.");
      }
      this.audioContext = new AudioContextCtor({
        sampleRate: this.audioConfiguration.inputSampleRateHz,
      });
      this.outputAudioContext = new AudioContextCtor();
      const inputResume = this.resumeAudioContext(this.audioContext);
      const outputResume = this.resumeAudioContext(this.outputAudioContext);
      const outputSampleRateHz = this.outputAudioContext.sampleRate;
      console.info(
        "[Telefun] Audio graph sample rates:",
        JSON.stringify({
          inputSampleRateHz: this.audioContext.sampleRate,
          outputSampleRateHz,
          providerOutputSampleRateHz:
            this.audioConfiguration.outputSampleRateHz,
          outputRateCapability:
            outputSampleRateHz < 24_000
              ? "native_below_24khz"
              : "native_at_least_24khz",
        }),
      );

      // 1. Get User Media. The browser may resample the device track into the
      // fixed input context; the provider contract remains PCM 16 kHz.
      this.microphoneRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          ...(options.microphoneDeviceId
            ? { deviceId: { exact: options.microphoneDeviceId } }
            : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: this.audioConfiguration.inputSampleRateHz,
        },
      });
      this.stream = await this.microphoneRequest;
      // Closed while the microphone was opening (e.g. left during the ring).
      if (this.intentionalClose) {
        this.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.applyMicrophoneCaptureStateToTracks();
      this.onLocalStream(this.stream);

      // 2. Setup Recording on the independent input and native output graphs.
      this.setupRecorders();

      // 3. Setup Input Processing
      await this.setupInputProcessing();
      // disconnect() may close either context while addModule() is pending.
      if (this.intentionalClose) return;
      const [inputRunning, outputRunning] = await Promise.all([
        inputResume,
        outputResume,
      ]);
      if (this.intentionalClose) {
        await this.abortAudioStartup();
        return;
      }
      if (!inputRunning || !outputRunning) this.onPlaybackBlocked();

      // 4. Connect WebSocket
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

      const socket = new WebSocket(wsUrl.toString());
      this.ws = socket;
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        if (
          this.intentionalClose ||
          this.ws !== socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          if (
            socket.readyState === WebSocket.CONNECTING ||
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close(
              TELEFUN_CLIENT_CLOSE_CODE,
              TELEFUN_CLIENT_CLOSE_REASON,
            );
          }
          return;
        }
        this.isSetupComplete = false;
        this.hasAuthenticated = false;
        this.hasConfigured = false;
        this.pendingGeminiSetup = null;
        this.hasSentFirstUserAudio = false;
        this.hasReceivedFirstModelAudio = false;
        this.lastModelActivityMs = Date.now();
        this.setSessionState("connecting");
        this.onStatusChange("Mengautentikasi sesi...");
        socket.send(
          JSON.stringify(
            buildTelefunAuthMessage(accessToken, this.config.sessionId),
          ),
        );
        this.emitTimelineEvent("ws_open");
        this.startSetupTimeout();
        this.startStalledWatchdog();
      };

      socket.onmessage = async (event) => {
        if (this.intentionalClose || this.ws !== socket) return;
        if (event.data instanceof ArrayBuffer) {
          this.playPendingNonverbalClip();
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

      socket.onerror = (_event) => {
        if (!this.intentionalClose && this.ws === socket) {
          this.onError(new Error("WebSocket Error"));
        }
      };

      socket.onclose = (event) => {
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

        this.activeDrain?.complete();
        this.intentionalClose = true;
        void this.beginShutdown(() => this.finishAfterSocketClose()).catch(
          () => {
            this.onError(new AudioCleanupPendingError());
          },
        );
        this.emitTimelineEvent("ws_close", {
          code: event.code,
          reason: event.reason,
          severity: mapped.severity,
        });
      };
    } catch (err) {
      if (this.intentionalClose) {
        await this.abortAudioStartup();
        return;
      }
      if (
        options.microphoneDeviceId &&
        !this.stream &&
        err &&
        typeof err === "object" &&
        "name" in err &&
        ["OverconstrainedError", "NotFoundError"].includes(String(err.name))
      ) {
        const error = Object.assign(
          new Error("Selected microphone unavailable"),
          {
            code: "selected_microphone_unavailable",
          },
        );
        // Fail closed before any socket/recording starts. Never retry another mic.
        this.intentionalClose = true;
        await this.abortAudioStartup();
        this.onError(error);
        this.onStatusChange("Gagal");
        this.setSessionState("ended");
        return;
      }
      this.intentionalClose = true;
      await this.abortAudioStartup();
      this.onError(err as Error);
    }
  }

  private handleJsonMessage(msg: any) {
    if (this.intentionalClose) return;
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
      if (this.isPickedUp) this.sessionStartTime = Date.now();
      this.sendConfigure();
      this.emitTimelineEvent("auth_complete");
      return;
    }

    if (!this.hasAuthenticated) return;

    if (msg.type === "telefun_session_configured") {
      if (this.intentionalClose) return;
      if (this.hasConfigured) return;
      this.hasConfigured = true;
      this.sendSetup();
      return;
    }

    if (!this.hasConfigured) return;

    if (msg.type === "session_created" && msg.sessionId) {
      this.config.sessionId = msg.sessionId;
      this.onSessionCreated(msg.sessionId);
    }

    if (msg.setupComplete) {
      this.completeSetup();
    }

    if (msg.serverContent?.modelTurn?.parts) {
      // A new ordinary turn extends the playback queue; only explicit
      // interruption/hold/disconnect cancels already scheduled audio.
      this.pendingTurnCompletion = false;
      this.lastModelActivityMs = Date.now();
      this.resetAgentSilenceInterval();
      this.setIsAiSpeaking(true);
      this.setSessionState("ai_speaking");
    }

    const chunks = extractGeminiInlineAudioChunks(
      msg,
      this.audioConfiguration.outputSampleRateHz,
    );
    if (chunks.length > 0) this.playPendingNonverbalClip();
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
      this.consumerTurnsCompleted += 1;
      this.turnsSinceLastClip += 1;
      this.sendToneNote({
        kind: "after_consumer_turn",
        consumerTurnsCompleted: this.consumerTurnsCompleted,
      });
      this.pendingTurnCompletion = true;
      if (this.activeSources.size === 0) this.finishConsumerTurnPlayback();
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

  private setupRecorders() {
    if (!this.audioContext || !this.outputAudioContext || !this.stream) {
      return;
    }

    this.recordingDestination =
      this.outputAudioContext.createMediaStreamDestination();
    this.agentOnlyDestination =
      this.audioContext.createMediaStreamDestination();

    const agentSource = this.audioContext.createMediaStreamSource(this.stream);
    agentSource.connect(this.agentOnlyDestination);
    this.outputMicSource = this.outputAudioContext.createMediaStreamSource(
      this.stream,
    );
    this.outputMicSource.connect(this.recordingDestination);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    // Speech needs far less than Chrome's ~128 kbps default; every byte is
    // uploaded, remuxed and downloaded again for scoring and Telaah.
    const recorderOptions = {
      mimeType,
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    };
    const fullCallRecorder = new MediaRecorder(
      this.recordingDestination.stream,
      recorderOptions,
    );
    this.mediaRecorder = fullCallRecorder;
    fullCallRecorder.addEventListener("error", () =>
      this.failRecorderTrack("full_call"),
    );
    fullCallRecorder.addEventListener("stop", () => {
      this.stoppedRecorders.add(fullCallRecorder);
      if (
        !this.hasEmittedRecording &&
        !this.pendingRecorderStops.has(fullCallRecorder)
      ) {
        this.failRecorderTrack("full_call");
      }
    });
    fullCallRecorder.ondataavailable = (e) => {
      if (
        !this.hasEmittedRecording &&
        !this.failedRecorderTracks.has("full_call") &&
        e.data.size > 0
      ) {
        this.recordedChunks.push(e.data);
      }
    };

    const agentRecorder = new MediaRecorder(
      this.agentOnlyDestination.stream,
      recorderOptions,
    );
    this.agentMediaRecorder = agentRecorder;
    agentRecorder.addEventListener("error", () =>
      this.failRecorderTrack("agent_only"),
    );
    agentRecorder.addEventListener("stop", () => {
      this.stoppedRecorders.add(agentRecorder);
      if (
        !this.hasEmittedRecording &&
        !this.pendingRecorderStops.has(agentRecorder)
      ) {
        this.failRecorderTrack("agent_only");
      }
    });
    agentRecorder.ondataavailable = (e) => {
      if (
        !this.hasEmittedRecording &&
        !this.failedRecorderTracks.has("agent_only") &&
        e.data.size > 0
      ) {
        this.agentRecordedChunks.push(e.data);
      }
    };

    if (this.isPickedUp) this.startRecorders();
  }

  private failRecorderTrack(track: "full_call" | "agent_only"): void {
    if (this.hasEmittedRecording || this.failedRecorderTracks.has(track))
      return;
    this.failedRecorderTracks.add(track);
    this.recordingCaptureFailed = true;
    if (track === "full_call") this.recordedChunks = [];
    else this.agentRecordedChunks = [];
    this.reportCaptureFailure();
  }

  private startRecorders() {
    try {
      if (this.mediaRecorder?.state === "inactive")
        this.mediaRecorder.start(1000);
      if (this.agentMediaRecorder?.state === "inactive")
        this.agentMediaRecorder.start(1000);
    } catch (error) {
      this.lastLocalError =
        error instanceof Error ? error : new Error("Recording startup failed");
      this.onError(this.lastLocalError);
      this.ws?.close(1011, "Recording startup failed");
      void this.abortAudioStartup();
    }
  }

  /** The ring ended: start the call on the connection prepared meanwhile. */
  private pickUp() {
    if (this.isPickedUp || this.intentionalClose || this.hasStoppedRecording)
      return;
    this.isPickedUp = true;
    this.sessionStartTime = Date.now();
    this.startRecorders();
    if (this.intentionalClose) return;
    if (this.isSetupComplete) this.announceReady();
    this.agentSilenceCueTimer.schedule();
  }

  private async setupInputProcessing() {
    const context = this.audioContext;
    if (!context || !this.stream) return;

    this.inputSource = context.createMediaStreamSource(this.stream);
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;

    this.inputSource.connect(this.analyser);

    if (context.audioWorklet) {
      try {
        await this.loadAudioWorkletModule(context);
        if (this.intentionalClose || context.state === "closed") return;
        const workletNode = new AudioWorkletNode(
          context,
          "telefun-audio-input-processor",
        );
        this.workletNode = workletNode;
        workletNode.port.onmessage = (event) => {
          this.handleInputAudioFrame(event.data as Float32Array);
        };
        this.inputSource.connect(workletNode);
        workletNode.connect(context.destination);
        this.emitTimelineEvent("audio_worklet_enabled");
        return;
      } catch (error) {
        if (this.intentionalClose || context.state === "closed") return;
        this.emitTimelineEvent("audio_worklet_fallback", {
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (!this.intentionalClose) this.setupInputProcessingFallback();
  }

  private async loadAudioWorkletModule(context: AudioContext): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        context.audioWorklet.addModule("/audio-input-processor.js"),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("AudioWorklet module load timed out.")),
            this.AUDIO_WORKLET_LOAD_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private setupInputProcessingFallback() {
    if (
      !this.audioContext ||
      this.audioContext.state === "closed" ||
      !this.inputSource
    ) {
      return;
    }

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      this.handleInputAudioFrame(event.inputBuffer.getChannelData(0));
    };
    this.inputSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private handleInputAudioFrame(inputData: Float32Array) {
    if (!this.isPickedUp) return;
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

    const audioMessage = buildRealtimeAudioMessage(
      frame.pcm16Buffer,
      this.audioConfiguration.inputSampleRateHz,
    );
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
        this.resetAgentSilenceInterval();
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
      this.agentSilenceCueTimer.markQuietSince(now);
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

  /**
   * The consumer's completed turn has finished playing. Gemini sends
   * turnComplete before queued audio drains, so the agent's quiet interval
   * starts here, when the consumer actually stops being heard.
   */
  private finishConsumerTurnPlayback() {
    this.pendingTurnCompletion = false;
    this.agentSilenceCueTimer.markQuietSince(Date.now());
    this.setIsAiSpeaking(false);
    this.setSessionState("idle");
  }

  /** Stop all active sources AND mark AI as not speaking. */
  private clearAiPlayback(_reason: string) {
    this.stopActiveSources();
    this.setIsAiSpeaking(false);
    this.setSessionState("idle");
  }

  private playPcm(data: Uint8Array, sampleRate = 24000): boolean {
    const context = this.outputAudioContext;
    if (
      !context ||
      context.state === "closed" ||
      !this.recordingDestination ||
      this.isHeld ||
      this.intentionalClose
    ) {
      return false;
    }

    const byteLength = data.byteLength - (data.byteLength % 2);
    if (byteLength === 0) return false;
    const float32 = new Float32Array(byteLength / 2);
    const view = new DataView(data.buffer, data.byteOffset, byteLength);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0;
    }

    let source: AudioBufferSourceNode | null = null;
    try {
      const buffer = context.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);

      const scheduledSource = context.createBufferSource();
      source = scheduledSource;
      scheduledSource.buffer = buffer;
      scheduledSource.connect(context.destination);
      scheduledSource.connect(this.recordingDestination);
      this.activeSources.add(scheduledSource);
      scheduledSource.onended = () => {
        this.activeSources.delete(scheduledSource);
        if (this.activeSources.size === 0 && this.pendingTurnCompletion) {
          this.finishConsumerTurnPlayback();
        }
      };

      const startTime =
        this.nextStartTime > context.currentTime
          ? this.nextStartTime
          : context.currentTime + PLAYBACK_START_LEAD_SECONDS;
      scheduledSource.start(startTime);
      this.nextStartTime = startTime + buffer.duration;
      return true;
    } catch {
      if (source) {
        this.activeSources.delete(source);
        try {
          source.disconnect();
        } catch {
          /* output context closed while scheduling */
        }
      }
      if (!this.intentionalClose) this.onPlaybackBlocked();
      return false;
    }
  }

  private completeSetup() {
    this.isSetupComplete = true;
    this.clearSetupTimeout();
    if (!this.hasSentOpeningTone) {
      this.hasSentOpeningTone = true;
      this.sendToneNote({ kind: "opening" });
    }
    if (this.isPickedUp) this.announceReady();
  }

  private announceReady() {
    this.lastModelActivityMs = Date.now();
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

    const modelId = this.config.telefunModelId || DEFAULT_TELEFUN_LIVE_MODEL_ID;
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
    });

    return {
      configure: buildTelefunSessionConfigure({
        modelId,
        voice: setupVoiceName,
        instructions: systemInstructionText,
        responsePacingMode: this.config.responsePacingMode || "realistic",
      }),
      setup: buildTelefunLiveSetupMessage({
        telefunModelId: modelId,
        voiceName: setupVoiceName,
        systemInstruction: systemInstructionText,
      }),
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
      const watchdogResponseIsActive = true;
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

  private applyMicrophoneCaptureStateToTracks(): void {
    if (!this.stream) return;
    this.stream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted && !this.isHeld;
    });
  }

  private async resumeAudioContext(
    context: AudioContext | null,
  ): Promise<boolean> {
    if (!context) return false;
    if (context.state === "running") return true;
    if (context.state !== "suspended") return false;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const resumed = context
      .resume()
      .then(() => true)
      .catch(() => false);
    const result = await Promise.race([
      resumed,
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(
          () => resolve(false),
          this.AUDIO_CONTEXT_RESUME_TIMEOUT_MS,
        );
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    return result && (context.state as AudioContextState) === "running";
  }

  /** Waktu sejak autentikasi; mute sebelum autentikasi dihitung dari 0. */
  private sessionRelativeNow(): number {
    return this.sessionStartTime > 0
      ? Math.max(0, Date.now() - this.sessionStartTime)
      : 0;
  }

  private endMuteInterval(endedAtMs: number) {
    if (this.muteStartedAtMs === null) return;
    this.muteIntervals.push({ startedAtMs: this.muteStartedAtMs, endedAtMs });
    this.muteStartedAtMs = null;
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (muted) this.muteStartedAtMs ??= this.sessionRelativeNow();
    else this.endMuteInterval(this.sessionRelativeNow());
    if (muted) this.agentSilenceCueTimer.pause();
    else this.agentSilenceCueTimer.schedule();
    this.emitTimelineEvent("mute_changed", { muted });
    this.applyMicrophoneCaptureStateToTracks();
  }

  public setHold(held: boolean) {
    const relativeNow = Math.max(0, Date.now() - this.sessionStartTime);
    const wasHeld = this.holdTracker.active !== null;
    this.holdTracker = held
      ? startHold(this.holdTracker, relativeNow)
      : endHold(this.holdTracker, relativeNow);
    this.isHeld = this.holdTracker.active !== null;
    this.applyMicrophoneCaptureStateToTracks();
    if (held) {
      this.agentSilenceCueTimer.reset();
      this.pendingClip = null;
      this.clearAiPlayback("hold_activated");
    }
    this.emitTimelineEvent("hold_state_changed", {
      held: this.isHeld,
      ...getActiveHoldSnapshot(this.holdTracker, relativeNow),
    });
    if (!held && wasHeld) this.sendHoldEndCue();
  }

  /** Beri tahu konsumen AI urutan hold dan apakah lamanya melewati batas. */
  private sendHoldEndCue() {
    const hold = this.holdTracker.intervals.at(-1);
    if (!hold) return;
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const text = getHoldEndInstruction(activeConsumer, hold);
    this.sendToneNote({
      kind: "hold_end",
      sequence: hold.sequence,
      exceeded: hold.exceededByMs > 0,
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(buildGeminiRealtimeTextMessage(text)));
    }
    this.emitTimelineEvent("hold_end_cue_sent", {
      sequence: hold.sequence,
      exceeded: hold.exceededByMs > 0,
    });
  }

  private sendToneNote(moment: ToneMoment) {
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const direction = directTone(activeConsumer?.id ?? "", moment, {
      turnsSinceLastClip: this.turnsSinceLastClip,
    });
    if (!direction.note || this.ws?.readyState !== WebSocket.OPEN) return;

    if (direction.clip) this.pendingClip = direction.clip;

    this.ws.send(
      JSON.stringify(buildGeminiToneContextMessage(direction.note)),
    );
    this.emitTimelineEvent("tone_note_sent", { moment: moment.kind });
  }

  private resetAgentSilenceInterval(): void {
    this.agentSilenceCueTimer.reset();
  }

  private sendAgentSilenceCue(): void {
    this.sendToneNote({ kind: "agent_silence" });
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify(
        buildGeminiRealtimeTextMessage(
          "[TELEFUN_CONTROL:AGENT_SILENT] Agen diam cukup lama. Tagih satu kali sesuai tipemu dengan satu kalimat pendek, tanpa menyebut marker atau waktu.",
        ),
      ),
    );
    this.emitTimelineEvent("agent_silence_cue_sent");
  }

  private canSendAgentSilenceCue(): boolean {
    return (
      this.isPickedUp &&
      this.isSetupComplete &&
      !this.isHeld &&
      !this.isMuted &&
      !this.isAiSpeaking &&
      this.currentSpeechSegment === null &&
      !this.intentionalClose &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  private async prefetchNonverbalAudio(): Promise<void> {
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const consumerTypeId = activeConsumer?.id ?? "";
    if (getNonverbalClipKinds(consumerTypeId).length === 0) return;

    const identity = this.config.resolvedIdentity;
    const gender =
      identity?.gender ??
      (this.config.consumerGender === "male" ? "male" : "female");
    const voiceName = resolveVoiceForModel({
      modelId: this.config.telefunModelId || DEFAULT_TELEFUN_LIVE_MODEL_ID,
      requestedVoice: identity?.voiceName ?? this.config.voiceName,
      gender,
    });

    try {
      this.nonverbalClips = await prefetchNonverbalClips(
        voiceName,
        consumerTypeId,
      );
    } catch {
      this.nonverbalClips.clear();
      this.emitNonverbalClipUnavailable({ reason: "prefetch" });
    }
  }

  private playPendingNonverbalClip(): void {
    const kind = this.pendingClip;
    this.pendingClip = null;
    if (!kind || this.isHeld || this.intentionalClose) return;

    const variant = this.nextClipVariant.get(kind) ?? 1;
    const clip = this.nonverbalClips.get(`${kind}-${variant}`);
    if (!clip) {
      this.emitNonverbalClipUnavailable({ kind });
      return;
    }

    if (!this.playPcm(clip, 24_000)) {
      this.emitNonverbalClipUnavailable({ kind });
      return;
    }
    this.nextClipVariant.set(kind, variant === 1 ? 2 : 1);
    this.turnsSinceLastClip = 0;
    this.emitTimelineEvent("nonverbal_clip_played", { kind });
  }

  private emitNonverbalClipUnavailable(meta: Record<string, unknown>): void {
    if (this.nonverbalUnavailableEmitted) return;
    this.nonverbalUnavailableEmitted = true;
    this.emitTimelineEvent("nonverbal_clip_unavailable", meta);
  }

  private setIsAiSpeaking(speaking: boolean) {
    if (this.isAiSpeaking !== speaking) {
      this.isAiSpeaking = speaking;
      this.onAiSpeaking(speaking);
      if (speaking) this.emitTimelineEvent("playback_start");
      else this.emitTimelineEvent("playback_end");
    }
    if (speaking) this.agentSilenceCueTimer.pause();
    else this.agentSilenceCueTimer.schedule();
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

  public waitForAudioRelease(): Promise<void> {
    return this.audioOwner?.released ?? Promise.resolve();
  }

  public disconnect(
    reason: "user" | "timeout" | "cleanup" = "user",
  ): Promise<void> {
    return this.beginShutdown(
      () => this.performDisconnect(reason),
      reason === "user",
    );
  }

  private beginShutdown(
    start: () => Promise<void>,
    retryFailed = false,
  ): Promise<void> {
    // Socket-close, timeout and unmount observers join the last attempt,
    // including its rejection. Only an explicit user retry opens another batch.
    if (retryFailed && this.shutdownFailed) this.shutdownPromise = null;
    if (!this.shutdownPromise) {
      this.shutdownFailed = false;
      this.intentionalClose = true;
      this.shutdownDeadline =
        Date.now() + this.RECORDING_FINALIZATION_TIMEOUT_MS;
      const attempt = Promise.resolve().then(start);
      this.shutdownPromise = attempt;
      void attempt.then(undefined, () => {
        if (this.shutdownPromise === attempt) this.shutdownFailed = true;
      });
    }
    return this.shutdownPromise;
  }

  private async performDisconnect(
    reason: "user" | "timeout" | "cleanup",
  ): Promise<void> {
    const deadline = this.shutdownDeadline;
    this.clearSetupTimeout();
    this.stopStalledWatchdog();
    this.clearAiPlayback("disconnect");
    const recorderStop = this.stopRecordingOnce();
    const socket = this.ws;

    if (socket?.readyState === WebSocket.CONNECTING) {
      socket.close(TELEFUN_CLIENT_CLOSE_CODE, TELEFUN_CLIENT_CLOSE_REASON);
    } else if (socket?.readyState === WebSocket.OPEN) {
      const drain = new LiveSessionDrain(5000);
      const onDrainMessage = (event: MessageEvent) => {
        if (typeof event.data !== "string") return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "session_end_complete") drain.complete();
        } catch {
          /* ignore non-JSON messages while draining */
        }
      };
      const onDrainClose = () => drain.complete();
      this.activeDrain = drain;
      socket.addEventListener("message", onDrainMessage);
      socket.addEventListener("close", onDrainClose);
      const drainComplete = drain.start();
      try {
        if (this.hasConfigured) {
          socket.send(JSON.stringify(buildAudioStreamEndMessage()));
        }
        socket.send(JSON.stringify(buildSessionEndRequest(reason)));
      } catch (error) {
        console.warn("[Telefun] Session drain request failed:", error);
        drain.complete();
      }
      await drainComplete;
      socket.removeEventListener("message", onDrainMessage);
      socket.removeEventListener("close", onDrainClose);
      if (this.activeDrain === drain) this.activeDrain = null;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(TELEFUN_CLIENT_CLOSE_CODE, TELEFUN_CLIENT_CLOSE_REASON);
      }
    }

    await this.finishRecordingAndCleanup(recorderStop, deadline);
    this.emitTimelineEvent("disconnect", { reason });
  }

  private async finishRecordingAndCleanup(
    recorderStop: Promise<void>,
    deadline: number,
  ): Promise<void> {
    const recorderDeadline = Math.max(
      Date.now(),
      deadline - this.AUDIO_CLEANUP_RESERVE_MS,
    );
    const recorderStopped = await this.waitForRecorderStopUntil(
      recorderStop,
      recorderDeadline,
    );
    if (!recorderStopped) this.discardIncompleteRecording();
    const audioCleaned = await this.cleanupAudio(deadline);
    if (!audioCleaned) {
      throw new AudioCleanupPendingError();
    }
    const recordingFinalized = await this.waitForPromiseUntil(
      this.recordingFinalizationPromise,
      deadline,
    );
    if (!recordingFinalized) {
      throw new AudioCleanupPendingError();
    }
  }

  private stopRecordingOnce(): Promise<void> {
    if (this.hasStoppedRecording) return this.recorderStopPromise;
    this.hasStoppedRecording = true;
    // Ended before pickup: there is no call to record or save.
    if (!this.isPickedUp) return Promise.resolve();
    return this.stopRecording();
  }

  private stopRecording(): Promise<void> {
    this.recordingFinalizationPromise = new Promise<void>((resolve) => {
      this.resolveRecordingFinalization = resolve;
    });

    const recorders: Array<{
      recorder: MediaRecorder;
      track: "full_call" | "agent_only";
    }> = [
      ...(this.mediaRecorder
        ? [{ recorder: this.mediaRecorder, track: "full_call" as const }]
        : []),
      ...(this.agentMediaRecorder
        ? [{ recorder: this.agentMediaRecorder, track: "agent_only" as const }]
        : []),
    ];
    const pending = new Map(
      recorders
        .filter(({ recorder }) => !this.stoppedRecorders.has(recorder))
        .map(({ recorder, track }) => [recorder, track] as const),
    );
    this.pendingRecorderStops = pending;

    const stopped = new Promise<void>((resolve) => {
      const finish = (
        recorder: MediaRecorder,
        track: "full_call" | "agent_only",
        failed: boolean,
      ) => {
        if (!pending.has(recorder)) return;
        pending.delete(recorder);
        if (failed) {
          this.failRecorderTrack(track);
        } else {
          this.stoppedRecorders.add(recorder);
        }
        if (pending.size === 0) resolve();
      };

      for (const { recorder, track } of recorders) {
        if (!pending.has(recorder)) continue;
        recorder.addEventListener(
          "stop",
          () => finish(recorder, track, false),
          { once: true },
        );
        recorder.addEventListener(
          "error",
          () => finish(recorder, track, true),
          { once: true },
        );
        if (recorder.state === "inactive") {
          finish(recorder, track, false);
          continue;
        }
        try {
          recorder.stop();
        } catch {
          finish(recorder, track, true);
        }
      }
      if (pending.size === 0) resolve();
    });

    this.recorderStopPromise = stopped.then(() => {
      this.pendingRecorderStops.clear();
      void this.emitRecording();
    });
    return this.recorderStopPromise;
  }

  private async waitForPromiseUntil(
    promise: Promise<unknown>,
    deadline: number,
  ): Promise<boolean> {
    const remainingMs = Math.max(0, deadline - Date.now());
    if (remainingMs === 0) return false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const completed = await Promise.race([
      promise.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), remainingMs);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    return completed;
  }

  private waitForRecorderStopUntil(
    recorderStop: Promise<void>,
    deadline: number,
  ): Promise<boolean> {
    return this.waitForPromiseUntil(recorderStop, deadline);
  }

  private discardIncompleteRecording(): void {
    if (this.hasEmittedRecording) return;
    for (const [recorder, track] of this.pendingRecorderStops) {
      this.failRecorderTrack(track);
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* the source graph is closed immediately below */
        }
      }
    }
    this.pendingRecorderStops.clear();
    this.recordingCaptureFailed = true;
    this.reportCaptureFailure();
    console.error(
      "[Telefun] MediaRecorder stop timed out; incomplete tracks discarded independently.",
    );
    void this.emitRecording();
  }

  private reportCaptureFailure(): void {
    if (this.captureFailureReported) return;
    this.captureFailureReported = true;
    const error = new Error(
      "Rekaman panggilan tidak lengkap. Panggilan tidak akan dinilai.",
    );
    this.lastLocalError = error;
    this.onError(error);
    this.onStatusChange("Gagal");
  }

  private async finishAfterSocketClose(): Promise<void> {
    const recorderStop = this.stopRecordingOnce();
    await this.finishRecordingAndCleanup(
      recorderStop,
      this.shutdownDeadline ||
        Date.now() + this.RECORDING_FINALIZATION_TIMEOUT_MS,
    );
    this.emitTimelineEvent("disconnect", { reason: "server_close" });
  }

  private async abortAudioStartup(): Promise<void> {
    this.intentionalClose = true;
    this.activeDrain?.complete();
    const socket = this.ws;
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN)
    ) {
      socket.close(TELEFUN_CLIENT_CLOSE_CODE, TELEFUN_CLIENT_CLOSE_REASON);
    }
    this.clearSetupTimeout();
    this.stopStalledWatchdog();
    this.stopActiveSources();
    this.hasStoppedRecording = true;
    this.hasEmittedRecording = true;

    const activeRecorders = [
      this.mediaRecorder,
      this.agentMediaRecorder,
    ].filter(
      (recorder): recorder is MediaRecorder =>
        recorder !== null && recorder.state !== "inactive",
    );
    const stopped = Promise.all(
      activeRecorders.map(
        (recorder) =>
          new Promise<void>((resolve) => {
            recorder.addEventListener("stop", () => resolve(), { once: true });
            try {
              recorder.stop();
            } catch {
              resolve();
            }
          }),
      ),
    );
    await this.waitForRecorderStopUntil(
      stopped.then(() => {}),
      Date.now() + 1_000,
    );
    this.recordedChunks = [];
    this.agentRecordedChunks = [];
    await this.cleanupAudio(Date.now() + 1_000);
  }

  private buildSessionMetrics(): SessionMetrics {
    const sessionEndMs = Math.max(0, Date.now() - this.sessionStartTime);
    this.holdTracker = finalizeActiveHold(this.holdTracker, sessionEndMs);
    this.endMuteInterval(sessionEndMs);
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
      mutes: this.muteIntervals,
    };
  }

  private async emitRecording(): Promise<void> {
    if (this.hasEmittedRecording) return;
    this.hasEmittedRecording = true;
    const fullBlob =
      this.recordedChunks.length > 0
        ? new Blob(this.recordedChunks, { type: "audio/webm" })
        : null;
    const agentBlob =
      this.agentRecordedChunks.length > 0
        ? new Blob(this.agentRecordedChunks, { type: "audio/webm" })
        : null;
    if (this.recordingCaptureFailed || !fullBlob || !agentBlob) {
      this.recordingCaptureFailed = true;
      this.reportCaptureFailure();
    }
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

  private async cleanupAudio(deadline: number): Promise<boolean> {
    if (this.hasCleanedUpAudio || !this.audioOwner) return true;
    const disposal = this.audioOwner.dispose(async () => {
      await this.performAudioCleanup();
      this.hasCleanedUpAudio = true;
    });
    // The caller's deadline does not cancel or relinquish the retained owner.
    await this.waitForPromiseUntil(disposal, deadline);
    return this.hasCleanedUpAudio;
  }

  private async performAudioCleanup(): Promise<void> {
    this.agentSilenceCueTimer.dispose();
    this.pendingClip = null;
    this.nonverbalClips.clear();
    this.clearAiPlayback("cleanup");
    try {
      if (this.workletNode) {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      }
    } catch {
      /* worklet already disconnected during partial startup */
    }
    for (const node of [
      this.processor,
      this.analyser,
      this.inputSource,
      this.outputMicSource,
    ]) {
      try {
        node?.disconnect();
      } catch {
        /* node already disconnected */
      }
    }
    const activeRecorders = [
      this.mediaRecorder,
      this.agentMediaRecorder,
    ].filter(
      (recorder): recorder is MediaRecorder =>
        recorder !== null && recorder.state !== "inactive",
    );
    const stopped = Promise.all(
      activeRecorders.map(
        (recorder) =>
          new Promise<void>((resolve) => {
            recorder.addEventListener("stop", () => resolve(), { once: true });
            try {
              recorder.stop();
            } catch {
              resolve();
            }
          }),
      ),
    );
    await this.waitForPromiseUntil(stopped, Date.now() + 1_000);

    // Once recorder stop has settled (or its bounded failure was handled),
    // stop tracks before waiting for close. A rejected/pending context cannot
    // keep the microphone alive. Also own any permission request still open.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.onLocalStream(null);
    const microphoneReleased = this.microphoneRequest?.then(
      (stream) => {
        stream.getTracks().forEach((track) => track.stop());
      },
      () => {
        /* a rejected request owns no microphone */
      },
    );
    const contexts = [this.audioContext, this.outputAudioContext].filter(
      (context): context is AudioContext => context !== null,
    );
    const results = await Promise.allSettled([
      microphoneReleased,
      closeTelefunAudioContexts(contexts),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    this.workletNode = null;
    this.processor = null;
    this.analyser = null;
    this.inputSource = null;
    this.outputMicSource = null;
    this.recordingDestination = null;
    this.agentOnlyDestination = null;
    this.stream = null;
    this.audioContext = null;
    this.outputAudioContext = null;
    this.microphoneRequest = null;
  }

  public async retryPlayback(): Promise<boolean> {
    if (this.intentionalClose) return false;
    const [inputRunning, outputRunning] = await Promise.all([
      this.resumeAudioContext(this.audioContext),
      this.resumeAudioContext(this.outputAudioContext),
    ]);
    const resumed = inputRunning && outputRunning && !this.intentionalClose;
    if (!resumed && !this.intentionalClose) this.onPlaybackBlocked();
    return resumed;
  }

  public sendTimeCue(remainingSeconds: number) {
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const text = getTimeCueInstruction(activeConsumer, remainingSeconds);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(buildGeminiRealtimeTextMessage(text)));
    }
    this.emitTimelineEvent("time_cue_prompt_sent", {
      type: "time_cue",
      remainingSeconds,
    });
  }
}
