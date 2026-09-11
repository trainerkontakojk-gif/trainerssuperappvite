import { Link } from "@tanstack/react-router";
import { ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AgentDirectoryEntry } from "@trainers/types";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const RISK_BADGE_CLASSES = {
  atRisk: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  compliant:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  none: "border-border bg-muted/40 text-muted-foreground",
};

interface TrendIconResult {
  icon: typeof TrendingUp;
  label: string;
  className: string;
}

function trendIcon(trend: string, trendValue: number | null): TrendIconResult {
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
  index: number;
}

export default function AgentCard({ agent, index: _index }: AgentCardProps) {
  const trend = trendIcon(agent.trend, agent.trendValue);
  const TrendIcon = trend.icon;

  const riskKey =
    agent.avgScore !== null ? (agent.atRisk ? "atRisk" : "compliant") : "none";

  return (
    <Link
      to="/sidak/agents/$id"
      params={{ id: agent.id }}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full gap-0 border-border bg-surface py-0 text-card-foreground ring-0 transition-colors group-hover:border-foreground/30">
        <CardContent className="flex h-full flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <Avatar
              size="lg"
              className="!size-16 rounded-xl bg-muted after:rounded-xl"
            >
              {agent.foto_url ? (
                <AvatarImage src={agent.foto_url} alt="" />
              ) : null}
              <AvatarFallback className="rounded-xl bg-muted font-outfit text-xl font-bold text-primary">
                {agent.nama.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex min-w-0 flex-col items-end gap-2 text-right">
              <Badge
                variant="outline"
                className={cn("max-w-full", RISK_BADGE_CLASSES[riskKey])}
              >
                {humanizeRiskStatus(riskKey)}
              </Badge>
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-xl font-black leading-none tabular-nums",
                    scoreColor(agent.avgScore),
                  )}
                >
                  {agent.avgScore !== null
                    ? `${agent.avgScore.toFixed(1)}%`
                    : "--"}
                </span>
                {agent.avgScore !== null && agent.periodMonth ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    ({MONTHS_SHORT[agent.periodMonth - 1]})
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <p className="min-h-10 break-words text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
              {titleize(agent.nama)}
            </p>
            <p className="mt-1 break-words text-xs font-medium text-muted-foreground">
              {titleize(agent.tim)}
              {agent.batch ? ` · ${titleize(agent.batch)}` : ""}
            </p>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3">
            <div
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-xs font-medium",
                trend.className,
              )}
            >
              <TrendIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{trend.label}</span>
            </div>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
            >
              <ChevronRight className="size-4" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
