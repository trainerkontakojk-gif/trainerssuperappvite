import React, { useState } from "react";
import type { VoiceQualityAssessment } from "@trainers/types";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Wand2,
  MessageSquare,
  ListChecks,
} from "lucide-react";
import { motion } from "framer-motion";
import { validateAssessment } from "../../../lib/voiceAssessmentUtils";
import { VoiceRadarChart } from "./VoiceRadarChart";
import { postApi } from "../../../hooks/useApi";

interface VoiceAssessmentSectionProps {
  sessionId: string;
  initialAssessment?: VoiceQualityAssessment | null;
  hasAgentRecording?: boolean;
  onAssessmentUpdate?: (assessment: VoiceQualityAssessment) => void;
}

export const VoiceAssessmentSection: React.FC<VoiceAssessmentSectionProps> = ({
  sessionId,
  initialAssessment,
  hasAgentRecording = true,
  onAssessmentUpdate,
}) => {
  const [assessment, setAssessment] = useState<VoiceQualityAssessment | null>(
    initialAssessment ? validateAssessment(initialAssessment) : null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const data = await postApi<VoiceQualityAssessment>(
        `/telefun/score/${sessionId}`,
        {},
      );
      const validAssessment = validateAssessment(data);

      if (validAssessment) {
        setAssessment(validAssessment);
        onAssessmentUpdate?.(validAssessment);
      } else {
        setError("Format penilaian tidak valid");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Terjadi kesalahan tak terduga saat analisis",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!assessment && !isAnalyzing) {
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

  if (isAnalyzing) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-emerald-500" />
        <h3 className="mb-1 text-xl font-bold">Menganalisis Suara...</h3>
        <p className="max-w-xs text-sm text-slate-500 dark:text-white/55">
          AI sedang mendengarkan rekaman anda untuk memberikan penilaian
          mendalam.
        </p>
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              Vocal Performance
            </h3>
            <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
              <Sparkles className="h-3 w-3" />
              <span>{assessment.overallScore}/10</span>
            </div>
          </div>
          <VoiceRadarChart assessment={assessment} />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Kekuatan Utama
            </h3>
            <ul className="space-y-2">
              {assessment.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-slate-700 dark:text-white/80">{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              <ListChecks className="h-4 w-4 text-emerald-500" />
              Highlights
            </h3>
            <ul className="space-y-2">
              {assessment.highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/50" />
                  <span className="text-slate-700 dark:text-white/80">{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Kecepatan"
          score={assessment.speakingRate.score}
          subValue={`${assessment.speakingRate.wordsPerMinute} WPM`}
          feedback={assessment.speakingRate.verdict}
        />
        <MetricCard
          label="Intonasi"
          score={assessment.intonation.score}
          feedback={assessment.intonation.verdict}
        />
        <MetricCard
          label="Artikulasi"
          score={assessment.articulation.score}
          feedback={assessment.articulation.verdict}
        />
        <MetricCard
          label="Filler Words"
          score={assessment.fillerWords.score}
          subValue={`${assessment.fillerWords.count} kata`}
          feedback={assessment.fillerWords.verdict}
        />
        <MetricCard
          label="Emosi"
          score={assessment.emotionalTone.score}
          subValue={assessment.emotionalTone.dominant}
          feedback={assessment.emotionalTone.verdict}
        />
      </div>

      <div className="rounded-2xl border border-slate-950/10 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
          <MessageSquare className="h-4 w-4" />
          Transcript Lengkap
        </h3>
        <div className="max-h-[200px] overflow-y-auto rounded-xl bg-slate-950/5 p-4 text-sm leading-relaxed text-slate-700 dark:bg-white/5 dark:text-white/70">
          {assessment.transcript}
        </div>
      </div>
    </motion.div>
  );
};

const MetricCard = ({
  label,
  score,
  subValue,
  feedback,
}: {
  label: string;
  score: number;
  subValue?: string;
  feedback: string;
}) => (
  <div className="rounded-xl border border-slate-950/5 bg-slate-950/5 p-4 transition-colors hover:bg-slate-950/[0.07] dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/[0.08]">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs font-bold text-slate-500 dark:text-white/40">
        {label}
      </span>
      <span className="text-xs font-black text-emerald-500">{score}/10</span>
    </div>
    {subValue && (
      <div className="mb-1 text-lg font-black tracking-tight">{subValue}</div>
    )}
    <p className="text-xs leading-relaxed text-slate-500 dark:text-white/55">
      {feedback}
    </p>
  </div>
);
