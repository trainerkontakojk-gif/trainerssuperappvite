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

/** Bucket intensitas hasil turunan data, bukan ambang tetap. */
type IntensityBucket = {
  label: string;
  min: number;
  max: number | null;
  level: 0 | 1 | 2 | 3 | 4;
};

/**
 * Susun bucket intensitas dari sebaran data tahun aktif, bukan ambang tetap.
 *
 * Bucket `0` selalu ada. Hari yang punya temuan dibagi memakai kuartil,
 * sehingga tiap warna mewakili porsi hari yang sebanding dan skalanya tetap
 * terbaca berapa pun volume temuannya. Ambang yang bertabrakan digabung supaya
 * tidak pernah muncul bucket kosong.
 */
function buildIntensityBuckets(counts: readonly number[]): IntensityBucket[] {
  const zero: IntensityBucket = { label: "0", min: 0, max: 0, level: 0 };

  const positive = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (positive.length === 0) return [zero];

  const min = positive[0];
  const max = positive[positive.length - 1];
  const cuts = [
    ...new Set(
      [
        quantile(positive, 0.25),
        quantile(positive, 0.5),
        quantile(positive, 0.75),
      ].filter((cut) => cut >= min && cut < max),
    ),
  ].sort((a, b) => a - b);

  const ranges: Array<{ min: number; max: number | null }> = [];
  let start = min;
  for (const cut of cuts) {
    if (cut < start) continue;
    ranges.push({ min: start, max: cut });
    start = cut + 1;
  }
  // Sisa di atas potongan terakhir menjadi bucket terbuka.
  if (start <= max) ranges.push({ min: start, max: null });

  return [
    zero,
    ...ranges.map((range, index) => {
      // Warna disebar merata sehingga bucket tertinggi selalu paling kuat.
      const level = (ranges.length === 1
        ? 4
        : Math.round((index / (ranges.length - 1)) * 3) +
          1) as IntensityBucket["level"];
      const label =
        range.max === null
          ? range.min === max
            ? `${range.min}`
            : `${range.min}+`
          : range.min === range.max
            ? `${range.min}`
            : `${range.min}–${range.max}`;
      return { label, min: range.min, max: range.max, level };
    }),
  ];
}

/** Kuantil "nearest-rank", dijaga tetap di dalam batas array. */
function quantile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.floor(fraction * sorted.length),
  );
  return sorted[index];
}

/** Bucket yang memuat sebuah count. Rentang selalu menutup semua nilai. */
function bucketForCount(count: number, buckets: readonly IntensityBucket[]) {
  return (
    buckets.find(
      (bucket) =>
        count >= bucket.min && (bucket.max === null || count <= bucket.max),
    ) ?? buckets[buckets.length - 1]
  );
}

/** Kelas warna per tingkat intensitas. Token existing saja, tanpa hex hardcode. */
const LEVEL_CLASS: Record<IntensityBucket["level"], string> = {
  0: "bg-background border border-border text-muted-foreground",
  1: "bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300",
  2: "bg-orange-500/20 border border-orange-500/40 text-orange-700 dark:text-orange-300",
  3: "bg-rose-500/20 border border-rose-500/40 text-rose-700 dark:text-rose-300",
  4: "bg-rose-600 text-white border border-rose-600",
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
  const buckets = useMemo(
    () => buildIntensityBuckets(days.map((d) => d.count)),
    [days],
  );

  return (
    <div className="space-y-6">
      {/* Legenda: warna DAN label selalu berpasangan. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Intensitas temuan</span>
        <ul className="flex flex-wrap items-center gap-2">
          {buckets.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-4 rounded ${LEVEL_CLASS[b.level]}`}
              />
              <span>{b.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada temuan bertanggal di {year} untuk filter ini.
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
                    className="pb-1 text-center text-xs text-muted-foreground"
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
                  const bucket = bucketForCount(count, buckets);
                  const isSelected = selectedDate === iso;

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => onSelectDay?.({ date: iso, count })}
                      aria-label={`${formatTanggal(iso)}: ${count} temuan`}
                      aria-current={isSelected ? "date" : undefined}
                      data-intensity={bucket.label}
                      className={`flex aspect-square items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${LEVEL_CLASS[bucket.level]} ${isSelected ? "ring-2 ring-foreground" : ""}`}
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