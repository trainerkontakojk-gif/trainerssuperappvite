import React, { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";

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
  improvement_area: "Perlu diperbaiki",
  critical_moment: "Momen kritis",
  technique_used: "Teknik dipakai",
};

/** Titik kategori; label teks selalu menyertai warnanya. */
const CATEGORY_DOT: Record<ReplayAnnotationCategory, string> = {
  strength: "bg-chart-green",
  improvement_area: "bg-chart-orange",
  critical_moment: "bg-destructive",
  technique_used: "bg-module-telefun",
};

const MOMENT_LABELS: Record<AnnotationMoment, string> = {
  missed_empathy: "Empati terlewat",
  good_de_escalation: "De-eskalasi baik",
  long_pause: "Jeda panjang",
  interruption: "Interupsi",
  technique_usage: "Penggunaan teknik",
};

const MAX_CHAR_COUNT = 500;

const fieldLabel = "text-[13px] font-semibold text-foreground";
const sectionTitle = "text-[13px] font-semibold text-foreground";

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}.${seconds.toString().padStart(2, "0")}`;
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

  if (sorted.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className={sectionTitle}>Rekomendasi coaching</h3>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-6 text-fg2 marker:text-muted-foreground">
        {sorted.map((rec, idx) => (
          <li key={`${rec.priority}-${idx}`}>{rec.text}</li>
        ))}
      </ol>
    </section>
  );
}

function AnnotationItem({
  annotation,
  number,
  onDelete,
}: {
  annotation: ReplayAnnotationItem;
  number: number;
  onDelete?: (annotationId: string) => Promise<void>;
}) {
  return (
    <li
      className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3"
      aria-label={`Catatan ${number} pada ${formatTimestamp(annotation.timestampMs)}`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-xs font-bold text-background"
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-module-telefun tabular-nums">
            {formatTimestamp(annotation.timestampMs)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-fg2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                CATEGORY_DOT[annotation.category],
              )}
            />
            {CATEGORY_LABELS[annotation.category]}
          </span>
          {annotation.moment && <span>{annotation.moment}</span>}
          <span>{annotation.isManual ? "Trainer" : "AI"}</span>
        </p>
        <p className="text-sm leading-6 text-foreground">{annotation.text}</p>
      </div>
      {annotation.isManual && onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void onDelete(annotation.id)}
          aria-label={`Hapus catatan ${number}`}
          className="-my-1.5 size-[44px] shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 data-icon="inline" />
        </Button>
      )}
    </li>
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
      <p role="status" className="text-[13px] text-muted-foreground">
        Memuat catatan…
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground"
      >
        {error}
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="min-h-[44px] gap-2 px-3 text-[13px]"
        >
          <RefreshCw data-icon="inline-start" />
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RecommendationList recommendations={recommendations} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={sectionTitle}>
            Catatan di rekaman{" "}
            <span className="font-normal text-muted-foreground">
              ({sortedAnnotations.length})
            </span>
          </h3>
          {onGenerateAi && (
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateAi}
              disabled={isGenerating}
              className="min-h-[44px] gap-2 px-3 text-[13px]"
            >
              {isGenerating ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {isGenerating ? "Menganalisis…" : "Analisis AI"}
            </Button>
          )}
        </div>
        {sortedAnnotations.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Belum ada catatan untuk panggilan ini.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {sortedAnnotations.map((annotation, index) => (
              <AnnotationItem
                key={annotation.id}
                annotation={annotation}
                number={index + 1}
                onDelete={onDeleteAnnotation}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-5">
        <h3 className={sectionTitle}>Tambah catatan</h3>

        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between">
            <span className={fieldLabel}>Waktu di rekaman</span>
            <span className="font-mono text-xs text-fg2 tabular-nums">
              {formatTimestamp(timestampMs)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={maxTimestampMs}
            step={1000}
            value={timestampMs}
            onChange={(e) => setTimestampMs(Number(e.target.value))}
            className="min-h-[44px] w-full accent-foreground"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span id="annotation-category-label" className={fieldLabel}>
            Jenis catatan
          </span>
          <div
            role="radiogroup"
            aria-labelledby="annotation-category-label"
            className="flex flex-wrap gap-1.5"
          >
            {(
              [
                "strength",
                "improvement_area",
                "critical_moment",
                "technique_used",
              ] as const
            ).map((item) => (
              <Button
                key={item}
                type="button"
                role="radio"
                aria-checked={category === item}
                variant={category === item ? "secondary" : "ghost"}
                onClick={() => setCategory(item)}
                className="min-h-[44px] gap-2 px-3 text-[13px] aria-checked:font-semibold"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", CATEGORY_DOT[item])}
                />
                {CATEGORY_LABELS[item]}
              </Button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Momen</span>
          <select
            value={moment}
            onChange={(e) => setMoment(e.target.value as AnnotationMoment)}
            className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {(
              Object.entries(MOMENT_LABELS) as [AnnotationMoment, string][]
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Catatan</span>
          <textarea
            value={text.slice(0, MAX_CHAR_COUNT)}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis catatan singkat untuk momen ini"
            className="h-24 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <span
            className={cn(
              "text-xs tabular-nums",
              charCount > MAX_CHAR_COUNT * 0.9
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {charCount}/{MAX_CHAR_COUNT} karakter
          </span>
        </label>

        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || !text.trim() || charLimitReached}
          className="min-h-[44px] gap-2 self-start px-4 text-[13px] font-semibold"
        >
          {isSubmitting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          Simpan catatan
        </Button>
      </section>
    </div>
  );
};
