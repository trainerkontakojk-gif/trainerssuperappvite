import { useState } from "react";
import { AlertCircle, Eye, EyeOff, ListChecks, SearchCheck } from "lucide-react";
import type { RootCauseResult, RootCauseTicketReference } from "@trainers/types";

interface RootCauseCardProps {
  causes: RootCauseResult[];
  monthLabel?: string;
}

function groupTicketReferencesByMonth(
  references: RootCauseTicketReference[] = [],
): Array<{ periodLabel: string; items: RootCauseTicketReference[] }> {
  const byLabel = new Map<string, RootCauseTicketReference[]>();
  for (const ref of references) {
    const list = byLabel.get(ref.periodLabel) ?? [];
    list.push(ref);
    byLabel.set(ref.periodLabel, list);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodLabel, items]) => ({ periodLabel, items }));
}

export default function RootCauseCard({
  causes,
  monthLabel,
}: RootCauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const primary = causes[0];
  const secondary = causes.slice(1, 4);
  const primaryTicketGroups = primary
    ? groupTicketReferencesByMonth(primary.ticketReferences)
    : [];

  return (
    <section>
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <SearchCheck className="h-4 w-4" />
            Diagnosis Akar Masalah
          </h4>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            {monthLabel
              ? `Berdasarkan temuan ${monthLabel}`
              : "Berdasarkan temuan bulan aktif"}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {causes.length} pola
        </span>
      </div>

      {!primary ? (
        <div className="py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Belum ada pola akar masalah yang dominan
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Primary cause — highest priority */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
                Prioritas {primary.priority}
              </span>
              {primary.criticalFindingsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                  <AlertCircle className="h-3 w-3" />
                  {primary.criticalFindingsCount} critical
                </span>
              )}
            </div>
            <h5 className="break-words font-outfit text-base font-bold leading-snug text-foreground">
              {primary.label}
            </h5>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
              <span>{primary.findingsCount} temuan</span>
              <span>{primary.affectedTickets} tiket</span>
              {primary.matchedKeywords[0] && (
                <span>Keyword: {primary.matchedKeywords[0]}</span>
              )}
            </div>
            <p className="text-[13px] font-medium leading-relaxed text-foreground">
              {primary.recommendation}
            </p>

            {/* Ticket evidence toggle — default collapsed */}
            {primary.ticketReferences && primary.ticketReferences.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted/30"
              >
                {expanded ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {expanded ? "Sembunyikan tiket" : "Tampilkan tiket"}
              </button>
            )}

            {/* Collapsed evidence strip — ticket numbers grouped by month */}
            {expanded && primaryTicketGroups.length > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
                {primaryTicketGroups.map((group) => (
                  <div key={group.periodLabel}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {group.periodLabel}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((ref) => (
                        <span
                          key={`${ref.no_tiket}-${ref.periodId}`}
                          className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                        >
                          {ref.no_tiket}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence snippets for primary cause */}
          {primary.evidence.length > 0 && (
            <div className="space-y-1.5">
              {primary.evidence.slice(0, 2).map((item) => (
                <blockquote
                  key={item.id}
                  className="break-words border-l-2 border-border bg-background/50 pl-2.5 py-1 text-[11px] font-medium leading-relaxed text-muted-foreground"
                >
                  &ldquo;{item.text}&rdquo;
                </blockquote>
              ))}
            </div>
          )}

          {/* Secondary causes — compact rows */}
          {secondary.length > 0 && (
            <div className="divide-y divide-border border-t border-border">
              {secondary.map((cause) => (
                <div
                  key={cause.clusterId}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 py-2"
                >
                  <ListChecks className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="break-words text-[13px] font-bold text-foreground">
                      {cause.label}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {cause.recommendation}
                    </p>
                    {expanded &&
                      cause.ticketReferences &&
                      cause.ticketReferences.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {cause.ticketReferences.map((ref) => (
                            <span
                              key={`${ref.no_tiket}-${ref.periodId}`}
                              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                            >
                              {ref.no_tiket}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="text-right text-[11px] font-bold text-foreground">
                    {cause.findingsCount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
