import { cn } from "cn";
import { useTelefunHoldClock } from "../hooks/useTelefunHoldClock";

interface HoldStatusDisplayProps {
  active: boolean;
  sequence: number;
  startedAtEpochMs: number;
  limitMs: number;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}.${secs.toString().padStart(2, "0")}`;
}

/**
 * Pita hold di bawah kepala layar panggilan: lama ditahan dibanding batasnya
 * (1 menit untuk hold pertama, 3 menit berikutnya). Lewat batas diumumkan
 * tegas, karena konsumen sudah menunggu terlalu lama.
 */
export function HoldStatusDisplay({
  active,
  sequence,
  startedAtEpochMs,
  limitMs,
}: HoldStatusDisplayProps) {
  const clock = useTelefunHoldClock(active, startedAtEpochMs, limitMs);

  if (!active) return null;

  const isOvertime = clock.phase === "overtime";
  const isWarning = clock.phase === "warning";
  const progress = Math.min(100, (clock.elapsedMs / limitMs) * 100);

  return (
    <div
      role="status"
      aria-live={isOvertime ? "assertive" : "polite"}
      aria-label={`Hold ke-${sequence}`}
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5 text-[13px] text-foreground sm:px-6",
        isOvertime ? "bg-destructive/10" : "bg-chart-orange/10",
      )}
    >
      <strong className="font-semibold">
        {isOvertime ? "Hold melewati batas" : "Panggilan ditahan"}
      </strong>
      <span className="font-mono font-bold tabular-nums">
        {isOvertime
          ? `+${formatMs(clock.overtimeMs)}`
          : formatMs(clock.elapsedMs)}
      </span>
      <span className="text-muted-foreground">
        {isOvertime
          ? "Kembali ke konsumen sekarang"
          : isWarning
            ? `Segera kembali ke konsumen · batas ${formatMs(limitMs)}`
            : `dari batas ${formatMs(limitMs)}`}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            isOvertime ? "bg-destructive" : "bg-chart-orange",
          )}
          style={{ width: `${progress}%` }}
        />
      </span>
    </div>
  );
}
