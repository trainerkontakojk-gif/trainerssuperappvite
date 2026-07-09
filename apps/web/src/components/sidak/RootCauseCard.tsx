import { useState } from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  ListChecks,
  SearchCheck,
} from "lucide-react";
import type {
  RootCauseResult,
  RootCauseTicketReference,
} from "@trainers/types";

interface RootCauseCardProps {
  causes: RootCauseResult[];
  monthLabel?: string;
  showSecondary?: boolean;
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

const MONTH_NAMES = [
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

const MONTH_ALIASES = new Map<string, string>([
  ["jan", "Januari"],
  ["januari", "Januari"],
  ["january", "Januari"],
  ["feb", "Februari"],
  ["februari", "Februari"],
  ["february", "Februari"],
  ["mar", "Maret"],
  ["maret", "Maret"],
  ["march", "Maret"],
  ["apr", "April"],
  ["april", "April"],
  ["mei", "Mei"],
  ["may", "Mei"],
  ["jun", "Juni"],
  ["juni", "Juni"],
  ["june", "Juni"],
  ["jul", "Juli"],
  ["juli", "Juli"],
  ["july", "Juli"],
  ["agu", "Agustus"],
  ["agt", "Agustus"],
  ["agustus", "Agustus"],
  ["aug", "Agustus"],
  ["august", "Agustus"],
  ["sep", "September"],
  ["sept", "September"],
  ["september", "September"],
  ["okt", "Oktober"],
  ["oct", "Oktober"],
  ["oktober", "Oktober"],
  ["october", "Oktober"],
  ["nov", "November"],
  ["november", "November"],
  ["des", "Desember"],
  ["dec", "Desember"],
  ["desember", "Desember"],
  ["december", "Desember"],
]);

function formatTicketMonth(periodLabel: string): string {
  const numericMonth = periodLabel.match(/^(\d{1,2})[/-]\d{4}$/);
  if (numericMonth) {
    const monthIndex = Number(numericMonth[1]) - 1;
    return MONTH_NAMES[monthIndex] ?? periodLabel;
  }

  const isoMonth = periodLabel.match(/^\d{4}-(\d{1,2})/);
  if (isoMonth) {
    const monthIndex = Number(isoMonth[1]) - 1;
    return MONTH_NAMES[monthIndex] ?? periodLabel;
  }

  const firstWord = periodLabel.trim().split(/\s+/)[0]?.toLowerCase();
  return (firstWord && MONTH_ALIASES.get(firstWord)) || periodLabel;
}

function formatTicketLabel(ref: RootCauseTicketReference): string {
  return `${ref.no_tiket} (${formatTicketMonth(ref.periodLabel)})`;
}

function TicketEvidenceGroups({
  groups,
  className = "space-y-2 rounded-md border border-border bg-background/50 p-3",
}: {
  groups: Array<{ periodLabel: string; items: RootCauseTicketReference[] }>;
  className?: string;
}) {
  if (groups.length === 0) return null;

  return (
    <div className={className}>
      {groups.map((group) => (
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
                {formatTicketLabel(ref)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
  const primaryExpanded = primary
    ? expandedCauseIds.has(primary.clusterId)
    : false;
  const primaryTicketGroups = primary
    ? groupTicketReferencesByMonth(primary.ticketReferences)
    : [];
  const toggleCause = (clusterId: string) => {
    setExpandedCauseIds((current) => {
      const next = new Set(current);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
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
              Diagnosis Akar Masalah
            </h4>
          </div>
          <p className="mt-1 pl-9 text-xs font-medium text-muted-foreground">
            {monthLabel
              ? `Berdasarkan temuan ${monthLabel}`
              : "Berdasarkan temuan bulan aktif"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {causes.length} pola
        </span>
      </div>

      {!primary ? (
        <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Belum ada pola akar masalah yang dominan
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-foreground">
                Utama
              </span>
              <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
                Prioritas {primary.priority}
              </span>
              {primary.criticalFindingsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  <AlertCircle className="h-3 w-3" />
                  {primary.criticalFindingsCount} critical
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
                  <span>Keyword: {primary.matchedKeywords[0]}</span>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              {primary.recommendation}
            </p>

            {/* Ticket evidence toggle — default collapsed */}
            {primary.ticketReferences &&
              primary.ticketReferences.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleCause(primary.clusterId)}
                  aria-expanded={primaryExpanded}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
                >
                  {primaryExpanded ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {primaryExpanded ? "Sembunyikan tiket" : "Tampilkan tiket"}
                </button>
              )}

            {/* Collapsed evidence strip — ticket numbers grouped by month */}
            {primaryExpanded && (
              <div className="mt-3">
                <TicketEvidenceGroups groups={primaryTicketGroups} />
              </div>
            )}
          </div>

          {/* Secondary causes — compact rows */}
          {showSecondary && secondary.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="divide-y divide-border">
                {secondary.map((cause) =>
                  (() => {
                    const causeExpanded = expandedCauseIds.has(cause.clusterId);
                    const ticketGroups = groupTicketReferencesByMonth(
                      cause.ticketReferences,
                    );
                    const hasTicketReferences = ticketGroups.length > 0;

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
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {cause.recommendation}
                          </p>
                          {hasTicketReferences && (
                            <button
                              type="button"
                              onClick={() => toggleCause(cause.clusterId)}
                              aria-expanded={causeExpanded}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
                            >
                              {causeExpanded ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              {causeExpanded
                                ? "Sembunyikan tiket"
                                : "Tampilkan tiket"}
                            </button>
                          )}
                          {causeExpanded && (
                            <div className="mt-3">
                              <TicketEvidenceGroups
                                groups={ticketGroups}
                                className="space-y-2 rounded-lg border border-border bg-muted/20 p-3"
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
