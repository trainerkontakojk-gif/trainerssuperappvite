import { useEffect, useState } from "react";

const REVIEW_LIMIT_MS = 180_000;

function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Waktu berjalan dan estimasi jujur untuk antrean Telaah KETIK. */
export function KetikReviewWait() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const late = elapsed >= REVIEW_LIMIT_MS;

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-fg2">
        <span className="font-semibold text-foreground">
          AI sedang menelaah percakapan ini
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          berjalan{" "}
          <span
            data-testid="ketik-wait-elapsed"
            className="font-mono font-medium text-foreground tabular-nums"
          >
            {formatClock(elapsed)}
          </span>
        </span>
      </p>
      <span
        aria-hidden="true"
        className="h-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span className="block h-full w-full rounded-full bg-module-ketik/60 motion-safe:animate-pulse" />
      </span>
      <p className="text-[13px] leading-5 text-muted-foreground">
        {late
          ? "Lebih lama dari biasanya. Tunggu sebentar lagi."
          : "Biasanya 1–2 menit, paling lama sekitar 3 menit."}
      </p>
    </div>
  );
}
