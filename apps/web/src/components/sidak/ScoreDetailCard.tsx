import { TrendingUp, TrendingDown, Activity, ShieldCheck, AlertCircle } from "lucide-react";

interface Props {
  finalScore: number;
  sessionCount: number;
  previousScore: number | null;
  findingsCount: number;
  monthLabel?: string;
}

function scoreColor(score: number): { text: string; bg: string; bar: string } {
  if (score >= 85) return { text: "text-green-500", bg: "bg-green-500", bar: "bg-green-500" };
  if (score >= 70) return { text: "text-amber-500", bg: "bg-amber-500", bar: "bg-amber-500" };
  return { text: "text-red-500", bg: "bg-red-500", bar: "bg-red-500" };
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
}

export default function ScoreDetailCard({ finalScore, sessionCount, previousScore, findingsCount, monthLabel }: Props) {
  const colors = scoreColor(finalScore);
  const delta = previousScore !== null ? finalScore - previousScore : null;
  const label = scoreLabel(finalScore);
  const needsAttention = finalScore < 95;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-6 shadow-sm lg:p-7">
      <div className="absolute right-0 top-0 p-6 text-primary opacity-[0.04]">
        <ShieldCheck className="h-40 w-40 -translate-y-10 translate-x-10 -rotate-12" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {monthLabel && (
            <span className="rounded-full bg-muted/50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {monthLabel}
            </span>
          )}
          {needsAttention ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600">Butuh Perhatian</span>
            </div>
          ) : (
            <div className={`rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${colors.bg}`}>
              {label}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            Final Audit Score
          </p>
          <div className="flex items-end gap-2">
            <span className={`text-6xl font-black leading-none tracking-tighter sm:text-7xl ${colors.text}`}>
              {finalScore.toFixed(1)}
            </span>
            <span className="pb-1 text-xl font-black text-muted-foreground/30">%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${Math.max(0, Math.min(100, finalScore))}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/40 bg-foreground/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Activity className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Volume Audit</span>
            </div>
            <div className="text-xl font-black leading-none">{sessionCount} Sesi</div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-foreground/[0.02] p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">vs Audit Terakhir</p>
            {delta !== null ? (
              <div className={`flex items-center gap-1 text-xl font-black leading-none ${delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {delta > 0 ? <TrendingUp className="h-4 w-4" /> : delta < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
              </div>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">-</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
