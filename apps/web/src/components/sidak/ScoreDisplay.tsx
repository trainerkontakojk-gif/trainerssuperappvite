interface Props {
  score: number;
  showLabel?: boolean;
  showProgress?: boolean;
  size?: "sm" | "md" | "lg";
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-amber-600";
  return "text-rose-600";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
}

export default function ScoreDisplay({ score, showLabel, showProgress, size = "md" }: Props) {
  const colorClass = scoreColor(score);
  const bgClass = scoreBg(score);
  const sizeClass = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`${sizeClass} font-black tracking-tighter tabular-nums ${colorClass}`}>
        {score.toFixed(1)}
      </span>
      {showLabel && (
        <span className={`text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>
          {scoreLabel(score)}
        </span>
      )}
      {showProgress && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
          <div className={`h-full rounded-full ${bgClass}`} style={{ width: `${Math.max(5, Math.min(100, score))}%` }} />
        </div>
      )}
    </div>
  );
}
