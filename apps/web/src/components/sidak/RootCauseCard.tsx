import {
  AlertCircle,
  ListChecks,
  SearchCheck,
} from "lucide-react";
import type { RootCauseResult } from "@trainers/types";
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
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground">
              <SearchCheck className="h-4 w-4" />
            </span>
            <h4 className="truncate text-sm font-black tracking-tight text-foreground">
              Akar Masalah
            </h4>
          </div>
          <p className="mt-1 pl-9 text-xs font-medium text-muted-foreground">
            {monthLabel
              ? `Berdasarkan temuan ${monthLabel}`
              : "Berdasarkan temuan bulan yang dipilih"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold tracking-wider text-muted-foreground">
          {causes.length} pola
        </span>
      </div>

      {!primary ? (
        <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center">
          <p className="text-xs font-bold tracking-widest text-muted-foreground">
            Belum ditemukan pola akar masalah yang dominan
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black tracking-wider text-foreground">
                Utama
              </span>
              {primary.criticalFindingsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-rose-600">
                  <AlertCircle className="h-3 w-3" />
                  {primary.criticalFindingsCount} kritis
                </span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <h5 className="break-words text-sm font-black leading-snug tracking-tight text-foreground">
                {primary.label}
              </h5>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{primary.findingsCount} temuan</span>
                <span>{primary.affectedTickets} tiket</span>
                {primary.matchedKeywords[0] && (
                  <span>Kata kunci: {primary.matchedKeywords[0]}</span>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              {primary.recommendation}
            </p>

            {primary.ticketReferences && primary.ticketReferences.length > 0 && (
              <div className="mt-3">
                <TicketToggle
                  expanded={expandedCauseIds.has(primary.clusterId)}
                  onToggle={() => toggleCause(primary.clusterId)}
                  references={primary.ticketReferences}
                />
              </div>
            )}
          </div>

          {/* Secondary causes — compact rows */}
          {showSecondary && secondary.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="divide-y divide-border">
                {secondary.map((cause) =>
                  (() => {
                    const hasTicketReferences =
                      (cause.ticketReferences?.length ?? 0) > 0;

                    return (
                      <div
                        key={cause.clusterId}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3"
                      >
                        <ListChecks className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold leading-snug text-foreground">
                            {cause.label}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                            <span>{cause.findingsCount} temuan</span>
                            <span>{cause.affectedTickets} tiket</span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {cause.recommendation}
                          </p>
                          {hasTicketReferences && (
                            <div className="mt-3">
                              <TicketToggle
                                expanded={expandedCauseIds.has(cause.clusterId)}
                                onToggle={() => toggleCause(cause.clusterId)}
                                references={cause.ticketReferences ?? []}
                                className="rounded-lg border border-border bg-muted/20 p-3"
                              />
                            </div>
                          )}
                        </div>
                        <div className="pt-0.5 text-right">
                          <span className="inline-flex min-w-9 justify-center rounded-full border border-border bg-muted/20 px-2 py-1 text-xs font-black tabular-nums text-foreground">
                            {cause.findingsCount}
                          </span>
                        </div>
                      </div>
                    );
                  })(),
                )}
              </div>
            </div>
          )}
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
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
      >
        {expanded ? "Sembunyikan tiket" : "Tampilkan tiket"}
      </button>
      {expanded && references && references.length > 0 && (
        <div className="mt-3">
          <TicketEvidenceGroups references={references} className={className} />
        </div>
      )}
    </>
  );
}
import { useState } from "react";
