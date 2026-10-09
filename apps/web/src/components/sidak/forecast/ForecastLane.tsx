import { useId } from "react";
import type { SidakAgentForecastEntry } from "@trainers/types";
import { cn } from "cn";
import { ScrollArea } from "@/components/ui/scroll-area";
import QaStatePanel from "../QaStatePanel";
import { FORECAST_STATUS, type ForecastStatusKey } from "../forecast-status";
import AgentRow from "./AgentRow";

export default function ForecastLane({
  status,
  entries,
  emptyMessage,
  showAgentContext,
}: {
  status: ForecastStatusKey;
  entries: SidakAgentForecastEntry[];
  emptyMessage: string;
  showAgentContext: boolean;
}) {
  const meta = FORECAST_STATUS[status];
  const titleId = useId();

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col xl:px-5 first:pl-0 last:pr-0"
    >
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              data-testid="forecast-lane-dot"
              className={cn("size-2.5 rounded-full", meta.dotClass)}
            />
            <h3
              id={titleId}
              className={cn(
                "truncate font-heading text-sm font-semibold tracking-tight sm:text-base",
                meta.textClass,
              )}
            >
              {meta.label}
            </h3>
          </div>
          <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
            {meta.groupHint}
          </p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {entries.length} agen
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-48 items-center p-3">
          <QaStatePanel
            type="empty"
            compact
            title={emptyMessage}
            description="Filter yang dipilih belum menghasilkan cukup sinyal untuk kelompok ini."
          />
        </div>
      ) : (
        <ScrollArea
          role="region"
          aria-label={`Daftar agen ${meta.label.toLocaleLowerCase("id-ID")}`}
          className="h-auto lg:max-h-[23rem]"
        >
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <AgentRow
                key={entry.agentId}
                entry={entry}
                showContext={showAgentContext}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}
