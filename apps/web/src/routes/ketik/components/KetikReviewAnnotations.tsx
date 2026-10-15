import { Check } from "lucide-react";
import type { KetikAgentNote, KetikConsumerPoint } from "@trainers/types";
import { cn } from "cn";
import { pointStatus, statusLine } from "../utils/quoteMarks";
import { KETIK_ASPECTS } from "../utils/reviewDisplay";

/** Anotasi Telaah KETIK di panel hasil: poin konsumen dan kalimat agen. */

const aspectLabel = (key: string) =>
  KETIK_ASPECTS.find((aspect) => aspect.key === key)?.label ?? key;

/** Tombol menuju pesan di transkrip, dengan kutipannya. */
function QuoteButton({
  prefix,
  messageId,
  quote,
  numbers,
  onShowMessage,
}: {
  prefix: string;
  messageId: string;
  quote: string;
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
}) {
  const number = numbers.get(messageId);
  return (
    <button
      type="button"
      onClick={() => onShowMessage(messageId)}
      disabled={number === undefined}
      className="flex min-h-[44px] w-full flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
    >
      <span className="font-mono text-xs text-module-ketik">
        {number !== undefined ? `${prefix} ${number}` : "Pesan tidak ditemukan"}
      </span>
      <span className="text-[13px] leading-5 text-foreground">“{quote}”</span>
    </button>
  );
}

export function ConsumerPointItem({
  point,
  letter,
  numbers,
  onShowMessage,
}: {
  point: KetikConsumerPoint;
  letter: string;
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
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
        prefix="Pesan"
        messageId={point.messageId}
        quote={point.quote}
        numbers={numbers}
        onShowMessage={onShowMessage}
      />
      {point.answerMessageId && point.answerQuote ? (
        <QuoteButton
          prefix="Dijawab di pesan"
          messageId={point.answerMessageId}
          quote={point.answerQuote}
          numbers={numbers}
          onShowMessage={onShowMessage}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Belum ada balasan agen untuk poin ini.
        </p>
      )}
    </li>
  );
}

export function AgentNoteItem({
  note,
  number,
  numbers,
  onShowMessage,
}: {
  note: KetikAgentNote;
  number: number;
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
}) {
  const isFix = note.verdict === "fix";
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-bold text-foreground">
          {number}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {aspectLabel(note.dimension)}
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
        prefix="Pesan"
        messageId={note.messageId}
        quote={note.quote}
        numbers={numbers}
        onShowMessage={onShowMessage}
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

export function NotAvailable({ canRerun }: { canRerun: boolean }) {
  return (
    <p className="text-[13px] text-muted-foreground">
      Belum tersedia untuk telaah ini. Penanda pertanyaan konsumen dan kalimat
      agen hanya ada di telaah yang dibuat setelah fitur ini dirilis.
      {canRerun && " Jalankan Telaah ulang untuk melengkapinya."}
    </p>
  );
}
