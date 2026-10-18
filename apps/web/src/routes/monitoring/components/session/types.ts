import type { MonitoringReviewStatus } from "@trainers/types";

export const REVIEW_STATE_LABELS: Record<MonitoringReviewStatus, string> = {
  completed: "Selesai dinilai",
  pending: "Sedang dinilai",
  processing: "Sedang dinilai",
  failed: "Gagal dinilai",
  not_started: "Belum dinilai",
};
