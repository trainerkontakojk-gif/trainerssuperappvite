import type { ServiceWeight, ScoringMode } from "@trainers/types";
import type { QAScoreResult } from "../../lib/scoring";
import { scoreLabel } from "../../lib/scoring";
import { Info, ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  liveScore: QAScoreResult | null;
  activeWeight: ServiceWeight | null;
  agentName: string;
  periodLabel: string;
}

function ModeIndicator({ mode }: { mode: ScoringMode }) {
  switch (mode) {
    case "flat":
      return <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">(flat)</span>;
    case "no_category":
      return <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">(no_category)</span>;
    default:
      return null;
  }
}

export default function SidakInputScoreCard({ liveScore, activeWeight, agentName, periodLabel }: Props) {
  if (!liveScore || !activeWeight) return null;

  const score = liveScore.finalScore;
  const colors = {
    text: score >= 85 ? "text-green-500" : score >= 70 ? "text-amber-500" : "text-red-500",
    stroke: score >= 85 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444"
  };

  // SVG Gauge calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/75 backdrop-blur-md p-6 shadow-md transition-all duration-300 hover:shadow-lg">
      {/* Glow effect */}
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/5 blur-3xl" />

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground/90">
              Skor Kualitas (Live)
            </h3>
            <ModeIndicator mode={liveScore.mode} />
          </div>
          <p className="text-[11px] font-bold text-muted-foreground mt-1.5">
            {agentName} &middot; {periodLabel}
          </p>
        </div>

        {/* Live Pulse Badge */}
        <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest text-green-600">Kalkulasi Live</span>
        </div>
      </div>

      {/* Main Scoring Section */}
      <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-stretch">
        
        {/* SVG Radial Progress Ring */}
        <div className="flex flex-1 items-center justify-center sm:justify-start gap-5">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-muted-foreground/10"
                strokeWidth="7"
                fill="transparent"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke={colors.stroke}
                strokeWidth="7"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className={`text-2xl font-black tracking-tight leading-none ${colors.text}`}>
                {score}
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                {scoreLabel(score)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-black leading-tight text-foreground/90">
              Hasil Sementara Audit
            </h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[240px]">
              Skor kualitas keseluruhan dari parameter audit yang bernilai sesuai atau perbaikan.
            </p>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="w-full sm:w-auto shrink-0 flex flex-col justify-center">
          {liveScore.mode === "weighted" ? (
            <div className="grid grid-cols-2 gap-3 min-w-[260px]">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-rose-500/[0.04] border border-rose-500/10">
                <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-rose-600">
                    NC Score ({Math.round(activeWeight.non_critical_weight * 100)}%)
                  </div>
                  <div className="text-base font-black text-rose-600 leading-none mt-1">
                    {liveScore.nonCriticalScore}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-500/[0.04] border border-blue-500/10">
                <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-blue-600">
                    CR Score ({Math.round(activeWeight.critical_weight * 100)}%)
                  </div>
                  <div className="text-base font-black text-blue-600 leading-none mt-1">
                    {liveScore.criticalScore}
                  </div>
                </div>
              </div>
            </div>
          ) : liveScore.mode === "flat" ? (
            <div className="rounded-2xl p-4 border border-border bg-foreground/[0.02] min-w-[260px]">
              <div className="flex justify-between items-center mb-1 text-[9px] font-black uppercase text-muted-foreground tracking-wider">
                <span>Skema Penilaian Flat</span>
                <span>{Math.round(activeWeight.non_critical_weight * 100)}% NC &middot; {Math.round(activeWeight.critical_weight * 100)}% CR</span>
              </div>
              <p className="text-[11px] font-bold text-muted-foreground/80 leading-normal">
                Skor dihitung proporsional dari total bobot parameter terpenuhi.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl p-4 border border-border bg-foreground/[0.02] min-w-[260px]">
              <p className="text-[9px] font-black uppercase text-muted-foreground text-center mb-1.5 tracking-wider">
                Mode No Category (BKO)
              </p>
              <p className="text-[11px] font-bold text-muted-foreground/80 text-center leading-normal">
                Semua parameter memiliki derajat setara tanpa pemisahan kategori.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Footnote */}
      <div className="flex items-start gap-2 border-t border-border/50 pt-3.5 mt-5">
        <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
        <div className="text-[10px] text-muted-foreground leading-relaxed">
          Telah diinput <strong>{liveScore.sessionCount} sesi</strong> (Sampling maks. 5 sesi terendah). Perubahan data di bawah ter-kalkulasi langsung secara live. Hasil akhir akan sinkron setelah Anda menyimpan audit ini.
        </div>
      </div>
    </div>
  );
}
