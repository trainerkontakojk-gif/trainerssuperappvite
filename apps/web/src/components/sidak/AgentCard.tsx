import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AgentDirectoryEntry } from "@trainers/types";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  humanizeRiskStatus,
  humanizeTrend,
  titleize,
} from "../../lib/humanize";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 70) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

type RiskKey = "atRisk" | "compliant" | "none";

const RISK_STATUS_CLASSES: Record<RiskKey, string> = {
  atRisk: "text-rose-700 dark:text-rose-400",
  compliant: "text-emerald-700 dark:text-emerald-400",
  none: "text-muted-foreground",
};

const RISK_STATUS_ICONS: Record<RiskKey, typeof CircleCheck> = {
  atRisk: CircleAlert,
  compliant: CircleCheck,
  none: Clock3,
};

interface TrendIconResult {
  icon: typeof TrendingUp;
  label: string;
  className: string;
}

function trendIcon(
  trend: AgentDirectoryEntry["trend"],
  trendValue: number | null,
): TrendIconResult {
  if (trend === "up" && trendValue !== null)
    return {
      icon: TrendingUp,
      label: `${humanizeTrend("up")} ${trendValue.toFixed(1)}%`,
      className: "text-emerald-700 dark:text-emerald-400",
    };
  if (trend === "down" && trendValue !== null)
    return {
      icon: TrendingDown,
      label: `${humanizeTrend("down")} ${trendValue.toFixed(1)}%`,
      className: "text-rose-700 dark:text-rose-400",
    };
  if (trend === "same")
    return {
      icon: Minus,
      label: humanizeTrend("same"),
      className: "text-muted-foreground",
    };
  return {
    icon: Minus,
    label: humanizeTrend("none"),
    className: "text-muted-foreground",
  };
}

interface AgentCardProps {
  agent: AgentDirectoryEntry;
  index?: number;
}

export default function AgentCard({ agent }: AgentCardProps) {
  const hasAuditScore = agent.avgScore !== null;
  const trend = trendIcon(
    hasAuditScore ? agent.trend : "none",
    hasAuditScore ? agent.trendValue : null,
  );
  const TrendIcon = trend.icon;
  const riskKey: RiskKey = hasAuditScore
    ? agent.atRisk
      ? "atRisk"
      : "compliant"
    : "none";
  const StatusIcon = RISK_STATUS_ICONS[riskKey];
  const scoreValueClass = hasAuditScore
    ? "text-xl font-bold leading-6 tabular-nums"
    : "text-base font-semibold leading-5";
  const agentName = titleize(agent.nama);

  return (
    <Link
      to="/sidak/agents/$id"
      params={{ id: agent.id }}
      aria-label={`Lihat detail audit ${titleize(agent.nama)}`}
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar
            size="default"
            className="!size-10 shrink-0 overflow-hidden rounded-lg bg-muted after:rounded-lg"
          >
            {agent.foto_url ? (
              <AvatarImage src={agent.foto_url} alt="" />
            ) : null}
            <AvatarFallback className="rounded-lg bg-muted font-outfit text-base font-bold text-primary">
              {agent.nama.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p
              title={agentName}
              className="truncate text-[13px] font-semibold leading-[18px] text-foreground transition-colors group-hover:text-primary"
            >
              {agentName}
            </p>
            <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs font-medium text-muted-foreground">
              <span className="truncate">Tim: {titleize(agent.tim)}</span>
              {agent.batch ? (
                <span className="truncate">Batch: {titleize(agent.batch)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">
            Skor audit
          </p>
          <p
            className={cn("mt-1", scoreValueClass, scoreColor(agent.avgScore))}
          >
            {agent.avgScore !== null
              ? `${agent.avgScore.toFixed(1)}%`
              : "Belum diaudit"}
          </p>
          {agent.avgScore !== null && agent.periodMonth ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Periode: {MONTHS_SHORT[agent.periodMonth - 1]}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">
              Status audit
            </p>
            <div
              className={cn(
                "mt-1 flex items-center gap-1.5 text-sm font-semibold",
                RISK_STATUS_CLASSES[riskKey],
              )}
            >
              <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="break-words">{humanizeRiskStatus(riskKey)}</span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">
              Perubahan
            </p>
            <div
              className={cn(
                "mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium",
                trend.className,
              )}
            >
              <TrendIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{trend.label}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
