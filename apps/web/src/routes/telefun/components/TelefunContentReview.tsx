import { Check } from "lucide-react";
import type { TelefunAgentNote, TelefunConsumerPoint } from "@trainers/types";
import { cn } from "cn";
import {
  pointLetter,
  pointStatus,
  statusLine,
} from "../../../components/simulation/quoteMarks";
import { formatClock } from "../utils/reviewDisplay";

/** Anotasi isi Telaah Telefun: pertanyaan konsumen dan kalimat agen. */

/** Tombol menuju baris transkrip, dengan kutipannya. */
function QuoteButton({
  label,
  startMs,
  quote,
  onShowLine,
}: {
  label: string;
  startMs: number;
  quote: string;
  onShowLine: (startMs: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onShowLine(startMs)}
      className="flex min-h-[44px] w-full flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="font-mono text-xs text-module-telefun">
        {label} {formatClock(startMs)}
      </span>
      <span className="text-[13px] leading-5 text-foreground">“{quote}”</span>
    </button>
  );
}

function ConsumerPointItem({
  point,
  letter,
  onShowLine,
}: {
  point: TelefunConsumerPoint;
  letter: string;
  onShowLine: (startMs: number) => void;
}) {
  const status = pointStatus[point.status];
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-bold text-foreground">
          {letter}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {point.summary}
        </span>
        <span
          className={cn(
            "ml-auto text-xs font-medium text-foreground",
            statusLine,
            status.line,
          )}
        >
          {status.label}
        </span>
      </p>
      {point.reason && (
        <p className="text-[13px] leading-6 text-fg2">{point.reason}</p>
      )}
      <QuoteButton
        label="Konsumen"
        startMs={point.startMs}
        quote={point.quote}
        onShowLine={onShowLine}
      />
      {point.answerStartMs !== null && point.answerQuote ? (
        <QuoteButton
          label="Dijawab di"
          startMs={point.answerStartMs}
          quote={point.answerQuote}
          onShowLine={onShowLine}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Belum ada jawaban agen untuk pertanyaan ini.
        </p>
      )}
    </li>
  );
}

function AgentNoteItem({
  note,
  number,
  onShowLine,
}: {
  note: TelefunAgentNote;
  number: number;
  onShowLine: (startMs: number) => void;
}) {
  const isFix = note.verdict === "fix";
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-bold text-foreground">
          {number}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          {isFix ? (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-chart-orange"
            />
          ) : (
            <Check aria-hidden="true" className="size-3.5 text-chart-green" />
          )}
          {isFix ? "Perlu diperbaiki" : "Sudah tepat"}
        </span>
      </p>
      <QuoteButton
        label="Agen"
        startMs={note.startMs}
        quote={note.quote}
        onShowLine={onShowLine}
      />
      <p className="text-[13px] leading-6 text-fg2">{note.note}</p>
      {isFix && note.example && (
        <p className="rounded-lg border border-chart-green/40 px-3 py-2 text-[13px] leading-6 text-foreground">
          <span className="font-semibold">Kalimat yang lebih tepat: </span>
          {note.example}
        </p>
      )}
    </li>
  );
}

export function ConsumerPointList({
  points,
  onShowLine,
}: {
  points: readonly TelefunConsumerPoint[];
  onShowLine: (startMs: number) => void;
}) {
  return (
    <ol aria-label="Pertanyaan konsumen" className="flex flex-col gap-3">
      {points.map((point, index) => (
        <ConsumerPointItem
          key={`${point.startMs}-${index}`}
          point={point}
          letter={pointLetter(index)}
          onShowLine={onShowLine}
        />
      ))}
    </ol>
  );
}

export function AgentNoteList({
  notes,
  onShowLine,
}: {
  notes: readonly TelefunAgentNote[];
  onShowLine: (startMs: number) => void;
}) {
  return (
    <ol aria-label="Kalimat agen" className="flex flex-col gap-3">
      {notes.map((note, index) => (
        <AgentNoteItem
          key={`${note.startMs}-${index}`}
          note={note}
          number={index + 1}
          onShowLine={onShowLine}
        />
      ))}
    </ol>
  );
}

/**
 * Anotasi isi tidak ada: hasil lama (`undefined`) atau panggilan tanpa
 * transkrip dua arah (`null`).
 */
export function ContentNotAvailable({
  review,
  canRerun,
}: {
  review: null | undefined;
  canRerun: boolean;
}) {
  return (
    <p className="text-[13px] leading-6 text-muted-foreground">
      {review === null
        ? "Transkrip percakapan tidak tersimpan, jadi isi panggilan ini tidak bisa ditelaah."
        : "Belum tersedia untuk hasil ini. Pertanyaan konsumen dan kalimat agen hanya ditelaah pada hasil yang dibuat setelah fitur ini dirilis."}
      {review === undefined &&
        canRerun &&
        " Jalankan Telaah ulang untuk melengkapinya."}
    </p>
  );
}
