import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { SettingsSwitch } from "../settings/SettingsSwitch";
import { WEEKDAY_FULL } from "./heatmap-insights";

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

/** Skala intensitas yang sama untuk legenda dan kotak kalender. */
const LEVEL_CLASS: Record<IntensityBucket["level"], string> = {
  0: "bg-[var(--sidak-heatmap-0)]",
  1: "bg-[var(--sidak-heatmap-1)]",
  2: "bg-[var(--sidak-heatmap-2)]",
  3: "bg-[var(--sidak-heatmap-3)]",
  4: "bg-[var(--sidak-heatmap-4)]",
};

/** Warna angka tanggal di atas tiap tingkat, kontras di tema terang dan gelap. */
const LEVEL_TEXT: Record<IntensityBucket["level"], string> = {
  0: "text-muted-foreground",
  1: "text-[color:var(--sidak-heatmap-1-text)]",
  2: "text-[color:var(--sidak-heatmap-2-text)]",
  3: "text-[color:var(--sidak-heatmap-3-text)]",
  4: "text-[color:var(--sidak-heatmap-4-text)]",
};

/**
 * Ring pilihan/fokus dua warna di dalam kotak: 2px warna teks di luar, 1px
 * warna permukaan di dalamnya. Satu warna saja tenggelam di kotak tergelap
 * (tema terang) atau paling terang (tema gelap); pasangan ini selalu kontras.
 */
const SELECTED_RING =
  "[box-shadow:inset_0_0_0_2px_var(--color-foreground),inset_0_0_0_3px_var(--color-surface)]";
const SELECTED_RING_FOCUS =
  "focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-foreground),inset_0_0_0_3px_var(--color-surface)]";

/**
 * Mode forced colors (mis. Kontras Tinggi Windows) menghapus latar dan
 * bayangan. Warna intensitas adalah datanya, jadi kotak dan legenda keluar dari
 * penyesuaian; pilihan dan fokus diberi outline warna sistem di luar kotak.
 */
const KEEP_DATA_COLORS = "forced-color-adjust-none";
const FORCED_SELECTED_OUTLINE =
  "forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-solid forced-colors:outline-[color:CanvasText]";
