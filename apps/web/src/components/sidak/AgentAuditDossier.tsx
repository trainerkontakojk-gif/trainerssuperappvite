import { useState, type ReactNode } from "react";
import { Activity, ListChecks, TrendingDown, TrendingUp } from "lucide-react";
import type { RootCauseResult } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import TopTicketsCard from "./TopTicketsCard";
import RootCauseCard from "./RootCauseCard";
import TicketEvidenceGroups from "./RootCauseTicketEvidence";

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

function scoreColor(score: number): {
  text: string;
  progress: string;
} {
  if (score >= 85) {
    return {
      text: "text-emerald-700 dark:text-emerald-400",
      progress: "[&_[data-slot=progress-indicator]]:bg-emerald-600",
    };
  }
  if (score >= 70) {
    return {
      text: "text-amber-700 dark:text-amber-400",
      progress: "[&_[data-slot=progress-indicator]]:bg-amber-600",
    };
  }
  return {
    text: "text-rose-700 dark:text-rose-400",
    progress: "[&_[data-slot=progress-indicator]]:bg-rose-600",
  };
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
    <Card className="gap-0 border-border bg-surface py-0 ring-0">
      <CardContent className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {monthLabel ? (
              <span className="text-xs font-semibold text-muted-foreground">
                {monthLabel}
              </span>
            ) : null}
            <Badge
              variant="outline"
              className={`h-auto px-2 py-1 text-xs font-semibold ${colors.text}`}
            >
              {label}
            </Badge>
          </div>
          <div className="flex items-end gap-1.5">
            <span
              className={`text-3xl font-bold leading-none tracking-tight tabular-nums sm:text-4xl ${colors.text}`}
            >
              {finalScore.toFixed(1)}
            </span>
            <span className="pb-0.5 text-sm font-semibold text-muted-foreground">
              %
            </span>
          </div>
        </div>

        <Progress
          value={pct}
          aria-label={`Skor ${finalScore.toFixed(1)} persen`}
          className={`min-w-0 flex-1 gap-0 [&_[data-slot=progress-track]]:h-2 ${colors.progress}`}
        />

        <div className="grid grid-cols-3 gap-4 lg:gap-6 lg:border-l lg:border-border lg:pl-8">
          <StatCell
            icon={<Activity className="size-3" aria-hidden="true" />}
            label="Sesi"
            value={String(sessionCount)}
          />
          <StatCell label="Temuan" value={String(findingsCount)} />
          <StatCell
            icon={
              delta !== null ? (
                delta > 0 ? (
                  <TrendingUp className="size-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                ) : delta < 0 ? (
                  <TrendingDown className="size-3 text-rose-700 dark:text-rose-400" aria-hidden="true" />
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
                  ? "text-emerald-700 dark:text-emerald-400"
                  : delta < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-muted-foreground"
                : "text-muted-foreground"
            }
          />
        </div>
      </CardContent>

      <div className="border-t border-border" />

      <div className="grid grid-cols-1 items-start xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <div className="p-4 sm:p-5 xl:border-r xl:border-border">
          <TopTicketsCard tickets={tickets} />
        </div>
        <div className="p-4 sm:p-5">
          <RootCauseCard
            causes={causes}
            monthLabel={rootCauseMonthLabel}
            showSecondary={false}
          />
        </div>
        {causes.length > 1 ? (
          <div className="border-t border-border p-4 sm:p-5 xl:col-span-2">
            <RootCausePatternBand causes={causes.slice(1, 4)} />
          </div>
        ) : null}
      </div>
    </Card>
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
    <Card className="gap-0 rounded-xl border-0 bg-transparent py-0 ring-0">
      <CardHeader className="flex flex-row items-center justify-between gap-4 px-0 pb-3">
        <h4 className="flex items-center gap-2 font-outfit text-lg font-bold tracking-tight text-foreground">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          Pola Temuan Lainnya
        </h4>
        <Badge variant="outline" className="h-auto shrink-0 bg-background px-2.5 py-1 text-xs font-semibold">
          {causes.length} pola
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 px-0 pt-0 md:grid-cols-3">
        {causes.map((cause) => (
          <Card key={cause.clusterId} className="gap-0 border-border bg-background/60 py-0 ring-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold leading-snug text-foreground">
                    {cause.label}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                    <span>{cause.findingsCount} temuan</span>
                    <span>{cause.affectedTickets} tiket</span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
                    {cause.recommendation}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="h-auto min-w-9 shrink-0 justify-center bg-surface px-2 py-1 text-xs font-black tabular-nums text-foreground"
                >
                  {cause.findingsCount}
                </Badge>
              </div>
              {cause.ticketReferences && cause.ticketReferences.length > 0 ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => toggleCause(cause.clusterId)}
                    aria-expanded={expandedCauseIds.has(cause.clusterId)}
                    className="min-h-11 rounded-xl px-3 py-1.5 text-sm font-semibold"
                  >
                    {expandedCauseIds.has(cause.clusterId)
                      ? "Sembunyikan tiket"
                      : "Tampilkan tiket"}
                  </Button>
                  {expandedCauseIds.has(cause.clusterId) ? (
                    <div className="mt-3">
                      <TicketEvidenceGroups
                        references={cause.ticketReferences}
                        className="rounded-lg border border-border bg-muted/20 p-3"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
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
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <span className={`text-lg font-bold leading-none tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
