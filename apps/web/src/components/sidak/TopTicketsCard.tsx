import { Ticket, TrendingDown } from "lucide-react";

interface TicketItem {
  no_tiket: string;
  deduction: number;
  count: number;
  heaviestParam: string;
  isSamplingQa?: boolean;
}

interface Props {
  tickets: TicketItem[];
}

export default function TopTicketsCard({ tickets }: Props) {
  return (
    <div className="rounded-3xl border border-border/50 bg-card p-6 shadow-sm lg:p-7">
      <div className="mb-5 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <Ticket className="h-4 w-4 text-primary" />
          Top 5 Pengurang Skor Terbesar
        </h4>
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          {tickets.length} Tiket Ditemukan
        </span>
      </div>

      <div className="space-y-2.5">
        {tickets.map((ticket, idx) => {
          const ticketLabel = ticket.isSamplingQa
            ? "Tiket Sampling QA"
            : ticket.no_tiket.toLowerCase().startsWith("audit-")
              ? "Audit Internal"
              : ticket.no_tiket;

          return (
            <div
              key={ticket.no_tiket}
              className="group/ticket grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-border/40 bg-foreground/[0.02] p-3.5 transition-all hover:border-primary/30"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-xs font-black text-muted-foreground shadow-sm transition-colors group-hover/ticket:text-primary">
                {String(idx + 1).padStart(2, "0")}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">No Tiket</span>
                  <span className="truncate font-mono text-[11px] font-black uppercase tracking-wider">
                    {ticketLabel}
                  </span>
                </div>
                <p className="truncate text-[11px] font-medium italic text-muted-foreground">
                  &quot;{ticket.heaviestParam}&quot;
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-xs font-black leading-none">
                    -{ticket.deduction.toFixed(1)} poin
                  </span>
                  <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{ticket.count} Temuan</span>
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tidak ada tiket yang menurunkan skor</p>
          </div>
        )}
      </div>
    </div>
  );
}
