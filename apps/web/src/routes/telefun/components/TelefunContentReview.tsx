import { Check } from "lucide-react";
import type { TelefunAgentNote, TelefunConsumerPoint } from "@trainers/types";
import { cn } from "cn";
import {
  pointLetter,
  pointStatus,
  statusLine,
} from "../../../components/simulation/quoteMarks";
import { contentItemId } from "../utils/contentMarks";
import { formatClock } from "../utils/reviewDisplay";

/** Anotasi isi Telaah Telefun: pertanyaan konsumen dan kalimat agen. */

/** Waktu baris transkrip yang ditampilkan (awal ucapan bila sudah diketahui). */
export type LineClock = (startMs: number) => string;

const itemClass =
  "flex scroll-mt-4 flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 outline-none data-[highlighted=true]:border-foreground data-[highlighted=true]:ring-1 data-[highlighted=true]:ring-foreground";

/** Tombol menuju baris transkrip, dengan kutipannya. */
function QuoteButton({
  label,
  startMs,
  quote,
  onShowLine,
  clockOf,
}: {
  label: string;
  startMs: number;
  quote: string;
  onShowLine: (startMs: number) => void;
  clockOf: LineClock;
}) {
  return (
    <button
      type="button"
      onClick={() => onShowLine(startMs)}
      className="flex min-h-[44px] w-full flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="font-mono text-xs text-module-telefun">
        {label} {clockOf(startMs)}
      </span>
      <span className="text-[13px] leading-5 text-foreground">“{quote}”</span>
    </button>
  );
}

function ConsumerPointItem({
  point,
  letter,
  id,
  highlighted,
  onShowLine,
  clockOf,
}: {
  point: TelefunConsumerPoint;
  letter: string;
  id: string;
  highlighted: boolean;
  onShowLine: (startMs: number) => void;
  clockOf: LineClock;
}) {
  const status = pointStatus[point.status];
  return (
    <li
      id={id}
      tabIndex={-1}
      data-highlighted={highlighted}
      className={itemClass}
    >
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
        clockOf={clockOf}
      />
      {point.answerStartMs !== null && point.answerQuote ? (
        <QuoteButton
          label="Dijawab di"
          startMs={point.answerStartMs}
          quote={point.answerQuote}
          onShowLine={onShowLine}
          clockOf={clockOf}
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
  id,
  highlighted,
  onShowLine,
  clockOf,
}: {
  note: TelefunAgentNote;
  number: number;
  id: string;
  highlighted: boolean;
  onShowLine: (startMs: number) => void;
  clockOf: LineClock;
}) {
  const isFix = note.verdict === "fix";
  return (
    <li
      id={id}
      tabIndex={-1}
      data-highlighted={highlighted}
      className={itemClass}
    >
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
        clockOf={clockOf}
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

interface ContentListProps {
  onShowLine: (startMs: number) => void;
  /** `id` butir yang sedang ditunjuk dari transkrip. */
  highlightedId?: string | null;
  clockOf?: LineClock;
}

export function ConsumerPointList({
  points,
  onShowLine,
  highlightedId = null,
  clockOf = formatClock,
}: ContentListProps & { points: readonly TelefunConsumerPoint[] }) {
  return (
    <ol aria-label="Pertanyaan konsumen" className="flex flex-col gap-3">
      {points
        .map((point, index) => ({ point, index }))
        .sort((a, b) => {
          const order = { unanswered: 0, partial: 1, answered: 2 };
          return (
            order[a.point.status] - order[b.point.status] || a.index - b.index
          );
        })
        .map(({ point, index }) => (
          <ConsumerPointItem
            key={`${point.startMs}-${index}`}
            point={point}
            letter={pointLetter(index)}
            id={contentItemId({ kind: "question", index })}
            highlighted={
              highlightedId === contentItemId({ kind: "question", index })
            }
            onShowLine={onShowLine}
            clockOf={clockOf}
          />
        ))}
    </ol>
  );
}

export function AgentNoteList({
  notes,
  verdict,
  onShowLine,
  highlightedId = null,
  clockOf = formatClock,
}: ContentListProps & {
  notes: readonly TelefunAgentNote[];
  verdict?: TelefunAgentNote["verdict"];
}) {
  return (
    <ol aria-label="Kalimat agen" className="flex flex-col gap-3">
      {notes.map(
        (note, index) =>
          (!verdict || note.verdict === verdict) && (
            <AgentNoteItem
              key={`${note.startMs}-${index}`}
              note={note}
              number={index + 1}
              id={contentItemId({ kind: "line", index })}
              highlighted={
                highlightedId === contentItemId({ kind: "line", index })
              }
              onShowLine={onShowLine}
              clockOf={clockOf}
            />
          ),
      )}
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
