import type { TelefunContentReview } from "@trainers/types";
import {
  agentMarkClass,
  consumerMarkClass,
  pointLetter,
  type QuoteMark,
} from "../../../components/simulation/quoteMarks";

/** Poin anotasi isi di panel hasil, tetap memakai urutan aslinya. */
export type TelefunContentTarget = { kind: "question" | "line"; index: number };

/** `id` elemen butir anotasi isi di panel hasil. */
export function contentItemId(target: TelefunContentTarget): string {
  return `telefun-${target.kind}-${target.index}`;
}

/** Gulir hanya panel telaah, bukan bingkai aplikasi yang tetap. */
export function focusReviewTarget(target: HTMLElement): void {
  const root = target.closest<HTMLElement>("[data-review-scroll]");
  if (!root) return;
  for (
    let parent = target.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    if (parent === root) break;
  }
  let focus = target;
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
    focus = target.querySelector("summary") ?? target;
  }
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  for (let pane = focus.parentElement; pane; pane = pane.parentElement) {
    if (
      pane.scrollHeight > pane.clientHeight &&
      /auto|scroll/.test(getComputedStyle(pane).overflowY)
    ) {
      const rect = focus.getBoundingClientRect();
      const box = pane.getBoundingClientRect();
      const navigation = target
        .closest("#telefun-review-result")
        ?.querySelector<HTMLElement>('nav[aria-label="Lompat ke bagian"]');
      const inset = navigation
        ? navigation.getBoundingClientRect().height +
          parseFloat(getComputedStyle(pane).paddingTop) +
          12
        : 0;
      const offset = Math.max(inset, (pane.clientHeight - rect.height) / 2);
      pane.scrollBy({ top: rect.top - box.top - offset, behavior });
    }
    if (pane === root) break;
  }
  focus.focus({ preventScroll: true });
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
      onSelect: onSelect && (() => onSelect({ kind: "question", index })),
      selectLabel: `Lihat pertanyaan konsumen ${pointLetter(index)}`,
    }),
  );
  review.agentNotes.forEach((note, index) =>
    add(note.startMs, {
      quote: note.quote,
      label: String(index + 1),
      className: agentMarkClass(note.verdict),
      onSelect: onSelect && (() => onSelect({ kind: "line", index })),
      selectLabel: `Lihat kalimat agen ${index + 1}`,
    }),
  );
  return marks;
}
