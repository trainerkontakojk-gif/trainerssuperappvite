import { z } from "zod";
import type { KetikSessionHistoryItem } from "./ketik";

export const ketikHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).default(""),
  status: z
    .enum(["all", "completed", "running", "failed", "not_started"])
    .default("all"),
  cursor: z.string().min(1).max(1200).optional(),
});
export type KetikHistoryQuery = z.infer<typeof ketikHistoryQuerySchema>;
export type KetikHistoryStatus = KetikHistoryQuery["status"];
export type KetikHistorySummaryItem = Omit<KetikSessionHistoryItem, "messages">;
export interface KetikHistoryPage {
  items: KetikHistorySummaryItem[];
  nextCursor: string | null;
  total: number;
  counts: Record<KetikHistoryStatus, number>;
  reviewedCount: number;
  averageScore: number | null;
}
export interface KetikHistoryDetail extends KetikSessionHistoryItem {
  previousFinalScore: number | null;
  /** Images actually sent, resolved from the immutable session snapshot. */
  attachments?: KetikHistoryAttachment[];
}
export interface KetikHistoryAttachment {
  /** Original SEND_IMAGE index; never renumber filtered/missing images. */
  index: number;
  src: string;
  alt: string;
}
export interface KetikLandingSummary {
  sessionsThisMonth: number;
  reviewing: number;
  average: { score: number; sessions: number } | null;
  focus: { label: string; score: number } | null;
  followUps: Array<{
    session: KetikHistorySummaryItem;
    meta: string;
    status: "Ditelaah" | "Sedang ditelaah" | "Telaah gagal" | "Belum ditelaah";
  }>;
  recent: Array<{
    session: KetikHistorySummaryItem;
    subjectLabel: string;
    score: number;
    lowestAspect: string | null;
  }>;
}

/**
 * Lama sesi KETIK dalam detik: selisih stempel waktu pesan pertama dan
 * terakhir. `simulation_duration` di `ketik_history` adalah batas waktu yang
 * dipilih (menit), bukan lama sesi. `null` bila stempel waktu tidak terbaca.
 */
export function ketikTranscriptDurationSeconds(
  firstTimestamp: unknown,
  lastTimestamp: unknown,
): number | null {
  if (typeof firstTimestamp !== "string" || typeof lastTimestamp !== "string") {
    return null;
  }
  const start = Date.parse(firstTimestamp);
  const end = Date.parse(lastTimestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.round((end - start) / 1000);
}
