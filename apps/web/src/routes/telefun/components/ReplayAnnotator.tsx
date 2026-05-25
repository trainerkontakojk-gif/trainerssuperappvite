import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Clock,
  Lightbulb,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { motion } from "framer-motion";

export type ReplayAnnotationCategory =
  | "strength"
  | "improvement_area"
  | "critical_moment"
  | "technique_used";

export type AnnotationMoment =
  | "missed_empathy"
  | "good_de_escalation"
  | "long_pause"
  | "interruption"
  | "technique_usage";

export interface ReplayAnnotationItem {
  id: string;
  timestampMs: number;
  category: ReplayAnnotationCategory;
  moment: string;
  text: string;
  isManual: boolean;
  createdBy?: string;
}

export interface CoachingRecommendationItem {
  text: string;
  priority: number;
}

export interface ReplayAnnotatorProps {
  sessionId: string;
  annotations: ReplayAnnotationItem[];
  recommendations: CoachingRecommendationItem[];
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
  onAddAnnotation: (
    annotation: Omit<ReplayAnnotationItem, "id" | "isManual" | "createdBy">,
  ) => Promise<void>;
  onDeleteAnnotation?: (annotationId: string) => Promise<void>;
  onGenerateAi?: () => void;
  isGenerating?: boolean;
  sessionDurationMs?: number;
}

const CATEGORY_LABELS: Record<ReplayAnnotationCategory, string> = {
  strength: "Kekuatan",
  improvement_area: "Area Perbaikan",
  critical_moment: "Momen Kritis",
  technique_used: "Teknik Digunakan",
};

const CATEGORY_STYLES: Record<
  ReplayAnnotationCategory,
  { bg: string; text: string; border: string }
