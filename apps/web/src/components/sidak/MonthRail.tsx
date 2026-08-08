import { useRef } from "react";

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

function scoreBg(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

export default function MonthRail({ summaries, selectedMonth, onMonthSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (summaries.length === 0) return null;

  const sorted = [...summaries].sort((a, b) => a.month - b.month);

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max items-end gap-1.5 border-b border-border/50 pb-1">
        {sorted.map((p) => {
          const isActive = selectedMonth === p.month;
           return (
            <button
              key={`${p.month}-${p.year}`}
              onClick={() => onMonthSelect(p.month)}
              className={`group relative min-w-[84px] rounded-lg border px-2 pb-2.5 pt-1.5 text-left transition-colors ${
                isActive
                  ? "border-border bg-muted/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
            >
              <div className={`text-[10px] font-black tracking-[0.18em] mb-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {MONTHS_SHORT[p.month - 1]}
              </div>

              <div className="flex items-end gap-0.5 leading-none">
                <span className={`text-base font-black tracking-tight ${isActive ? "text-foreground" : "text-muted-foreground/80"}`}>
                  {p.finalScore.toFixed(1)}
                </span>
                <span className="pb-0.5 text-[10px] font-black text-muted-foreground/40">%</span>
              </div>

              {p.finalScore < 95 && (
                <div className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
              )}

              <div className="absolute bottom-0 left-2.5 right-2.5 h-[3px] overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${scoreBg(p.finalScore)} transition-opacity ${
                    isActive ? "opacity-100" : "opacity-55 group-hover:opacity-80"
                  }`}
                  style={{ width: `${Math.max(20, Math.min(100, p.finalScore))}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