const FORCED_FOCUS_OUTLINE =
  "not-forced-colors:focus-visible:outline-none forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-1 forced-colors:focus-visible:outline-solid forced-colors:focus-visible:outline-[color:Highlight]";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatTanggal(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type GridDay = { iso: string; column: number; weekday: number };
type YearGrid = {
  days: GridDay[];
  months: Array<{ start: number; end: number }>;
  columns: string;
};

/** Lebar kolom label hari. */
const LABEL_COLUMN = "28px";
/** Lebar kolom jeda antarbulan. */
const MONTH_GAP = "10px";
/** Lebar minimal satu kotak hari (cukup untuk angka dua digit). */
const CELL = "minmax(22px, 1fr)";
/** Lebar minimal kotak ringkas: 21px + celah 3px = jarak antar-pusat 24px. */
const COMPACT_CELL = "minmax(21px, 1fr)";

/**
 * Tujuan tombol panah dari hari ke-`index` (urutan tanggal setahun), atau
 * `null` bila tidak ada kotak ke arah itu. Kanan/kiri = minggu
 * berikutnya/sebelumnya; atas/bawah = hari sebelum/sesudahnya selama masih di
 * kolom yang sama; Home/End = awal/akhir tahun.
 */
function arrowTarget(days: readonly GridDay[], index: number, key: string) {
  const current = days[index];
  const sameColumn = (next: GridDay | undefined) =>
    next && next.column === current.column ? next : null;
  switch (key) {
    case "ArrowRight":
      return days[index + 7] ?? null;
    case "ArrowLeft":
      return days[index - 7] ?? null;
    case "ArrowDown":
      return sameColumn(days[index + 1]);
    case "ArrowUp":
      return sameColumn(days[index - 1]);
    case "Home":
      return days[0];
    case "End":
      return days[days.length - 1];
    default:
      return null;
  }
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Tata letak ringkas (gaya kontribusi): kolom = minggu Senin–Minggu yang
 * menyambung sepanjang tahun tanpa jeda bulan. Label bulan mulai di minggu
 * penuh pertama bulan itu. `column` memakai nomor kolom grid (1 = label hari).
 */
function buildCompactYearGrid(year: number): YearGrid {
  const offset = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
  const days: GridDay[] = [];
  const firstColumn: number[] = [];
  let dayOfYear = 0;
  for (let month = 0; month < 12; month++) {
    const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= total; day++) {
      const index = offset + dayOfYear;
      const column = 2 + Math.floor(index / 7);
      const weekday = index % 7;
      // Minggu penuh pertama: tanggal 1 jatuh Senin, atau minggu berikutnya.
      if (day === 1) firstColumn.push(weekday === 0 ? column : column + 1);
      days.push({ iso: isoDate(year, month, day), column, weekday });
      dayOfYear++;
    }
  }
  const lastColumn = days[days.length - 1].column;
  const months = firstColumn.map((start, month) => ({
    start,
    end: firstColumn[month + 1] ?? lastColumn + 1,
  }));
  const columns = [
    LABEL_COLUMN,
    ...new Array<string>(lastColumn - 1).fill(COMPACT_CELL),
  ].join(" ");
  return { days, months, columns };
}

/**
 * Tata letak lengkap: kolom = minggu (Senin–Minggu), baris = hari. Tiap
 * bulan punya kolom mingguannya sendiri dan dipisah satu kolom jeda, jadi
 * minggu yang melintasi dua bulan terbelah dan batas bulan terlihat jelas.
 * `column` sudah memakai nomor kolom grid (kolom 1 = label hari).
 */
function buildSplitYearGrid(year: number): YearGrid {
  const days: GridDay[] = [];
  const months: Array<{ start: number; end: number }> = [];
  const template: string[] = [LABEL_COLUMN];
  let column = 2;
  for (let month = 0; month < 12; month++) {
    const firstWeekday =
      (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const weeks = Math.ceil((firstWeekday + total) / 7);
    for (let day = 1; day <= total; day++) {
      const index = firstWeekday + day - 1;
      days.push({
        iso: isoDate(year, month, day),
        column: column + Math.floor(index / 7),
        weekday: index % 7,
      });
    }
    months.push({ start: column, end: column + weeks });
    template.push(...new Array<string>(weeks).fill(CELL));
    column += weeks;
    if (month < 11) {
      template.push(MONTH_GAP);
      column += 1;
    }
  }
  return { days, months, columns: template.join(" ") };
}

/**
 * Kalender setahun dalam satu kisi (gaya kontribusi). Bawaannya ringkas:
 * minggu menyambung tanpa angka tanggal. Sakelar "Tampilkan tanggal" memisah
 * tiap bulan dengan jeda dan menulis angka tanggal di kotak (minimal 22px).
 * Setiap hari tetap `<button>` dengan `aria-label` tanggal dan jumlah temuan,
 * jadi jumlahnya terbaca lewat fokus, hover (`title`), dan pembaca layar,
 * tidak hanya warna. Kotak minimal 21px (jarak antar-pusat 24px) di semua
 * perangkat; bila kisi tidak muat, ia digeser ke samping dan dibuka di
 * tanggal terpilih atau temuan terakhir. Kisi ber-role `grid`: satu baris per
 * hari dalam minggu, tiap tombol hari di dalam `gridcell` ber-`aria-selected`.
 */
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
  const [showDates, setShowDates] = useState(false);
  const grid = useMemo(
    () => (showDates ? buildSplitYearGrid(year) : buildCompactYearGrid(year)),
    [year, showDates],
  );
  const daysByWeekday = useMemo(
    () =>
      WEEKDAY_FULL.map((_, weekday) =>
        grid.days.filter((day) => day.weekday === weekday),
      ),
    [grid.days],
  );

  // Satu tab stop untuk seluruh kalender (roving tabindex): hari yang terakhir
  // difokus, lalu tanggal terpilih, hari bertemuan terakhir, atau 1 Januari.
  const [focusedIso, setFocusedIso] = useState<string | null>(null);
  const lastFindingIso = useMemo(
    () => [...days].reverse().find((d) => d.count > 0)?.date ?? null,
    [days],
  );
  const indexByIso = useMemo(
    () => new Map(grid.days.map((d, index) => [d.iso, index])),
    [grid],
  );
  const tabStopIso =
    [focusedIso, selectedDate, lastFindingIso].find(
      (iso) => iso != null && indexByIso.has(iso),
    ) ?? grid.days[0].iso;

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const from = (event.target as HTMLElement).dataset.date;
    const index = from === undefined ? undefined : indexByIso.get(from);
    if (index === undefined) return;
    const target = arrowTarget(grid.days, index, event.key);
    // Tanpa kotak di arah itu, biarkan tombol berperilaku bawaan.
    if (!target) return;
    event.preventDefault();
    setFocusedIso(target.iso);
    const cell = event.currentTarget.querySelector<HTMLElement>(
      `[data-date="${target.iso}"]`,
    );
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const hintId = useId();

  // Saat data baru tiba atau tata letak berganti, geser kisi supaya tanggal
  // terpilih atau hari bertemuan terakhir terlihat. Pemilihan tanggal
  // sesudahnya tidak menggeser.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const cell =
      scroller.querySelector<HTMLElement>('[aria-selected="true"] [data-date]') ??
      (lastFindingIso
        ? scroller.querySelector<HTMLElement>(`[data-date="${lastFindingIso}"]`)
        : null);
    if (!cell) return;
    scroller.scrollLeft = Math.max(
      0,
      cell.offsetLeft + cell.offsetWidth - scroller.clientWidth + 48,
    );
  }, [days, lastFindingIso, year, showDates]);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Kalender {year}
        </h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Legenda: warna DAN label selalu berpasangan. */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Intensitas temuan</span>
            <ul className="flex flex-wrap items-center gap-2">
              {buckets.map((b) => (
                <li key={b.label} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={`size-3 rounded-sm ${KEEP_DATA_COLORS} ${LEVEL_CLASS[b.level]}`}
                  />
                  <span className="tabular-nums">{b.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <label className="-my-2 -mr-2 flex cursor-pointer items-center text-xs text-muted-foreground select-none">
            <span aria-hidden="true">Tampilkan tanggal</span>
            <SettingsSwitch
              checked={showDates}
              onCheckedChange={setShowDates}
              label="Tampilkan tanggal"
            />
          </label>
        </div>
      </div>

      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada temuan bertanggal di {year} untuk filter ini.
        </p>
      )}

      <div
        ref={scrollerRef}
        data-testid="heatmap-calendar-scroller"
        // scroll-pl-8: kotak yang dituju tombol panah tidak tertutup kolom label
        // hari yang menempel. Di forced colors, padding memberi ruang outline.
        className="relative min-w-0 scroll-pl-8 overflow-x-auto pb-1 forced-colors:p-1"
      >
        <div
          role="grid"
          aria-label={`Kalender temuan ${year}`}
          aria-describedby={hintId}
          onKeyDown={moveFocus}
          className="grid w-full min-w-max gap-[3px]"
          style={{ gridTemplateColumns: grid.columns }}
        >
          <div
            data-testid="heatmap-month-labels"
            aria-hidden="true"
            className="contents"
          >
            {grid.months.map((range, month) => (
              <span
                key={MONTH_SHORT[month]}
                className="truncate text-xs text-muted-foreground"
                style={{
                  gridRow: 1,
                  gridColumn: `${range.start} / ${range.end}`,
                }}
              >
                {MONTH_SHORT[month]}
              </span>
            ))}
          </div>
          {WEEKDAY_FULL.map((name, weekday) => (
            <div key={name} role="row" className="contents">
              <span
                role="rowheader"
                aria-label={name}
                // Menempel di kiri saat kisi digeser, supaya baris tetap terbaca.
                className="sticky left-0 z-10 flex items-center self-stretch bg-surface text-xs leading-none text-muted-foreground"
                style={{ gridRow: weekday + 2, gridColumn: 1 }}
              >
                {/* Senin di atas, hanya baris ganjil yang diberi teks. */}
                <span aria-hidden="true">
                  {weekday % 2 === 0 && name.slice(0, 3)}
                </span>
              </span>
              {daysByWeekday[weekday].map(({ iso, column }) => {
                const count = countByDate.get(iso) ?? 0;
                const bucket = bucketForCount(count, buckets);
                const isSelected = selectedDate === iso;
                const label = `${formatTanggal(iso)}: ${count} temuan`;
                return (
                  <div
                    key={iso}
                    role="gridcell"
                    aria-selected={isSelected}
                    className="contents"
                  >
                    <button
                      type="button"
                      tabIndex={iso === tabStopIso ? 0 : -1}
                      onFocus={() => setFocusedIso(iso)}
                      onClick={() => onSelectDay?.({ date: iso, count })}
                      aria-label={label}
                      title={label}
                      data-intensity={bucket.label}
                      data-date={iso}
                      style={{ gridRow: weekday + 2, gridColumn: column }}
                      className={`flex aspect-square min-w-0 items-center justify-center text-xs font-medium tabular-nums transition-shadow ${KEEP_DATA_COLORS} ${FORCED_FOCUS_OUTLINE} ${SELECTED_RING_FOCUS} ${showDates ? "rounded-[3px]" : "rounded-[2px]"} ${LEVEL_CLASS[bucket.level]} ${LEVEL_TEXT[bucket.level]} ${isSelected ? `${SELECTED_RING} ${FORCED_SELECTED_OUTLINE}` : ""}`}
                    >
                      {/* Angka tanggal; jumlah temuan ada di label dan kartu terpilih. */}
                      {showDates && (
                        <span aria-hidden="true">{Number(iso.slice(8))}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p id={hintId} className="text-xs text-muted-foreground">
        Kotak abu-abu berarti 0 temuan. Warna dibagi per kuartil hari
        bertemuan tahun ini; pilih tanggal untuk melihat jumlahnya. Nyalakan
        Tampilkan tanggal untuk angka tanggal dan jeda per bulan. Bila
        kalender tidak muat, geser ke samping untuk bulan lain. Dengan keyboard, gunakan
        tombol panah untuk berpindah tanggal dan Enter untuk memilih.
      </p>
    </section>
  );
}
