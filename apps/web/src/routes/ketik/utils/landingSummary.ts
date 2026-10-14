import type { KetikSessionHistoryItem } from "@trainers/types";
import {
  KETIK_ASPECTS,
  lowestAspect,
  readFinalScore,
  reviewStatusLabel,
  sessionParticipantLabel,
  sortNewestFirst,
  type KetikReviewStatusLabel,
} from "./reviewDisplay";

/** Jumlah sesi telaah terbaru yang dipakai untuk rata-rata dan fokus. */
export const KETIK_LANDING_REVIEW_WINDOW = 5;
const LIST_LIMIT = 3;

export interface KetikFollowUp {
  session: KetikSessionHistoryItem;
  meta: string;
  status: KetikReviewStatusLabel;
}

export interface KetikRecentReview {
  session: KetikSessionHistoryItem;
  subjectLabel: string;
  score: number;
  lowestAspect: string | null;
}

export interface KetikLandingSummary {
  sessionsThisMonth: number;
  average: { score: number; sessions: number } | null;
  reviewing: number;
  followUps: KetikFollowUp[];
  focus: { label: string; score: number } | null;
  recent: KetikRecentReview[];
}

const WIB_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
});

function wibMonth(value: string | number): string | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? WIB_MONTH.format(time) : null;
}

function followUpMeta(session: KetikSessionHistoryItem): string {
  return [sessionParticipantLabel(session), session.consumerName, session.consumerCity]
    .filter(Boolean)
    .join(" · ");
}

function averageFocus(
  sessions: readonly KetikSessionHistoryItem[],
): KetikLandingSummary["focus"] {
  let lowest: KetikLandingSummary["focus"] = null;
  for (const { label, field } of KETIK_ASPECTS) {
    const values = sessions
      .map((session) => session[field])
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      );
    if (values.length === 0) continue;
    const score = Math.round(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
    if (!lowest || score < lowest.score) lowest = { label, score };
  }
  return lowest;
}

/**
 * Ringkasan halaman awal KETIK dari riwayat yang sudah dimuat. Tidak ada angka
 * yang dikarang: bagian tanpa data mengembalikan `null` atau daftar kosong.
 */
export function summarizeKetikLanding(
  history: readonly KetikSessionHistoryItem[],
  now: number = Date.now(),
): KetikLandingSummary {
  const sorted = sortNewestFirst(history);
  const reviewed = sorted.filter((session) => readFinalScore(session) !== null);
  const window = reviewed.slice(0, KETIK_LANDING_REVIEW_WINDOW);
  const month = wibMonth(now);

  return {
    sessionsThisMonth: sorted.filter(
      (session) => wibMonth(session.date) === month,
    ).length,
    average: window.length
      ? {
          score: Math.round(
            window.reduce(
              (total, session) => total + readFinalScore(session)!,
              0,
            ) / window.length,
          ),
          sessions: window.length,
        }
      : null,
    reviewing: sorted.filter((session) => session.reviewStatus === "processing")
      .length,
    followUps: sorted
      .filter(
        (session) =>
          session.reviewStatus !== "completed" &&
          session.reviewStatus !== "processing",
      )
      .slice(0, LIST_LIMIT)
      .map((session) => ({
        session,
        meta: followUpMeta(session),
        status: reviewStatusLabel(session.reviewStatus),
      })),
    focus: averageFocus(window),
    recent: reviewed.slice(0, LIST_LIMIT).map((session) => ({
      session,
      subjectLabel: sessionParticipantLabel(session),
      score: readFinalScore(session)!,
      lowestAspect: lowestAspect(session)?.label ?? null,
    })),
  };
}
