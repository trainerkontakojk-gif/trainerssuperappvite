import type { SidakAgentForecastEntry } from "@trainers/types";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  agentInitials,
  formatNumber,
  formatSigned,
  safeLabel,
} from "../../../utils/forecastFormat";
import {
  FORECAST_CONFIDENCE,
  FORECAST_STATUS,
  statusFromAgent,
} from "../forecast-status";

export default function AgentRow({
  entry,
  showContext,
}: {
  entry: SidakAgentForecastEntry;
  showContext: boolean;
}) {
  const meta = FORECAST_STATUS[statusFromAgent(entry.forecastStatus)];
  const StatusIcon = meta.icon;
  const groupLabel = safeLabel(entry.batchName || entry.tim);
  const roleLabel =
    entry.jabatan && entry.jabatan.toLocaleLowerCase("id-ID") !== "agent"
      ? safeLabel(entry.jabatan)
      : null;
  const contextLabel = [groupLabel, roleLabel].filter(Boolean).join(" · ");

  return (
    <article className="flex items-start gap-2.5 p-3">
      <Avatar size="sm" className="rounded-lg bg-muted after:rounded-lg">
        {entry.foto_url ? (
          <AvatarImage
            src={entry.foto_url}
            alt={entry.nama}
            className="rounded-lg"
          />
        ) : null}
        <AvatarFallback className="rounded-lg font-heading text-[12px] font-semibold text-foreground group-data-[size=sm]/avatar:text-[12px]">
          {agentInitials(entry.nama)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0">
            <h4 className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">
              {entry.nama}
            </h4>
            {showContext && contextLabel ? (
              <p className="mt-1 break-words text-[12px] leading-4 text-muted-foreground">
                {contextLabel}
              </p>
            ) : null}
          </div>

          <span
            aria-label={`Status ${meta.label}`}
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold",
              meta.textClass,
            )}
          >
            <StatusIcon aria-hidden="true" className="size-3.5" />
            <span>{meta.label}</span>
          </span>
        </div>

        <div className="mt-3 border-t border-border/70 pt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
            <p className="text-muted-foreground">
              <span>Skor </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatNumber(entry.latestScore, 1)}
                <span className="mx-1 text-muted-foreground" aria-hidden="true">
                  →
                </span>
                {formatNumber(entry.projectedScore, 1)}
              </span>
            </p>
            <p className="text-muted-foreground">
              <span>Temuan </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatSigned(entry.findingsSlope, 2)}/periode
              </span>
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] leading-4 text-muted-foreground">
            <span>
              Kualitas{" "}
              <span className={FORECAST_CONFIDENCE[entry.confidence].textClass}>
                {FORECAST_CONFIDENCE[entry.confidence].label}
              </span>
            </span>
            <span>{entry.sourcePointCount} titik</span>
            <span>{entry.latestPeriodLabel}</span>
            <span>
              Prediksi {formatNumber(entry.projectedFindings, 1)} temuan
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
