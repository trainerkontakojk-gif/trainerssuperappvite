import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Clock3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  UserRound,
} from "lucide-react";
import type { SessionMetrics } from "@trainers/types";
import type { TelefunAppSettings } from "../telefunSettings";
import { LiveSession } from "../services/geminiService";
import { getTelefunTimeCueThreshold } from "../services/timingGuards";
import {
  MicrophoneActivityWaveform,
  type MicrophoneWaveformTone,
} from "./MicrophoneActivityWaveform";
import { useMicrophoneActivity } from "./useMicrophoneActivity";

interface PhoneInterfaceProps {
  config: TelefunAppSettings;
  onEndSession: (reason?: string) => void;
  onRecordingReady?: (
    url: string | null,
    consumerName: string,
    duration: number,
    fullCallBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: SessionMetrics,
  ) => void;
  onSessionCreated?: (sessionId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export const PhoneInterface: React.FC<PhoneInterfaceProps> = ({
  config,
  onEndSession,
  onRecordingReady,
  onSessionCreated,
}) => {
  const [connectionState, setConnectionState] = useState("Memanggil...");
  const [callDuration, setCallDuration] = useState(0);
  const callDurationRef = useRef(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isRinging, setIsRinging] = useState(true);
  const [agentVolume, setAgentVolume] = useState(0);
  const [isOnHold, setIsOnHold] = useState(false);
  const [holdCount, setHoldCount] = useState(0);
  const [holdTimer, setHoldTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const timeCue30Sent = useRef(false);
  const timeCue20Sent = useRef(false);

  const sessionRef = useRef<LiveSession | null>(null);
  const mountedRef = useRef(true);

  const uiAudioContextRef = useRef<AudioContext | null>(null);
  const holdMusicOscillators = useRef<OscillatorNode[]>([]);
  const holdMusicGain = useRef<GainNode | null>(null);

  const onRecordingReadyRef = useRef(onRecordingReady);
  const onEndSessionRef = useRef(onEndSession);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    onRecordingReadyRef.current = onRecordingReady;
  }, [onRecordingReady]);
  useEffect(() => {
    onEndSessionRef.current = onEndSession;
  }, [onEndSession]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const getUiContext = () => {
    if (
      !uiAudioContextRef.current ||
      uiAudioContextRef.current.state === "closed"
    ) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      uiAudioContextRef.current = new AudioContextClass();
    }
    if (uiAudioContextRef.current.state === "suspended") {
      uiAudioContextRef.current.resume().catch(console.warn);
    }
    return uiAudioContextRef.current;
  };

  const playIncomingRing = useCallback(async () => {
    try {
      if (!mountedRef.current) return;
      const ctx = getUiContext();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
      gain.gain.setValueAtTime(0.5, now + 2.0);
      gain.gain.linearRampToValueAtTime(0, now + 2.1);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.5);
      osc2.stop(now + 2.5);

      setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          gain.disconnect();
        } catch (_e) {
          /* cleanup */
        }
      }, 2600);

