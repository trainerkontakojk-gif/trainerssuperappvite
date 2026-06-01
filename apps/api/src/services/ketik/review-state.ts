export type KetikHistoryReviewStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | null
  | undefined;

export type KetikJobStatus = "queued" | "processing" | "completed" | "failed";

export interface KetikReviewJobSnapshot {
  status: KetikJobStatus;
  lease_expires_at?: string | null;
  error_message?: string | null;
  updated_at?: string | null;
}

export interface KetikReviewStateDecision {
  status: "pending" | "processing" | "completed" | "failed";
  resultReady: boolean;
  errorMessage?: string;
  shouldMarkHistoryFailed: boolean;
  shouldMarkJobFailed: boolean;
  jobFailureMessage?: string;
}

export function resolveKetikReviewState(input: {
  historyStatus: KetikHistoryReviewStatus;
  job: KetikReviewJobSnapshot | null;
  hasReviewRow: boolean | null;
  nowMs?: number;
}): KetikReviewStateDecision {
  const nowMs = input.nowMs ?? Date.now();
  const historyStatus = input.historyStatus || "pending";

  if (historyStatus === "completed") {
    if (input.hasReviewRow === false) {
      return {
        status: "failed",
        resultReady: false,
        errorMessage: "Hasil analisis tidak ditemukan. Silakan jalankan ulang.",
        shouldMarkHistoryFailed: true,
        shouldMarkJobFailed: true,
        jobFailureMessage: "Review row missing for completed history",
      };
    }
    return {
      status: "completed",
      resultReady: true,
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    };
  }

  if (historyStatus === "failed") {
    return {
      status: "failed",
      resultReady: false,
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    };
  }

  if (!input.job) {
    return {
      status: historyStatus === "processing" ? "processing" : "pending",
      resultReady: false,
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    };
  }

  if (input.job.status === "completed") {
    return {
      status: "completed",
      resultReady: Boolean(input.hasReviewRow),
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    };
  }

  if (input.job.status === "failed") {
    return {
      status: "failed",
      resultReady: false,
      errorMessage:
        input.job.error_message || "Analisis AI gagal diproses. Silakan jalankan ulang.",
      shouldMarkHistoryFailed: true,
      shouldMarkJobFailed: false,
    };
  }

  if (input.job.status === "processing") {
    const gracePeriodMs = 30_000;
    const leaseExpired =
      input.job.lease_expires_at &&
      new Date(input.job.lease_expires_at).getTime() + gracePeriodMs < nowMs;

    if (leaseExpired) {
      return {
        status: "failed",
        resultReady: false,
        errorMessage: "Analisis AI melebihi batas waktu. Silakan jalankan ulang.",
        shouldMarkHistoryFailed: true,
        shouldMarkJobFailed: true,
        jobFailureMessage: "Processing timeout — lease expired",
      };
    }

    return {
      status: "processing",
      resultReady: false,
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    };
  }

  const queueTTL = 5 * 60 * 1000;
  const queueExpired =
    input.job.updated_at && nowMs - new Date(input.job.updated_at).getTime() > queueTTL;

  if (queueExpired) {
    return {
      status: "failed",
      resultReady: false,
      errorMessage: "Analisis AI terlalu lama mengantre. Silakan jalankan ulang.",
      shouldMarkHistoryFailed: true,
      shouldMarkJobFailed: true,
      jobFailureMessage: "Queue timeout — no worker picked up the job",
    };
  }

  return {
    status: "processing",
    resultReady: false,
    shouldMarkHistoryFailed: false,
    shouldMarkJobFailed: false,
  };
}
