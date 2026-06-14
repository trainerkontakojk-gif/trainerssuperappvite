import { Ticket, TrendingDown } from "lucide-react";

interface TicketItem {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa?: boolean;
}

interface Props {
  tickets: TicketItem[];
}

export default function TopTicketsCard({ tickets }: Props) {
  return (
    <div className="p-0">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <Ticket className="h-4 w-4 text-foreground" />
          Top 5 Pengurang Skor Terbesar
        </h4>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {tickets.length} Tiket Ditemukan
        </span>
      </div>

      <div className="divide-y divide-border">
        {tickets.map((ticket, idx) => {
          const ticketLabel = ticket.isSamplingQa
            ? "Tiket Sampling QA"
            : ticket.no_tiket.toLowerCase().startsWith("audit-")
              ? "Audit Internal"
              : ticket.no_tiket;

          return (
            <div
              key={ticket.no_tiket}
              className="group/ticket grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3 transition-all"
            >
              <div className="flex shrink-0 items-center pt-0.5 w-6">
                <span className="text-sm font-black italic text-muted-foreground/40">
                  #{idx + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">ID Tiket</span>
                  <span className="truncate font-mono text-[11px] font-black uppercase tracking-wider">
                    {ticketLabel}
                  </span>
                </div>
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  Parameter: &quot;{ticket.heaviestParam}&quot;
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 pt-0.5">
                <div className="flex items-center gap-1 text-rose-500">
                  <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap text-[13px] font-black leading-none tracking-tight">
                    {ticket.scoreDeduction.toFixed(1)}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Poin</span>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{ticket.findingCount} Temuan</span>
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
