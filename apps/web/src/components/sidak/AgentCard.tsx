import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  ChevronRight,
} from "lucide-react";
import type { AgentDirectoryEntry } from "@trainers/types";

const DOT_CLASSES = {
  atRisk: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]",
  compliant: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
  none: "bg-muted-foreground/40",
};

const BADGE_CLASSES = {
  atRisk:
    "bg-rose-500/10 border border-rose-500/20 text-rose-500",
  compliant:
    "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500",
  none: "bg-muted/30 border border-border/40 text-muted-foreground",
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-emerald-500";
  if (score >= 70) return "text-amber-500";
  return "text-rose-500";
}

interface TrendIconResult {
  icon: typeof TrendingUp;
  label: string;
  className: string;
}

function trendIcon(
  trend: string,
  trendValue: number | null,
): TrendIconResult {
  if (trend === "up" && trendValue !== null)
    return {
      icon: TrendingUp,
      label: `+${trendValue.toFixed(1)}%`,
      className: "text-emerald-500",
    };
  if (trend === "down" && trendValue !== null)
    return {
      icon: TrendingDown,
      label: `${trendValue.toFixed(1)}%`,
      className: "text-rose-500",
    };
  if (trend === "same")
    return {
      icon: Minus,
      label: "Steady",
      className: "text-muted-foreground",
    };
  return { icon: Minus, label: "No Trend", className: "text-muted-foreground" };
}

interface AgentCardProps {
  agent: AgentDirectoryEntry;
  index: number;
}

export default function AgentCard({ agent, index }: AgentCardProps) {
  const trend = trendIcon(agent.trend, agent.trendValue);
  const TrendIcon = trend.icon;

  const riskKey =
    agent.avgScore !== null
      ? agent.atRisk
        ? "atRisk"
        : "compliant"
      : "none";

  return (
    <Link
      to="/sidak/agents/$id"
      params={{ id: agent.id }}
      className="group relative block overflow-hidden rounded-[2rem] border border-border/50 bg-card/40 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all duration-300 group-hover:bg-primary/20" />

      <div className="flex items-start justify-between">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted/50">
          {agent.foto_url ? (
            <img
              src={agent.foto_url}
              alt={agent.nama}
              className="h-full w-full object-cover"
            />
          ) : (
            <Users size={28} className="text-muted-foreground/60" />
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${BADGE_CLASSES[riskKey]}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[riskKey]} ${riskKey === "none" ? "" : "animate-pulse"}`}
            />
            <span className="text-[9px] font-black uppercase tracking-[0.14em]">
              {riskKey === "atRisk"
                ? "At Risk"
                : riskKey === "compliant"
                  ? "Compliant"
                  : "Not Audited"}
            </span>
          </div>
          <span
            className={`text-xl font-black tabular-nums leading-none ${scoreColor(agent.avgScore)}`}
          >
            {agent.avgScore !== null
              ? agent.avgScore.toFixed(1)
              : "--"}
          </span>
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <p className="truncate text-base font-black text-foreground transition-colors group-hover:text-primary">
          {agent.nama}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {agent.tim}
          {agent.batch ? ` \u00B7 ${agent.batch}` : ""}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className={`flex items-center gap-1 text-[10px] font-black ${trend.className}`}>
          <TrendIcon size={14} />
          <span>{trend.label}</span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-white">
          <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}
