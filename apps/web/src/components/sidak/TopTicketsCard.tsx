import { Ticket, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
}

export default function TopTicketsCard({ tickets }: Props) {
  return (
    <Card className="gap-0 rounded-xl border-0 bg-transparent py-0 ring-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-0 pb-2.5">
        <h4 className="flex min-w-0 items-center gap-2 font-outfit text-lg font-bold tracking-tight text-foreground">
          <Ticket className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span className="break-words">Tiket Pengurang Skor Terbesar</span>
        </h4>
        <Badge variant="outline" className="h-auto shrink-0 bg-background px-2 py-1 text-xs font-semibold">
          {tickets.length} tiket
        </Badge>
      </CardHeader>

      <CardContent className="px-0 pt-0">
        {tickets.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
                <Ticket className="size-4" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ada tiket yang menurunkan skor</EmptyTitle>
              <EmptyDescription>Pengurang skor akan muncul setelah audit memiliki temuan.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
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
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 py-3"
                >
                  <div className="flex w-5 shrink-0 items-center pt-0.5">
                    <span className="text-sm font-semibold italic text-muted-foreground">
                      #{idx + 1}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">No. Tiket</span>
                      <Badge
                        variant="outline"
                        className="h-auto max-w-full whitespace-normal rounded-md bg-background px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-foreground"
                      >
                        {ticketLabel}
                      </Badge>
                    </div>
                    <p className="break-words text-sm font-medium text-muted-foreground">
                      &quot;{ticket.heaviestParam}&quot;
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-0.5 pt-0.5">
                    <div className="flex items-center gap-1 text-rose-700 dark:text-rose-400">
                      <TrendingDown className="size-3 shrink-0" aria-hidden="true" />
                      <span className="whitespace-nowrap tabular-nums text-sm font-bold leading-none tracking-tight">
                        {ticket.scoreDeduction.toFixed(1)}
                      </span>
                      <span className="text-xs font-semibold">Poin</span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {ticket.findingCount} temuan
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
