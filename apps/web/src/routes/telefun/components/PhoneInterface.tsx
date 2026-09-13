import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Clock3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Volume2,
} from "lucide-react";
import type { SessionMetrics } from "@trainers/types";
import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
} from "@trainers/types";
import type { TelefunAppSettings } from "../telefunSettings";
import {
  createTelefunTransport,
  mapTelefunTransportError,
  type TelefunTransportSession,
} from "../services/telefunTransport";
import {
  getTelefunTimeCueThreshold,
  type TelefunTimeCue,
} from "../services/timingGuards";
import {
  MicrophoneActivityWaveform,
  type MicrophoneWaveformTone,
} from "./MicrophoneActivityWaveform";
import { useMicrophoneActivity } from "./useMicrophoneActivity";
import { HoldStatusDisplay } from "./HoldStatusDisplay";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { getKetikConsumerAvatarUrl } from "../../ketik/lib/ketik-avatar";

type TelefunEndSessionReason = "completed" | "failed" | "timeout";

interface PhoneInterfaceProps {
  config: TelefunAppSettings;
  accessToken: string;
  onEndSession: (reason?: TelefunEndSessionReason) => void;
  onRecordingReady?: (
    url: string | null,
    consumerName: string,
    duration: number,
    fullCallBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: SessionMetrics,
  ) => void | Promise<void>;
  onSessionCreated?: (sessionId: string) => void;
}

interface ActiveHoldUi {
  sequence: number;
  startedAtEpochMs: number;
  limitMs: number;
}

