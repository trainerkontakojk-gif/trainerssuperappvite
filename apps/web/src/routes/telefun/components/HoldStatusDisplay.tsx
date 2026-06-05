import { AlertTriangle, Pause } from "lucide-react";
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
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

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

  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-full border-4 border-amber-400 bg-black/65 backdrop-blur-sm"
      role="status"
      aria-live={isOvertime ? "assertive" : "polite"}
      aria-label={`Hold ke-${sequence}`}
    >
      <div className="text-center">
        {isOvertime ? (
          <AlertTriangle className="mx-auto h-7 w-7 text-red-400" />
        ) : (
          <Pause className="mx-auto h-7 w-7 fill-current text-amber-300" />
        )}
        <span className="mt-1 block text-xs font-bold text-amber-300">
          {isOvertime ? "HOLD MELEWATI BATAS" : "HOLD"}
        </span>
        <div
          className={`mt-1 text-xl font-mono font-bold ${
            isOvertime ? "text-red-400" : "text-white"
          }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {isOvertime
            ? `+${formatMs(clock.overtimeMs)}`
            : formatMs(clock.remainingMs)}
        </div>
        <span className="block text-[10px] text-amber-200/70">
          {isOvertime
            ? "Kembali ke konsumen sekarang"
            : isWarning
              ? "Segera kembali ke konsumen"
              : "Sisa waktu hold"}
        </span>
      </div>
    </div>
  );
}
