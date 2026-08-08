import { useState, type ReactNode } from "react";
import { Activity, TrendingUp, TrendingDown, ListChecks } from "lucide-react";
import TopTicketsCard from "./TopTicketsCard";
import RootCauseCard from "./RootCauseCard";
import TicketEvidenceGroups from "./RootCauseTicketEvidence";
import type { RootCauseResult } from "@trainers/types";

interface TicketItem {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa?: boolean;
}

interface Props {
  finalScore: number;
  sessionCount: number;
  findingsCount: number;
  previousScore: number | null;
  monthLabel?: string;
  tickets: TicketItem[];
  causes: RootCauseResult[];
  rootCauseMonthLabel?: string;
}

function scoreColor(score: number): { text: string; bar: string } {
  if (score >= 85) return { text: "text-green-500", bar: "bg-green-500" };
  if (score >= 70) return { text: "text-amber-500", bar: "bg-amber-500" };
  return { text: "text-red-500", bar: "bg-red-500" };
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
}

export default function AgentAuditDossier({
  finalScore,
  sessionCount,
  findingsCount,
  previousScore,
  monthLabel,
  tickets,
  causes,
  rootCauseMonthLabel,
}: Props) {
  const colors = scoreColor(finalScore);
  const delta = previousScore !== null ? finalScore - previousScore : null;
  const label = scoreLabel(finalScore);
  const pct = Math.max(0, Math.min(100, finalScore));

  return (
    <div className="rounded-2xl border border-border bg-surface">
      {/* Score strip — compact, full width, no tall left rail */}
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {monthLabel && (
              <span className="text-[10px] font-black tracking-widest text-muted-foreground">
                {monthLabel}
              </span>
            )}
            <span
              className={`text-[10px] font-black tracking-widest ${colors.text}`}
            >
              {label}
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            <span
              className={`text-3xl font-black leading-none tracking-tighter sm:text-4xl ${colors.text}`}
            >
              {finalScore.toFixed(1)}
            </span>
            <span className="pb-0.5 text-sm font-black text-muted-foreground/40">
              %
            </span>
          </div>
        </div>

        <div className="lg:flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 lg:gap-6 lg:border-l lg:border-border lg:pl-8">
          <StatCell
            icon={<Activity className="h-3 w-3" />}
            label="Sesi"
            value={String(sessionCount)}
          />
          <StatCell label="Temuan" value={String(findingsCount)} />
          <StatCell
            icon={
              delta !== null ? (
                delta > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : delta < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : null
              ) : null
            }
            label="Selisih"
            value={
              delta !== null
                ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`
                : "-"
            }
            valueClass={
              delta !== null
                ? delta > 0
                  ? "text-green-500"
                  : delta < 0
                    ? "text-red-500"
                    : "text-muted-foreground"
                : "text-muted-foreground"
            }
          />
        </div>
      </div>

      {/* Internal divider between strip and working sections */}
      <div className="border-t border-border" />

      {/* Bottom row — ticket impact + primary diagnosis, then full-width patterns */}
      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(320px,0.42fr)_minmax(420px,0.58fr)]">
        <div className="p-5 lg:border-r lg:border-border">
          <TopTicketsCard tickets={tickets} />
        </div>
        <div className="p-5">
          <RootCauseCard
            causes={causes}
            monthLabel={rootCauseMonthLabel}
            showSecondary={false}
          />
        </div>
        {causes.length > 1 && (
          <div className="border-t border-border p-5 lg:col-span-2">
            <RootCausePatternBand causes={causes.slice(1, 4)} />
          </div>
        )}
      </div>
    </div>
  );
}

function RootCausePatternBand({ causes }: { causes: RootCauseResult[] }) {
  const [expandedCauseIds, setExpandedCauseIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleCause = (clusterId: string) => {
    setExpandedCauseIds((current) => {
      const next = new Set(current);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h4 className="flex items-center gap-2 text-sm font-black tracking-tight text-foreground">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Pola Temuan Lainnya
        </h4>
        <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold tracking-wider text-muted-foreground">
          {causes.length} pola
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {causes.map((cause) => (
          <div
            key={cause.clusterId}
            className="rounded-xl border border-border bg-background/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-snug text-foreground">
                  {cause.label}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                  <span>{cause.findingsCount} temuan</span>
                  <span>{cause.affectedTickets} tiket</span>
                </div>
                <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                  {cause.recommendation}
                </p>
              </div>
              <span className="inline-flex min-w-9 shrink-0 justify-center rounded-full border border-border bg-surface px-2 py-1 text-xs font-black tabular-nums text-foreground">
                {cause.findingsCount}
              </span>
            </div>
            {cause.ticketReferences && cause.ticketReferences.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => toggleCause(cause.clusterId)}
                  aria-expanded={expandedCauseIds.has(cause.clusterId)}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
                >
                  {expandedCauseIds.has(cause.clusterId)
                    ? "Sembunyikan tiket"
                    : "Tampilkan tiket"}
                </button>
                {expandedCauseIds.has(cause.clusterId) && (
                  <div className="mt-3">
                    <TicketEvidenceGroups
                      references={cause.ticketReferences}
                      className="rounded-lg border border-border bg-muted/20 p-3"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatCell({
  icon,
  label,
  value,
  valueClass = "text-foreground",
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[9px] font-black tracking-widest">
          {label}
        </span>
      </div>
      <span className={`text-base font-black leading-none ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
