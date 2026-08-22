import React from "react";
import { Play, Volume2 } from "lucide-react";
import type {
  TelefunCommunicationProfile,
  CommunicationMetric,
} from "@trainers/types";
import { FILLER_TARGET_COUNT } from "@trainers/types";

interface VoiceMetricCardsProps {
  profile: TelefunCommunicationProfile;
}

const STATUS_CLASSES: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full border",
  needs_improvement:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full border",
  poor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full border",
};

const STATUS_LABELS: Record<string, string> = {
  good: "Baik",
  needs_improvement: "Cukup",
  poor: "Kurang",
};

function formatRawMetric(metric: CommunicationMetric): string {
  if (metric.rawValue === undefined || metric.rawValue === null) return "";
  if (metric.key === "speakingRate") {
    return `${metric.rawValue} WPM`;
  }
  if (metric.key === "fillers") {
    const count = metric.rawValue;
    const countNum =
      typeof count === "number"
        ? count
        : typeof count === "string"
          ? Number(count)
          : NaN;
    if (Number.isFinite(countNum)) {
      return `${countNum} kata pengisi${countNum === 1 ? "" : ""}`;
    }
    return `${metric.rawValue} filler words`;
  }
  return String(metric.rawValue);
}

export const VoiceMetricCards: React.FC<VoiceMetricCardsProps> = ({
  profile,
}) => {
  if (!profile.metrics || profile.metrics.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {profile.metrics.map((metric) => {
        const detail = formatRawMetric(metric);
        return (
          <div
            key={metric.key}
            className="rounded-xl border border-slate-950/10 bg-white p-4 transition-colors hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {metric.label}
                </p>
                {metric.key === "fillers" ? (
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                    {typeof metric.rawValue === "number"
                      ? metric.rawValue
                      : "—"}
                    <span className="text-sm font-semibold text-slate-400">
                      {" "}
                      kata
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                    {metric.displayScore}
                    <span className="text-sm font-semibold text-slate-400">
                      /100
                    </span>
                  </p>
                )}
              </div>
              <span className={STATUS_CLASSES[metric.status] || ""}>
                {STATUS_LABELS[metric.status] || metric.status}
              </span>
            </div>
            {metric.key === "fillers" ? (
              <p className="mt-2 text-xs text-slate-500 font-medium">
                Target: maksimal {FILLER_TARGET_COUNT} · semakin sedikit semakin baik
              </p>
            ) : (
              detail && (
                <p className="mt-2 text-xs text-slate-500 font-medium">
                  Detail: {detail}
                </p>
              )
            )}
            {metric.key === "fillers" &&
              metric.examples &&
              metric.examples.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                    Contoh terdeteksi
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {metric.examples.slice(0, 8).map((word, i) => (
                      <span
                        key={`${word}-${i}`}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/75">
              {metric.feedback || metric.explanation}
            </p>
            {metric.improvementTip && (
              <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Tip: {metric.improvementTip}
              </p>
            )}
            {metric.drill && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-sky-600 dark:text-sky-400">
                <Play className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>
                  <span className="font-bold uppercase tracking-wide">Drill:</span>{" "}
                  {metric.drill}
                </span>
              </p>
            )}
            {metric.examplePhrase && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] italic leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-white/70">
                <Volume2 className="mt-0.5 h-3 w-3 shrink-0 not-italic" aria-hidden />
                <span>&ldquo;{metric.examplePhrase}&rdquo;</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
