import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Tanda kutipan anotasi Telaah di transkrip, dipakai bersama KETIK dan
 * Telefun. Tanda lain di dalam kutipan (typo, kata pengisi) tetap tampil
 * lewat `renderInner`.
 */

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Posisi kutipan anotasi di teks yang ditampilkan. Huruf besar/kecil dan
 * jumlah spasi diabaikan, sama seperti pencocokan di backend; `null` bila tidak
 * ketemu (catatan tetap tampil di panel hasil).
 */
export function findQuoteRange(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const match = new RegExp(words.map(escapeRegExp).join("\\s+"), "i").exec(
    text,
  );
  return match
    ? { start: match.index, end: match.index + match[0].length }
    : null;
}

export type QuotePointStatus = "answered" | "partial" | "unanswered";

// Status dibedakan oleh warna dan gaya garis (utuh/putus/titik), tidak hanya
// warna; label status di panel hasil memakai garis yang sama sebagai legenda.
export const pointStatus: Record<
  QuotePointStatus,
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

/** Kutipan anotasi yang ditandai di satu baris transkrip. */
export interface QuoteMark {
  quote: string;
  label: string;
  className: string;
  /** Label tanda menjadi tombol menuju poinnya di panel hasil. */
  onSelect?: () => void;
  /** Nama tombol untuk pembaca layar, mis. "Lihat pertanyaan konsumen A". */
  selectLabel?: string;
}

/** Kelas tanda untuk kutipan konsumen dengan status jawabannya. */
export function consumerMarkClass(status: QuotePointStatus): string {
  return cn(
    "text-foreground",
    statusLine,
    pointStatus[status].line,
    pointStatus[status].tint,
  );
}

/** Kelas tanda untuk kalimat agen: garis utuh untuk tepat, putus untuk perbaiki. */
export function agentMarkClass(verdict: "good" | "fix"): string {
  return cn(
    "bg-transparent text-inherit",
    statusLine,
    verdict === "fix" ? "decoration-dashed" : "decoration-solid",
  );
}

/** Teks dengan kutipan anotasi bertanda; tanda lain dirender oleh `renderInner`. */
export function withQuoteMarks(
  text: string,
  marks: readonly QuoteMark[],
  renderInner: (text: string) => ReactNode = (value) => value,
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
  if (placed.length === 0) return renderInner(text);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end, mark } of placed) {
    if (start > cursor) {
      parts.push(
        <span key={`t${cursor}`}>
          {renderInner(text.slice(cursor, start))}
        </span>,
      );
    }
    parts.push(
      <mark
        key={`m${start}`}
        className={cn("px-0.5 [box-decoration-break:clone]", mark.className)}
      >
        {renderInner(text.slice(start, end))}
        {mark.onSelect ? (
          <button
            type="button"
            onClick={mark.onSelect}
            aria-label={mark.selectLabel ?? mark.label}
            className="relative -top-1.5 ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-border bg-background px-1 align-baseline font-mono text-xs leading-none font-bold text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {mark.label}
          </button>
        ) : (
          <sup className="ml-0.5 font-mono text-xs font-bold">{mark.label}</sup>
        )}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(
      <span key={`t${cursor}`}>{renderInner(text.slice(cursor))}</span>,
    );
  }
  return parts;
}
