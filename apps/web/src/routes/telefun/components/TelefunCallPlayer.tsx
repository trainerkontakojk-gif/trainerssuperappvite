import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import type { TelefunHoldInterval } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { cn } from "cn";
import type { RecordingAnalysis } from "../hooks/useRecordingAnalysis";
import type { TelefunRecordingSource } from "../hooks/useTelefunRecordingUrl";
import { holdWindowsInRecording, waveformBars } from "../utils/recordingAudio";
import { formatClock } from "../utils/reviewDisplay";

export interface TelefunCallPlayerHandle {
  /** Putar rekaman dari posisi `ms`. */
  playFrom: (ms: number) => void;
}

export interface TelefunPlayerNote {
  id: string;
  timestampMs: number;
  number: number;
}

interface TelefunCallPlayerProps {
  ref?: Ref<TelefunCallPlayerHandle>;
  source: TelefunRecordingSource;
  /** Selubung rekaman untuk gelombang; batang datar selama belum siap. */
  analysis: RecordingAnalysis;
  onRetry: () => void;
  /** Durasi dari sesi, dipakai sampai metadata audio termuat. */
  fallbackDurationMs: number;
  holds: readonly TelefunHoldInterval[];
  /** Panjang sesi tercatat, untuk menyelaraskan jam hold dengan rekaman. */
  sessionDurationMs?: number;
  notes: readonly TelefunPlayerNote[];
  downloadName: string;
  onTimeChange?: (ms: number) => void;
  /** Nomor catatan di garis waktu diklik. */
  onSelectNote?: (id: string) => void;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;
/** Lebar batang gelombang + celah, dalam px. */
const BAR_STEP = 3;
const WAVE_HEIGHT = 40;

/** Gelombang rekaman dari selubung kekerasan suara; bagian terputar berwarna. */
function Waveform({
  analysis,
  progress,
}: {
  analysis: RecordingAnalysis;
  progress: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const count = Math.floor(width / BAR_STEP);
  const bars = useMemo(
    () =>
      analysis.status === "ready"
        ? waveformBars(analysis.envelope, count)
        : Array.from({ length: count }, () => 0),
    [analysis, count],
  );
  const played = Math.round(progress * bars.length);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="telefun-waveform"
      data-state={analysis.status}
      className="absolute inset-0"
    >
      <svg width={width} height={WAVE_HEIGHT} className="block">
        {bars.map((value, index) => {
          const height = Math.max(2, value * (WAVE_HEIGHT - 4));
          return (
            <rect
              key={index}
              x={index * BAR_STEP}
              y={(WAVE_HEIGHT - height) / 2}
              width={BAR_STEP - 1}
              height={height}
              rx={1}
              className={cn(
                index < played
                  ? "fill-module-telefun"
                  : "fill-muted-foreground/45",
                analysis.status === "loading" && "motion-safe:animate-pulse",
              )}
            />
          );
        })}
      </svg>
    </div>
  );
}

function percent(ms: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (ms / total) * 100))}%`;
}

/**
 * Pemutar rekaman Telaah. Garis waktunya hanya memuat data nyata: gelombang
 * dari rekaman itu sendiri, posisi putar, jeda hold dari metrik sesi, dan
 * catatan trainer. Rekaman disenyapkan selama hold: sesi lama ikut merekam
 * suara agen saat hold, padahal konsumen tidak mendengarnya.
 */
export function TelefunCallPlayer({
  ref,
  source,
  analysis,
  onRetry,
  fallbackDurationMs,
  holds,
  sessionDurationMs,
  notes,
  downloadName,
  onTimeChange,
  onSelectNote,
}: TelefunCallPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const refreshedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const totalMs = durationMs > 0 ? durationMs : fallbackDurationMs;
  const ready = source.status === "ready";
  const holdWindows = useMemo(
    () => holdWindowsInRecording(holds, durationMs, sessionDurationMs),
    [holds, durationMs, sessionDurationMs],
  );

  const syncHoldMute = (audio: HTMLAudioElement) => {
    const ms = audio.currentTime * 1000;
    audio.muted = holdWindows.some(
      (hold) => ms >= hold.startMs && ms < hold.endMs,
    );
  };
  const syncHoldMuteRef = useRef(syncHoldMute);
  syncHoldMuteRef.current = syncHoldMute;

  // `timeupdate` hanya ±4 kali per detik; cek tiap bingkai supaya batas hold tepat.
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      if (audioRef.current) syncHoldMuteRef.current(audioRef.current);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const updateTime = (ms: number) => {
    setCurrentMs(ms);
    onTimeChange?.(ms);
  };

  const seek = (ms: number) => {
    const audio = audioRef.current;
    const target = Math.max(0, ms);
    updateTime(target);
    if (!audio || audio.readyState < 1) {
      pendingSeekRef.current = target;
      return;
    }
    audio.currentTime = target / 1000;
  };

  useImperativeHandle(ref, () => ({
    playFrom: (ms: number) => {
      seek(ms);
      void audioRef.current?.play().catch(() => {});
    },
  }));

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const download = () => {
    if (source.status !== "ready") return;
    const link = document.createElement("a");
    link.href = source.url;
    link.download = downloadName;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  };

  return (
    <div className="flex flex-col gap-2.5">
      {ready && (
        <audio
          ref={audioRef}
          src={source.url}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds)) setDurationMs(seconds * 1000);
            event.currentTarget.playbackRate = speed;
            if (pendingSeekRef.current !== null) {
              event.currentTarget.currentTime = pendingSeekRef.current / 1000;
              pendingSeekRef.current = null;
            }
          }}
          onTimeUpdate={(event) => {
            syncHoldMute(event.currentTarget);
            updateTime(event.currentTarget.currentTime * 1000);
          }}
          onSeeked={(event) => {
            syncHoldMute(event.currentTarget);
            updateTime(event.currentTarget.currentTime * 1000);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            // Tautan bertanda tangan bisa kedaluwarsa; minta sekali lagi.
            if (refreshedRef.current) return;
            refreshedRef.current = true;
            onRetry();
          }}
        />
      )}

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggle}
          disabled={!ready}
          aria-label={playing ? "Jeda rekaman" : "Putar rekaman"}
          className="size-[44px] shrink-0"
        >
          {playing ? <Pause data-icon="inline" /> : <Play data-icon="inline" />}
        </Button>
        <span
          data-testid="telefun-player-time"
          className="w-11 shrink-0 font-mono text-xs font-bold text-foreground tabular-nums"
        >
          {formatClock(currentMs)}
        </span>
        <div className="relative h-10 min-w-0 flex-1">
          <Waveform
            analysis={analysis}
            progress={totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0}
          />
          {holdWindows.map((hold) => (
            <span
              key={hold.sequence}
              aria-hidden="true"
              className="absolute inset-y-0 border-x border-dashed border-chart-orange bg-chart-orange/15"
              style={{
                left: percent(hold.startMs, totalMs),
                width: percent(hold.endMs - hold.startMs, totalMs),
              }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(totalMs))}
            step={1000}
            value={Math.min(Math.round(currentMs), Math.round(totalMs))}
            disabled={!ready}
            aria-label="Posisi rekaman"
            aria-valuetext={`${formatClock(currentMs)} dari ${formatClock(totalMs)}`}
            onChange={(event) => seek(Number(event.target.value))}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
          />
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => {
                seek(note.timestampMs);
                onSelectNote?.(note.id);
              }}
              aria-label={`Catatan trainer ${note.number} di ${formatClock(note.timestampMs)}`}
              className="absolute -top-3 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-surface-elevated bg-foreground font-mono text-xs font-bold text-background transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ left: percent(note.timestampMs, totalMs) }}
            >
              {note.number}
            </button>
          ))}
        </div>
        <span className="w-11 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {formatClock(totalMs)}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={cycleSpeed}
          disabled={!ready}
          aria-label={`Kecepatan putar ${speed}×`}
          className="min-h-[44px] shrink-0 px-2.5 font-mono text-xs"
        >
          {String(speed).replace(".", ",")}×
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {holds.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 border border-dashed border-chart-orange bg-chart-orange/15"
            />
            Hold
          </span>
        )}
        {notes.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-full bg-foreground font-mono text-xs font-bold text-background"
            >
              1
            </span>
            Catatan trainer
          </span>
        )}
        {source.status === "loading" && <span>Memuat rekaman…</span>}
        {source.status === "unavailable" && (
          <span>Rekaman tidak tersedia untuk panggilan ini.</span>
        )}
        {source.status === "error" && (
          <span className="inline-flex items-center gap-2" role="alert">
            Rekaman belum bisa dimuat.
            <Button
              type="button"
              variant="link"
              onClick={() => {
                refreshedRef.current = false;
                onRetry();
              }}
              className="h-auto min-h-[44px] gap-1 px-0 text-xs"
            >
              <RotateCcw data-icon="inline-start" />
              Coba lagi
            </Button>
          </span>
        )}
        {ready && (
          <Button
            type="button"
            variant="link"
            onClick={download}
            className="ml-auto h-auto min-h-[44px] gap-1.5 px-0 text-xs text-fg2"
          >
            <Download data-icon="inline-start" />
            Unduh rekaman
          </Button>
        )}
      </div>
    </div>
  );
}
