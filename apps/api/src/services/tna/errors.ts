export class TnaServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

const rpcErrors: Record<
  string,
  { status: 403 | 404 | 409 | 422; message: string }
> = {
  TNA_ACTOR_FORBIDDEN: {
    status: 403,
    message: "Akun ini tidak diizinkan mengubah data TNA.",
  },
  TNA_PLAN_NOT_FOUND: { status: 404, message: "Rencana tidak ditemukan." },
  TNA_PLAN_NOT_ACTIVE: {
    status: 409,
    message:
      "Rencana sudah bukan aktif. Muat ulang untuk melihat status terbaru.",
  },
  TNA_PLAN_NOT_EVALUATING: {
    status: 409,
    message:
      "Rencana tidak sedang dievaluasi. Muat ulang untuk melihat status terbaru.",
  },
  TNA_EVALUATION_NOT_DUE: {
    status: 422,
    message: "Evaluasi belum jatuh tempo sesuai jadwal (WIB).",
  },
  TNA_EVALUATION_PERIOD_INVALID: {
    status: 422,
    message: "Pilih periode evaluasi setelah bulan berakhirnya pelatihan.",
  },
  TNA_EVALUATION_NO_AUDIT: {
    status: 422,
    message:
      "Belum ada audit pada periode evaluasi. Pilih periode lain atau tunggu data audit sebelum menyelesaikan.",
  },
  TNA_EVALUATION_PARTICIPANT_MISMATCH: {
    status: 422,
    message:
      "Data evaluasi peserta tidak sesuai rencana. Muat ulang sebelum melanjutkan.",
  },
  TNA_INVALID_EVALUATION: {
    status: 422,
    message:
      "Data evaluasi atau tindak lanjut belum valid. Periksa kembali data yang diisi.",
  },
  TNA_CANCEL_REASON_REQUIRED: {
    status: 422,
    message:
      "Alasan pembatalan wajib diisi untuk rencana aktif atau sedang dievaluasi.",
  },
  TNA_INVALID_CANCEL_REASON: {
    status: 422,
    message: "Alasan pembatalan harus berisi 10–1000 karakter.",
  },
  TNA_PREVIOUS_PLAN_INVALID: {
    status: 422,
    message:
      "Rencana sebelumnya harus sudah selesai, memerlukan rencana lanjutan, dan memiliki layanan serta parameter yang sama.",
  },
  TNA_PLAN_EXISTS: {
    status: 409,
    message: "Kebutuhan ini sudah memiliki rencana terbuka.",
  },
  TNA_PLAN_NOT_DRAFT: {
    status: 409,
    message:
      "Rencana sudah bukan draft. Muat ulang untuk melihat status terbaru.",
  },
  TNA_PLAN_STALE: {
    status: 409,
    message: "Rencana sudah berubah, muat ulang sebelum melanjutkan.",
  },
  TNA_PLAN_TRANSITION_CONFLICT: {
    status: 409,
    message: "Status rencana sudah berubah, muat ulang sebelum melanjutkan.",
  },
  TNA_NEED_NOT_TRAINING: {
    status: 422,
    message:
      "Kebutuhan eskalasi non-training tidak dapat dibuatkan rencana pelatihan.",
  },
  TNA_PROGRAM_INACTIVE: {
    status: 422,
    message: "Program tidak aktif atau tidak ditemukan. Pilih program lain.",
  },
  TNA_INVALID_PARTICIPANTS: {
    status: 422,
    message:
      "Peserta harus 1–200 orang yang unik, tersedia, dan merupakan agent layanan dalam cakupan akses.",
  },
  TNA_BASELINE_PARTICIPANT_MISMATCH: {
    status: 422,
    message:
      "Data peserta tidak sesuai dengan rencana. Muat ulang dan periksa peserta.",
  },
  TNA_INVALID_BASELINE: {
    status: 422,
    message: "Baseline belum dapat dihitung dengan data yang valid.",
  },
  TNA_TARGET_NOT_BETTER: {
    status: 422,
    message: "Target harus lebih baik dari baseline.",
  },
  TNA_BASELINE_NO_AUDIT: {
    status: 422,
    message:
      "Belum ada audit pada periode baseline, jadi rencana ini tidak bisa diaktifkan. Batalkan rencana atau pilih kebutuhan lain.",
  },
  TNA_BASELINE_NO_FINDINGS: {
    status: 422,
    message:
      "Tidak ada temuan pada periode baseline, jadi rencana ini tidak bisa diaktifkan. Batalkan rencana atau pilih kebutuhan lain.",
  },
};

export function tnaBusinessError(
  code: keyof typeof rpcErrors,
): TnaServiceError {
  const entry = rpcErrors[code];
  if (!entry) throw new Error("Unknown TNA business error");
  return new TnaServiceError(code, entry.status, entry.message);
}

export function throwTnaRpcError(error: {
  code?: string;
  message: string;
}): never {
  if (Object.hasOwn(rpcErrors, error.message))
    throw tnaBusinessError(error.message);
  if (error.code === "23514")
    throw new TnaServiceError(
      "TNA_INVALID_PLAN",
      422,
      "Tanggal, target, atau data rencana tidak valid. Periksa kembali data yang diisi.",
    );
  // Unknown DB/guard/transport errors remain unavailable, never plausible success.
  throw error;
}
