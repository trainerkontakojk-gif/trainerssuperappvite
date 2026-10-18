import { z } from "zod";
import type { KetikReviewDetail } from "./ketik";
export const ketikReviewRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  requestId: z.uuid().optional(),
  rerun: z.boolean().default(false),
});
export type KetikReviewJobStatus =
  "queued" | "processing" | "completed" | "failed";
export interface KetikReviewAccepted {
  status: KetikReviewJobStatus;
}
export interface KetikReviewStatus {
  status: "pending" | KetikReviewJobStatus;
  resultReady: boolean;
  scores: KetikReviewDetail["scores"] | null;
  previousKept: boolean;
  errorMessage?: string;
  /** Re-scores the reader may still start; null = no limit (trainer, admin). */
  rerunsLeft: number | null;
}

/** Re-scores per KETIK session for agent and leader (enforced in the database). */
export const KETIK_RERUN_LIMIT = 1;
