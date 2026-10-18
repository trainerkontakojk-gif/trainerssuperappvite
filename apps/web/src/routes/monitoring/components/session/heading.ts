import { MODULE_LABELS } from "../../history-search";
import { formatSessionDateTime } from "../../utils/formatting";
import type { SessionReviewData } from "../SessionReview";
import { REVIEW_STATE_LABELS } from "./types";

const FALLBACK_TITLES: Record<SessionReviewData["module"], string> = {
  ketik: "Sesi KETIK",
  pdkt: "Sesi PDKT",
  telefun: "Sesi Telefun",
};

export interface SessionHeading {
  title: string;
  participant: string | null;
  occurredAt: string | null;
  /** Mis. "KETIK · Rina Kartika · 17 Okt 2026, 14.15 WIB · Selesai dinilai". */
  meta: string;
}

/** Judul dan baris meta detail sesi, sama untuk halaman sesi dan jendela SIDAK. */
export function sessionHeading(review: SessionReviewData): SessionHeading {
  const header = review.header;
  const subject = review.simulationSubject;
  const participant =
    (subject?.type === "participant" ? subject.displayName : null) ||
    header?.actor_name ||
    review.user_email ||
    null;
  const occurredAt = header?.occurred_at ?? null;
  return {
    title:
      header?.scenario_title ||
      (review.module === "telefun" ? review.scenario_title : null) ||
      FALLBACK_TITLES[review.module],
    participant,
    occurredAt,
    meta: [
      MODULE_LABELS[review.module],
      participant,
      formatSessionDateTime(occurredAt),
      REVIEW_STATE_LABELS[review.review_status] ?? "Belum dinilai",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
