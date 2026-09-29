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

/**
 * Status kehadiran dari teks `shift`.
 *
 * Aturan yang disepakati: `shift` kosong atau berisi OFF/Libur = libur,
 * selain itu masuk. `CUTI` ikut dihitung libur karena cuti memang bukan hari
 * kerja — kalau tidak, satu baris akan terbaca "masuk" padahal tidak ada.
 * Kode lain (mis. `H`, `S1`–`S4`) tetap masuk; nilai `shift` apa adanya tetap
 * ditampilkan, jadi keputusan ini tidak pernah menghapus informasi aslinya.
 */
export type Duty = "masuk" | "libur";

const OFF_PATTERN = /^(OFF|LIBUR|LBR|CUTI)\b/;

export function dutyOf(shift: string): Duty {
  const normalized = shift.trim().toUpperCase();
  return normalized === "" || OFF_PATTERN.test(normalized) ? "libur" : "masuk";
}

export function groupByDuty<T extends { shift: string }>(
  rows: T[],
): { masuk: T[]; libur: T[] } {
  const masuk: T[] = [];
  const libur: T[] = [];
  for (const row of rows) {
    (dutyOf(row.shift) === "masuk" ? masuk : libur).push(row);
  }
  return { masuk, libur };
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
