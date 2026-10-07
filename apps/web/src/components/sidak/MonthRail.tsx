import {
  SIDAK_QA_TARGET,
  SIDAK_SCORE_FILL,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";

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

interface MonthSummary {
  month: number;
  year: number;
  finalScore: number;
  findingsCount: number;
}

interface Props {
  summaries: MonthSummary[];
  selectedMonth: number | null;
  onMonthSelect: (month: number) => void;
}

/**
 * Grafik batang skor Jan–Des dengan garis target QA. Bulan berdata adalah
 * tombol pemilih bulan; bulan tanpa audit tampil sebagai slot kosong.
 */
export default function MonthRail({
  summaries,
  selectedMonth,
  onMonthSelect,
}: Props) {
  if (summaries.length === 0) return null;

  const byMonth = new Map(summaries.map((summary) => [summary.month, summary]));
  const year = summaries[0]!.year;
  const belowTarget = summaries.filter(
    (summary) => summary.finalScore < SIDAK_QA_TARGET,
  ).length;

  // Sumbu bawah dibulatkan ke kelipatan 10 di bawah skor terendah supaya
  // selisih antarbulan terlihat, tapi tidak pernah di atas 60.
  const lowest = Math.min(...summaries.map((summary) => summary.finalScore));
  const floor = Math.max(0, Math.min(60, Math.floor((lowest - 5) / 10) * 10));
  const toPct = (score: number) =>
    Math.max(
      2,
      Math.min(100, ((Math.min(100, score) - floor) / (100 - floor)) * 100),
    );
  const targetPct = toPct(SIDAK_QA_TARGET);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p>
          {belowTarget > 0
            ? `${belowTarget} dari ${summaries.length} bulan di bawah target QA ${SIDAK_QA_TARGET}%`
            : `Semua bulan memenuhi target QA ${SIDAK_QA_TARGET}%`}
        </p>
        <p className="tabular-nums" aria-hidden="true">
          Skala grafik {floor}–100%
        </p>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          data-testid="qa-target-line"
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40"
          style={{
            bottom: `calc(1.75rem + (100% - 3.25rem) * ${targetPct / 100})`,
          }}
        >
          <span className="absolute -top-2.5 right-0 bg-background pl-1.5 text-[11px] font-medium text-foreground/70">
            Target {SIDAK_QA_TARGET}%
          </span>
        </div>

        <div className="grid grid-cols-12 gap-1 sm:gap-2">
          {MONTHS_SHORT.map((label, index) => {
            const month = index + 1;
            const summary = byMonth.get(month);

            if (!summary) {
              return (
                <div
                  key={month}
                  className="flex h-48 flex-col items-center gap-1 sm:h-56"
                >
                  <span className="h-5" />
                  <span className="flex w-full flex-1 items-end justify-center">
                    <span className="h-px w-full bg-border" />
                  </span>
                  <span className="flex h-6 items-center text-[11px] text-muted-foreground/70 sm:text-xs">
                    {label}
                  </span>
                </div>
              );
            }

            const isActive = selectedMonth === month;
            const isBelowQaTarget = summary.finalScore < SIDAK_QA_TARGET;
            const tone = sidakScoreTone(summary.finalScore);

            return (
              <button
                key={month}
                type="button"
                onClick={() => onMonthSelect(month)}
                aria-pressed={isActive}
                aria-label={`Pilih bulan ${label} ${year}, skor ${summary.finalScore.toFixed(1)} persen, ${summary.findingsCount} temuan${isBelowQaTarget ? ", QA di bawah target 95 persen" : ""}`}
                className={`group flex h-48 flex-col items-center gap-1 rounded-lg px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:h-56 ${
                  isActive ? "bg-muted ring-1 ring-border" : "hover:bg-muted/60"
                }`}
              >
                <span
                  className={`flex h-5 items-end text-xs font-semibold tabular-nums ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {summary.finalScore.toFixed(1)}
                </span>
                <span className="flex w-full flex-1 items-end justify-center">
                  <span
                    data-bar
                    className={`block w-full max-w-10 rounded-t-md ${SIDAK_SCORE_FILL[tone]}`}
                    style={{ height: `${toPct(summary.finalScore)}%` }}
                  />
                </span>
                <span
                  className={`flex h-6 items-center text-[11px] sm:text-xs ${
                    isActive
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
