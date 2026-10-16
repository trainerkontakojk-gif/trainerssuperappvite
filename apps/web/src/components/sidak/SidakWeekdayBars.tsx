import { useMemo } from "react";
import { WEEKDAY_FULL, buildHeatmapInsights } from "./heatmap-insights";
import type { HeatmapDay } from "./SidakHeatmapCalendar";

const INTEGER = new Intl.NumberFormat("id-ID");
const WEEKDAY_SHORT = WEEKDAY_FULL.map((label) => label.slice(0, 3));

/**
 * Bar jumlah temuan per hari dalam minggu (Senin–Minggu). Dipakai Dashboard
 * dan di bawah kalender Heatmap supaya hari bisa dibandingkan sekilas. Angka
 * tiap bar tertulis; bar tertinggi diberi warna penuh.
 */
export function SidakWeekdayBars({
  totals,
  year,
}: {
  totals: readonly number[];
  year: number;
}) {
  const max = Math.max(...totals);
  return (
    <div
      role="img"
      aria-label={`Temuan per hari dalam minggu ${year}: ${totals
        .map((total, index) => `${WEEKDAY_FULL[index]}: ${total} temuan`)
        .join(", ")}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="relative min-h-32 flex-1 border-b border-border">
        <div className="absolute inset-0 flex items-end gap-2 pt-5">
          {totals.map((total, index) => {
            const isPeak = total > 0 && total === max;
            return (
              <div
                key={WEEKDAY_FULL[index]}
                title={`${WEEKDAY_FULL[index]}: ${INTEGER.format(total)} temuan`}
                className="flex h-full flex-1 items-end"
              >
                <div
                  className={`relative w-full rounded-t-[3px] ${
                    isPeak ? "bg-foreground" : "bg-foreground/45"
                  }`}
                  style={{
                    height:
                      total > 0
                        ? `${Math.max(4, (total / max) * 100)}%`
                        : "2px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-full mb-1 text-center text-xs leading-4 tabular-nums ${
                      isPeak
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {INTEGER.format(total)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 flex gap-2 text-center text-xs text-muted-foreground"
      >
        {WEEKDAY_SHORT.map((label) => (
          <span key={label} className="flex-1">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bagian "Temuan per hari dalam minggu" di bawah kalender Heatmap. */
export function SidakWeekdayPattern({
  days,
  year,
}: {
  days: HeatmapDay[];
  year: number;
}) {
  const insights = useMemo(() => buildHeatmapInsights(days), [days]);
  const busiest = insights.busiestWeekday;
  return (
    <section
      aria-labelledby="sidak-weekday-pattern-title"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="sidak-weekday-pattern-title"
          className="text-sm font-semibold text-foreground"
        >
          Temuan per hari dalam minggu
        </h3>
        <p className="text-sm text-fg2">
          {busiest && busiest.total > 0
            ? `${busiest.label} paling banyak · ${INTEGER.format(busiest.total)} temuan`
            : `Belum ada temuan di ${year}`}
        </p>
      </div>
      <div className="flex h-44 flex-col">
        <SidakWeekdayBars totals={insights.weekdayTotals} year={year} />
      </div>
      <p className="text-xs text-muted-foreground">
        Jumlah temuan {year} dijumlah per hari (Senin–Minggu) dari kalender di
        atas.
      </p>
    </section>
  );
}
