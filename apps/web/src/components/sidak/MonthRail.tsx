import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

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

function scoreIndicatorClass(score: number): string {
  if (score >= 85) return "[&_[data-slot=progress-indicator]]:bg-emerald-600";
  if (score >= 70) return "[&_[data-slot=progress-indicator]]:bg-amber-600";
  return "[&_[data-slot=progress-indicator]]:bg-rose-600";
}

export default function MonthRail({ summaries, selectedMonth, onMonthSelect }: Props) {
  if (summaries.length === 0) return null;

  const sorted = [...summaries].sort((a, b) => a.month - b.month);
  const hasBelowQaTarget = sorted.some((summary) => summary.finalScore < 95);

  return (
    <div className="overflow-x-auto no-scrollbar">
      {hasBelowQaTarget && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <span>QA di bawah target 95%</span>
        </div>
      )}
      <div className="flex min-w-max items-end gap-1.5 border-b border-border/50 pb-1">
        {sorted.map((p) => {
          const isActive = selectedMonth === p.month;
          const monthLabel = `${MONTHS_SHORT[p.month - 1]} ${p.year}`;
          const isBelowQaTarget = p.finalScore < 95;
          return (
            <Button
              key={`${p.month}-${p.year}`}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              size="lg"
              onClick={() => onMonthSelect(p.month)}
              aria-pressed={isActive}
              aria-label={`Pilih bulan ${monthLabel}, skor ${p.finalScore.toFixed(1)} persen, ${p.findingsCount} temuan${isBelowQaTarget ? ", QA di bawah target 95 persen" : ""}`}
              className={`group relative min-h-16 min-w-[88px] h-auto items-start rounded-xl border px-2 pb-2.5 pt-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none ${
                isActive
                  ? "border-border bg-muted/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              <div className={`mb-1 text-xs font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {MONTHS_SHORT[p.month - 1]}
              </div>

              <div className="flex items-end gap-0.5 leading-none tabular-nums">
                <span className={`text-base font-bold tracking-tight ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {p.finalScore.toFixed(1)}
                </span>
                <span className="pb-0.5 text-xs font-semibold text-muted-foreground">%</span>
              </div>

              {isBelowQaTarget && (
                <span
                  role="img"
                  aria-label="Skor QA di bawah target 95 persen"
                  title="Skor QA di bawah target 95 persen"
                  className="ml-1 inline-flex size-4 shrink-0 text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="size-4" aria-hidden="true" />
                </span>
              )}

              <Progress
                value={Math.max(20, Math.min(100, p.finalScore))}
                aria-hidden="true"
                className={`absolute bottom-0 left-2.5 right-2.5 h-1 gap-0 ${scoreIndicatorClass(p.finalScore)} [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:transition-none`}
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
