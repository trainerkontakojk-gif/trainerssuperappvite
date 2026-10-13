import type {
  PdktDimensionKey,
  PdktEvaluationScoreBreakdown,
  PdktMailboxListItem,
} from "@trainers/types";
import { PDKT_DIMENSION_LABELS } from "../../../lib/pdkt-dimensions";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import type { SessionHistory } from "../components/HistoryModal";

/** Jumlah sesi telaah terbaru yang dipakai untuk rata-rata dan fokus. */
export const PDKT_LANDING_REVIEW_WINDOW = 5;
const LIST_LIMIT = 3;

const BREAKDOWN_KEYS: Record<
  PdktDimensionKey,
  keyof PdktEvaluationScoreBreakdown
> = {
  recipientDirection: "recipientDirectionScore",
  normative: "normativeResponseScore",
  clarity: "clarityScore",
  typo: "typoScore",
  template: "templateComplianceScore",
};

export interface PdktUnrepliedEmail {
  id: string;
  subject: string;
  meta: string;
  createdAt: string;
}

export interface PdktReviewedSession {
  session: SessionHistory;
  subject: string;
  subjectLabel: string;
  timestamp: string;
  score: number;
}

export interface PdktLandingSummary {
  waiting: { count: number; oldestAt: string | null };
  average: { score: number; sessions: number } | null;
  reviewing: number;
  unreplied: PdktUnrepliedEmail[];
  focus: { label: string; score: number } | null;
  recent: PdktReviewedSession[];
}

function toTime(value: string | Date | null | undefined): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function readScore(session: SessionHistory): number | null {
  const score = session.evaluation?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function readBreakdown(
  session: SessionHistory,
): PdktEvaluationScoreBreakdown | null {
  const breakdown = session.evaluation?.scoreBreakdown;
  return breakdown && typeof breakdown === "object" ? breakdown : null;
}

function sessionSubject(session: SessionHistory): string {
  const emails = Array.isArray(session.emails) ? session.emails : [];
  const subject = emails.find(
    (email) => typeof email?.subject === "string" && email.subject.trim(),
  )?.subject;
  if (typeof subject === "string") return subject.trim();
  const title = session.config?.scenarios?.[0]?.title;
  return typeof title === "string" && title.trim()
    ? title.trim()
    : "Tanpa subjek";
}

function mailboxMeta(item: PdktMailboxListItem): string {
  const subject = item.simulationSubject;
  if (subject?.type === "participant") {
    return `Untuk ${formatSimulationSubjectLabel(subject, {
      includeParticipantDetails: true,
    }).replaceAll(" — ", " · ")}`;
  }
  if (item.created_by_user?.is_current_user) return "Latihan Anda sendiri";
  const creator = item.created_by_user?.full_name?.trim();
  return creator ? `Dibuat oleh ${creator}` : "Latihan mandiri";
}

function lowestDimension(
  sessions: SessionHistory[],
): PdktLandingSummary["focus"] {
  let lowest: PdktLandingSummary["focus"] = null;
  for (const [dimension, key] of Object.entries(BREAKDOWN_KEYS) as Array<
    [PdktDimensionKey, keyof PdktEvaluationScoreBreakdown]
  >) {
    const values = sessions
      .map((session) => readBreakdown(session)?.[key])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) continue;
    const score = Math.round(
      values.reduce((total, value) => total + value, 0) / values.length,
    );
    if (!lowest || score < lowest.score) {
      lowest = { label: PDKT_DIMENSION_LABELS[dimension], score };
    }
  }
  return lowest;
}

/**
 * Ringkasan halaman awal PDKT dari data yang sudah dimuat (riwayat + daftar
 * kotak masuk). Tidak ada angka yang dikarang: bagian tanpa data mengembalikan
 * `null` atau daftar kosong.
 */
export function summarizePdktLanding(
  history: readonly SessionHistory[],
  mailbox: readonly PdktMailboxListItem[],
): PdktLandingSummary {
  const open = mailbox
    .filter((item) => item.status === "open")
    .sort((a, b) => toTime(a.created_at) - toTime(b.created_at));

  const reviewed = history
    .filter(
      (session) =>
        session.evaluationStatus === "completed" && readScore(session) !== null,
    )
    .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp));
  const window = reviewed.slice(0, PDKT_LANDING_REVIEW_WINDOW);
  const average = window.length
    ? {
        score: Math.round(
          window.reduce((total, session) => total + readScore(session)!, 0) /
            window.length,
        ),
        sessions: window.length,
      }
    : null;

  return {
    waiting: { count: open.length, oldestAt: open[0]?.created_at ?? null },
    average,
    reviewing: history.filter(
      (session) =>
        session.evaluationStatus === "pending" ||
        session.evaluationStatus === "processing",
    ).length,
    unreplied: open.slice(0, LIST_LIMIT).map((item) => ({
      id: item.id,
      subject: item.subject?.trim() || "Tanpa subjek",
      meta: mailboxMeta(item),
      createdAt: item.created_at,
    })),
    focus: lowestDimension(window),
    recent: reviewed.slice(0, LIST_LIMIT).map((session) => ({
      session,
      subject: sessionSubject(session),
      subjectLabel: formatSimulationSubjectLabel(session.simulationSubject, {
        unknownLabel: "Tidak tercatat",
      }),
      timestamp: new Date(session.timestamp).toISOString(),
      score: readScore(session)!,
    })),
  };
}

const WIB_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function wibDayNumber(time: number): number {
  return Date.parse(`${WIB_DAY.format(time)}T00:00:00Z`) / 86_400_000;
}

/** "Hari ini", "Kemarin", atau "N hari lalu" menurut tanggal WIB. */
export function formatPdktRelativeDay(
  value: string | null | undefined,
  now: number = Date.now(),
): string {
  const time = toTime(value);
  if (!time) return "-";
  const days = Math.max(0, wibDayNumber(now) - wibDayNumber(time));
  if (days === 0) return "Hari ini";
  if (days === 1) return "Kemarin";
  return `${days} hari lalu`;
}

const WIB_DATE = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatPdktDate(value: string): string {
  const time = toTime(value);
  return time ? WIB_DATE.format(time) : "-";
}
