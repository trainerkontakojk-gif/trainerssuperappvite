import { SCHEDULE_SECTIONS, type JadwalShiftingSection } from "@trainers/types";

/**
 * Konstanta tampilan untuk dua format jadwal shifting.
 *
 * Bagian layanan diambil dari `SCHEDULE_SECTIONS` (kontrak backend), jadi
 * pilihan di UI tidak pernah berbeda daftarnya dengan apa yang ada di data
 * WFM — termasuk `Leader`, yang memang baris `channel = Leader` pada tabel
 * yang sama.
 */

/** Slug ramah-URL untuk sebuah bagian. `Digital Chat` → `digital-chat`. */
export function sectionSlug(section: JadwalShiftingSection): string {
  return section.toLowerCase().replace(/\s+/g, "-");
}

const SLUG_TO_SECTION = new Map(
  SCHEDULE_SECTIONS.map((section) => [sectionSlug(section), section] as const),
);

/** `"digital-chat"` → `Digital Chat`; nilai tak dikenal → `null`. */
export function sectionFromSlug(slug: string): JadwalShiftingSection | null {
  return SLUG_TO_SECTION.get(slug) ?? null;
}

/**
 * Slug yang valid untuk filter. String kosong berarti "Semua layanan" dan
 * hanya dipakai format harian — kalender selalu memilih satu dari empat
 * bagian, karena memang hanya itu yang diminta tampilannya.
 */
export function normalizeChannelSlug(value: string | undefined): string {
  return value && SLUG_TO_SECTION.has(value) ? value : "";
}

export function normalizeSectionSlug(value: string | undefined): string {
  return value && SLUG_TO_SECTION.has(value)
    ? value
    : sectionSlug(SCHEDULE_SECTIONS[0]);
}

/** Pilihan format harian: semua bagian, lalu empat bagian satu per satu. */
export function todaySectionOptions(): Array<{
  value: string;
  label: string;
}> {
  return [
    { value: "", label: "Semua layanan" },
    ...SCHEDULE_SECTIONS.map((section) => ({
      value: sectionSlug(section),
      label: section,
    })),
  ];
}

/** Pilihan kalender: hanya empat bagian. */
export function calendarSectionOptions(): Array<{
  value: string;
  label: string;
}> {
  return SCHEDULE_SECTIONS.map((section) => ({
    value: sectionSlug(section),
    label: section,
  }));
}

/**
 * Sebuah baris termasuk pilihan bagian ini?
 *
 * Pencocokan persis (case-insensitive) pada `channel`, bukan substring:
 * `Email` tidak boleh ikut tersaring ketika pilihan `Call`.
 */
export function matchesSection(channel: string, slug: string): boolean {
  if (!slug) return true;
  const section = sectionFromSlug(slug);
  if (!section) return true;
  return channel.trim().toLowerCase() === section.toLowerCase();
}

// ── Urutan baris harian ────────────────────────────────────────────────────

const nameCollator = new Intl.Collator("id");
const SHIFT_RANK = new Map(
  ["S1", "H", "S2", "S3", "S4"].map((shift, index) => [shift, index]),
);
const OFF_SHIFT_CODES = new Set(["", "OFF", "LIBUR", "LBR", "CUTI"]);
const OFF_SHIFT_RANK = SHIFT_RANK.size;
const UNKNOWN_SHIFT_RANK = OFF_SHIFT_RANK + 1;
const SECTION_RANK = new Map(
  SCHEDULE_SECTIONS.map((section, index) => [section.toLowerCase(), index]),
);

function shiftRank(shift: string): number {
  const code = shift.trim().toUpperCase();
  return (
    SHIFT_RANK.get(code) ??
    (OFF_SHIFT_CODES.has(code) ? OFF_SHIFT_RANK : UNKNOWN_SHIFT_RANK)
  );
}

function compareShift(a: string, b: string): number {
  const rankA = shiftRank(a);
  const rankB = shiftRank(b);
  if (rankA !== rankB) return rankA - rankB;
  if (rankA === UNKNOWN_SHIFT_RANK) {
    return nameCollator.compare(a.trim(), b.trim());
  }
  return 0;
}

function compareSections(a: string, b: string): number {
  const sectionA = a.trim();
  const sectionB = b.trim();
  const rankA = SECTION_RANK.get(sectionA.toLowerCase());
  const rankB = SECTION_RANK.get(sectionB.toLowerCase());
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
  if (rankA !== undefined) return -1;
  if (rankB !== undefined) return 1;
  if (sectionA === "") return sectionB === "" ? 0 : 1;
  if (sectionB === "") return -1;
  return nameCollator.compare(sectionA, sectionB);
}

function compareTeamLeaders(a: string, b: string): number {
  const teamLeaderA = a.trim();
  const teamLeaderB = b.trim();
  if (teamLeaderA === "") return teamLeaderB === "" ? 0 : 1;
  if (teamLeaderB === "") return -1;
  return nameCollator.compare(teamLeaderA, teamLeaderB);
}

/**
 * Kode aktivitas istirahat panjang di grid WFM. Satu slot = 15 menit, jadi
 * menit sejak 00:00 = `slot × 15`.
 */
export const LONG_BREAK_CODE = "LB";

