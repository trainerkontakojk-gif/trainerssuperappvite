import type { KetikReviewTarget } from "./reviewNavigation";
import type { ReactNode } from "react";
import type { KetikAgentNote, KetikConsumerPoint } from "@trainers/types";
import {
  agentMarkClass,
  consumerMarkClass,
  escapeRegExp,
  pointLetter,
  withQuoteMarks as withSharedQuoteMarks,
  type QuoteMark,
} from "../../../components/simulation/quoteMarks";

export {
  pointLetter,
  pointStatus,
  statusLine,
} from "../../../components/simulation/quoteMarks";

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

/** Tanda anotasi per pesan: poin konsumen (huruf) dan kalimat agen (nomor). */
export function buildQuoteMarks(
  points: readonly KetikConsumerPoint[],
  notes: readonly KetikAgentNote[],
  onSelect: (target: KetikReviewTarget) => void,
): Map<string, QuoteMark[]> {
  const marks = new Map<string, QuoteMark[]>();
  const add = (messageId: string, mark: QuoteMark) =>
    marks.set(messageId, [...(marks.get(messageId) ?? []), mark]);
  points.forEach((point, index) =>
    add(point.messageId, {
      quote: point.quote,
      label: pointLetter(index),
      onSelect: () => onSelect({ section: "questions", key: index }),
      selectLabel: `Lihat pertanyaan konsumen ${pointLetter(index)}`,
      className: consumerMarkClass(point.status),
    }),
  );
  notes.forEach((note, index) =>
    add(note.messageId, {
      quote: note.quote,
      label: String(index + 1),
      onSelect: () => onSelect({ section: "notes", key: index }),
      selectLabel: `Lihat kalimat agen ${index + 1}`,
      // Gelembung agen berwarna modul: tanda memakai warna teksnya sendiri.
      className: agentMarkClass(note.verdict),
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
  return withSharedQuoteMarks(text, marks, (part) =>
    withTypoMarks(part, typoWords),
  );
}
