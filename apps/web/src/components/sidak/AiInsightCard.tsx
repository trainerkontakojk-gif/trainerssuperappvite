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
      <div className="rounded-3xl border border-border/50 bg-card p-6 shadow-sm lg:p-7">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Zap className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-wider">AI Coaching Insight</p>
            <p className="text-[10px] font-medium text-muted-foreground">Tidak ada temuan signifikan</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-foreground/5 p-6 shadow-sm lg:p-7">
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full bg-amber-400/[0.08] blur-2xl" />

      <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] lg:gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Area Perbaikan</span>
          </div>
          <h4 className="text-xl font-black uppercase leading-tight tracking-tight sm:text-2xl">
            {insight.parameter}
          </h4>
          <div className="flex items-center gap-3">
            <div className={`rounded-full px-3 py-1 text-[10px] font-black text-white ${insight.isCritical ? "bg-rose-500" : "bg-blue-500"}`}>
              {insight.isCritical ? "CRITICAL" : "OPPORTUNITY"}
            </div>
            <div className="text-sm font-black text-muted-foreground">{insight.count} Sesi</div>
          </div>
        </div>

        <div className="flex flex-col justify-center lg:border-l lg:border-border lg:pl-8">
          <div className="mb-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Rekomendasi Strategis
          </div>
          <blockquote className="max-h-56 overflow-y-auto pr-1 text-sm font-medium italic leading-relaxed sm:text-base">
            &quot;{insight.recommendation}&quot;
          </blockquote>
        </div>
      </div>
    </div>
  );
}
