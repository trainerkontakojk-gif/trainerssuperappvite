import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Mic, MicOff, Pause, PhoneOff, Play, Volume2 } from "lucide-react";
import type { SessionMetrics } from "@trainers/types";
import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
} from "@trainers/types";
import { cn } from "cn";
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
import { useMicrophoneActivity } from "./useMicrophoneActivity";
import { HoldStatusDisplay } from "./HoldStatusDisplay";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Button } from "../../../components/ui/button";

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
  /** Nama peserta bila trainer menjalankan panggilan untuk peserta. */
  participantLabel?: string | null;
}

interface ActiveHoldUi {
  sequence: number;
  startedAtEpochMs: number;
  limitMs: number;
}

/** Level di bawah ini dianggap senyap (skala 0–100). */
const SILENT_VOLUME = 6;
const SILENCE_NOTICE_MS = 6000;
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
  participantLabel = null,
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
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  // Dialog konfirmasi dirender di dalam lapisan panggilan (`fixed z-[100]`).
  const [layer, setLayer] = useState<HTMLElement | null>(null);

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
    return `${mins.toString().padStart(2, "0")}.${secs.toString().padStart(2, "0")}`;
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


  const micActivity = useMicrophoneActivity({
    active: connectionState === "Tersambung" && !isOnHold,
    muted: isMuted,
    stream: localStream,
  });
  const displayVolume = isMuted ? 0 : Math.max(agentVolume, micActivity.level);
  const isConnected =
    connectionState === "Tersambung" && !terminalFailure && !error;

  // "Suara Anda tidak terdeteksi" hanya setelah beberapa detik benar-benar
  // senyap saat giliran agen; jeda bicara biasa tidak memicunya.
  const lastHeardAtRef = useRef(0);
  const [micSilent, setMicSilent] = useState(false);
  const listening = isConnected && !isOnHold && !isMuted && !isAiSpeaking;
  useEffect(() => {
    if (displayVolume >= SILENT_VOLUME) lastHeardAtRef.current = Date.now();
  }, [displayVolume]);
  useEffect(() => {
    lastHeardAtRef.current = Date.now();
    if (!listening) {
      setMicSilent(false);
      return;
    }
    const timer = setInterval(() => {
      setMicSilent(Date.now() - lastHeardAtRef.current > SILENCE_NOTICE_MS);
    }, 1000);
    return () => clearInterval(timer);
  }, [listening]);

  const displayName = config.resolvedIdentity?.name || config.consumerName;
  const displayPhone = config.resolvedIdentity?.phone || "08123456789";
  const displayCity = config.resolvedIdentity?.city || "Jakarta";
  const initials = getInitials(displayName);
  // Satu baris status netral, seperti layar softphone.
  let statusText = "Menghubungkan…";
  let statusTone: "neutral" | "failure" = "neutral";
  if (isDisconnecting) {
    statusText = "Menyimpan rekaman…";
  } else if (isOnHold) {
    statusText = "Ditahan · konsumen mendengar musik tunggu";
  } else if (isRinging) {
    statusText = "Memanggil…";
  } else if (isConnected) {
    statusText = isAiSpeaking ? "Konsumen berbicara" : "Giliran Anda";
  } else if (connectionState === "Selesai") {
    statusText = "Panggilan selesai";
  } else if (terminalFailure || connectionState === "Gagal" || error) {
    statusText = error || "Panggilan terputus";
    statusTone = "failure";
  }

  return (
    <section
      ref={setLayer}
      aria-label="Panggilan"
      className="relative flex h-full w-full flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2.5 sm:px-6">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-module-telefun/10 font-display text-sm font-bold text-foreground"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {displayPhone} · {displayCity}
            {participantLabel && ` · Peserta: ${participantLabel}`}
          </p>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold text-foreground tabular-nums">
          <span className="sr-only">Lama panggilan </span>
          {formatTime(callDuration)}
        </span>
      </header>

      {activeHold && (
        <HoldStatusDisplay
          active
          sequence={activeHold.sequence}
          startedAtEpochMs={activeHold.startedAtEpochMs}
          limitMs={activeHold.limitMs}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-24 items-center justify-center rounded-full bg-module-telefun/10 font-display text-3xl font-bold text-foreground ring-8 ring-module-telefun/10 transition-opacity duration-200 motion-reduce:transition-none",
            isOnHold && "opacity-50 ring-0",
            isRinging && "motion-safe:animate-pulse",
          )}
        >
          {initials}
        </span>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "inline-flex min-h-8 max-w-md items-center gap-2 rounded-full border px-3.5 text-[13px]",
            statusTone === "failure"
              ? "border-destructive bg-destructive/10 text-foreground"
              : "border-border bg-surface-elevated text-foreground",
          )}
        >
          {statusText}
        </p>
        {isOnHold && (
          <p className="max-w-[34ch] text-xs text-muted-foreground">
            Kembali sebelum batas, lalu ucapkan terima kasih sudah menunggu.
          </p>
        )}
        {isConnected && !isOnHold && (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span>{isMuted ? "Mikrofon dibisukan" : "Mikrofon"}</span>
              <span
                aria-hidden="true"
                className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-sunken"
              >
                <span
                  className="block h-full rounded-full bg-chart-green transition-[width] duration-100 ease-out motion-reduce:transition-none"
                  style={{ width: `${isMuted ? 0 : Math.min(100, displayVolume)}%` }}
                />
              </span>
            </div>
            {micSilent && (
              <p className="text-xs text-fg2">
                Suara Anda tidak terdeteksi. Periksa mikrofon atau bicara lebih
                dekat.
              </p>
            )}
          </div>
        )}
        {playbackBlocked && !isDisconnecting && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void retryAudioPlayback()}
            className="min-h-[44px] gap-2"
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
            onClick={() => void handleEndCall()}
            disabled={isDisconnecting}
            aria-busy={isDisconnecting}
            className="min-h-[44px]"
          >
            Coba lagi mengakhiri panggilan
          </Button>
        )}
      </div>

      <div className="flex shrink-0 items-start justify-center gap-7 border-t border-border bg-surface-elevated px-6 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <CallControl label={isOnHold ? "Lanjutkan" : "Tahan"}>
          <Button
            type="button"
            variant={isOnHold ? "default" : "outline"}
            size="icon-lg"
            onClick={toggleHold}
            disabled={isRinging || isDisconnecting}
            aria-label={isOnHold ? "Lanjutkan" : "Tahan"}
            aria-pressed={isOnHold}
            className="size-14 rounded-full"
          >
            {isOnHold ? (
              <Play data-icon="inline" className="fill-current" />
            ) : (
              <Pause data-icon="inline" />
            )}
          </Button>
        </CallControl>
        <CallControl label={isMuted ? "Bunyikan" : "Bisukan"}>
          <Button
            type="button"
            variant={isMuted ? "default" : "outline"}
            size="icon-lg"
            onClick={() => {
              if (!isDisconnectingRef.current) setIsMuted((muted) => !muted);
            }}
            disabled={isOnHold || isRinging || isDisconnecting}
            aria-label={isMuted ? "Bunyikan" : "Bisukan"}
            aria-pressed={isMuted}
            className="size-14 rounded-full"
          >
            {isMuted ? <MicOff data-icon="inline" /> : <Mic data-icon="inline" />}
          </Button>
        </CallControl>
        <CallControl label={isDisconnecting ? "Mengakhiri…" : "Akhiri"}>
          <Button
            type="button"
            variant="destructive"
            size="icon-lg"
            onClick={() => setConfirmEndOpen(true)}
            disabled={isDisconnecting}
            aria-label={isDisconnecting ? "Mengakhiri panggilan" : "Akhiri"}
            className="size-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <PhoneOff data-icon="inline" />
          </Button>
        </CallControl>
      </div>

      <ConfirmDialog
        // Panggilan yang berakhir sendiri (durasi habis) menutup konfirmasi.
        open={confirmEndOpen && !isDisconnecting}
        title="Akhiri panggilan?"
        description="Rekaman disimpan lalu AI menilai suara Anda. Panggilan yang sudah diakhiri tidak bisa dilanjutkan."
        cancelLabel="Lanjutkan panggilan"
        confirmLabel="Akhiri panggilan"
        container={layer}
        onCancel={() => setConfirmEndOpen(false)}
        onConfirm={() => {
          setConfirmEndOpen(false);
          void handleEndCall();
        }}
      />
    </section>
  );
};

function CallControl({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span aria-hidden="true" className="text-xs font-medium text-foreground">
        {label}
      </span>
    </div>
  );
}
