import { Ticket, TrendingDown } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

interface TicketItem {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa?: boolean;
}

interface Props {
  tickets: TicketItem[];
  /** Bila diisi, setiap baris menjadi tombol yang membuka tiket di tab Temuan. */
  onTicketSelect?: (ticketKey: string) => void;
}

const rowClass =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 px-1 py-3";

export default function TopTicketsCard({ tickets, onTicketSelect }: Props) {
  return (
    <section
      aria-label="Tiket pengurang skor terbesar"
      className="flex min-w-0 flex-col"
    >
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h4 className="font-outfit text-base font-semibold tracking-tight text-foreground">
          Tiket pengurang skor terbesar
        </h4>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {tickets.length} tiket
        </span>
      </div>

      <div>
        {tickets.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="bg-muted text-muted-foreground"
              >
                <Ticket className="size-4" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Tidak ada tiket yang mengurangi skor</EmptyTitle>
              <EmptyDescription>
                Tidak ada temuan yang mengurangi skor di bulan ini.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="divide-y divide-border border-t border-border">
            {tickets.map((ticket, idx) => {
              const ticketLabel = ticket.isSamplingQa
                ? "Tiket Sampling QA"
                : ticket.no_tiket.toLowerCase().startsWith("audit-")
                  ? "Audit Internal"
                  : ticket.no_tiket;

              const content = (
                <>
                  <span className="pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words font-mono text-sm font-semibold text-foreground">
                      <span className="sr-only">No. Tiket </span>
                      {ticketLabel}
                    </span>
                    <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                      Parameter terberat: {ticket.heaviestParam}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                      <TrendingDown
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      −{ticket.scoreDeduction.toFixed(1)} poin
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ticket.findingCount} temuan
                    </span>
                  </span>
                </>
              );

              return (
                <li key={ticket.no_tiket}>
                  {onTicketSelect ? (
                    <button
                      type="button"
                      onClick={() => onTicketSelect(ticket.no_tiket)}
                      title="Lihat di tab Temuan"
                      className={`${rowClass} w-full rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={rowClass}>{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
