import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { RootCauseResult } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import TopTicketsCard from "./TopTicketsCard";
import RootCauseCard from "./RootCauseCard";
import {
  SIDAK_SCORE_TEXT,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";

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
  /** Nama bulan lengkap untuk judul panel, mis. "Juni 2026". */
  monthTitle?: string;
  /** Nama bulan pembanding, mis. "Mei". */
  previousMonthName?: string;
  tickets: TicketItem[];
  causes: RootCauseResult[];
  rootCauseMonthLabel?: string;
  /** Membuka tiket di tab Temuan. */
  onTicketSelect?: (ticketKey: string) => void;
}

export default function AgentAuditDossier({
  finalScore,
  sessionCount,
  findingsCount,
  previousScore,
  monthLabel,
  monthTitle,
  previousMonthName,
  tickets,
  causes,
  rootCauseMonthLabel,
  onTicketSelect,
}: Props) {
  const colors = { text: SIDAK_SCORE_TEXT[sidakScoreTone(finalScore)] };
  const delta = previousScore !== null ? finalScore - previousScore : null;
  const label = sidakScoreLabel(finalScore);
  const title = monthTitle ?? monthLabel ?? "Bulan terpilih";
  const deltaClass =
    delta === null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-rose-700 dark:text-rose-400";

  return (
    <section
      aria-label={`Detail ${title}`}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div className="flex flex-col gap-1">
          <h3 className="font-outfit text-base font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <div className="flex items-baseline gap-2">
            <span
              className={`font-outfit text-4xl font-bold leading-none tracking-tight tabular-nums ${colors.text}`}
            >
              {finalScore.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">%</span>
            <Badge
              variant="outline"
              className={`ml-1 h-auto self-center px-2 py-0.5 text-xs font-semibold ${colors.text}`}
            >
              {label}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-6 sm:flex sm:gap-8">
          <StatCell label="Sesi audit" value={String(sessionCount)} />
          <StatCell label="Temuan" value={String(findingsCount)} />
          <StatCell
            icon={
              delta !== null && delta !== 0 ? (
                delta > 0 ? (
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                )
              ) : null
            }
            label={
              previousMonthName
                ? `Dibanding ${previousMonthName}`
                : "Dibanding bulan lalu"
            }
            value={
              delta !== null
                ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} poin`
                : "—"
            }
            valueClass={deltaClass}
          />
        </dl>
      </div>

      <div className="grid grid-cols-1 items-start lg:grid-cols-2">
        <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <TopTicketsCard tickets={tickets} onTicketSelect={onTicketSelect} />
        </div>
        <div className="p-4 sm:p-5">
          <RootCauseCard causes={causes} monthLabel={rootCauseMonthLabel} />
        </div>
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
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={`inline-flex items-center gap-1 whitespace-nowrap text-lg font-semibold leading-none tabular-nums ${valueClass}`}
      >
        {icon}
        {value}
      </dd>
    </div>
  );
}
