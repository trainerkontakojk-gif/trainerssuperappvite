import type { ReactNode } from "react";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import TopTicketsCard from "./TopTicketsCard";
import RootCauseCard from "./RootCauseCard";
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
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {monthLabel}
              </span>
            )}
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${colors.text}`}
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
            label="Delta"
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

      {/* Bottom row — ticket impact + root-cause coaching, shared rhythm */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,0.42fr)_minmax(420px,0.58fr)]">
        <div className="p-5 lg:border-r lg:border-border">
          <TopTicketsCard tickets={tickets} />
        </div>
        <div className="p-5">
          <RootCauseCard causes={causes} monthLabel={rootCauseMonthLabel} />
        </div>
      </div>
    </div>
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
        <span className="text-[9px] font-black uppercase tracking-widest">
          {label}
        </span>
      </div>
      <span className={`text-base font-black leading-none ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