/**
 * Menit sejak 00:00 saat istirahat panjang pertama dimulai, atau `null` kalau
 * baris itu tidak punya istirahat yang terbaca.
 *
 * Dipakai sebagai kunci urutan: "siapa break duluan". Baris yang belum punya
 * istirahat TIDAK ditebak dari shift-nya — `null` sengaja dibedakan dari 00:00
 * supaya baris tanpa data selalu jatuh ke belakang, bukan tampil paling awal.
 */
export function breakStartMinutes(
  activities: ReadonlyArray<{ slot: number; value: string }>,
): number | null {
  let earliest: number | null = null;
  for (const activity of activities) {
    if (activity.value.trim().toUpperCase() !== LONG_BREAK_CODE) continue;
    if (!Number.isSafeInteger(activity.slot) || activity.slot < 0) continue;
    if (earliest === null || activity.slot < earliest) earliest = activity.slot;
  }
  return earliest === null ? null : earliest * 15;
}

/** Istirahat tanpa data selalu paling belakang, bukan dianggap break 00:00. */
function compareBreakStarts(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Urutkan setiap baris sendiri, bukan melalui grouping, agar tabel tidak
 * bergantung pada urutan sumber WFM. Bagian layanan adalah kunci PALING LUAR:
 * seluruh baris satu layanan tampil berurutan lebih dulu, baru layanan
 * berikutnya. Bagian yang dikenal memakai peringkat `SCHEDULE_SECTIONS` tanpa
 * membedakan kapitalisasi; nilai sumber tetap dirender apa adanya dan bagian
 * lain tetap tampil di belakang.
 *
 * `breakStartOf` (opsional) menyisipkan jam istirahat setelah shift: di dalam
 * satu layanan dan shift yang sama, orang yang break lebih dulu tampil lebih
 * dulu, baru diurutkan per TL dan nama. Kalender bulanan tidak mengirim
 * `breakStartOf` karena barisnya memang tidak membawa aktivitas.
 */
export function orderScheduleRows<
  T extends { shift: string; channel: string; tl: string; nama: string },
>(rows: T[], breakStartOf?: (row: T) => number | null): T[] {
  const breakStart = breakStartOf
    ? new Map(rows.map((row) => [row, breakStartOf(row)]))
    : null;
  return [...rows].sort(
    (a, b) =>
      compareSections(a.channel, b.channel) ||
      compareShift(a.shift, b.shift) ||
      compareBreakStarts(
        breakStart?.get(a) ?? null,
        breakStart?.get(b) ?? null,
      ) ||
      compareTeamLeaders(a.tl, b.tl) ||
      nameCollator.compare(a.nama, b.nama),
  );
}

// ── Kalender matriks (agen × hari) ─────────────────────────────────────────

/** Nama bulan Indonesia; indeks 0 = Januari. */
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-09` → `September 2026`. */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const name = MONTH_NAMES[monthNumber - 1];
  if (!name || !Number.isInteger(year)) return month;
  return `${name} ${year}`;
}

/** `2026-09` + (-1) → `2026-08`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}`;
}

/** Jumlah hari pada bulan `YYYY-MM`, dihitung dari kalender, bukan tabel. */
export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return 30;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/** `2026-09` → `["2026-09-01", …, "2026-09-30"]`. */
export function monthDates(month: string): string[] {
  const total = daysInMonth(month);
  return Array.from(
    { length: total },
    (_, index) => `${month}-${pad2(index + 1)}`,
  );
}

/** `2026-09-14` → `Sen`. */
export function weekdayShort(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const name = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
  return name ?? "";
}

/** Bagian nama yang aman dipakai di `data-testid` (spasi → `_`). */
export function agentTestIdKey(nama: string): string {
  return nama.trim().replace(/\s+/g, "_");
}

/**
 * Klasifikasi kode shift untuk pewarnaan sel.
 *
 * `libur` hanya untuk kode yang memang berarti tidak masuk. Kode yang tidak
 * dikenali (mis. `WFH`) mendapat `lainnya`, BUKAN `libur` — menandai shift tak
 * dikenal sebagai libur akan menyembunyikan informasi yang paling justru perlu
 * dilihat supervisor.
 */
export type ShiftKind = "kerja" | "libur" | "lainnya";

const CUTI_CODES = new Set(["CUTI"]);
const OFF_CODES = new Set(["OFF", "LIBUR", "LBR"]);

export function shiftKindOf(shift: string): ShiftKind {
  const code = shift.trim().toUpperCase();
  if (code === "") return "lainnya";
  if (OFF_CODES.has(code)) return "libur";
  if (CUTI_CODES.has(code)) return "lainnya";
  return "kerja";
}

/** Kode yang terhitung sebagai cuti pada rekap. */
export function isCutiCode(shift: string): boolean {
  return CUTI_CODES.has(shift.trim().toUpperCase());
}

/** Kode yang terhitung sebagai off pada rekap. */
export function isOffCode(shift: string): boolean {
  return OFF_CODES.has(shift.trim().toUpperCase());
}

/** Kode yang terhitung sebagai hari kerja pada rekap. */
export function isWorkCode(shift: string): boolean {
  const code = shift.trim().toUpperCase();
  return code !== "" && !OFF_CODES.has(code) && !CUTI_CODES.has(code);
}

/** Kode yang masuk rekap TBCCI (training/capacity). */
export function isTbccCode(shift: string): boolean {
  return shift.trim().toUpperCase() === "TBCCI";
}
