import { Zap } from "lucide-react";

interface CoachingInsight {
  parameter: string;
  count: number;
  recommendation: string;
  isCritical: boolean;
}

interface Props {
  insight: CoachingInsight | null;
}

export default function AiInsightCard({ insight }: Props) {
  if (!insight) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 lg:p-7">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Zap className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-foreground">AI Coaching Insight</p>
            <p className="text-[10px] font-medium text-muted-foreground">Tidak ada temuan signifikan</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 lg:p-7">
      <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">Area Perbaikan</span>
          </div>
          <h4 className="font-outfit text-xl font-bold leading-tight tracking-tight sm:text-2xl text-foreground">
            {insight.parameter}
          </h4>
          <div className="flex items-center gap-3">
            <div className={`rounded-full px-3 py-1 text-[10px] font-semibold text-white ${insight.isCritical ? "bg-rose-500" : "bg-blue-500"}`}>
              {insight.isCritical ? "CRITICAL" : "OPPORTUNITY"}
            </div>
            <div className="text-sm font-medium text-muted-foreground">{insight.count} Sesi</div>
          </div>
        </div>

        <div className="flex flex-col justify-center lg:border-l lg:border-border lg:pl-8">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Rekomendasi Strategis
          </div>
          <blockquote className="max-h-56 overflow-y-auto pr-1 text-sm font-medium italic leading-relaxed sm:text-base text-foreground">
            &quot;{insight.recommendation}&quot;
          </blockquote>
        </div>
      </div>
    </div>
  );
}
