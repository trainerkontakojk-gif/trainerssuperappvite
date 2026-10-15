import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import type { TelefunHoldInterval } from "@trainers/types";
import { Button } from "../../../components/ui/button";
import type { TelefunRecordingSource } from "../hooks/useTelefunRecordingUrl";
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
  onRetry: () => void;
  /** Durasi dari sesi, dipakai sampai metadata audio termuat. */
  fallbackDurationMs: number;
  holds: readonly TelefunHoldInterval[];
  notes: readonly TelefunPlayerNote[];
  downloadName: string;
  onTimeChange?: (ms: number) => void;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function percent(ms: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (ms / total) * 100))}%`;
}

/**
 * Pemutar rekaman Telaah. Garis waktunya hanya memuat data nyata: posisi
 * putar, jeda hold dari metrik sesi, dan catatan trainer.
 */
export function TelefunCallPlayer({
  ref,
  source,
  onRetry,
  fallbackDurationMs,
  holds,
  notes,
  downloadName,
  onTimeChange,
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
          onTimeUpdate={(event) =>
            updateTime(event.currentTarget.currentTime * 1000)
          }
          onSeeked={(event) =>
            updateTime(event.currentTarget.currentTime * 1000)
          }
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
        <div className="relative h-7 min-w-0 flex-1 rounded-md bg-surface-sunken">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-l-md border-r-2 border-module-telefun bg-module-telefun/10"
            style={{ width: percent(currentMs, totalMs) }}
          />
          {holds.map((hold) => (
            <span
              key={hold.sequence}
              aria-hidden="true"
              className="absolute inset-y-0 border-x border-dashed border-chart-orange bg-chart-orange/15"
              style={{
                left: percent(hold.startedAtMs, totalMs),
                width: percent(hold.durationMs, totalMs),
              }}
            />
          ))}
          {notes.map((note) => (
            <span
              key={note.id}
              aria-hidden="true"
              className="absolute -top-2.5 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-foreground font-mono text-xs font-bold text-background"
              style={{ left: percent(note.timestampMs, totalMs) }}
            >
              {note.number}
            </span>
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
