import type { ParetoViewModel } from "./pareto-view-model";
import SidakDashboardPanel from "./SidakDashboardPanel";

interface Props {
  viewModel: ParetoViewModel;
  serviceLabel: string;
}

const COUNT = new Intl.NumberFormat("id-ID");
const VISIBLE_ROWS = 8;

/** Pareto as a ranked list: full parameter names, one axis, cumulative share as text. */
export default function SidakParameterRanking({
  viewModel,
  serviceLabel,
}: Props) {
  const { chartData, insight } = viewModel;
  const rows = chartData.slice(0, VISIBLE_ROWS);
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
              return (
                <li key={row.fullName} className="min-w-0">
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
            </p>
          )}
        </>
      )}
    </SidakDashboardPanel>
  );
}
