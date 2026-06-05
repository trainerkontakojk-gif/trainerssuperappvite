import { ShieldCheck, ShieldAlert, Clock, AlertTriangle } from "lucide-react";
import type { TelefunHoldAssessment } from "@trainers/types";

interface HoldAssessmentCardProps {
  assessment: TelefunHoldAssessment | null | undefined;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function HoldAssessmentCard({ assessment }: HoldAssessmentCardProps) {
  if (!assessment) return null;

  const isNotUsed = assessment.verdict === "N/A";
  const isGood = assessment.verdict === "Baik";
  const isPoor = assessment.verdict === "Kurang";

  const accentClass = isNotUsed
    ? "border-slate-200 dark:border-slate-700"
    : isGood
      ? "border-emerald-200 dark:border-emerald-800"
      : "border-amber-200 dark:border-amber-800";

  const bgClass = isNotUsed
    ? "bg-slate-50 dark:bg-slate-900/50"
    : isGood
      ? "bg-emerald-50/50 dark:bg-emerald-950/20"
      : "bg-amber-50/50 dark:bg-amber-950/20";

  return (
    <div className={`rounded-2xl border p-5 ${accentClass} ${bgClass}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isNotUsed ? (
            <Clock className="h-5 w-5 text-slate-400" />
          ) : isGood ? (
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-500" />
          )}
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
            Manajemen Hold
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
            isNotUsed
              ? "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
              : isGood
                ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
        >
          {assessment.verdict}
        </span>
      </div>

      {isNotUsed ? (
        <p className="text-sm text-slate-500 dark:text-white/55">
          User tidak menggunakan hold pada sesi ini.
        </p>
      ) : (
        <div className="space-y-2">
          {assessment.holdCount > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/35">
                  Jumlah Hold
                </p>
                <p className="text-sm font-semibold text-slate-700 dark:text-white/75">
                  {assessment.holdCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/35">
                  Total Durasi
                </p>
                <p className="text-sm font-semibold text-slate-700 dark:text-white/75">
                  {formatDuration(assessment.totalDurationMs)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/35">
                  Hold Terlama
                </p>
                <p className="text-sm font-semibold text-slate-700 dark:text-white/75">
                  {formatDuration(assessment.longestDurationMs)}
                </p>
              </div>
              {isPoor && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/35">
                    Melewati Batas
                  </p>
                  <p className="flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    {assessment.exceededCount}
                  </p>
                </div>
              )}
            </div>
          )}
          {assessment.feedback && (
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              {assessment.feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