      return new Promise((resolve) => setTimeout(resolve, 2500));
    } catch (e) {
      console.error("Ringtone error", e);
      return Promise.resolve();
    }
  }, []);

  const startHoldMusic = () => {
    try {
      const ctx = getUiContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.1;
      gain.connect(ctx.destination);
      holdMusicGain.current = gain;

      const notes = [329.63, 440, 554.37, 659.25];
      const oscillators: OscillatorNode[] = [];

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const oscGain = ctx.createGain();
        const now = ctx.currentTime;
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.1, now + 0.5 + i * 0.5);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0 + i * 0.5);
        osc.connect(oscGain);
        oscGain.connect(gain);
        osc.start();
        oscillators.push(osc);
      });

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      oscillators.push(lfo);

      holdMusicOscillators.current = oscillators;
    } catch (e) {
      console.error("Hold music error", e);
    }
  };

  const stopHoldMusic = useCallback(() => {
    holdMusicOscillators.current.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (_e) {
        /* cleanup */
      }
    });
    holdMusicOscillators.current = [];
    if (holdMusicGain.current) {
      try {
        holdMusicGain.current.disconnect();
      } catch (_e) {
        /* cleanup */
      }
      holdMusicGain.current = null;
    }
  }, []);

  useEffect(() => {
    sessionRef.current?.setMute(isMuted);
  }, [isMuted]);

  useEffect(() => {
    console.log("[Telefun] PhoneInterface mounted with config:", config);
    let isActive = true;
    mountedRef.current = true;

    const startCallSequence = async () => {
      timeCue30Sent.current = false;
      timeCue20Sent.current = false;

      if (isActive) {
        console.log("[Telefun] Starting ringtone sequence");
        setIsRinging(true);
        setConnectionState("Memanggil...");
        await playIncomingRing();
      }

      if (!isActive) {
        console.log(
          "[Telefun] Component unmounted during ringtone, aborting connection",
        );
        return;
      }

      console.log("[Telefun] Ringtone finished, connecting to AI...");
      setIsRinging(false);
      setConnectionState("Menghubungkan...");

      try {
        const session = new LiveSession(config);
        sessionRef.current = session;

        session.onSessionCreated = (sessionId) => {
          if (onSessionCreated) onSessionCreated(sessionId);
        };

        session.onStatusChange = (s) => {
          if (isActive) setConnectionState(s);
        };
        session.onError = (e) => {
          if (isActive)
            setError(
              e instanceof Error
                ? e.message
                : "Terjadi kesalahan koneksi.",
            );
        };
        session.onAiSpeaking = (speaking) => {
          if (isActive) setIsAiSpeaking(speaking);
        };
        session.onVolumeChange = (vol) => {
          if (isActive) setAgentVolume(vol);
        };
        session.onRecordingComplete = async (
          url,
          fullBlob,
          agentBlob,
          metrics,
        ) => {
          if (onRecordingReadyRef.current) {
            try {
              await onRecordingReadyRef.current(
                url,
                config.consumerName,
                callDurationRef.current,
                fullBlob,
                agentBlob,
                metrics,
              );
            } catch (err) {
              console.error("onRecordingReady failed:", err);
            }
          }
          if (mountedRef.current) {
            onEndSessionRef.current("completed");
          }
        };

        session.connect();
      } catch (err: unknown) {
        console.error("[Telefun] Failed to initialize session:", err);
        if (isActive)
          setError(
            err instanceof Error
              ? err.message
              : "Gagal memulai panggilan.",
          );
      }
    };

    startCallSequence();

    return () => {
      console.log("[Telefun] PhoneInterface unmounting, cleaning up");
      isActive = false;
      mountedRef.current = false;
      stopHoldMusic();
      sessionRef.current?.disconnect();
      if (
        uiAudioContextRef.current &&
        uiAudioContextRef.current.state !== "closed"
      ) {
        uiAudioContextRef.current.close().catch(() => {});
        uiAudioContextRef.current = null;
      }
    };
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (!isRinging && connectionState === "Tersambung") {
      timer = setInterval(() => {
        setCallDuration((prev) => {
          const next = prev + 1;
          callDurationRef.current = next;
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRinging, connectionState]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isOnHold && holdTimer > 0) {
      timer = setInterval(() => {
        setHoldTimer((prev) => prev - 1);
      }, 1000);
    } else if (isOnHold && holdTimer <= 0) {
      // timer finished
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOnHold, holdTimer]);

  const toggleHold = () => {
    if (isOnHold) {
      setIsOnHold(false);
      stopHoldMusic();
      sessionRef.current?.setHold(false);
    } else {
      const isFirstHold = holdCount === 0;
      const duration = isFirstHold ? 60 : 180;
      setHoldTimer(duration);
      setHoldCount((prev) => prev + 1);
      setIsOnHold(true);
      sessionRef.current?.setHold(true);
      startHoldMusic();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEndCall = useCallback(
    (reason?: string) => {
      stopHoldMusic();
      if (
        uiAudioContextRef.current &&
        uiAudioContextRef.current.state !== "closed"
      ) {
        try {
          uiAudioContextRef.current.close();
          uiAudioContextRef.current = null;
        } catch (_e) {
          /* cleanup */
        }
      }
      sessionRef.current?.disconnect();
      onEndSessionRef.current(reason);
    },
    [stopHoldMusic],
  );

  useEffect(() => {
    const maxMinutes = config.maxCallDuration || 0;
    if (maxMinutes > 0 && callDuration >= maxMinutes * 60) {
      handleEndCall("timeout");
    }
  }, [callDuration, config.maxCallDuration, handleEndCall]);

  useEffect(() => {
    const maxMinutes = config.maxCallDuration || 0;
    if (maxMinutes > 0 && connectionState === "Tersambung") {
      const totalSeconds = maxMinutes * 60;
      const remaining = totalSeconds - callDuration;
      const cue = getTelefunTimeCueThreshold({
        totalSeconds,
        elapsedSeconds: callDuration,
        cue30Sent: timeCue30Sent.current,
        cue20Sent: timeCue20Sent.current,
      });
      if (cue === "30s") {
        timeCue30Sent.current = true;
        sessionRef.current?.sendTimeCue(remaining);
      }
      if (cue === "20s") {
        timeCue20Sent.current = true;
        sessionRef.current?.sendTimeCue(remaining);
      }
    }
  }, [callDuration, config.maxCallDuration, connectionState]);

  const getVolumeStatus = (volume: number) => {
    if (volume <= 0)
      return { color: "bg-gray-700/50", label: "Senyap", width: "2%" };
    if (volume < 10)
      return { color: "bg-gray-700", label: "Senyap", width: "5%" };
    if (volume < 35)
      return {
        color: "bg-emerald-600",
        label: "Tenang/Netral",
        width: `${Math.max(10, volume)}%`,
      };
    if (volume < 65)
      return {
        color: "bg-yellow-500",
        label: "Tegas/Peringatan",
        width: `${volume}%`,
      };
    return {
      color: "bg-red-500",
      label: "Tinggi/Urgensi",
      width: `${Math.min(100, volume)}%`,
    };
  };

  const micActivity = useMicrophoneActivity({
    active: connectionState === "Tersambung" && !isOnHold,
    muted: isMuted,
  });
  const displayVolume = isMuted ? 0 : Math.max(agentVolume, micActivity.level);
  const volStatus = getVolumeStatus(displayVolume);
  const volumeTone: MicrophoneWaveformTone =
    isMuted || displayVolume < 10
      ? "silent"
      : displayVolume < 35
        ? "normal"
        : displayVolume < 65
          ? "warning"
          : "danger";
  const initials = getInitials(config.consumerName);
  const displayName = config.resolvedIdentity?.name || config.consumerName;
  const displayPhone = config.resolvedIdentity?.phone || "08123456789";
  const displayCity = config.resolvedIdentity?.city || "Jakarta";

  // Status card per-state
  let statusText = "Menghubungkan...";
  let statusBg = "bg-gray-800";
  let statusTextColor = "text-gray-400";
  let statusBorder = "border-white/5";

  if (isOnHold) {
    statusText = "Panggilan di-HOLD";
    statusBg = "bg-yellow-900/40";
    statusTextColor = "text-yellow-400";
    statusBorder = "border-yellow-500/30";
  } else if (isRinging) {
    statusText = "Memanggil...";
    statusBg = "bg-blue-900/40";
    statusTextColor = "text-blue-400";
    statusBorder = "border-blue-500/30";
  } else if (connectionState === "Tersambung") {
    if (isAiSpeaking) {
      statusText = "Konsumen sedang berbicara...";
      statusBg = "bg-green-900/40";
      statusTextColor = "text-green-400";
      statusBorder = "border-green-500/30";
    } else {
      statusText = "Konsumen sedang menunggu respon dari anda";
      statusBg = "bg-[#0f1e18]";
      statusTextColor = "text-[#4ade80]";
      statusBorder = "border-[#4ade80]/20";
    }
  } else if (connectionState.startsWith("Error") || error) {
    statusText = error || connectionState;
    statusBg = "bg-red-900/50";
    statusTextColor = "text-red-400";
    statusBorder = "border-red-500/30";
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f7faf8] text-slate-950 transition-colors duration-300 dark:bg-[#06110d] dark:text-white md:flex-row">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.78),transparent_44%)] dark:bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_44%)]" />

      <div className="relative z-10 flex h-full w-full flex-1 flex-col">
        {/* Timer Badge */}
        <div className="relative flex shrink-0 items-center justify-between p-4 md:p-8">
          <div className="flex items-center gap-3 rounded-full border border-emerald-900/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                connectionState === "Tersambung"
                  ? "animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                  : "bg-rose-500"
              }`}
            />
            <Clock3 className="h-4 w-4 text-slate-500 dark:text-white/45" />
            <span className="font-mono text-sm font-semibold tracking-wide text-slate-700 dark:text-white/80">
              {formatTime(callDuration)}
            </span>
          </div>
        </div>

        {/* Center Content */}
        <div className="relative mx-auto flex w-full flex-1 overflow-y-auto px-4 pb-10 md:px-12">
          <div className="flex min-h-full w-full flex-col items-center justify-center py-6">
            {/* Avatar */}
            <div className="relative mb-8">
              {isRinging && (
                <>
                  <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                  <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/10 delay-150" />
                </>
              )}

              {isOnHold && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full border-4 border-amber-400 bg-black/65 backdrop-blur-sm">
                  <div className="text-center">
                    <Pause className="mx-auto h-7 w-7 fill-current text-amber-300" />
                    <span className="mt-1 block text-xs font-bold text-amber-300">
                      HOLD
                    </span>
                    <div className="mt-1 text-xl font-mono font-bold text-white">
                      {formatTime(holdTimer)}
                    </div>
                  </div>
                </div>
              )}

              <div
                className={`absolute inset-0 scale-110 rounded-full bg-emerald-500/20 transition-transform duration-300 ${
                  isAiSpeaking && !isOnHold
                    ? "animate-ping opacity-40"
                    : "opacity-0"
                }`}
              />

              <div
                className={`relative z-10 flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border border-emerald-950/10 bg-gradient-to-br from-emerald-50 via-white to-teal-100 shadow-[0_28px_90px_rgba(15,23,42,0.16)] transition-all dark:border-white/10 dark:from-emerald-950 dark:via-slate-950 dark:to-teal-950 md:h-72 md:w-72 ${
                  isOnHold ? "grayscale blur-[1px]" : ""
                }`}
              >
                <div className="absolute inset-5 rounded-full border border-emerald-500/15" />
                <div className="absolute bottom-0 h-2/5 w-4/5 rounded-t-full bg-emerald-900/10 dark:bg-white/5" />
                <UserRound className="absolute top-10 h-20 w-20 text-emerald-700/30 dark:text-emerald-200/20 md:top-16 md:h-28 md:w-28" />
                <span className="relative mt-14 text-5xl font-black tracking-normal text-emerald-900 dark:text-emerald-100 md:mt-20 md:text-7xl">
                  {initials}
                </span>
              </div>
            </div>

            {/* Consumer Info */}
            <h1 className="mb-2 text-center text-3xl font-bold tracking-normal text-slate-950 dark:text-white md:text-5xl">
              {displayName}
            </h1>
            <p className="mb-8 text-center text-base font-medium text-slate-500 dark:text-white/55 md:text-xl">
              {displayPhone} / {displayCity}
            </p>

            {/* Volume Indicator */}
            {!isOnHold && connectionState === "Tersambung" && (
              <div className="mb-8 flex w-full max-w-sm flex-col gap-1 md:max-w-md">
                <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-white/45">
                  <span>Indikator Input Suara Anda</span>
                  <span
                    className={volStatus.color
                      .replace("bg-", "text-")
                      .replace("/50", "")}
                  >
                    {isMuted ? "Mic Mute" : volStatus.label}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full border border-emerald-950/10 bg-slate-950/10 dark:border-white/10 dark:bg-white/10">
                  <div className="absolute bottom-0 left-[33%] top-0 w-px bg-white/25" />
                  <div className="absolute bottom-0 left-[66%] top-0 w-px bg-white/25" />
                  <div
                    className={`h-full rounded-full shadow-[0_0_14px_rgba(16,185,129,0.25)] transition-all duration-100 ease-out ${volStatus.color}`}
                    style={{
                      width: isMuted ? "5%" : volStatus.width,
                    }}
                  />
                </div>
                <MicrophoneActivityWaveform
                  active={micActivity.isListening && !isMuted}
                  bars={isMuted ? [] : micActivity.bars}
                  tone={volumeTone}
                />
              </div>
            )}

            {/* Status Card */}
            <div
              className={`w-full max-w-md rounded-3xl border px-8 py-6 text-center shadow-lg backdrop-blur-md transition-all duration-300 md:max-w-2xl ${statusBg} ${statusBorder}`}
            >
              <p
                className={`text-base md:text-xl font-semibold ${statusTextColor} animate-pulse`}
              >
                {statusText}
              </p>
            </div>

            {/* Hold Warnings */}
            {isOnHold && holdTimer <= 10 && holdTimer > 0 && (
              <p className="mt-2 font-bold text-red-400 animate-bounce">
                Waktu hold hampir habis!
              </p>
            )}
            {isOnHold && holdTimer <= 0 && (
              <p className="mt-2 font-bold uppercase tracking-wider text-red-500 bg-red-900/50 px-4 py-1 rounded">
                Batas Waktu Hold Habis
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div
        className="
        shrink-0 z-20
        bg-white/88 dark:bg-slate-950/82 backdrop-blur-md border-t border-slate-950/10 dark:border-white/10 md:border-t-0 md:border-l
        flex
        flex-row justify-center items-center gap-6 md:gap-8 py-6 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]
        md:flex-col md:justify-center md:px-6 md:py-0 md:w-32 md:pb-6
      "
      >
        {/* Hold Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={toggleHold}
            disabled={isRinging}
            className={`rounded-full border p-4 shadow-lg transition-all duration-200 md:p-5 ${
              isOnHold
                ? "border-amber-400 bg-amber-400 text-black hover:bg-amber-300"
                : "border-slate-950/10 bg-slate-950/5 text-slate-900 hover:bg-slate-950/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            title={isOnHold ? "Resume Call" : "Put on Hold"}
          >
            {isOnHold ? (
              <Play className="h-6 w-6 fill-current md:h-7 md:w-7" />
            ) : (
              <Pause className="h-6 w-6 md:h-7 md:w-7" />
            )}
          </button>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground hidden md:block">
            Hold
          </span>
        </div>

        {/* Mic Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            disabled={isOnHold || isRinging}
            className={`rounded-full border p-4 shadow-lg transition-all duration-200 md:p-5 ${
              isMuted
                ? "border-slate-950 bg-slate-950 text-white hover:opacity-90 dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-950/10 bg-slate-950/5 text-slate-900 hover:bg-slate-950/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            }`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? (
              <MicOff className="h-6 w-6 md:h-7 md:w-7" />
            ) : (
              <Mic className="h-6 w-6 md:h-7 md:w-7" />
            )}
          </button>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground hidden md:block">
            Mic
          </span>
        </div>

        {/* End Call Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => handleEndCall()}
            className="rounded-full border border-red-500 bg-red-600 p-5 text-white shadow-xl shadow-red-900/30 transition-all hover:scale-105 hover:bg-red-700 md:p-6"
            title="End Call"
          >
            <PhoneOff className="h-8 w-8 md:h-9 md:w-9" />
          </button>
          <span className="text-[10px] uppercase font-bold tracking-wider text-red-500/70 hidden md:block">
            Hangup
          </span>
        </div>
      </div>
    </div>
  );
};
