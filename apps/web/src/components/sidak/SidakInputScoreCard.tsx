import type { ServiceWeight, ScoringMode } from "@trainers/types";
import type { QAScoreResult } from "../../lib/scoring";
import { scoreColor, scoreBg, scoreLabel } from "../../lib/scoring";

interface Props {
  liveScore: QAScoreResult | null;
  activeWeight: ServiceWeight | null;
  agentName: string;
  periodLabel: string;
}

function ModeIndicator({ mode }: { mode: ScoringMode }) {
  switch (mode) {
    case "flat":
      return <span className="text-[10px] text-muted-foreground font-mono">(flat)</span>;
    case "no_category":
      return <span className="text-[10px] text-muted-foreground font-mono">(no_category)</span>;
    default:
      return null;
  }
}

export default function SidakInputScoreCard({ liveScore, activeWeight, agentName, periodLabel }: Props) {
  if (!liveScore || !activeWeight) return null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Estimasi Skor <ModeIndicator mode={liveScore.mode} />
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {agentName} · {periodLabel}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-black ${scoreColor(liveScore.finalScore)}`}>
            {liveScore.finalScore}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-1">
            {scoreLabel(liveScore.finalScore)}
          </div>
        </div>
      </div>

      <div className="mt-4 h-2.5 rounded-full bg-foreground/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBg(liveScore.finalScore)}`}
          style={{ width: `${Math.max(liveScore.finalScore, 0)}%` }}
        />
      </div>

      {liveScore.mode === "weighted" ? (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
              NC Score ({Math.round(activeWeight.non_critical_weight * 100)}%)
            </div>
            <div className="text-lg font-black text-rose-600">
              {liveScore.nonCriticalScore}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              CR Score ({Math.round(activeWeight.critical_weight * 100)}%)
            </div>
            <div className="text-lg font-black text-blue-600">
              {liveScore.criticalScore}
            </div>
          </div>
        </div>
      ) : liveScore.mode === "flat" ? (
        <div className="bg-primary/5 rounded-xl p-4 mt-4 border border-primary/10">
          <div className="flex justify-between items-center mb-1 text-[10px] font-black uppercase text-muted-foreground">
            <span>Sistem Penilaian Flat</span>
            <span>{Math.round(activeWeight.non_critical_weight * 100)}% NC + {Math.round(activeWeight.critical_weight * 100)}% CR</span>
          </div>
          <p className="text-xs font-bold text-muted-foreground leading-relaxed text-center">
            Skor dihitung langsung dari total bobot parameter yang terpenuhi.
          </p>
        </div>
      ) : (
        <div className="bg-foreground/5 rounded-xl p-4 mt-4 border border-border/50">
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center mb-1">
            Mode No Category (BKO)
          </p>
          <p className="text-xs font-bold text-muted-foreground text-center leading-relaxed">
            Semua parameter memiliki derajat yang sama tanpa pemisahan kategori.
          </p>
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-3">
        {liveScore.sessionCount} sesi dihitung · Sampling max 5 sesi
      </div>
    </div>
  );
}
