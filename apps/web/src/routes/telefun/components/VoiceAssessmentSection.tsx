import React, { useState } from "react";
import type { VoiceQualityAssessment, TelefunTranscriptEntry } from "@trainers/types";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Wand2,
  MessageSquare,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Gauge,
  Maximize2,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  validateAssessment,
  parseTelefunScoreResult,
  getCommunicationProfileFromAssessment,
} from "../../../lib/voiceAssessmentUtils";
import { VoiceRadarChart } from "./VoiceRadarChart";
import { CommunicationProfileZoomModal } from "./CommunicationProfileZoomModal";
import { VoiceMetricCards } from "./VoiceMetricCards";
import { HoldAssessmentCard } from "./HoldAssessmentCard";
import { TelefunTranscript } from "./TelefunTranscript";
import { postApi } from "../../../hooks/useApi";

interface VoiceAssessmentSectionProps {
  sessionId: string;
  initialAssessment?: VoiceQualityAssessment | null;
  hasAgentRecording?: boolean;
  onAssessmentUpdate?: (assessment: VoiceQualityAssessment) => void;
  transcript?: TelefunTranscriptEntry[] | null;
}

const STATUS_COLORS: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  needs_improvement:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  poor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  good: "Baik",
  needs_improvement: "Perlu Perbaikan",
  poor: "Kurang",
};

