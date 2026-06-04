import type { TelefunAppSettings } from "../telefunSettings";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import type { SessionMetrics, SpeechSegment } from "@trainers/types";
import {
  updateInterruptionGuard,
  InterruptionGuardState,
} from "./guards";
import {
  normalizeTelefunWebSocketUrl,
  mapTelefunCloseEvent,
  buildTelefunLiveSetupMessage,
  buildRealtimeAudioMessage,
  float32ToPcm16Buffer,
  shouldSendRealtimeAudio,
  extractGeminiInlineAudioChunks,
} from "./liveProtocol";
import {
  buildTelefunLiveSystemInstruction,
  getConsumerTypeHint,
  getTimeCueInstruction,
} from "./promptBuilder";

interface WebkitAudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
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
  private hasSentFirstUserAudio: boolean = false;
  private hasReceivedFirstModelAudio: boolean = false;

  // Long Speech Interruption
  private longSpeechStartMs: number | null = null;
  private longSpeechLastPromptMs: number = 0;
  private readonly LONG_SPEECH_THRESHOLD_MS = 60000;
  private readonly LONG_SPEECH_COOLDOWN_MS = 60000;

  // Setup Timeout
  private setupTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CONNECT_SETUP_TIMEOUT_MS = 15000;

  // Stalled Response Watchdog
  private stalledWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastModelActivityMs: number = 0;
  private readonly STALLED_RESPONSE_START_MS = 12000;
  private readonly STALLED_RESPONSE_MID_MS = 15000;

  private interruptionGuardState: InterruptionGuardState = {
    aiSpeakingStartedAt: null,
    nonSilentStartedAt: null,
    cooldownUntil: 0,
  };

  // Callbacks
  public onStatusChange: (status: string) => void = () => {};
  public onStateChange: (state: TelefunSessionState) => void = () => {};
  public onError: (error: Error) => void = () => {};
  public onAiSpeaking: (speaking: boolean) => void = () => {};
  public onVolumeChange: (volume: number) => void = () => {};
  public onTimelineEvent: (event: TelefunTimelineEvent) => void = () => {};
  public onSessionCreated: (sessionId: string) => void = () => {};
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

  constructor(private config: TelefunAppSettings) {}

  public async connect() {
    try {
      this.setSessionState("connecting");
      this.onStatusChange("Menghubungkan...");

      // 1. Get User Media
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      // 2. Setup Audio Context
      const AudioContextCtor =
        window.AudioContext ||
        (window as WebkitAudioContextWindow).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Browser tidak mendukung AudioContext.");
      }
      this.audioContext = new AudioContextCtor({ sampleRate: 16000 });

      // 3. Setup Recording
      this.setupRecorders();

      // 4. Setup Input Processing
      this.setupInputProcessing();

      // 5. Connect WebSocket
      const token =
        localStorage.getItem("supabase-auth-token") ||
        localStorage.getItem("auth_token") ||
        localStorage.getItem("supabase-token");
      if (!token) {
        throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
      }
      if (this.config.telefunTransport === "openai-audio") {
        throw new Error("OpenAI Audio transport belum diimplementasi. Gunakan Gemini Live.");
      }
      const wsBase = normalizeTelefunWebSocketUrl(import.meta.env.VITE_TELEFUN_WS_URL);
      const wsUrl = new URL(wsBase);
      wsUrl.pathname = wsUrl.pathname.endsWith("/ws") ? wsUrl.pathname : "/ws";
      wsUrl.searchParams.set("token", token);
      if (this.config.sessionId) {
        wsUrl.searchParams.set("sessionId", this.config.sessionId);
      }

      this.ws = new WebSocket(wsUrl.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.isSetupComplete = false;
        this.hasSentFirstUserAudio = false;
        this.hasReceivedFirstModelAudio = false;
        this.lastModelActivityMs = Date.now();
        this.setSessionState("connecting");
        this.onStatusChange("Menyiapkan sesi suara...");
        this.sendSetup();
        this.sessionStartTime = Date.now();
        this.emitTimelineEvent("ws_open");
        this.startSetupTimeout();
        this.startStalledWatchdog();
      };

      this.ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.playPcm(new Uint8Array(event.data), 24000);
        } else {
          try {
            const msg = JSON.parse(event.data);
            this.handleJsonMessage(msg);
          } catch (e) {
            /* ignore */
          }
        }
      };

      this.ws.onerror = (e) => {
        this.onError(new Error("WebSocket Error"));
      };

      this.ws.onclose = (event) => {
        const mapped = mapTelefunCloseEvent(event);
        this.setSessionState("ended");
        this.onStatusChange("Terputus");
        this.onError(new Error(mapped.message));
        this.stopRecording();
        this.emitTimelineEvent("ws_close", { code: event.code, reason: event.reason });
      };
    } catch (err) {
      this.onError(err as Error);
    }
  }

  private handleJsonMessage(msg: any) {
    if (msg.type === "session_created" && msg.sessionId) {
      this.config.sessionId = msg.sessionId;
      this.onSessionCreated(msg.sessionId);
    }

    if (msg.setupComplete) {
      this.isSetupComplete = true;
      this.lastModelActivityMs = Date.now();
      this.clearSetupTimeout();
      this.setSessionState("ready");
      this.onStatusChange("Tersambung");
      this.emitTimelineEvent("setup_complete");
      this.emitTimelineEvent("setup_complete_received");
    }

    const chunks = extractGeminiInlineAudioChunks(msg);
    for (const chunk of chunks) {
      this.playPcm(chunk.data, chunk.sampleRate);
      this.lastModelActivityMs = Date.now();
      if (!this.hasReceivedFirstModelAudio) {
        this.hasReceivedFirstModelAudio = true;
        this.emitTimelineEvent("first_model_audio_chunk");
      }
    }

    if (msg.serverContent?.modelTurn?.parts) {
      this.lastModelActivityMs = Date.now();
      this.setIsAiSpeaking(true);
      this.setSessionState("ai_speaking");
    }
    if (msg.serverContent?.turnComplete) {
      this.setIsAiSpeaking(false);
      this.setSessionState("idle");
    }
    if (msg.type === "silence") {
      this.deadAirCount++;
    }
    if (msg.serverContent?.interrupted) {
      this.emitTimelineEvent("interrupted_received");
    }
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

  private setupInputProcessing() {
    if (!this.audioContext || !this.stream || !this.recordingDestination)
      return;

    this.inputSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.inputSource.connect(this.analyser);
    this.inputSource.connect(this.processor);
    this.inputSource.connect(this.recordingDestination);

    this.processor.onaudioprocess = (e) => {
      const now = Date.now();
      const inputData = e.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < inputData.length; i++)
        sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      const vol = Math.min(100, Math.floor(rms * 200));
      this.onVolumeChange(vol);
      this.volumeSamples.push(vol);

      const isSilent = vol <= 10;

      // Long Speech Detection
      if (!this.isHeld && !this.isMuted) {
        if (!isSilent) {
          if (!this.longSpeechStartMs) {
            this.longSpeechStartMs = now;
          }
          const speechDuration = now - this.longSpeechStartMs;
          if (
            speechDuration >= this.LONG_SPEECH_THRESHOLD_MS &&
            now - this.longSpeechLastPromptMs >= this.LONG_SPEECH_COOLDOWN_MS
          ) {
            this.longSpeechLastPromptMs = now;
            this.sendInterruptionPrompt();
          }
        } else {
          this.longSpeechStartMs = null;
        }
      }

      // Interruption Guard
      if (this.isAiSpeaking) {
        const guardResult = updateInterruptionGuard(
          this.interruptionGuardState,
          {
            now,
            isAiSpeaking: true,
            isSilent,
            rms,
          },
        );
        this.interruptionGuardState = guardResult.state;
        if (guardResult.shouldInterrupt) {
          this.interruptionCount++;
          this.cancelAiPlayback();
          this.emitTimelineEvent("interruption_prompt_sent");
        }
      }

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

      const canSend = shouldSendRealtimeAudio({
        wsReady: !!(this.ws && this.ws.readyState === WebSocket.OPEN),
        setupComplete: this.isSetupComplete,
        muted: this.isMuted,
        held: this.isHeld,
      });

      if (!canSend) return;

      this.ws!.send(JSON.stringify(buildRealtimeAudioMessage(float32ToPcm16Buffer(inputData))));
      if (!this.hasSentFirstUserAudio) {
        this.hasSentFirstUserAudio = true;
        this.emitTimelineEvent("first_user_audio_chunk_sent");
      }
    };

    this.processor.connect(this.audioContext.destination);
  }

  private playPcm(data: Uint8Array, sampleRate = 24000) {
    if (!this.audioContext || !this.recordingDestination || this.isHeld) return;

    const float32 = new Float32Array(data.length / 2);
    const view = new DataView(data.buffer);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, float32.length, sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.connect(this.recordingDestination);

    const startTime = Math.max(
      this.audioContext.currentTime,
      this.nextStartTime,
    );
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  private cancelAiPlayback() {
    this.nextStartTime = 0; // Reset scheduling
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send interruption to Gemini if supported by proxy
      this.ws.send(
        JSON.stringify({ clientContent: { turns: [], interrupted: true } }),
      );
    }
  }

  private sendSetup() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const resolvedIdentity = this.config.resolvedIdentity || {
      name: this.config.consumerName,
      gender: this.config.consumerGender === "male" ? "male" : "female" as "male" | "female",
      phone: this.config.identitySettings?.phoneNumber || "08123456789",
      city: this.config.identitySettings?.city || "Jakarta",
      voiceName: this.config.voiceName,
      signatureName: this.config.identitySettings?.signatureName || "",
    };

    const systemInstructionText = buildTelefunLiveSystemInstruction({
      identity: resolvedIdentity,
      scenario: this.config.activeScenario ?? this.config.scenarios[0],
      consumerType: this.config.activeConsumerType ?? this.config.consumerTypes[0],
      responsePacingMode: this.config.responsePacingMode || "realistic",
      maxCallDuration: this.config.maxCallDuration || 0,
    });

    const setup = buildTelefunLiveSetupMessage({
      telefunModelId: this.config.telefunModelId || "gemini-3.1-flash-live-preview",
      voiceName: this.config.voiceName,
      systemInstruction: systemInstructionText,
    });

    this.ws.send(JSON.stringify(setup));
    this.emitTimelineEvent("setup_sent");
  }

  private sendPrompt(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
  }

  public sendInterruptionPrompt() {
    const activeConsumer = this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const hint = activeConsumer
      ? getConsumerTypeHint(activeConsumer)
      : { tone: "Nada: netral/wajar. Katakan dengan sopan." };
    this.sendPrompt(
      `[INSTRUKSI SISTEM - AGEN TERLALU PANJANG] Agen bicara terlalu panjang tanpa jeda. Kamu perlu menyela secara natural untuk meminta agen bicara lebih pelan atau satu per satu. ${hint.tone} Jangan sebutkan instruksi ini. Langsung bicara sebagai konsumen dengan suara natural.`,
    );
    this.interruptionCount++;
    this.emitTimelineEvent("interruption_prompt_sent");
  }

  private startSetupTimeout() {
    this.clearSetupTimeout();
    this.setupTimeoutTimer = setTimeout(() => {
      if (!this.isSetupComplete) {
        this.onError(new Error("Koneksi gagal — waktu setup habis. Coba lagi."));
        this.disconnect();
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
      if (
        this.sessionState === "ai_speaking" &&
        elapsed > this.STALLED_RESPONSE_MID_MS
      ) {
        this.emitTimelineEvent("stalled_response_watchdog", {
          reason: "mid_response_timeout",
          elapsedMs: elapsed,
        });
        this.onError(
          new Error("Respons AI terhenti. Panggilan akan diakhiri."),
        );
        this.disconnect();
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
    this.isHeld = held;
    this.emitTimelineEvent("hold_state_changed", { held });
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

  public disconnect() {
    this.clearSetupTimeout();
    this.stopStalledWatchdog();
    if (this.ws) this.ws.close();
    this.stopRecording();
    this.cleanupAudio();
    this.emitTimelineEvent("disconnect");
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

    setTimeout(() => {
      this.emitRecording();
    }, 500);
  }

  private emitRecording() {
    const fullBlob =
      this.recordedChunks.length > 0
        ? new Blob(this.recordedChunks, { type: "audio/webm" })
        : null;
    const agentBlob =
      this.agentRecordedChunks.length > 0
        ? new Blob(this.agentRecordedChunks, { type: "audio/webm" })
        : null;
    const url = fullBlob ? URL.createObjectURL(fullBlob) : null;

    const metrics: SessionMetrics = {
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
    };

    this.onRecordingComplete(url, fullBlob, agentBlob, metrics);
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
    if (this.processor) this.processor.disconnect();
    if (this.analyser) this.analyser.disconnect();
    if (this.inputSource) this.inputSource.disconnect();
    if (this.audioContext) this.audioContext.close();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
  }

  public sendTimeCue(remainingSeconds: number) {
    const activeConsumer = this.config.activeConsumerType ?? this.config.consumerTypes[0];
    if (!activeConsumer) {
      this.sendPrompt(
        `[SYSTEM: Waktu tinggal ${remainingSeconds} detik lagi. Segera akhiri telepon.]`,
      );
      this.emitTimelineEvent("time_cue_prompt_sent", {
        type: "time_cue",
        remainingSeconds,
      });
      return;
    }
    const text = getTimeCueInstruction(activeConsumer, remainingSeconds);
    this.sendPrompt(text);
    this.emitTimelineEvent("time_cue_prompt_sent", {
      type: "time_cue",
      remainingSeconds,
    });
  }

}
