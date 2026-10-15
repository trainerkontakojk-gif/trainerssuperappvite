import type { TelefunContentReview } from "@trainers/types";
import {
  agentMarkClass,
  consumerMarkClass,
  pointLetter,
  type QuoteMark,
} from "../../../components/simulation/quoteMarks";

/** Poin anotasi isi di panel hasil: tab dan urutan butirnya. */
export type TelefunContentTarget = { tab: "questions" | "lines"; index: number };

/** `id` elemen butir anotasi isi di panel hasil. */
export function contentItemId(target: TelefunContentTarget): string {
  return `telefun-${target.tab}-${target.index}`;
}

/** `id` elemen catatan trainer di panel hasil. */
export function annotationItemId(annotationId: string): string {
  return `telefun-annotation-${annotationId}`;
}

/**
 * Tanda kutipan per baris transkrip, dikunci dengan `startMs` baris. Label
 * tanda membuka poinnya lewat `onSelect`.
 */
export function buildTelefunQuoteMarks(
  review: TelefunContentReview | null | undefined,
  onSelect?: (target: TelefunContentTarget) => void,
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
      onSelect: onSelect && (() => onSelect({ tab: "questions", index })),
      selectLabel: `Lihat pertanyaan konsumen ${pointLetter(index)}`,
    }),
  );
  review.agentNotes.forEach((note, index) =>
    add(note.startMs, {
      quote: note.quote,
      label: String(index + 1),
      className: agentMarkClass(note.verdict),
      onSelect: onSelect && (() => onSelect({ tab: "lines", index })),
      selectLabel: `Lihat kalimat agen ${index + 1}`,
    }),
  );
  return marks;
}
