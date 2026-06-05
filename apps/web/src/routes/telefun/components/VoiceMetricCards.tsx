import React from "react";
import type {
  TelefunCommunicationProfile,
  CommunicationMetric,
} from "@trainers/types";

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
                <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                  {metric.displayScore}
                  <span className="text-sm font-semibold text-slate-400">
                    /100
                  </span>
                </p>
              </div>
              <span className={STATUS_CLASSES[metric.status] || ""}>
                {STATUS_LABELS[metric.status] || metric.status}
              </span>
            </div>
            {detail && (
              <p className="mt-2 text-xs text-slate-500 font-medium">
                Detail: {detail}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/75">
              {metric.feedback || metric.explanation}
            </p>
            {metric.improvementTip && (
              <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Tip: {metric.improvementTip}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
