import { ApiError } from "../../../lib/api";

/**
 * Pesan galat PDKT untuk peserta. Teks dari server (bisa berbahasa Inggris,
 * memuat ID, atau istilah teknis) tidak pernah ditampilkan apa adanya.
 */

const SESSION_ENDED_CODES = new Set(["UNAUTHORIZED", "INVALID_TOKEN"]);

function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** Balasan gagal dikirim; draf tetap ada di perangkat. */
export function pdktReplyErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "NOT_FOUND") {
    return "Email ini sudah dihapus dan tidak bisa dibalas.";
  }
  // CONFLICT juga dipakai untuk balasan ganda dan email yang sudah dibalas.
  if (code === "CONFLICT") {
    return "Email ini sudah dibalas atau tidak tersedia lagi. Muat ulang kotak masuk.";
  }
  if (code && SESSION_ENDED_CODES.has(code)) {
    return "Sesi masuk Anda berakhir. Masuk lagi, lalu kirim ulang balasan.";
  }
  if (code === "FORBIDDEN") {
    return "Anda tidak punya izin membalas email ini.";
  }
  return "Balasan belum terkirim. Draf Anda masih tersimpan di perangkat ini; coba kirim lagi.";
}

/**
 * Pengaturan PDKT gagal disimpan. Hanya konflik versi yang punya langkah
 * pemulihan sendiri (pesan buatan frontend, bukan teks server).
 */
export function pdktSettingsSaveErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "SETTINGS_CONFLICT") {
    return "Pengaturan telah diubah di tempat lain. Muat ulang halaman, lalu simpan lagi.";
  }
  if (code === "SETTINGS_VERSION_REQUIRED") {
    return "Versi pengaturan belum termuat. Muat ulang halaman, lalu simpan lagi.";
  }
  return "Pengaturan belum tersimpan. Coba lagi.";
}
