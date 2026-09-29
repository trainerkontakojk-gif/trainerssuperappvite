import { z } from "zod";

/**
 * Kontrak read-only untuk `GET /api/v1/sidak/jadwal-shifting`.
 *
 * Kontrak ini adalah SATU-SATUNYA bentuk yang boleh menyentuh browser. Field
 * upstream WFM yang tidak ada di sini (`nik`, identitas WFM, alasan aktivitas,
 * swap, konfigurasi sistem) tidak pernah didefinisikan, jadi tidak bisa bocor
 * hanya karena lupa dibuang.
 *
 * Sumber: plans/markdown/sidak-jadwal-shifting.md (gate checkpoint 2026-09-28).
 * Field upstream yang terverifikasi: `nama`, `tl`, `shift`, `shift_prev`,
 * `activities`, `date`, `channel`.
 */

/**
 * Satu slot aktivitas pada grid 15 menit WFM.
 *
 * `slot` adalah indeks numerik apa adanya dari upstream. `label` DITURUNKAN
 * dari indeks itu (`index × 15 menit`) sebagai jam dinding, tanpa konversi zona
 * waktu. Zona konfigurasi WFM yang dikonfirmasi adalah `Asia/Jakarta`; slot
 * tidak diperlakukan sebagai timestamp UTC.
 */
export const jadwalShiftingActivitySchema = z.object({
  slot: z.number().int().nonnegative(),
  label: z.string(),
  value: z.string(),
});
export type JadwalShiftingActivity = z.infer<
  typeof jadwalShiftingActivitySchema
>;

/**
 * Satu baris jadwal dalam bentuk yang sudah dinormalisasi.
 *
 * `shift` dan `shiftPrev` disimpan sebagai TEKS apa adanya dari WFM. Backend
 * tidak mengurai jam di dalamnya: parsing label adalah urusan UI, dan
 * kesalahan parse lebih baik muncul sebagai "tidak ditandai" daripada sebagai
 * shift yang salah.

 */
export const jadwalShiftingRowSchema = z.object({
  nama: z.string(),
  tl: z.string(),
  channel: z.string(),
  shift: z.string(),
  shiftPrev: z.string(),
  date: z.string(),
  activities: z.array(jadwalShiftingActivitySchema),
});
export type JadwalShiftingRow = z.infer<typeof jadwalShiftingRowSchema>;

/**
 * `truncated: true` berarti backend berhenti di batas hasil dan TIDAK boleh
 * dibaca sebagai "ini seluruh jadwal". UI wajib menampilkan peringatan
 * eksplisit; memotong baris diam-diam akan terlihat seperti data lengkap.
 */
export const jadwalShiftingResponseSchema = z.object({
  /** Tanggal efektif yang benar-benar di-query, selalu `YYYY-MM-DD`. */
  date: z.string(),
  rows: z.array(jadwalShiftingRowSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  channels: z.array(z.string()),
  /** Kapan baris ini dibaca. Bukan timestamp refresh cache — MVP tanpa cache. */
  asOf: z.string(),
});
export type JadwalShiftingResponse = z.infer<
  typeof jadwalShiftingResponseSchema
>;

/**
 * Empat bagian layanan yang ada di `wfm_schedules`, termasuk `Leader`
 * (baris dengan `channel = Leader` — sumbernya tabel yang sama, bukan
 * sumber terpisah).
 *
 * Daftar ini dikonfirmasi dari data WFM: keempatnya muncul sebagai channel
 * pada satu tanggal yang sama, jadi UI boleh menawarkannya sebagai pilihan
 * yang stabil, bukan menebak dari channel yang kebetulan muncul hari itu.
 */
export const SCHEDULE_SECTIONS = [
  "Call",
  "Digital Chat",
  "Email",
  "Leader",
] as const;
export type JadwalShiftingSection = (typeof SCHEDULE_SECTIONS)[number];

/**
 * Satu baris kalender bulanan.
 *
 * `activities` dan `shiftPrev` SENGAJA tidak ada: kalender hanya perlu
 * "siapa, di bagian mana, shift apa, tanggal berapa", sehingga payload satu
 * bulan tidak perlu membawa grid 96 slot per baris.
 */
export const jadwalShiftingMonthRowSchema = z.object({
  nama: z.string(),
  tl: z.string(),
  channel: z.string(),
  shift: z.string(),
  date: z.string(),
});
export type JadwalShiftingMonthRow = z.infer<
  typeof jadwalShiftingMonthRowSchema
>;

/**
 * Respons `GET /jadwal-shifting/month`.
 *
 * `from`/`to` adalah rentang hari yang BENAR-BENAR di-query, supaya UI tidak
 * pernah menghitung sendiri batas bulan yang berbeda dari yang dibaca backend.
 * `truncated` berlaku sama seperti respons harian: batas hasil tidak boleh
 * dibaca sebagai "seluruh bulan".
 */
export const jadwalShiftingMonthResponseSchema = z.object({
  /** Bulan efektif yang di-query, selalu `YYYY-MM`. */
  month: z.string(),
  from: z.string(),
  to: z.string(),
  rows: z.array(jadwalShiftingMonthRowSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  channels: z.array(z.string()),
  asOf: z.string(),
});
export type JadwalShiftingMonthResponse = z.infer<
  typeof jadwalShiftingMonthResponseSchema
>;

/**
 * Kode error yang boleh muncul dari endpoint jadwal.
 *
 * Pemisahan `WFM_UNAVAILABLE` / `WFM_UNAUTHORIZED` / `WFM_INVALID_RESPONSE` dari
 * `WFM_NOT_CONFIGURED` itu disengaja: empat kondisi ini butuh tindakan berbeda
 * dari whoever menjalankan sistem, dan tidak boleh menyatu jadi "kosong".
 */
export const JADWAL_SHIFTING_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "WFM_NOT_CONFIGURED",
  "WFM_UNAVAILABLE",
  "WFM_UNAUTHORIZED",
  "WFM_INVALID_RESPONSE",
] as const;
export type JadwalShiftingErrorCode =
  (typeof JADWAL_SHIFTING_ERROR_CODES)[number];
