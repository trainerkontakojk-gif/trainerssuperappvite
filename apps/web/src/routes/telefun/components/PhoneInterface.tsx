import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  Phone as PhoneIcon,
  User,
} from "lucide-react";
import type { SessionMetrics } from "@trainers/types";
import type { TelefunAppSettings } from "../telefunSettings";
import { LiveSession } from "../services/geminiService";
import { getTelefunTimeCueThreshold } from "../services/timingGuards";

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
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const PhoneInterface: React.FC<PhoneInterfaceProps> = ({
  config,
  onEndSession,
  onRecordingReady,
  onSessionCreated,
}) => {
  const [status, setStatus] = useState("Menghubungkan...");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [callState, setCallState] = useState<
    "connecting" | "connected" | "finalizing" | "ended"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  const callStateRef = useRef<"connecting" | "connected" | "finalizing" | "ended">("connecting");
  const setCallStateWithRef = (nextState: "connecting" | "connected" | "finalizing" | "ended") => {
    callStateRef.current = nextState;
    setCallState(nextState);
  };

  const sessionRef = useRef<LiveSession | null>(null);
  const mountedRef = useRef(true);
  const durationRef = useRef(0);
  const timerStartedRef = useRef(false);

  const timeCue30Sent = useRef(false);
  const timeCue20Sent = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const session = new LiveSession(config);
    sessionRef.current = session;

    session.onSessionCreated = (sessionId) => {
      if (onSessionCreated) {
        onSessionCreated(sessionId);
      }
    };

    session.onStatusChange = (nextStatus) => {
      if (!mountedRef.current) return;
      setStatus(nextStatus);
      if (nextStatus === "Terputus") {
        if (callStateRef.current === "connected") {
          setCallStateWithRef("finalizing");
          setStatus("Sedang menyimpan rekaman...");
        } else if (callStateRef.current === "connecting") {
          setCallStateWithRef("ended");
          onEndSession("disconnected");
        }
      }
    };

    session.onError = (err) => {
      if (!mountedRef.current) return;
      if (callStateRef.current === "connected") {
        setCallStateWithRef("finalizing");
        setStatus("Sedang menyimpan rekaman...");
      } else if (callStateRef.current === "connecting") {
        setError(err.message);
        setCallStateWithRef("ended");
        onEndSession(err.message);
      }
    };

    session.onAiSpeaking = (speaking) => {
      if (!mountedRef.current) return;
      setIsAiSpeaking(speaking);
    };

    session.onVolumeChange = (nextVolume) => {
      if (!mountedRef.current) return;
      setVolume(nextVolume);
    };

    session.onRecordingComplete = async (url, fullBlob, agentBlob, metrics) => {
      if (onRecordingReady) {
        try {
          await onRecordingReady(
            url,
            config.consumerName,
            durationRef.current,
            fullBlob,
            agentBlob,
            metrics,
          );
        } catch (err) {
          console.error("onRecordingReady failed:", err);
        }
      }
      if (mountedRef.current) {
        setCallStateWithRef("ended");
        onEndSession("completed");
      }
    };

    session
      .connect()
      .then(() => {
        if (!mountedRef.current) return;
        setCallStateWithRef("connected");
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(
          err instanceof Error ? err.message : "Gagal memulai panggilan.",
        );
        setCallStateWithRef("ended");
        onEndSession("connect_failed");
      });

    const timer = window.setInterval(() => {
      if (!mountedRef.current) return;
      if (callStateRef.current === "connected") {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }
    }, 1000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      session.disconnect();
      sessionRef.current = null;
    };
  }, [config, onEndSession, onRecordingReady]);

  useEffect(() => {
    sessionRef.current?.setMute(isMuted);
  }, [isMuted]);

  useEffect(() => {
    sessionRef.current?.setHold(isHeld);
  }, [isHeld]);

  useEffect(() => {
    const maxMinutes = config.maxCallDuration || 0;
    if (maxMinutes <= 0 || callState !== "connected") return;
    const totalSeconds = maxMinutes * 60;
    const remaining = totalSeconds - duration;
    const cue = getTelefunTimeCueThreshold({
      totalSeconds,
      elapsedSeconds: duration,
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
    if (duration >= totalSeconds) {
      sessionRef.current?.disconnect();
      setCallStateWithRef("finalizing");
      setStatus("Sedang menyimpan rekaman...");
    }
  }, [callState, config.maxCallDuration, duration, onEndSession]);

  const endCall = () => {
    sessionRef.current?.disconnect();
    setCallStateWithRef("finalizing");
    setStatus("Sedang menyimpan rekaman...");
  };

  const initials = getInitials(config.consumerName);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-50 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-950 p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white ${
                callState === "connecting" || callState === "finalizing"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-emerald-500"
              } shadow-xl shadow-emerald-500/20`}
            >
              {callState === "connecting" || callState === "finalizing" ? (
                <PhoneIcon className="h-10 w-10" />
              ) : (
                <User className="h-10 w-10" />
              )}
            </div>
            {callState === "connected" && (
              <div className="absolute -inset-2 rounded-full border-2 border-emerald-400/30 animate-ping" />
            )}
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {config.consumerName}
            </h2>
            {config.resolvedIdentity && (
              <p className="text-xs font-semibold text-slate-400 dark:text-white/40 mt-1">
                {config.resolvedIdentity.phone} • {config.resolvedIdentity.city}
              </p>
            )}
            <div className="text-sm font-medium text-slate-500 dark:text-white/55 mt-2 flex items-center justify-center gap-2">
              <span>{status}</span>
              {isHeld && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/30 animate-pulse">
                  HOLD
                </span>
              )}
              {isMuted && (
                <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/40 px-2.5 py-0.5 text-xs font-bold text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/30">
                  MUTED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Avatar initials circle */}
        {callState === "connected" && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-3 rounded-full bg-emerald-500/10 px-5 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">
                {initials}
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {config.scenarioTitle || "Tersambung"}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Status Panel */}
        <div className="rounded-[2rem] border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-6 shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/40">
                Durasi
              </span>
              <span className="font-mono text-lg font-black text-slate-900 dark:text-white">
                {Math.floor(duration / 60)}:
                {String(duration % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/40">
                Volume
              </span>
              <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                {volume}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, volume))}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`inline-block h-2 w-2 rounded-full ${isAiSpeaking ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
              />
              {isAiSpeaking ? "AI sedang berbicara" : "Menunggu respons Anda"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setIsMuted((v) => !v)}
            disabled={callState === "connecting" || callState === "finalizing"}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition-all disabled:opacity-40 ${
              isMuted
                ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
            }`}
          >
            {isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isMuted ? "Buka Mic" : "Mute"}
          </button>

          <button
            type="button"
            onClick={() => setIsHeld((v) => !v)}
            disabled={callState === "connecting" || callState === "finalizing"}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition-all disabled:opacity-40 ${
              isHeld
                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
            }`}
          >
            <Volume2 className="h-4 w-4" />
            {isHeld ? "Lanjutkan" : "Hold"}
          </button>

          <button
            type="button"
            onClick={endCall}
            disabled={callState === "connecting" || callState === "finalizing"}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:opacity-40 shadow-lg shadow-red-600/20"
          >
            {callState === "finalizing" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
            {callState === "finalizing" ? "Menyimpan..." : "Akhiri"}
          </button>
        </div>
      </div>
    </div>
  );
};
