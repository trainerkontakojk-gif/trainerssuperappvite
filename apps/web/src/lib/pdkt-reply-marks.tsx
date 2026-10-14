import type { ReactNode } from "react";
import type { PdktReplyAnnotation } from "@trainers/types";

export type PlacedReplyAnnotation = PdktReplyAnnotation & {
  number: number;
  /** `true` bila kutipan ditandai di teks balasan. */
  marked: boolean;
};

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

/** Tandai hanya bila teks di posisi itu memang kutipannya (data lama/berbeda tidak salah tempat). */
function hasValidRange(
  annotation: PdktReplyAnnotation,
  body: string,
): annotation is PdktReplyAnnotation & { start: number; end: number } {
  return (
    typeof annotation.start === "number" &&
    typeof annotation.end === "number" &&
    annotation.start >= 0 &&
    annotation.start < annotation.end &&
    annotation.end <= body.length &&
    collapseSpaces(body.slice(annotation.start, annotation.end)) ===
      collapseSpaces(annotation.quote)
  );
}

/**
 * Menomori catatan AI menurut urutan baca dan memotong balasan menjadi teks
 * biasa dan bagian bertanda. Catatan tanpa posisi yang cocok tetap bernomor,
 * diletakkan di akhir, dan tidak ditandai.
 */
export function placeReplyAnnotations(
  annotations: readonly PdktReplyAnnotation[] | null | undefined,
  body: string,
  renderMark: (text: string, number: number) => ReactNode,
): { notes: PlacedReplyAnnotation[]; segments: ReactNode[] } {
  const notes = [...(annotations ?? [])]
    .sort((a, b) => {
      const aStart = hasValidRange(a, body) ? a.start : Infinity;
      const bStart = hasValidRange(b, body) ? b.start : Infinity;
      return aStart - bStart;
    })
    .map((annotation, index) => ({
      ...annotation,
      number: index + 1,
      marked: hasValidRange(annotation, body),
    }));

  const segments: ReactNode[] = [];
  let cursor = 0;
  for (const note of notes) {
    if (!note.marked || note.start === null) continue;
    // Tanda yang bertumpuk dengan tanda sebelumnya dilewati.
    if (note.start < cursor) {
      note.marked = false;
      continue;
    }
    const end = note.end as number;
    segments.push(body.slice(cursor, note.start));
    segments.push(renderMark(body.slice(note.start, end), note.number));
    cursor = end;
  }
  segments.push(body.slice(cursor));

  return { notes, segments };
}

/** Sorot frasa `highlights` di contoh balasan dengan `<mark>`. */
export function renderHighlights(
  body: string,
  highlights: readonly string[] | undefined,
  markClassName: string,
): ReactNode[] {
  if (!highlights || highlights.length === 0) return [body];

  const parts: ReactNode[] = [];
  let remaining = body;
  let key = 0;

  while (remaining.length > 0) {
    let earliest: { highlight: string; index: number } | null = null;
    for (const highlight of highlights) {
      const index = highlight ? remaining.indexOf(highlight) : -1;
      if (index !== -1 && (!earliest || index < earliest.index)) {
        earliest = { highlight, index };
      }
    }
    if (!earliest) {
      parts.push(<span key={`txt-${key}`}>{remaining}</span>);
      break;
    }
    if (earliest.index > 0) {
      parts.push(
        <span key={`txt-${key++}`}>{remaining.slice(0, earliest.index)}</span>,
      );
    }
    parts.push(
      <mark key={`hl-${key++}`} className={markClassName}>
        {earliest.highlight}
      </mark>,
    );
    remaining = remaining.slice(earliest.index + earliest.highlight.length);
  }

  return parts;
}
