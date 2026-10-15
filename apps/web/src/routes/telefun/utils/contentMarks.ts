import type { TelefunContentReview } from "@trainers/types";
import {
  agentMarkClass,
  consumerMarkClass,
  pointLetter,
  type QuoteMark,
} from "../../../components/simulation/quoteMarks";

/** Tanda kutipan per baris transkrip, dikunci dengan `startMs` baris. */
export function buildTelefunQuoteMarks(
  review: TelefunContentReview | null | undefined,
): Map<number, QuoteMark[]> {
  const marks = new Map<number, QuoteMark[]>();
  if (!review) return marks;
  const add = (startMs: number, mark: QuoteMark) =>
    marks.set(startMs, [...(marks.get(startMs) ?? []), mark]);
  review.consumerPoints.forEach((point, index) =>
    add(point.startMs, {
      quote: point.quote,
      label: pointLetter(index),
      className: consumerMarkClass(point.status),
    }),
  );
  review.agentNotes.forEach((note, index) =>
    add(note.startMs, {
      quote: note.quote,
      label: String(index + 1),
      className: agentMarkClass(note.verdict),
    }),
  );
  return marks;
}