const CLEANUP_PENDING_MESSAGE =
  "Panggilan belum tersimpan. Coba lagi untuk mengakhiri.";
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
  accessToken,
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
  const [activeHold, setActiveHold] = useState<ActiveHoldUi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [cleanupRetryable, setCleanupRetryable] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [terminalFailure, setTerminalFailure] = useState(false);

  const sentTimeCues = useRef<Set<TelefunTimeCue>>(new Set());
  const holdSequenceRef = useRef(0);

  const sessionRef = useRef<TelefunTransportSession | null>(null);
  const terminalFailureRef = useRef(false);
  const mountedRef = useRef(true);

  // End-call idempotency refs
  const isDisconnectingRef = useRef(false);
  const endCallStartedRef = useRef(false);
  const cleanupRetryButtonRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (cleanupRetryable && !isDisconnecting) {
      cleanupRetryButtonRef.current?.focus();
    }
  }, [cleanupRetryable, isDisconnecting]);

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
      sentTimeCues.current = new Set();
      terminalFailureRef.current = false;
      setTerminalFailure(false);
      setCleanupRetryable(false);
      setPlaybackBlocked(false);

      try {
        let session: TelefunTransportSession | null = null;
        const bindSession = (nextSession: TelefunTransportSession) => {
          const session = nextSession;
          session.onLocalStream = (stream) => {
            if (isActive) setLocalStream(stream);
          };

          session.onSessionCreated = (sessionId) => {
            if (onSessionCreated) onSessionCreated(sessionId);
          };

          session.onStatusChange = (s) => {
            if (s === "Gagal" || s.startsWith("Error")) {
              terminalFailureRef.current = true;
              if (isActive) setTerminalFailure(true);
            }
            if (isActive) setConnectionState(s);
          };
          session.onStateChange = (state) => {
            if (!isActive) return;
            if (state === "ready") setConnectionState("Tersambung");
            if (state === "ended" && !terminalFailureRef.current) {
              setConnectionState("Selesai");
            }
          };
          session.onError = (e) => {
            terminalFailureRef.current = true;
            if (isActive) {
              setTerminalFailure(true);
              setError(mapTelefunTransportError(e));
            }
          };
          session.onPlaybackBlocked = () => {
            if (isActive) setPlaybackBlocked(true);
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
            // Transfer the page owner synchronously before upload/transition/
            // remux work can outlive the session callback deadline.
            let callbackResult: void | Promise<void> = undefined;
            if (onRecordingReadyRef.current) {
              const measuredDuration =
                Number.isFinite(metrics.sessionDurationMs) &&
                metrics.sessionDurationMs > 0
                  ? Math.round(metrics.sessionDurationMs / 1000)
                  : callDurationRef.current;
              try {
                callbackResult = await onRecordingReadyRef.current(
                  url,
                  config.consumerName,
                  measuredDuration,
                  fullBlob,
                  agentBlob,
                  metrics,
                );
              } catch (err) {
                console.error("onRecordingReady failed:", err);
                callbackResult = undefined;
              }
            }
            if (mountedRef.current && !isDisconnectingRef.current) {
              onEndSessionRef.current(
                terminalFailureRef.current ? "failed" : "completed",
              );
            }
            return callbackResult;
          };
        };

        if (isActive) {
          console.log("[Telefun] Starting ringtone sequence");
          setIsRinging(true);
          setConnectionState("Memanggil...");
          await playIncomingRing();
        }

        if (!isActive || endCallStartedRef.current) {
          console.log(
            "[Telefun] Call ended or component unmounted during ringtone, aborting connection",
          );
          return;
        }

        if (!session) {
          // Legacy transports are intentionally constructed after the ringtone.
          // Cancelling during the ringtone must not create an empty recording.
          session = createTelefunTransport(config, { accessToken });
          sessionRef.current = session;
          bindSession(session);
        }

        console.log("[Telefun] Ringtone finished, connecting to AI...");
        setIsRinging(false);
        setConnectionState("Menghubungkan...");
        void session.connect(accessToken).catch((connectError: unknown) => {
          if (terminalFailureRef.current) return;
          terminalFailureRef.current = true;
          if (isActive) {
            setTerminalFailure(true);
            setError(mapTelefunTransportError(connectError));
          }
        });
      } catch (err: unknown) {
        const failureAlreadyReported = terminalFailureRef.current;
        if (!failureAlreadyReported) {
          terminalFailureRef.current = true;
          setTerminalFailure(true);
        }
        setIsRinging(false);
        console.error("[Telefun] Failed to initialize session:", err);
        if (isActive && !failureAlreadyReported) {
          setError(mapTelefunTransportError(err));
        }
      }
    };

    startCallSequence();

    return () => {
      console.log("[Telefun] PhoneInterface unmounting, cleaning up");
      isActive = false;
      mountedRef.current = false;
      stopHoldMusic();
      if (!endCallStartedRef.current) {
        const disconnect = sessionRef.current?.disconnect("cleanup");
        if (disconnect) {
          void disconnect.catch((cleanupError: unknown) => {
            console.warn("[Telefun] cleanup disconnect failed:", cleanupError);
          });
        }
      }
      setLocalStream(null);
      if (
        uiAudioContextRef.current &&
        uiAudioContextRef.current.state !== "closed"
      ) {
        uiAudioContextRef.current.close().catch(() => {});
        uiAudioContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Hanya jalankan sekali saat mount — config object reference berubah tiap render parent

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

  // Hold timer is now derived via useTelefunHoldClock in HoldStatusDisplay.
  // No countdown decrement effect needed — duration is from timestamps.

  const isOnHold = activeHold !== null;

  const retryAudioPlayback = async () => {
    if (isDisconnectingRef.current) return;
    const didPlay = await sessionRef.current?.retryPlayback();
    if (didPlay) setPlaybackBlocked(false);
  };

  const toggleHold = () => {
    if (isDisconnectingRef.current) return;
    if (activeHold) {
      setActiveHold(null);
      stopHoldMusic();
      sessionRef.current?.setHold(false);
    } else {
      const sequence = holdSequenceRef.current + 1;
      holdSequenceRef.current = sequence;
      const limitMs =
        sequence === 1
          ? TELEFUN_FIRST_HOLD_LIMIT_MS
          : TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS;
      setActiveHold({
        sequence,
        startedAtEpochMs: Date.now(),
        limitMs,
      });
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
    async (reason?: TelefunEndSessionReason) => {
      // Guard: prevent concurrent end-call executions
      if (endCallStartedRef.current) return;
      endCallStartedRef.current = true;
      setIsDisconnecting(true);
      isDisconnectingRef.current = true;

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

      try {
        const session = sessionRef.current;
        if (session) {
          await session.disconnect(reason === "timeout" ? "timeout" : "user");
        }
      } catch (err) {
        console.error("[Telefun] disconnect error:", err);
        if (mountedRef.current) {
          // A 503 means the same durable finalization key still owns the
          // attempt. Keep this component mounted and let the trainer retry.
          setIsDisconnecting(false);
          isDisconnectingRef.current = false;
          endCallStartedRef.current = false;
          setCleanupRetryable(true);
          setError(CLEANUP_PENDING_MESSAGE);
        }
        return;
      }

      setCleanupRetryable(false);
      if (mountedRef.current) onEndSessionRef.current(reason);
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
        sentCues: sentTimeCues.current,
      });
      if (cue) {
        sentTimeCues.current.add(cue);
        sessionRef.current?.sendTimeCue?.(remaining);
      }
    }
  }, [callDuration, config.maxCallDuration, connectionState]);

  const getVolumeStatus = (volume: number) => {
    if (volume <= 0)
      return {
        color: "bg-muted-foreground/30",
        textColor: "text-muted-foreground",
        label: "Senyap",
        width: "2%",
      };
    if (volume < 10)
      return {
        color: "bg-muted-foreground/60",
        textColor: "text-muted-foreground",
        label: "Senyap",
        width: "5%",
      };
    if (volume < 35)
      return {
        color: "bg-module-telefun",
        textColor: "text-module-telefun",
        label: "Tenang/Netral",
        width: `${Math.max(10, volume)}%`,
      };
    if (volume < 65)
      return {
        color: "bg-chart-amber",
        textColor: "text-chart-amber",
        label: "Tegas/Peringatan",
        width: `${volume}%`,
      };
    return {
      color: "bg-destructive",
      textColor: "text-destructive",
      label: "Tinggi/Urgensi",
      width: `${Math.min(100, volume)}%`,
    };
  };

  const micActivity = useMicrophoneActivity({
    active: connectionState === "Tersambung" && !isOnHold,
    muted: isMuted,
    stream: localStream,
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
  const displayName = config.resolvedIdentity?.name || config.consumerName;
  const displayPhone = config.resolvedIdentity?.phone || "08123456789";
  const displayCity = config.resolvedIdentity?.city || "Jakarta";
  const initials = getInitials(displayName);
  const avatarUrl = getKetikConsumerAvatarUrl({
    name: displayName,
    phone: displayPhone,
    city: displayCity,
    gender: config.resolvedIdentity?.gender,
  });

  // Status card per-state
  let statusText = "Menghubungkan...";
  let statusBg = "bg-card";
  let statusTextColor = "text-muted-foreground";
  let statusBorder = "border-border";
  let statusIsSpeaking = false;

  if (isDisconnecting) {
    statusText = "Mengakhiri panggilan...";
    statusBg = "bg-destructive/10";
    statusTextColor = "text-destructive";
    statusBorder = "border-destructive/30";
  } else if (isOnHold) {
    statusText = "Panggilan di-HOLD";
    statusBg = "bg-chart-amber/10";
    statusTextColor = "text-chart-amber";
    statusBorder = "border-chart-amber/30";
  } else if (isRinging) {
    statusText = "Memanggil...";
    statusBg = "bg-module-telefun/10";
    statusTextColor = "text-module-telefun";
    statusBorder = "border-module-telefun/30";
  } else if (connectionState === "Tersambung" && !terminalFailure && !error) {
    if (isAiSpeaking) {
      statusText = "Konsumen sedang berbicara...";
      statusBg = "bg-module-telefun/10";
      statusTextColor = "text-module-telefun";
      statusBorder = "border-module-telefun/30";
      statusIsSpeaking = true;
    } else {
      statusText = "Konsumen sedang menunggu respon dari anda";
      statusBg = "bg-muted";
      statusTextColor = "text-foreground";
      statusBorder = "border-border";
    }
  } else if (connectionState === "Selesai") {
    statusText = "Selesai";
    statusBg = "bg-muted";
    statusTextColor = "text-foreground";
    statusBorder = "border-border";
  } else if (terminalFailure || connectionState === "Gagal" || error) {
    statusText = error || connectionState || "Gagal";
    statusBg = "bg-destructive/10";
    statusTextColor = "text-destructive";
    statusBorder = "border-destructive/30";
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <div className="relative flex h-full w-full flex-1 flex-col">
        {/* Timer */}
        <div className="relative flex shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-8">
          <Badge
            variant="outline"
            className="h-9 gap-2 rounded-lg px-3 text-sm"
          >
            <span
              className={`size-2 rounded-full ${
                connectionState === "Tersambung"
                  ? "bg-module-telefun motion-safe:animate-pulse motion-reduce:animate-none"
                  : "bg-destructive"
              }`}
            />
            <Clock3 className="size-4 text-muted-foreground" />
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatTime(callDuration)}
            </span>
          </Badge>
        </div>

        {/* Center Content */}
        <div className="relative mx-auto flex w-full flex-1 overflow-y-auto px-4 pb-8 md:px-12">
          <div className="flex min-h-full w-full flex-col items-center justify-center py-8">
            {/* Avatar */}
            <div className="relative mb-6">
              {isRinging && (
                <div className="absolute inset-0 rounded-full border border-module-telefun/30 motion-safe:animate-ping motion-reduce:animate-none" />
              )}

              {activeHold && (
                <div className="absolute inset-0 z-20">
                  <HoldStatusDisplay
                    active
                    sequence={activeHold.sequence}
                    startedAtEpochMs={activeHold.startedAtEpochMs}
                    limitMs={activeHold.limitMs}
                  />
                </div>
              )}

              <div
                className={`absolute inset-0 scale-110 rounded-full bg-module-telefun/15 transition-[opacity] duration-200 motion-reduce:transition-none ${
                  isAiSpeaking && !isOnHold
                    ? "opacity-100 motion-safe:animate-pulse motion-reduce:animate-none"
                    : "opacity-0"
                }`}
              />

              <Avatar
                size="lg"
                className={`relative z-10 !size-40 border border-border bg-muted after:!rounded-full sm:!size-48 md:!size-56 ${
                  isOnHold
                    ? "grayscale opacity-60"
                    : "transition-[filter,opacity] duration-200"
                }`}
              >
                <AvatarImage
                  src={avatarUrl}
                  alt={`Foto profil ${displayName}`}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="!rounded-full bg-module-telefun/10 text-4xl font-semibold text-module-telefun md:text-5xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Consumer Info */}
            <h1 className="mb-1 max-w-full truncate text-center text-2xl font-semibold text-foreground md:text-4xl">
              {displayName}
            </h1>
            <p className="mb-6 max-w-full truncate text-center text-sm text-muted-foreground md:text-base">
              {displayPhone} <span aria-hidden="true">·</span> {displayCity}
            </p>

            {/* Volume Indicator */}
            {!isOnHold && connectionState === "Tersambung" && (
              <div className="mb-6 flex w-full max-w-sm flex-col gap-2 md:max-w-md">
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
                  <span>Indikator Input Suara Anda</span>
                  <span className={volStatus.textColor}>
                    {isMuted ? "Mic Mute" : volStatus.label}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full border border-border bg-muted">
                  <div className="absolute bottom-0 left-[33%] top-0 w-px bg-border" />
                  <div className="absolute bottom-0 left-[66%] top-0 w-px bg-border" />
                  <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-out motion-reduce:transition-none ${volStatus.color}`}
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
            <Card
              className={`w-full max-w-xl border py-0 transition-colors duration-200 ${statusBg} ${statusBorder}`}
            >
              <CardContent className="flex flex-col items-center gap-3 px-5 py-4 text-center md:px-6 md:py-5">
                <p
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className={`text-sm font-semibold md:text-base ${statusTextColor} ${statusIsSpeaking ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`}
                >
                  {statusText}
                </p>
                {playbackBlocked && !isDisconnecting && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void retryAudioPlayback()}
                  >
                    <Volume2 data-icon="inline-start" />
                    Aktifkan audio
                  </Button>
                )}
                {cleanupRetryable && (
                  <Button
                    ref={cleanupRetryButtonRef}
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => void handleEndCall()}
                    disabled={isDisconnecting}
                    aria-busy={isDisconnecting}
                  >
                    Coba lagi mengakhiri panggilan
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Hold warnings are handled by HoldStatusDisplay phase */}
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="z-20 flex shrink-0 flex-row items-center justify-center gap-6 border-t border-border bg-card px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:w-28 md:flex-col md:gap-7 md:border-l md:border-t-0 md:px-4 md:py-6 md:pb-6">
        {/* Hold Button */}
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant={isOnHold ? "secondary" : "outline"}
            size="icon-lg"
            onClick={toggleHold}
            disabled={isRinging || isDisconnecting}
            title={isOnHold ? "Kembali ke konsumen" : "Aktifkan hold"}
            aria-label={isOnHold ? "Kembali ke konsumen" : "Aktifkan hold"}
            aria-pressed={isOnHold}
            className="size-14 rounded-full border-foreground/20 text-foreground hover:border-foreground/40 disabled:opacity-80 md:size-16"
          >
            {isOnHold ? (
              <Play data-icon="inline" className="fill-current" />
            ) : (
              <Pause data-icon="inline" />
            )}
          </Button>
          <span className="hidden text-sm font-medium text-foreground md:block">
            {isOnHold ? "Kembali" : "Hold"}
          </span>
        </div>

        {/* Mic Button */}
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant={isMuted ? "secondary" : "outline"}
            size="icon-lg"
            onClick={() => {
              if (!isDisconnectingRef.current) {
                setIsMuted((muted) => !muted);
              }
            }}
            disabled={isOnHold || isRinging || isDisconnecting}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            aria-label={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            aria-pressed={isMuted}
            className="size-14 rounded-full border-foreground/20 text-foreground hover:border-foreground/40 disabled:opacity-80 md:size-16"
          >
            {isMuted ? (
              <MicOff data-icon="inline" />
            ) : (
              <Mic data-icon="inline" />
            )}
          </Button>
          <span className="hidden text-sm font-medium text-foreground md:block">
            Mic
          </span>
        </div>

        {/* End Call Button */}
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="icon-lg"
            onClick={() => !isDisconnecting && handleEndCall()}
            disabled={isDisconnecting}
            title={isDisconnecting ? "Mengakhiri panggilan..." : "End Call"}
            aria-label={
              isDisconnecting
                ? "Mengakhiri panggilan, harap tunggu"
                : "Akhiri panggilan"
            }
            className="size-16 rounded-full disabled:opacity-80 md:size-[4.5rem]"
          >
            <PhoneOff data-icon="inline" />
          </Button>
          <span
            className={`block text-sm font-medium ${
              isDisconnecting ? "text-fg2" : "text-destructive"
            }`}
          >
            {isDisconnecting ? "Mengakhiri..." : "Hangup"}
          </span>
        </div>
      </div>
    </div>
  );
};