> = {
  strength: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  improvement_area: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
  },
  critical_moment: {
    bg: "bg-red-500/10",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  technique_used: {
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
};

const MOMENT_LABELS: Record<AnnotationMoment, string> = {
  missed_empathy: "Empati Terlewat",
  good_de_escalation: "De-eskalasi Baik",
  long_pause: "Jeda Panjang",
  interruption: "Interupsi",
  technique_usage: "Penggunaan Teknik",
};

const MAX_CHAR_COUNT = 500;

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function RecommendationList({
  recommendations,
}: {
  recommendations: CoachingRecommendationItem[];
}) {
  const sorted = useMemo(
    () =>
      [...recommendations].sort((a, b) => a.priority - b.priority).slice(0, 5),
    [recommendations],
  );

  if (sorted.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-950/5 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-lg bg-amber-500/10 p-1.5">
          <Lightbulb
            className="h-4 w-4 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
          Rekomendasi Coaching
        </h3>
      </div>
      <ol className="space-y-2">
        {sorted.map((rec, idx) => (
          <li
            key={`${rec.priority}-${idx}`}
            className="flex items-start gap-2 rounded-lg bg-slate-950/[0.02] p-2.5 dark:bg-white/5"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-slate-700 dark:text-white/70">
                {rec.text}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Prioritas {rec.priority}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnnotationCard({
  annotation,
  onDelete,
}: {
  annotation: ReplayAnnotationItem;
  onDelete?: (annotationId: string) => Promise<void>;
}) {
  const categoryColor = CATEGORY_STYLES[annotation.category];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group relative rounded-lg border p-3 ${categoryColor.border} bg-white dark:bg-slate-900`}
      role="article"
      aria-label={`Anotasi pada ${formatTimestamp(annotation.timestampMs)}: ${annotation.text}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-white/50">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatTimestamp(annotation.timestampMs)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor.bg} ${categoryColor.text}`}
        >
          {CATEGORY_LABELS[annotation.category]}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-white/35">
          {annotation.moment}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {annotation.isManual ? (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-white/50">
              <User className="h-3 w-3" aria-hidden="true" />
              Manual
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
              <Bot className="h-3 w-3" aria-hidden="true" />
              AI
            </span>
          )}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-slate-700 dark:text-white/70">
        {annotation.text}
      </p>

      {annotation.isManual && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(annotation.id)}
          className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-500/10"
          aria-label="Hapus anotasi"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
}

export const ReplayAnnotator: React.FC<ReplayAnnotatorProps> = ({
  sessionId: _sessionId,
  annotations,
  recommendations,
  isLoading,
  error,
  onRetry,
  onAddAnnotation,
  onDeleteAnnotation,
  onGenerateAi,
  isGenerating,
  sessionDurationMs,
}) => {
  const [text, setText] = useState("");
  const [category, setCategory] =
    useState<ReplayAnnotationCategory>("strength");
  const [moment, setMoment] = useState<AnnotationMoment>("missed_empathy");
  const [timestampMs, setTimestampMs] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const charCount = text.length;
  const charLimitReached = charCount > MAX_CHAR_COUNT;

  const sortedAnnotations = useMemo(
    () => [...annotations].sort((a, b) => a.timestampMs - b.timestampMs),
    [annotations],
  );

  const maxTimestampMs =
    sessionDurationMs && sessionDurationMs > 0
      ? sessionDurationMs
      : 5 * 60 * 1000;

  const handleSubmit = async () => {
    if (!text.trim() || charLimitReached) return;
    setIsSubmitting(true);
    try {
      await onAddAnnotation({
        timestampMs,
        category,
        moment,
        text: text.trim(),
      });
      setText("");
      setMoment("missed_empathy");
    } catch (_error) {
      // Parent component already surfaces errors; keep the form open.
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-950/5 bg-white p-6 dark:border-white/10 dark:bg-slate-900">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-950/20">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-500" />
        <p className="mb-4 text-sm text-red-700 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
        >
          <RefreshCw className="h-4 w-4" />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RecommendationList recommendations={recommendations} />

      <div className="rounded-2xl border border-slate-950/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
              Timeline Anotasi
            </h3>
            <p className="text-xs text-slate-400 dark:text-white/35">
              {sortedAnnotations.length} anotasi tersimpan
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onGenerateAi && (
              <button
                type="button"
                onClick={onGenerateAi}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isGenerating ? "Menganalisis..." : "Analisis AI"}
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-white/35">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{formatTimestamp(timestampMs)}</span>
            </div>
          </div>
        </div>

        {sortedAnnotations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-950/10 bg-slate-950/5 p-6 text-center dark:border-white/10 dark:bg-white/5">
            <MessageSquare className="mx-auto mb-2 h-6 w-6 text-slate-400 dark:text-white/30" />
            <p className="text-sm text-slate-500 dark:text-white/50">
              Belum ada anotasi untuk sesi ini.
            </p>
          </div>
        ) : (
          <div className="relative space-y-3">
            <div
              className="absolute left-[18px] top-0 bottom-0 w-px bg-slate-200 dark:bg-white/10"
              aria-hidden="true"
            />
            {sortedAnnotations.map((annotation) => (
              <div key={annotation.id} className="relative flex gap-3">
                <div
                  className={`relative z-10 mt-3 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    annotation.isManual
                      ? "bg-slate-400 dark:bg-white/40"
                      : "bg-violet-500 dark:bg-violet-400"
                  }`}
                  aria-hidden="true"
                  style={{ marginLeft: "12px" }}
                />
                <div className="flex-1">
                  <AnnotationCard
                    annotation={annotation}
                    onDelete={onDeleteAnnotation}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-950/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
            Tambah Anotasi Manual
          </h3>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              Waktu
            </span>
            <input
              type="range"
              min={0}
              max={maxTimestampMs}
              step={1000}
              value={timestampMs}
              onChange={(e) => setTimestampMs(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/35">
              <span>00:00</span>
              <span>{formatTimestamp(maxTimestampMs)}</span>
            </div>
          </label>

          <div className="flex gap-2 flex-wrap">
            {(
              [
                "strength",
                "improvement_area",
                "critical_moment",
                "technique_used",
              ] as const
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
                  category === item
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-950/5 text-slate-500 hover:bg-slate-950/10 dark:bg-white/5 dark:text-white/55 dark:hover:bg-white/10"
                }`}
              >
                {CATEGORY_LABELS[item]}
              </button>
            ))}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              Tipe Momen
            </span>
            <select
              value={moment}
              onChange={(e) => setMoment(e.target.value as AnnotationMoment)}
              className="w-full rounded-xl border border-slate-950/10 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950/20 dark:text-white"
            >
              {(
                Object.entries(MOMENT_LABELS) as [
                  AnnotationMoment,
                  string,
                ][]
              ).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <textarea
              value={text.slice(0, MAX_CHAR_COUNT)}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tulis catatan singkat untuk momen ini..."
              className="h-24 w-full resize-none rounded-xl border border-slate-950/10 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950/20 dark:text-white"
            />
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span
                className={
                  charCount > MAX_CHAR_COUNT * 0.9
                    ? "font-bold text-red-500"
                    : "text-slate-400 dark:text-white/35"
                }
              >
                {charCount}/{MAX_CHAR_COUNT} karakter
              </span>
              {charLimitReached && (
                <span className="font-bold text-red-500">
                  Maksimal {MAX_CHAR_COUNT} karakter
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !text.trim() || charLimitReached}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Simpan Anotasi
          </button>
        </div>
      </div>
    </div>
  );
};
