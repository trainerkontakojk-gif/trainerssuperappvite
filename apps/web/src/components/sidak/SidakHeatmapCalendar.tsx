import { useMemo } from "react";

/**
 * Kalender tahunan heatmap SIDAK.
 *
 * Tanpa dependency heatmap eksternal — grid CSS sederhana. Setiap hari adalah
 * `<button>` dengan `aria-label` berisi tanggal dan jumlah temuan, jadi
 * informasinya terbaca lewat hover, fokus keyboard, DAN tap, tidak hanya lewat
 * warna. Warna hanya penguat; tanpa teks, kalender ini tidak bisa dipakai.
 */

export type HeatmapDay = { date: string; count: number };

/** Legenda tetap — satu sumber kebenaran untuk warna dan teks. */
const LEGEND: ReadonlyArray<{ label: string; min: number; max: number | null }> = [
  { label: "0", min: 0, max: 0 },
  { label: "1–2", min: 1, max: 2 },
  { label: "3–5", min: 3, max: 5 },
  { label: "6–10", min: 6, max: 10 },
  { label: "11+", min: 11, max: null },
];

function legendBucket(count: number) {
  return LEGEND.find(
    (b) => count >= b.min && (b.max === null || count <= b.max),
  )!;
}

/** Kelas warna per bucket. Token existing saja, tanpa hex hardcode. */
const BUCKET_CLASS: Record<string, string> = {
  "0": "bg-background border border-border text-muted-foreground",
  "1–2": "bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300",
  "3–5": "bg-orange-500/20 border border-orange-500/40 text-orange-700 dark:text-orange-300",
  "6–10": "bg-rose-500/20 border border-rose-500/40 text-rose-700 dark:text-rose-300",
  "11+": "bg-rose-600 text-white border border-rose-600",
};

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Jumlah hari dalam bulan (0 =ISHED, jadi gunakan Date UTC yang stabil). */
function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatTanggal(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function SidakHeatmapCalendar({
  year,
  days,
  onSelectDay,
  selectedDate,
}: {
  year: number;
  days: HeatmapDay[];
  onSelectDay?: (day: HeatmapDay) => void;
  selectedDate?: string | null;
}) {
  const countByDate = useMemo(
    () => new Map(days.map((d) => [d.date, d.count])),
    [days],
  );

  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      {/* Legenda: warna DAN label selalu berpasangan. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Intensitas temuan</span>
        <ul className="flex flex-wrap items-center gap-2">
          {LEGEND.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-4 rounded ${BUCKET_CLASS[b.label]}`}
              />
              <span>{b.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          Tidak ada temuan tercatat pada tahun {year} untuk tanggal yang
          dipilih.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {MONTH_NAMES.map((monthName, monthIndex) => {
          const firstWeekday = (
            new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6
          ) % 7;
          const totalDays = daysInMonth(year, monthIndex);

          return (
            <section
              key={monthName}
              className="rounded-xl border border-border bg-surface p-4"
              aria-label={`Kalender ${monthName} ${year}`}
            >
              <h3 className="text-sm font-semibold text-foreground">
                {monthName} {year}
              </h3>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((w) => (
                  <span
                    key={w}
                    aria-hidden="true"
                    className="pb-1 text-center text-[10px] text-muted-foreground"
                  >
                    {w}
                  </span>
                ))}
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <span key={`pad-${i}`} aria-hidden="true" />
                ))}
                {Array.from({ length: totalDays }).map((_, dayIndex) => {
                  const day = dayIndex + 1;
                  const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const count = countByDate.get(iso) ?? 0;
                  const bucket = legendBucket(count);
                  const isSelected = selectedDate === iso;

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => onSelectDay?.({ date: iso, count })}
                      aria-label={`${formatTanggal(iso)}: ${count} temuan`}
                      aria-current={isSelected ? "date" : undefined}
                      className={`flex aspect-square items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${BUCKET_CLASS[bucket.label]} ${isSelected ? "ring-2 ring-foreground" : ""}`}
                    >
                      {/* Angka hari sekaligus pembawa intensitas, jadi warna
                          tidak pernah menjadi satu-satunya pembawa makna. */}
                      {day}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}