import type { DashboardInsights } from "@trainers/types";
import FocusAgentsDisclosure from "./FocusAgentsDisclosure";
import type { ParetoViewModel } from "./pareto-view-model";
import SidakDashboardPanel from "./SidakDashboardPanel";

interface Props {
  viewModel: ParetoViewModel;
  serviceLabel: string;
  insights?: DashboardInsights | null;
}

const COUNT = new Intl.NumberFormat("id-ID");
const VISIBLE_ROWS = 8;

/** Pareto as a ranked list: full parameter names, one axis, cumulative share as text. */
export default function SidakParameterRanking({
  viewModel,
  serviceLabel,
  insights,
}: Props) {
  const { chartData, insight } = viewModel;
  const focus = insights?.focusParameter;
  const focusedRow = chartData.find((row) => row.fullName === focus?.name);
  const rows =
    focusedRow && !chartData.slice(0, VISIBLE_ROWS).includes(focusedRow)
      ? [...chartData.slice(0, VISIBLE_ROWS - 1), focusedRow]
      : chartData.slice(0, VISIBLE_ROWS);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const total = insight?.totalCount ?? 0;

  return (
    <SidakDashboardPanel
      id="sidak-parameter-ranking-title"
      title="Parameter teratas"
      description={`Sumber temuan terbanyak · ${serviceLabel}`}
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Data kategori temuan belum tersedia.
        </p>
      ) : (
        <>
          <ol className="mb-5 space-y-3.5">
            {rows.map((row) => {
              const share =
                total > 0 ? Math.round((row.count / total) * 100) : 0;
              const critical = row.category === "critical";
              const change = insights?.parameterChanges.find(
                (item) => item.name === row.fullName,
              )?.change;
              const isFocus = row.fullName === focus?.name;
              const metrics = (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm leading-5 text-foreground">
                      <span className="font-medium">{row.fullName}</span>
                      {critical && (
                        <span className="ml-2 text-xs font-medium whitespace-nowrap text-rose-700 dark:text-rose-400">
                          Kritikal
                        </span>
                      )}
                    </p>
                    <p className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold text-foreground">
                        {COUNT.format(row.count)}
                      </span>
                      <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">
                        {share}%
                      </span>
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    title={`${row.fullName}: ${row.count} temuan, kumulatif ${row.cumulative}%`}
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg2/15"
                  >
                    <div
                      className={`h-full rounded-full ${critical ? "bg-module-sidak" : "bg-foreground/70"}`}
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                  {change !== undefined &&
                    change !== null &&
                    insights?.previousLabel && (
                      <p
                        className={`mt-1 text-xs tabular-nums ${change > 0 ? "text-rose-700 dark:text-rose-400" : change < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
                      >
                        {change === 0
                          ? "tetap"
                          : `${change > 0 ? "+" : "−"}${COUNT.format(Math.abs(change))} vs ${insights.previousLabel}`}
                      </p>
                    )}
                </>
              );
              return (
                <li key={row.fullName} className="min-w-0">
                  {isFocus && focus ? (
                    <>
                      {metrics}
                      <details open>
                        <summary className="mt-2 min-h-[44px] cursor-pointer rounded-md py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          Saran coaching
                        </summary>
                        <p className="mt-3 text-sm leading-relaxed text-fg2">
                          {focus.recommendation}
                        </p>
                        <FocusAgentsDisclosure agents={focus.agents} />
                      </details>
                    </>
                  ) : (
                    metrics
                  )}
                </li>
              );
            })}
          </ol>
          {insight && (
            <p className="mt-auto border-t border-border pt-4 text-sm text-fg2">
              <span className="font-semibold text-foreground">
                {insight.focusItems.length} parameter menyumbang{" "}
                {insight.focusShare}% dari {COUNT.format(insight.totalCount)}{" "}
                temuan.
              </span>{" "}
              Mulai review dari parameter ini.
              {focus &&
                ` ${focus.name} naik paling tajam, jadi prioritas pertama.`}
            </p>
          )}
        </>
      )}
    </SidakDashboardPanel>
  );
}
