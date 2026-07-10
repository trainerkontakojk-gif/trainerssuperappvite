import React from "react";
import {
  Activity,
  AlertTriangle,
  Gauge,
  Info,
  Loader2,
  MessageCircle,
  RefreshCw,
  Volume2,
} from "lucide-react";
import { motion } from "framer-motion";
import type { VoiceDashboardMetrics } from "../services/reviewTypes";

export interface VoiceDashboardProps {
  sessionId: string;
  metrics: VoiceDashboardMetrics | null;
  isLoading: boolean;
  error?: string;
  notice?: string;
  onRetry: () => void;
}

type ColorLevel = "red" | "yellow" | "green";

function getSpeechClarityColor(score: number): ColorLevel {
  if (score < 4) return "red";
  if (score <= 7) return "yellow";
  return "green";
}

function getSpeakingSpeedColor(
  classification: "too_slow" | "normal" | "too_fast",
): ColorLevel {
  return classification === "normal" ? "green" : "red";
}

function getSpeakingDominanceColor(
  classification: "dominated" | "balanced" | "passive",
): ColorLevel {
  return classification === "balanced" ? "green" : "red";
}

function getIntonationColor(score: number): ColorLevel {
  if (score < 4) return "red";
  if (score <= 7) return "yellow";
  return "green";
}

const colorMap: Record<
  ColorLevel,
  { bar: string; text: string; bg: string; label: string }
> = {
  red: {
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    label: "Perlu Perbaikan",
  },
  yellow: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    label: "Cukup",
  },
  green: {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Baik",
  },
};

function MetricGauge({
  label,
  value,
  maxValue,
  displayValue,
  sublabel,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  maxValue: number;
  displayValue: string;
  sublabel: string;
  color: ColorLevel;
  icon: React.ElementType;
}) {
  const percentage = Math.min(100, Math.max(0, (value / maxValue) * 100));
  const colors = colorMap[color];

  return (
    <div
      className="rounded-xl border border-slate-950/5 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
      role="group"
      aria-label={`${label}: ${displayValue}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${colors.bg}`}>
          <Icon className={`h-4 w-4 ${colors.text}`} aria-hidden="true" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
          {label}
        </span>
      </div>

      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
          {displayValue}
        </span>
        <span className={`text-xs font-bold ${colors.text}`}>
          {colors.label}
        </span>
      </div>

      <div
        className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-950/5 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={maxValue}
        aria-label={`${label} progress`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-white/55">{sublabel}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat metrik suara">
      <div className="flex items-center gap-3 p-4">
        <Loader2
          className="h-5 w-5 animate-spin text-emerald-500"
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-slate-600 dark:text-white/60">
          Menganalisis kualitas suara...
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[140px] animate-pulse rounded-xl bg-slate-950/5 dark:bg-white/5"
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-950/20"
      role="alert"
    >
      <AlertTriangle
        className="mx-auto mb-3 h-8 w-8 text-red-500"
        aria-hidden="true"
      />
      <h3 className="mb-2 text-sm font-bold text-red-700 dark:text-red-400">
        Analisis Gagal
      </h3>
      <p className="mb-4 text-sm text-red-600 dark:text-red-300/80">{error}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Coba Lagi
      </button>
    </div>
  );
}

function EmptyState({ notice }: { notice?: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-slate-950/10 bg-slate-950/5 p-6 text-center dark:border-white/10 dark:bg-white/5"
      role="status"
    >
      <Info
        className="mx-auto mb-3 h-8 w-8 text-slate-400 dark:text-white/40"
        aria-hidden="true"
      />
      <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-white/70">
        Metrik Suara Tidak Tersedia
      </h3>
      <p className="text-sm text-slate-500 dark:text-white/55">
        {notice ||
          "Metrik suara tidak dapat dihitung karena sesi terlalu singkat atau rekaman audio tidak tersedia."}
      </p>
    </div>
  );
}

export const VoiceEvaluationDashboard: React.FC<VoiceDashboardProps> = ({
  sessionId: _sessionId,
  metrics,
  isLoading,
  error,
  notice,
  onRetry,
}) => {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (!metrics) {
    return <EmptyState notice={notice} />;
  }

  const clarityColor = getSpeechClarityColor(metrics.speechClarity);
  const speedColor = getSpeakingSpeedColor(
    metrics.speakingSpeed.classification,
  );
  const dominanceColor = getSpeakingDominanceColor(
    metrics.speakingDominance.classification,
  );

  const speedLabel =
    metrics.speakingSpeed.classification === "too_slow"
      ? "Terlalu Lambat"
      : metrics.speakingSpeed.classification === "too_fast"
        ? "Terlalu Cepat"
        : "Normal";

  const dominanceLabel =
    metrics.speakingDominance.classification === "dominated"
      ? "Terlalu Dominan"
      : metrics.speakingDominance.classification === "passive"
        ? "Terlalu Pasif"
        : "Seimbang";

  const intonationColor =
    metrics.intonationVariability == null
      ? "green"
      : getIntonationColor(metrics.intonationVariability);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      aria-label="Dashboard Evaluasi Suara"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricGauge
          label="Kejelasan Bicara"
          value={metrics.speechClarity}
          maxValue={10}
          displayValue={`${metrics.speechClarity.toFixed(1)}/10`}
          sublabel="Skor artikulasi dan pengucapan"
          color={clarityColor}
          icon={Volume2}
        />

        <MetricGauge
          label="Kecepatan Bicara"
          value={metrics.speakingSpeed.wpm}
          maxValue={200}
          displayValue={`${metrics.speakingSpeed.wpm} WPM`}
          sublabel={speedLabel}
          color={speedColor}
          icon={Activity}
        />

        <MetricGauge
          label="Dominasi Bicara"
          value={Math.round(metrics.speakingDominance.ratio * 100)}
          maxValue={100}
          displayValue={`${Math.round(metrics.speakingDominance.ratio * 100)}%`}
          sublabel={dominanceLabel}
          color={dominanceColor}
          icon={MessageCircle}
        />
      </div>

      {metrics.intonationVariability != null && (
        <div className="rounded-xl border border-slate-950/5 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <div className={`rounded-lg p-1.5 ${colorMap[intonationColor].bg}`}>
              <Gauge
                className={`h-4 w-4 ${colorMap[intonationColor].text}`}
                aria-hidden="true"
              />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              Variasi Intonasi
            </span>
            <span
              className={`ml-auto text-xs font-bold ${colorMap[intonationColor].text}`}
            >
              {colorMap[intonationColor].label}
            </span>
          </div>

          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              {metrics.intonationVariability.toFixed(1)}/10
            </span>
            <span className="text-xs text-slate-500 dark:text-white/50">
              Semakin tinggi berarti variasi intonasi lebih hidup
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/5 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colorMap[intonationColor].bar}`}
              style={{
                width: `${Math.min(100, Math.max(0, metrics.intonationVariability * 10))}%`,
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};
