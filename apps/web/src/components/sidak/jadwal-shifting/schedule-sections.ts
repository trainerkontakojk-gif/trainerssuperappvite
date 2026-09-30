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

// ── Pengelompokan per team leader (format harian) ──────────────────────────

/** Judul grup untuk baris yang `tl`-nya kosong di WFM. */
export const NO_TEAM_LEADER_LABEL = "Tanpa team leader";

export type TeamLeaderGroup<T> = {
  /** Nama TL apa adanya (sudah di-trim); string kosong = tanpa TL. */
  tl: string;
  rows: T[];
};

/**
 * Urutan nama Indonesia; dipakai untuk TL maupun nama agen supaya keduanya
 * diurutkan dengan aturan yang sama.
 */
const nameCollator = new Intl.Collator("id");

/**
 * Kelompokkan baris jadwal per team leader, lalu urutkan nama agen di dalam
 * tiap kelompok (A–Z).
 *
 * Aturan yang dipegang:
 *   - Grup diurutkan dari nama TL (A–Z) supaya daftar tidak "berganti tempat"
 *     hanya karena urutan baris dari sumber berubah.
 *   - Grup tanpa TL selalu PALING AKHIR. Barisnya tetap ditampilkan — nama TL
 *     yang belum diisi di WFM bukan alasan untuk menyembunyikan orangnya —
 *     tapi tidak boleh menyelip di antara grup TL yang bernama.
 *   - Urutan baris di dalam grup tidak mengubah informasi apa pun: `shift`
 *     tetap ditampilkan apa adanya.
 */
export function groupByTeamLeader<T extends { tl: string; nama: string }>(
  rows: T[],
): TeamLeaderGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const tl = row.tl.trim();
    const bucket = groups.get(tl);
    if (bucket) bucket.push(row);
    else groups.set(tl, [row]);
  }

  return [...groups.entries()]
    .map(([tl, members]) => ({
      tl,
      rows: [...members].sort((a, b) => nameCollator.compare(a.nama, b.nama)),
    }))
    .sort((a, b) => {
      if (a.tl === b.tl) return 0;
      if (a.tl === "") return 1;
      if (b.tl === "") return -1;
      return nameCollator.compare(a.tl, b.tl);
    });
}

/**
 * Daftar datar yang sudah berurutan layanan → TL → nama, untuk dipakai bersama
 * daftar per-layanan dan tabel detail.
 *
 * Dipakai supaya daftar dan tabel di halaman yang sama TIDAK punya urutan
 * masing-masing: orang yang sama harus berada di posisi relatif yang sama di
 * kedua tempat, kalau tidak mata membaca ulang daftar dari awal.
 */
export function orderBySectionThenTeamLeader<
  T extends { tl: string; nama: string; channel: string },
>(rows: T[]): T[] {
  return groupBySectionThenTeamLeader(rows).flatMap((section) =>
    section.groups.flatMap((group) => group.rows),
  );
}

// ── Pengelompokan per layanan (format harian) ──────────────────────────────

/** Judul grup untuk baris yang `channel`-nya kosong di WFM. */
export const NO_SECTION_LABEL = "Tanpa layanan";

export type ScheduleSectionGroup<T> = {
  /** Nama bagian apa adanya (sudah di-trim); string kosong = tanpa layanan. */
  section: string;
  groups: TeamLeaderGroup<T>[];
  /** Jumlah baris di bagian ini, dihitung dari baris yang benar-benar lolos filter. */
  count: number;
};

/**
 * Peringkat bagian layanan yang disepakati: Call → Digital Chat → Email →
 * Leader. Peringkat ini yang menentukan urutan grup, bukan urutan kedatangan
 * baris — bagian yang sama tidak boleh terpisah-pisah.
 */
const sectionRank = new Map<string, number>(
  SCHEDULE_SECTIONS.map((section, index) => [section.toLowerCase(), index]),
);

/**
 * `channel` datang apa adanya dari WFM, jadi huruf besar/kecilnya tidak bisa
 * dipercaya. Label kanonik dipakai untuk bagian yang dikenal supaya `call` dan
 * `Call` menjadi SATU grup — aturan yang sama dengan filter bagian layanan di
 * UI, yang memang mencocokkan tanpa peduli kapitalisasi.
 *
 * Bagian di luar daftar yang disepakati dikembalikan apa adanya (sudah
 * di-trim): memaksakan label yang tidak kita kenal justru menamai ulang data.
 */
const canonicalSection = new Map<string, string>(
  SCHEDULE_SECTIONS.map((section) => [section.toLowerCase(), section] as const),
);

function canonicalizeSection(channel: string): string {
  const trimmed = channel.trim();
  return canonicalSection.get(trimmed.toLowerCase()) ?? trimmed;
}

function compareSections(a: string, b: string): number {
  if (a === b) return 0;
  const rankA = sectionRank.get(a.toLowerCase());
  const rankB = sectionRank.get(b.toLowerCase());
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
  // Bagian di luar daftar yang disepakati tetap tampil — menyembunyikannya
  // sama saja menghapus orang dari jadwal — tapi diletakkan di belakang.
  if (rankA !== undefined) return -1;
  if (rankB !== undefined) return 1;
  if (a === "") return 1;
  if (b === "") return -1;
  return nameCollator.compare(a, b);
}

/**
 * Kelompokkan baris jadwal dua tingkat: bagian layanan dulu, lalu team leader
 * di dalamnya, lalu nama agen A–Z.
 *
 * Bagian layanan dipilih sebagai tingkat teratas karena begitulah jadwal dibaca
 * sehari-hari (Call, Digital Chat, Email, Leader) — dan karena pilihan filter
 * "Bagian layanan" memakai daftar yang sama, jadi struktur daftarnya tidak
 * berubah bentuk saat filter diganti.
 */
export function groupBySectionThenTeamLeader<
  T extends { tl: string; nama: string; channel: string },
>(rows: T[]): ScheduleSectionGroup<T>[] {
  const bySection = new Map<string, T[]>();
  for (const row of rows) {
    const section = canonicalizeSection(row.channel);
    const bucket = bySection.get(section);
    if (bucket) bucket.push(row);
    else bySection.set(section, [row]);
  }

  return [...bySection.entries()]
    .map(([section, members]) => ({
      section,
      groups: groupByTeamLeader(members),
      count: members.length,
    }))
    .sort((a, b) => compareSections(a.section, b.section));
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
