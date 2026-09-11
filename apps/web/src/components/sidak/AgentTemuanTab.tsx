import { useState } from "react";
import {
  AlertCircle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  ShieldCheck,
  Ticket,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

interface TemuanItem {
  id: string;
  month: number;
  year: number;
  indicatorName: string;
  category: string;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
}

interface Props {
  items: TemuanItem[];
  loading?: boolean;
  deletingId?: string | null;
  canEdit?: boolean;
  onEdit: (item: TemuanItem) => void;
  onDelete: (id: string) => void;
}

const MONTHS_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default function AgentTemuanTab({
  items,
  loading = false,
  deletingId,
  canEdit = false,
  onEdit,
  onDelete,
}: Props) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    if (loading) {
      return (
        <Card className="border-border bg-surface ring-0">
          <CardContent
            role="status"
            aria-label="Memuat temuan"
            className="flex flex-col gap-3 p-6"
          >
            <Skeleton className="h-5 w-40 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-full max-w-md motion-reduce:animate-none" />
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-border bg-surface ring-0">
        <Empty className="border-0 p-8 sm:p-12">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12 rounded-xl bg-muted text-muted-foreground">
              <Ticket className="size-6" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-lg font-bold">Belum ada temuan</EmptyTitle>
            <EmptyDescription>
              Belum ada temuan untuk layanan atau tahun yang dipilih.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }

  const grouped = items.reduce<Record<string, TemuanItem[]>>((acc, item) => {
    const key = item.month + "-" + item.year;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const [monthA, yearA] = a.split("-").map(Number);
    const [monthB, yearB] = b.split("-").map(Number);
    return yearB - yearA || monthB - monthA;
  });

  const toggleMonth = (key: string, open?: boolean) => {
    setOpenMonths((current) => {
      const next = new Set(current);
      const shouldOpen = open ?? !next.has(key);
      if (shouldOpen) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <Card className="border-border bg-surface py-0 ring-0" aria-busy={loading}>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Memuat pembaruan temuan…
          </p>
        ) : null}
        {sortedKeys.map((key) => {
          const [month, year] = key.split("-").map(Number);
          const monthItems = grouped[key];
          const isOpen = openMonths.has(key);
          const panelId = "temuan-month-panel-" + key;
          const headingId = "temuan-month-heading-" + key;
          const tickets: Record<string, { label: string; items: TemuanItem[] }> = {};

          monthItems.forEach((item) => {
            const rawTicket = (item.no_tiket ?? "").trim();
            const ticketKey = rawTicket ? rawTicket.toUpperCase() : "audit-" + item.id;
            if (!tickets[ticketKey]) {
              tickets[ticketKey] = {
                label: rawTicket ? rawTicket.toUpperCase() : "AUDIT INTERNAL",
                items: [],
              };
            }
            tickets[ticketKey].items.push(item);
          });

          const monthLabel = MONTHS_FULL[month - 1] + " " + year;

          return (
            <Collapsible
              key={key}
              open={isOpen}
              onOpenChange={(open) => toggleMonth(key, open)}
              className="border-b border-border pb-4 last:border-0 last:pb-0"
            >
              <section aria-labelledby={headingId}>
                <CollapsibleTrigger
                  render={
                    <Button
                      id={headingId}
                      variant="ghost"
                      size="lg"
                      className="h-auto min-h-11 w-full justify-between rounded-xl px-3 py-3 text-left hover:bg-muted/40"
                      aria-controls={panelId}
                    />
                  }
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                      <BarChart2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-base font-bold text-foreground">
                        {monthLabel}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {monthItems.length} temuan · {Object.keys(tickets).length} tiket
                      </span>
                    </span>
                  </span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
                    {isOpen ? (
                      <ChevronUp className="size-5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-5" aria-hidden="true" />
                    )}
                  </span>
                </CollapsibleTrigger>

                <CollapsibleContent
                  id={panelId}
                  className="flex flex-col gap-6 px-2 pt-4 sm:px-4"
                >
                  {Object.entries(tickets).map(([ticketKey, ticket], ticketIndex) => (
                    <section key={ticketKey} className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground">
                            #{ticketIndex + 1}
                          </span>
                          <Ticket className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-muted-foreground">
                              No. Tiket
                            </span>
                            <span className="mt-0.5 block break-words font-mono text-sm font-bold text-foreground">
                              {ticket.label}
                            </span>
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {ticket.items.length} parameter
                        </span>
                      </div>

                      <div className="flex flex-col gap-6">
                        {ticket.items.map((item) => {
                          const isCritical = item.category === "critical";
                          return (
                            <article key={item.id} className="flex min-w-0 items-start gap-4">
                              <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-1">
                                <span className="text-xl font-bold leading-none tabular-nums text-foreground">
                                  {item.nilai}
                                </span>
                                <span className="text-xs font-semibold text-muted-foreground">
                                  Poin
                                </span>
                              </div>

                              <div className="flex min-w-0 flex-1 flex-col gap-4">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <Badge
                                      variant="outline"
                                      className={
                                        isCritical
                                          ? "h-auto rounded-lg border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                                          : "h-auto rounded-lg border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                                      }
                                    >
                                      {isCritical ? "Kritis" : "Non-kritis"}
                                    </Badge>
                                    <h5 className="mt-2 break-words text-base font-bold leading-snug text-foreground">
                                      {item.indicatorName}
                                    </h5>
                                  </div>

                                  {canEdit ? (
                                    <div className="flex shrink-0 gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-lg"
                                        aria-label={"Edit temuan " + item.indicatorName}
                                        title="Edit temuan"
                                        onClick={() => onEdit(item)}
                                        className="min-h-11 min-w-11 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
                                      >
                                        <Pencil className="size-4" aria-hidden="true" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-lg"
                                        aria-label={"Hapus temuan " + item.indicatorName}
                                        title="Hapus temuan"
                                        onClick={() => onDelete(item.id)}
                                        disabled={deletingId === item.id}
                                        className="min-h-11 min-w-11 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                      >
                                        {deletingId === item.id ? (
                                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                        ) : (
                                          <Trash2 className="size-4" aria-hidden="true" />
                                        )}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                                  <div className="flex min-w-0 flex-col gap-2">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                                      <span className="text-xs font-semibold">Ketidaksesuaian</span>
                                    </div>
                                    <p className="break-words text-sm leading-relaxed text-muted-foreground">
                                      {item.ketidaksesuaian || "—"}
                                    </p>
                                  </div>
                                  <div className="flex min-w-0 flex-col gap-2">
                                    <div className="flex items-center gap-2 text-primary">
                                      <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                                      <span className="text-xs font-semibold">Rekomendasi</span>
                                    </div>
                                    <p className="break-words text-sm font-semibold leading-relaxed text-foreground">
                                      {item.sebaiknya || "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </CollapsibleContent>
              </section>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
