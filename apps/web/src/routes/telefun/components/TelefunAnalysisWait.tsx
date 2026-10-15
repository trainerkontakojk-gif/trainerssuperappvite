import { useEffect, useState } from "react";
import { formatClock } from "../utils/reviewDisplay";

/** Batas waktu panggilan AI penilaian suara (`gemini-3.8-flash`, 180 detik). */
const AI_LIMIT_MS = 180_000;

interface TelefunAnalysisWaitProps {
  /** `Date.now()` saat analisis dimulai di halaman ini. */
  startedAt: number;
  /**
   * Nama wilayah status. Tanpa label, panel ini berada di dalam wilayah
   * status lain dan tidak membuat wilayah sendiri.
   */
  label?: string;
  /** Telaah ulang: hasil sebelumnya masih tampil dan dipakai bila gagal. */
  keepsPrevious?: boolean;
}

/**
 * Menunggu AI menilai: waktu berjalan dan perkiraan yang jujur, tanpa persen
 * karangan. Jam berjalan disembunyikan dari pembaca layar supaya tidak
 * diumumkan setiap detik.
 */
export function TelefunAnalysisWait({
  startedAt,
  label,
  keepsPrevious = false,
}: TelefunAnalysisWaitProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, now - startedAt);
  const late = elapsed >= AI_LIMIT_MS;

  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px] text-fg2">
        <span className="font-semibold text-foreground">
          AI sedang menilai panggilan ini
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          berjalan{" "}
          <span
            data-testid="telefun-wait-elapsed"
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
        <span className="block h-full w-full rounded-full bg-module-telefun/60 motion-safe:animate-pulse" />
      </span>
      <p className="text-[13px] leading-5 text-muted-foreground">
        {late
          ? "Lebih lama dari biasanya. Tunggu sebentar lagi."
          : "Biasanya 1–2 menit, paling lama sekitar 3 menit."}
        {keepsPrevious &&
          (late
            ? " Bila gagal, hasil sebelumnya tetap dipakai."
            : " Hasil sekarang tetap tampil sampai hasil baru siap.")}
      </p>
    </div>
  );
}
