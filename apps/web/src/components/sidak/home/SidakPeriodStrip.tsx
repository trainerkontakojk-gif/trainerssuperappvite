import { cn } from "cn";
import type { SidakHomePeriod } from "../../../utils/sidakHomeSummary";
import {
  SIDAK_SCORE_TEXT,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../../utils/sidakScoreStatus";
import {
  SidakHomeNote,
  SidakHomeProblem,
  SidakHomeSection,
  type SidakHomeLoadState,
} from "./SidakHomeSection";

const TONE_CLASS = {
  better: SIDAK_SCORE_TEXT.ok,
  worse: SIDAK_SCORE_TEXT.bad,
  neutral: "text-fg2",
} as const;

/** Empat angka periode QA terbaru, dibanding periode sebelumnya. */
export function SidakPeriodStrip({
  period,
  state,
  onRetry,
}: {
  period: SidakHomePeriod | null;
  state: SidakHomeLoadState;
  onRetry: () => void;
}) {
  return (
    <SidakHomeSection
      id="sidak-home-period"
      title="Kondisi periode terbaru"
      meta={
        state === "ready" && period ? (
          <span className="text-sm text-fg2">
            Periode {period.label}
            {period.previousLabel ? ` · dibanding ${period.previousLabel}` : ""}
          </span>
        ) : null
      }
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
        {state === "error" ? (
          <SidakHomeProblem
            message="Kondisi periode belum bisa dimuat."
            onRetry={onRetry}
          />
        ) : state === "loading" ? (
          <SidakHomeNote>Memuat kondisi periode…</SidakHomeNote>
        ) : !period ? (
          <SidakHomeNote>
            Belum ada periode QA dengan audit di cakupan ini.
          </SidakHomeNote>
        ) : (
          <dl className="grid grid-cols-2 lg:grid-cols-4 [&>div]:border-border [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t lg:[&>div:nth-child(n+2)]:border-l lg:[&>div:nth-child(n+3)]:border-t-0">
            {period.metrics.map((metric) => {
              const scoreTone =
                metric.id === "score"
                  ? sidakScoreTone(Number(metric.value))
                  : null;
              return (
                <div
                  key={metric.id}
                  data-testid={`sidak-home-metric-${metric.id}`}
                  className="flex min-w-0 flex-col gap-1 px-5 py-4"
                >
                  <dt className="text-sm text-fg2">{metric.label}</dt>
                  <dd className="flex flex-col gap-1">
                    <span className="font-mono text-3xl leading-none font-bold tracking-tight text-foreground tabular-nums">
                      {metric.value}
                      {metric.id === "score" ? (
                        <span className="ml-0.5 text-sm font-medium text-fg2">
                          %
                        </span>
                      ) : null}
                    </span>
                    {scoreTone ? (
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          SIDAK_SCORE_TEXT[scoreTone],
                        )}
                      >
                        {sidakScoreLabel(Number(metric.value))}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        TONE_CLASS[metric.tone],
                      )}
                    >
                      {metric.change ?? "Belum ada periode pembanding"}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </SidakHomeSection>
  );
}