export const VoiceAssessmentSection: React.FC<VoiceAssessmentSectionProps> = ({
  sessionId,
  initialAssessment,
  hasAgentRecording = true,
  onAssessmentUpdate,
  transcript,
}) => {
  const [assessment, setAssessment] = useState<VoiceQualityAssessment | null>(
    initialAssessment ? validateAssessment(initialAssessment) : null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scoringStatus, setScoringStatus] = useState<
    "idle" | "pending" | "processing" | "failed" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  const communicationProfile =
    getCommunicationProfileFromAssessment(assessment);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    setScoringStatus("processing");

    try {
      const data = await postApi<unknown>(`/telefun/score/${sessionId}`, {});
      const result = parseTelefunScoreResult(data);

      if (result) {
        setAssessment(result.assessment);
        onAssessmentUpdate?.(result.assessment);
        setScoringStatus(null);
      } else {
        setError("Format penilaian tidak valid");
        setScoringStatus("failed");
      }
    } catch (e: any) {
      const scoringStatusRaw = e?.scoringStatus;
      if (scoringStatusRaw === "processing") {
        setScoringStatus("processing");
        setError("Analisis suara sedang diproses otomatis. Silakan tunggu beberapa saat.");
      } else if (scoringStatusRaw === "pending" || scoringStatusRaw === "failed") {
        setScoringStatus(scoringStatusRaw);
        setError(
          scoringStatusRaw === "pending"
            ? "Analisis suara sedang dalam antrian."
            : e?.message || "Analisis suara gagal sebelumnya. Coba lagi.",
        );
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Terjadi kesalahan tak terduga saat analisis",
        );
        setScoringStatus("failed");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!assessment && !isAnalyzing && scoringStatus !== "processing" && scoringStatus !== "pending") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-950/10 bg-slate-950/5 p-8 text-center dark:border-white/10 dark:bg-white/5">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
        <h3 className="mb-2 text-lg font-bold">Analisis Kualitas Suara Agen</h3>
        <p className="mb-6 text-sm text-slate-500 dark:text-white/55">
          Gunakan AI untuk menilai kecepatan bicara, intonasi, dan artikulasi
          suara Anda dalam simulasi ini.
        </p>
        <button
          disabled={!hasAgentRecording}
          onClick={handleAnalyze}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Wand2 className="h-4 w-4" />
          <span>Mulai Analisis</span>
        </button>
        {!hasAgentRecording && (
          <p className="mt-4 text-xs font-bold text-amber-600 dark:text-amber-400">
            Rekaman suara agen belum tersedia untuk sesi ini.
          </p>
        )}
        {error && (
          <p className="mt-4 text-xs font-bold text-red-500">{error}</p>
        )}
      </div>
    );
  }

  if (scoringStatus === "pending" || (isAnalyzing && scoringStatus !== "processing")) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <Clock className="mb-4 h-12 w-12 text-amber-500" />
        <h3 className="mb-1 text-xl font-bold">Menunggu Antrian Analisis</h3>
        <p className="max-w-xs text-sm text-slate-500 dark:text-white/55">
          Analisis suara Anda sedang dalam antrian dan akan diproses secara
          otomatis.
        </p>
        <button
          onClick={handleAnalyze}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Cek Status</span>
        </button>
      </div>
    );
  }

  if (isAnalyzing || scoringStatus === "processing") {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-emerald-500" />
        <h3 className="mb-1 text-xl font-bold">Menganalisis Suara...</h3>
        <p className="max-w-xs text-sm text-slate-500 dark:text-white/55">
          {scoringStatus === "processing" && !isAnalyzing
            ? "AI sedang memproses rekaman anda secara otomatis."
            : "AI sedang mendengarkan rekaman anda untuk memberikan penilaian mendalam."}
        </p>
      </div>
    );
  }

  if (scoringStatus === "failed" && !assessment) {
    return (
      <div className="rounded-2xl border border-dashed border-red-500/30 bg-red-500/5 p-8 text-center dark:border-red-500/20 dark:bg-red-500/10">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <h3 className="mb-2 text-lg font-bold">Analisis Gagal</h3>
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          onClick={handleAnalyze}
          disabled={!hasAgentRecording}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Coba Lagi</span>
        </button>
      </div>
    );
  }

  if (!assessment) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Profil Komunikasi Card */}
      <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              Profil Komunikasi
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">
              Semakin sesuai dengan area target, semakin baik
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
            <Sparkles className="h-3 w-3" />
            <span>{assessment.overallScore}/10</span>
          </div>
        </div>

        {communicationProfile ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Perbesar diagram profil komunikasi"
            onClick={() => setZoomOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setZoomOpen(true);
              }
            }}
            className="group relative cursor-pointer rounded-xl p-2 transition-colors hover:bg-slate-950/[0.02] dark:hover:bg-white/[0.02]"
          >
            <VoiceRadarChart profile={communicationProfile} compact />
            <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm dark:bg-white/20">
                <Maximize2 className="h-3 w-3" />
                Klik untuk memperbesar
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[240px] rounded-xl bg-slate-950/[0.02] dark:bg-white/[0.02]">
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-slate-300 dark:text-white/20 mb-2" />
              <p className="text-sm text-slate-400 dark:text-white/40">
                Analisis komunikasi belum tersedia untuk sesi ini
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 text-[10px] font-bold mt-3 text-slate-500 dark:text-white/45">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0 border border-dashed border-emerald-500" />
            Target QA
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500" />
            Hasil Anda
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            Semakin tinggi
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-amber-500" />
            Semakin rendah
          </div>
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3 w-3 text-blue-500" />
            Rentang ideal
          </div>
        </div>

        {/* Metric Status Summary */}
        {communicationProfile && (
          <div className="mt-4 flex flex-wrap gap-2">
            {communicationProfile.metrics.map((m) => (
              <span
                key={m.key}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${STATUS_COLORS[m.status] || ""}`}
              >
                {m.label}: {STATUS_LABELS[m.status]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI Insight */}
      {communicationProfile && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Ringkasan
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-white/75">
              {communicationProfile.overallSummary}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              <ListChecks className="h-4 w-4 text-emerald-500" />
              Prioritas Perbaikan
            </h3>
            {communicationProfile.improvementPriorities.length > 0 ? (
              <ul className="space-y-1.5">
                {communicationProfile.improvementPriorities.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="text-slate-700 dark:text-white/75">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 dark:text-white/40">
                Semua aspek sudah baik.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      {communicationProfile && (
        <VoiceMetricCards profile={communicationProfile} />
      )}

      {/* Hold Assessment Card */}
      <HoldAssessmentCard assessment={assessment?.holdManagement} />

      {/* Transcript */}
      <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
          <MessageSquare className="h-4 w-4" />
          Transcript Lengkap
        </h3>
        <TelefunTranscript
          entries={transcript}
          legacyText={assessment.transcript}
        />
      </div>

      {/* Zoom Modal */}
      <CommunicationProfileZoomModal
        isOpen={zoomOpen}
        onClose={() => setZoomOpen(false)}
        profile={communicationProfile}
      />
    </motion.div>
  );
};
