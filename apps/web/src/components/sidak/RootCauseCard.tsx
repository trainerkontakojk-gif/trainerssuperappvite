import { AlertCircle, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { RootCauseResult } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <section aria-label="Akar masalah" className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <div className="min-w-0">
          <h4 className="font-outfit text-base font-semibold tracking-tight text-foreground">
            Akar masalah
          </h4>
          <p className="text-xs text-muted-foreground">
            {monthLabel
              ? `Akumulasi temuan ${monthLabel}`
              : "Akumulasi temuan sampai bulan terpilih"}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {causes.length} pola
        </span>
      </div>

      {!primary ? (
        <Empty className="border border-dashed border-border px-4 py-8">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="bg-muted text-muted-foreground"
            >
              <SearchCheck className="size-4" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Belum ada pola akar masalah</EmptyTitle>
            <EmptyDescription>
              Pola dibentuk dari kata kunci pada catatan ketidaksesuaian temuan.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col border-t border-border">
          <div className="mt-3 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="h-auto px-2 py-0.5 text-xs font-semibold"
              >
                Pola utama
              </Badge>
              {primary.criticalFindingsCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  {primary.criticalFindingsCount} temuan kritis
                </span>
              ) : null}
            </div>
            <h5 className="mt-2 break-words text-sm font-semibold leading-snug text-foreground">
              {primary.label}
            </h5>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {primary.findingsCount} temuan · {primary.affectedTickets} tiket
              {primary.matchedKeywords[0]
                ? ` · Kata kunci: ${primary.matchedKeywords[0]}`
                : ""}
            </p>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-foreground">
              {primary.recommendation}
            </p>
            {primary.ticketReferences && primary.ticketReferences.length > 0 ? (
              <div className="mt-3">
                <TicketToggle
                  expanded={expandedCauseIds.has(primary.clusterId)}
                  onToggle={() => toggleCause(primary.clusterId)}
                  references={primary.ticketReferences}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                />
              </div>
            ) : null}
          </div>

          {showSecondary && secondary.length > 0 ? (
            <ul
              aria-label="Pola lainnya"
              className="mt-2 divide-y divide-border"
            >
              {secondary.map((cause) => {
                const hasTicketReferences =
                  (cause.ticketReferences?.length ?? 0) > 0;
                return (
                  <li key={cause.clusterId} className="py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-snug text-foreground">
                        {cause.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {cause.findingsCount} temuan · {cause.affectedTickets}{" "}
                        tiket
                      </p>
                      <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                        {cause.recommendation}
                      </p>
                      {hasTicketReferences ? (
                        <div className="mt-2">
                          <TicketToggle
                            expanded={expandedCauseIds.has(cause.clusterId)}
                            onToggle={() => toggleCause(cause.clusterId)}
                            references={cause.ticketReferences ?? []}
                            className="rounded-lg border border-border bg-muted/20 p-3"
                          />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </section>
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
            className="h-10 px-3 text-sm font-medium"
          />
        }
      >
        {expanded
          ? "Sembunyikan tiket"
          : `Tampilkan ${references?.length ?? 0} tiket`}
      </CollapsibleTrigger>
      {references && references.length > 0 ? (
        <CollapsibleContent className="mt-3">
          <TicketEvidenceGroups references={references} className={className} />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
