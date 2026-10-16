import type { PdktEvaluationResult } from "@trainers/types";
import { cn } from "cn";
import { pdktReviewDimensionRows } from "../utils/reviewSummary";

export function PdktScoreBreakdown({
  result,
}: {
  result: PdktEvaluationResult;
}) {
  const rows = pdktReviewDimensionRows(result);
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Rincian skor"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface-elevated p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">Rincian skor</h3>
      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.dimension} className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {row.label}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {row.description}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {row.low && (
                  <span className="text-[12px] font-semibold text-foreground">
                    Perlu perbaikan
                  </span>
                )}
                <span className="font-mono text-sm font-bold">{row.value}</span>
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  row.low ? "bg-chart-orange" : "bg-foreground/70",
                )}
                style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
              />
            </div>
            {row.explanation ? (
              <div className="flex flex-col gap-1 text-[13px] leading-6">
                <p>
                  <span className="font-semibold">Alasan penilaian: </span>
                  {row.explanation.reason}
                </p>
                <blockquote className="border-l-2 border-border pl-3 text-fg2">
                  Di balasan Anda: “{row.explanation.quote}”
                </blockquote>
              </div>
            ) : (
              <p className="text-[13px] leading-6 text-muted-foreground">
                Alasan penilaian dengan kutipan belum tersedia untuk aspek ini.
                Telaah ulang dapat melengkapinya.
              </p>
            )}
            {row.tip && (
              <p className="text-xs leading-5 text-muted-foreground">
                <span className="font-semibold">Saran latihan: </span>
                {row.tip}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
