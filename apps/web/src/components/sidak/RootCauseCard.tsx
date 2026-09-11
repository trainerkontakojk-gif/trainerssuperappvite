import { AlertCircle, ListChecks, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { RootCauseResult } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
import TicketEvidenceGroups from "./RootCauseTicketEvidence";

interface RootCauseCardProps {
  causes: RootCauseResult[];
  monthLabel?: string;
  showSecondary?: boolean;
}

export default function RootCauseCard({
  causes,
  monthLabel,
  showSecondary = true,
}: RootCauseCardProps) {
  const [expandedCauseIds, setExpandedCauseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const primary = causes[0];
  const secondary = causes.slice(1, 4);

  const toggleCause = (clusterId: string) => {
    setExpandedCauseIds((current) => {
      const next = new Set(current);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  };

  return (
    <Card className="gap-0 rounded-xl border-0 bg-transparent py-0 ring-0">
      <CardHeader className="border-b border-border px-0 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="size-7 rounded-full bg-background p-0 text-foreground"
              >
                <SearchCheck className="size-4" aria-hidden="true" />
              </Badge>
              <h4 className="break-words font-outfit text-lg font-bold tracking-tight text-foreground">
                Akar Masalah
              </h4>
            </div>
            <p className="mt-1 pl-9 text-xs font-medium text-muted-foreground">
              {monthLabel
                ? `Berdasarkan temuan ${monthLabel}`
                : "Berdasarkan temuan bulan yang dipilih"}
            </p>
          </div>
          <Badge variant="outline" className="h-auto shrink-0 bg-background px-2.5 py-1 text-xs font-semibold">
            {causes.length} pola
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-0 pt-4">
        {!primary ? (
          <Empty className="border border-dashed border-border bg-background/40 px-4 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
                <SearchCheck className="size-4" aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Belum ditemukan pola akar masalah yang dominan</EmptyTitle>
              <EmptyDescription>Belum ada diagnosis yang dapat ditampilkan.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="gap-0 border-border bg-background/70 py-0 ring-0">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-auto px-2.5 py-1 text-xs font-semibold">
                    Utama
                  </Badge>
                  {primary.criticalFindingsCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="h-auto gap-1 border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                    >
                      <AlertCircle className="size-3" aria-hidden="true" />
                      {primary.criticalFindingsCount} kritis
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <h5 className="break-words text-sm font-black leading-snug tracking-tight text-foreground">
                    {primary.label}
                  </h5>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                    <span>{primary.findingsCount} temuan</span>
                    <span>{primary.affectedTickets} tiket</span>
                    {primary.matchedKeywords[0] ? (
                      <span>Kata kunci: {primary.matchedKeywords[0]}</span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  {primary.recommendation}
                </p>

                {primary.ticketReferences && primary.ticketReferences.length > 0 ? (
                  <div className="mt-3">
                    <TicketToggle
                      expanded={expandedCauseIds.has(primary.clusterId)}
                      onToggle={() => toggleCause(primary.clusterId)}
                      references={primary.ticketReferences}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {showSecondary && secondary.length > 0 ? (
              <Card className="gap-0 overflow-hidden border-border bg-background py-0 ring-0">
                <div className="divide-y divide-border">
                  {secondary.map((cause) => {
                    const hasTicketReferences = (cause.ticketReferences?.length ?? 0) > 0;
                    return (
                      <div
                        key={cause.clusterId}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3"
                      >
                        <ListChecks className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold leading-snug text-foreground">
                            {cause.label}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                            <span>{cause.findingsCount} temuan</span>
                            <span>{cause.affectedTickets} tiket</span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {cause.recommendation}
                          </p>
                          {hasTicketReferences ? (
                            <div className="mt-3">
                              <TicketToggle
                                expanded={expandedCauseIds.has(cause.clusterId)}
                                onToggle={() => toggleCause(cause.clusterId)}
                                references={cause.ticketReferences ?? []}
                                className="rounded-lg border border-border bg-muted/20 p-3"
                              />
                            </div>
                          ) : null}
                        </div>
                        <Badge
                          variant="outline"
                          className="h-auto min-w-9 justify-center bg-muted/20 px-2 py-1 text-xs font-black tabular-nums text-foreground"
                        >
                          {cause.findingsCount}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TicketToggle({
  expanded,
  onToggle,
  references,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  references: RootCauseResult["ticketReferences"];
  className?: string;
}) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(open) => {
        if (open !== expanded) onToggle();
      }}
    >
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 rounded-xl px-3 py-1.5 text-sm font-semibold"
          />
        }
      >
        {expanded ? "Sembunyikan tiket" : "Tampilkan tiket"}
      </CollapsibleTrigger>
      {references && references.length > 0 ? (
        <CollapsibleContent className="mt-3">
          <TicketEvidenceGroups references={references} className={className} />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
