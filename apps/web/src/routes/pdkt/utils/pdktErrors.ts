import type { EmailMessage } from "@trainers/types";
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

/** Consumer email the server generated but could not file in the mailbox. */
export interface PdktMailboxRetryDraft {
  token: string;
  message: EmailMessage;
  subjectLabel?: string;
}

/**
 * The retry draft a failed session start carries in its error details, so the
 * trainee can save that email again without generating a new one.
 */
export function extractMailboxRetryDraft(
  err: unknown,
): PdktMailboxRetryDraft | null {
  const details =
    err instanceof ApiError
      ? err.details
      : err && typeof err === "object" && "details" in err
        ? (err as { details?: unknown }).details
        : null;
  const retryDraft =
    details && typeof details === "object" && "retryDraft" in details
      ? (details as { retryDraft?: unknown }).retryDraft
      : null;
  const retryToken =
    retryDraft && typeof retryDraft === "object" && "token" in retryDraft
      ? (retryDraft as { token?: unknown }).token
      : null;
  const retryMessage =
    retryDraft &&
    typeof retryDraft === "object" &&
    "inbound_email" in retryDraft
      ? (retryDraft as { inbound_email?: unknown }).inbound_email
      : null;
  if (
    typeof retryToken !== "string" ||
    !retryMessage ||
    typeof retryMessage !== "object"
  ) {
    return null;
  }
  return {
    token: retryToken,
    message: retryMessage as EmailMessage,
    subjectLabel:
      typeof (retryMessage as { subject?: unknown }).subject === "string"
        ? (retryMessage as { subject: string }).subject
        : undefined,
  };
}
