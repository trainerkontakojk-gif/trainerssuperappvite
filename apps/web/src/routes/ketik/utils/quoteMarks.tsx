import type { ReactNode } from "react";
import type {
  KetikAgentNote,
  KetikConsumerPoint,
  KetikConsumerPointStatus,
} from "@trainers/types";
import { cn } from "cn";
import { escapeRegExp, findQuoteRange } from "./reviewDisplay";

/** Tanda kutipan anotasi dan typo di transkrip Telaah KETIK. */

/** Garis bawahi kata yang salah eja langsung di kalimatnya. */
function withTypoMarks(text: string, words: readonly string[]): ReactNode {
  const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
  if (unique.length === 0) return text;
  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded-sm border-b-2 border-chart-orange bg-chart-orange/25 px-px text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// Status dibedakan oleh warna dan gaya garis (utuh/putus/titik), tidak hanya
// warna; label status di panel hasil memakai garis yang sama sebagai legenda.
export const pointStatus: Record<
  KetikConsumerPointStatus,
  { label: string; line: string; tint: string }
> = {
  answered: {
    label: "Terjawab",
    line: "decoration-chart-green decoration-solid",
    tint: "bg-chart-green/15",
  },
  partial: {
    label: "Sebagian",
    line: "decoration-chart-amber decoration-dashed",
    tint: "bg-chart-amber/15",
  },
  unanswered: {
    label: "Belum terjawab",
    line: "decoration-chart-red decoration-dotted",
    tint: "bg-chart-red/15",
  },
};
export const statusLine = "underline decoration-2 underline-offset-4";
export const pointLetter = (index: number) => String.fromCharCode(65 + index);

/** Kutipan anotasi yang ditandai di satu pesan transkrip. */
interface QuoteMark {
  quote: string;
  label: string;
  className: string;
}

/** Tanda anotasi per pesan: poin konsumen (huruf) dan kalimat agen (nomor). */
export function buildQuoteMarks(
  points: readonly KetikConsumerPoint[],
  notes: readonly KetikAgentNote[],
): Map<string, QuoteMark[]> {
  const marks = new Map<string, QuoteMark[]>();
  const add = (messageId: string, mark: QuoteMark) =>
    marks.set(messageId, [...(marks.get(messageId) ?? []), mark]);
  points.forEach((point, index) =>
    add(point.messageId, {
      quote: point.quote,
      label: pointLetter(index),
      className: cn(
        "text-foreground",
        statusLine,
        pointStatus[point.status].line,
        pointStatus[point.status].tint,
      ),
    }),
  );
  notes.forEach((note, index) =>
    add(note.messageId, {
      quote: note.quote,
      label: String(index + 1),
      // Gelembung agen berwarna modul: tanda memakai warna teksnya sendiri.
      className: cn(
        "bg-transparent text-inherit",
        statusLine,
        note.verdict === "fix" ? "decoration-dashed" : "decoration-solid",
      ),
    }),
  );
  return marks;
}

/** Teks pesan dengan kutipan anotasi bertanda; typo tetap digarisbawahi di dalamnya. */
export function withQuoteMarks(
  text: string,
  marks: readonly QuoteMark[],
  typoWords: readonly string[],
): ReactNode {
  const placed = marks
    .flatMap((mark) => {
      const range = findQuoteRange(text, mark.quote);
      return range ? [{ ...range, mark }] : [];
    })
    .sort((a, b) => a.start - b.start)
    // Kutipan yang bertumpuk dengan tanda sebelumnya tidak ditandai.
    .filter((item, index, list) =>
      list.slice(0, index).every((prev) => prev.end <= item.start),
    );
  if (placed.length === 0) return withTypoMarks(text, typoWords);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, mark } of placed) {
    if (start > cursor) {
      parts.push(
        <span key={`t${cursor}`}>
          {withTypoMarks(text.slice(cursor, start), typoWords)}
        </span>,
      );
    }
    parts.push(
      <mark
        key={`m${start}`}
        className={cn("px-0.5 [box-decoration-break:clone]", mark.className)}
      >
        {withTypoMarks(text.slice(start, end), typoWords)}
        <sup className="ml-0.5 font-mono text-xs font-bold">{mark.label}</sup>
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(
      <span key={`t${cursor}`}>
        {withTypoMarks(text.slice(cursor), typoWords)}
      </span>,
    );
  }
  return parts;
}
