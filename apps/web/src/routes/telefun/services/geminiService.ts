import type { TelefunAppSettings } from "../telefunSettings";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import type { SessionMetrics, SpeechSegment } from "@trainers/types";
import {
  RealisticModeOrchestrator,
  RealisticModeConfig,
} from "./realisticMode/RealisticModeOrchestrator";
import {
  resolveTelefunRealisticModeConfig,
  updateInterruptionGuard,
  InterruptionGuardState,
} from "./guards";
import {
  normalizeTelefunWebSocketUrl,
  mapTelefunCloseEvent,
  buildTelefunLiveSetupMessage,
  buildRealtimeAudioMessage,
} from "./liveProtocol";
import { buildTelefunLiveSystemInstruction } from "./promptBuilder";

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

  // Realistic Mode
  private orchestrator: RealisticModeOrchestrator | null = null;
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

  constructor(private config: TelefunAppSettings) {
    if (config.realisticModeEnabled) {
      const orchestratorConfig = resolveTelefunRealisticModeConfig(config);
      this.orchestrator = new RealisticModeOrchestrator(orchestratorConfig);
    }
  }

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
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });

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
        this.setSessionState("ready");
        this.onStatusChange("Tersambung");
        this.sendSetup();
        this.sessionStartTime = Date.now();
        this.emitTimelineEvent("ws_open");
      };

      this.ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.playPcm(new Uint8Array(event.data));
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
    if (msg.serverContent?.modelTurn?.parts) {
      this.setIsAiSpeaking(true);
      this.setSessionState("ai_speaking");
      if (this.orchestrator) this.orchestrator.onConsumerResponse(Date.now());
    }
    if (msg.serverContent?.turnComplete) {
      this.setIsAiSpeaking(false);
      this.setSessionState("idle");
      if (this.orchestrator) {
        const action = this.orchestrator.onModelTurnComplete();
        this.handleOrchestratorAction(action);
      }
    }
    if (msg.type === "silence") {
      this.deadAirCount++;
    }
    if (msg.serverContent?.interrupted) {
      this.emitTimelineEvent("interrupted_received");
    }
  }

  private handleOrchestratorAction(action: any) {
    if (action.type === "inject_prompt") {
      this.sendPrompt(action.text);
      this.emitTimelineEvent("realistic_mode_prompt", {
        text: action.text,
        source: action.source,
      });
    } else if (action.type === "session_recovery") {
      this.emitTimelineEvent("realistic_mode_session_recovery");
      // Potentially reconnect or reset
    } else if (action.type === "end_session") {
      this.disconnect();
      this.emitTimelineEvent("realistic_mode_end_session", {
        source: action.source,
      });
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

      // Realistic Mode Orchestration
      if (this.orchestrator && !this.isHeld && !this.isMuted) {
        const ttResult = this.orchestrator.evaluateAudioFrame({
          now,
          isSilent,
          rms,
          sessionState: this.sessionState,
        });

        if (ttResult.action === "end_of_turn") {
          this.emitTimelineEvent("local_user_turn_end_detected");
        }

        const fallbackAction = this.orchestrator.evaluateFallbackResponse({
          now,
          sessionState: this.sessionState,
        });
        this.handleOrchestratorAction(fallbackAction);

        const silenceAction = this.orchestrator.evaluateProlongedSilence({
          now,
          agentSpeaking: !isSilent,
          agentAudioDurationMs: this.currentSpeechSegment
            ? now - this.currentSpeechSegment.startMs
            : 0,
          sessionState: this.sessionState,
          uiHoldActive: this.isHeld,
        });
        this.handleOrchestratorAction(silenceAction);
      }

      // Speech Segments
      if (!isSilent) {
        if (!this.currentSpeechSegment) {
          this.currentSpeechSegment = { startMs: now };
          this.setSessionState("user_speaking");
          if (this.orchestrator) this.orchestrator.onAgentStartSpeaking(now);
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
        if (this.orchestrator) this.orchestrator.onAgentStopSpeaking(now);
      }

      if (
        this.isMuted ||
        this.isHeld ||
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN
      )
        return;

      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
      }
      this.ws.send(JSON.stringify(buildRealtimeAudioMessage(pcm16.buffer)));
    };

    this.processor.connect(this.audioContext.destination);
  }

  private playPcm(data: Uint8Array) {
    if (!this.audioContext || !this.recordingDestination || this.isHeld) return;

    const float32 = new Float32Array(data.length / 2);
    const view = new DataView(data.buffer);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, float32.length, 16000);
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
        },
      }),
    );
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    this.emitTimelineEvent("mute_changed", { muted });
  }

  public setHold(held: boolean) {
    this.isHeld = held;
    this.emitTimelineEvent("hold_state_changed", { held });
    if (this.orchestrator) {
      const action = this.orchestrator.evaluateHoldStateInput({
        now: Date.now(),
        uiButtonPressed: held,
        uiButtonReleased: !held,
        uiTimerExpired: false,
      });
      this.handleOrchestratorAction(action);
    }
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

    if (this.orchestrator) {
      const rmMetrics = this.orchestrator.getMetrics();
      (metrics as any).realisticModeMetrics = rmMetrics;
    }

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
    this.sendPrompt(
      `[SYSTEM: Waktu tinggal ${remainingSeconds} detik lagi. Segera akhiri telepon.]`,
    );
    this.emitTimelineEvent("dead_air_prompt_sent", {
      type: "time_cue",
      remainingSeconds,
    });
  }

  public getOrchestrator() {
    return this.orchestrator;
  }
}
