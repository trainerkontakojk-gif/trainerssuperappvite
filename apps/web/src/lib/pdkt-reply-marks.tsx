import type { ReactNode } from "react";
import type { PdktReplyAnnotation, PdktConsumerPoint } from "@trainers/types";

export type PlacedReplyAnnotation = PdktReplyAnnotation & {
  number: number;
  /** `true` bila kutipan ditandai di teks balasan. */
  marked: boolean;
};

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

/** Tandai hanya bila teks di posisi itu memang kutipannya (data lama/berbeda tidak salah tempat). */
type QuotedRange = { quote: string; start: number | null; end: number | null };
function hasValidRange<T extends QuotedRange>(
  annotation: T,
  body: string,
): annotation is T & { start: number; end: number } {
  return (
    Number.isInteger(annotation.start) &&
    Number.isInteger(annotation.end) &&
    annotation.start !== null &&
    annotation.end !== null &&
    annotation.start >= 0 &&
    annotation.start < annotation.end &&
    annotation.end <= body.length &&
    collapseSpaces(body.slice(annotation.start, annotation.end)) ===
      collapseSpaces(annotation.quote)
  );
}

function orderQuotes<T extends QuotedRange>(
  values: readonly T[],
  body: string,
) {
  let cursor = 0;
  return [...values]
    .sort(
      (a, b) =>
        (hasValidRange(a, body) ? a.start : Infinity) -
        (hasValidRange(b, body) ? b.start : Infinity),
    )
    .map((value) => {
      const marked = hasValidRange(value, body) && value.start >= cursor;
      if (marked) cursor = value.end as number;
      return { ...value, marked };
    });
}

export type PlacedConsumerPoint = PdktConsumerPoint & {
  letter: string;
  marked: boolean;
};

/** Rentang paragraf persis seperti `EmailBody`: dipisah baris kosong, tepi di-trim. */
function paragraphRanges(body: string) {
  const ranges: { start: number; end: number }[] = [];
  const push = (start: number, end: number) => {
    const text = body.slice(start, end);
    if (!text.trim()) return;
    ranges.push({
      start: start + text.length - text.trimStart().length,
      end: end - (text.length - text.trimEnd().length),
    });
  };
  const separator = /\n\s*\n/g;
  let from = 0;
  for (const match of body.matchAll(separator)) {
    push(from, match.index);
    from = match.index + match[0].length;
  }
  push(from, body.length);
  return ranges;
}

/**
 * Poin konsumen ditandai per paragraf. Kutipan yang melewati batas paragraf
 * dipotong per paragraf; `withLabel` hanya pada potongan terakhirnya.
 */
export function placeConsumerPoints(
  points: readonly PdktConsumerPoint[] | undefined,
  body: string,
  renderMark: (
    text: string,
    point: PlacedConsumerPoint,
    withLabel: boolean,
  ) => ReactNode,
): { points: PlacedConsumerPoint[]; paragraphs: ReactNode[][] } {
  const ordered = orderQuotes(points ?? [], body).map((point, index) => ({
    ...point,
    letter: String.fromCharCode(65 + index),
  }));
  const ranges = paragraphRanges(body);
  const paragraphs = ranges.map(({ start, end }, index) => {
    const nextStart = ranges[index + 1]?.start ?? Infinity;
    const parts: ReactNode[] = [];
    let cursor = start;
    for (const point of ordered) {
      if (!point.marked || point.start === null || point.end === null) continue;
      const from = Math.max(point.start, start);
      const to = Math.min(point.end, end);
      if (from >= to) continue;
      parts.push(
        body.slice(cursor, from),
        renderMark(body.slice(from, to), point, point.end <= nextStart),
      );
      cursor = to;
    }
    parts.push(body.slice(cursor, end));
    return parts;
  });
  return { points: ordered, paragraphs };
}

/**
 * Posisi label huruf poin di balasan, atau `null` bila poin tidak dijawab atau
 * teks sebelum posisi itu bukan lagi kutipan jawabannya (body berubah/teredaksi).
 */
export function consumerPointReplyEnd(
  point: Pick<PdktConsumerPoint, "status" | "replyQuote" | "replyEnd">,
  body: string,
): number | null {
  const at = point.replyEnd;
  if (
    point.status === "unanswered" ||
    !point.replyQuote ||
    at === null ||
    !Number.isInteger(at) ||
    at < 0 ||
    at > body.length
  ) {
    return null;
  }
  return collapseSpaces(body.slice(0, at)).endsWith(
    collapseSpaces(point.replyQuote),
  )
    ? at
    : null;
}

export type ReplyInsertion = { at: number; node: ReactNode };
/** Nomor catatan dan label poin berbagi satu urutan teks; label tidak membelah mark. */
export function placeReplyAnnotations(
  annotations: readonly PdktReplyAnnotation[] | null | undefined,
  body: string,
  renderMark: (text: string, number: number) => ReactNode,
  insertions: readonly ReplyInsertion[] = [],
): { notes: PlacedReplyAnnotation[]; segments: ReactNode[] } {
  const notes = orderQuotes(annotations ?? [], body).map((note, index) => ({
    ...note,
    number: index + 1,
  }));
  const labels = insertions
    .filter(({ at }) => Number.isInteger(at) && at >= 0 && at <= body.length)
    .map((label) => {
      const containing = notes.find(
        (note) =>
          note.marked &&
          note.start !== null &&
          note.end !== null &&
          label.at > note.start &&
          label.at < note.end,
      );
      return { ...label, at: containing?.end ?? label.at };
    })
    .sort((a, b) => a.at - b.at);
  const segments: ReactNode[] = [];
  let cursor = 0;
  let labelIndex = 0;
  const appendText = (end: number) => {
    while (labelIndex < labels.length && labels[labelIndex].at <= end) {
      const label = labels[labelIndex++];
      segments.push(body.slice(cursor, label.at), label.node);
      cursor = label.at;
    }
    segments.push(body.slice(cursor, end));
    cursor = end;
  };
  for (const note of notes) {
    if (!note.marked || note.start === null || note.end === null) continue;
    appendText(note.start);
    segments.push(renderMark(body.slice(note.start, note.end), note.number));
    cursor = note.end;
  }
  appendText(body.length);
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
