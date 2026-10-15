import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, Download } from "lucide-react";
import type {
  CommunicationMetric,
  TelefunCoachingSummary,
  TelefunReplayAnnotation,
  TelefunTranscriptEntry,
  VoiceQualityAssessment,
} from "@trainers/types";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { useApi } from "../../../hooks/useApi";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { notify } from "../../../lib/toast";
import {
  getCommunicationProfileFromAssessment,
  parseTelefunScoreResult,
} from "../../../lib/voiceAssessmentUtils";
import { useTelefunRecordingUrl } from "../hooks/useTelefunRecordingUrl";
import type { CallRecord } from "../types";
import { isTelefunRecordScored } from "../types";
import { buildFillerPattern, withFillerMarks } from "../utils/fillerMarks";
import {
  TELEFUN_FIX_THRESHOLD,
  firstFillerLine,
  formatCallDuration,
  formatClock,
  formatTelefunScore,
  holdIntervals,
  readTelefunAspects,
  readTelefunScore,
  sortTelefunNewestFirst,
  telefunAnalysisState,
  telefunScoreVerdict,
  type TelefunAspect,
} from "../utils/reviewDisplay";
import type {
  CoachingRecommendationItem,
  ReplayAnnotationItem,
} from "./ReplayAnnotator";
import {
  TelefunCallPlayer,
  type TelefunCallPlayerHandle,
} from "./TelefunCallPlayer";
import { TelefunReviewStatus } from "./TelefunReviewStatus";
import { TelefunStageNav } from "./TelefunStageNav";

const ReplayAnnotator = lazy(() =>
  import("./ReplayAnnotator").then((module) => ({
    default: module.ReplayAnnotator,
  })),
);
const VoiceRadarChart = lazy(() =>
  import("./VoiceRadarChart").then((module) => ({
    default: module.VoiceRadarChart,
  })),
);

interface TelefunReviewStageProps {
  record: CallRecord;
  history: readonly CallRecord[];
  onBack: () => void;
  onPracticeAgain: () => void;
  /** Ganti sesi di riwayat (skor, status, dan rekaman berubah bersama). */
  onRecordChange: (record: CallRecord) => void;
  /** Minta pemantau status analisis memeriksa sesi ini. */
  onWatchScoring: (sessionId: string) => void;
  /** Baris sesi terbaru dari server; `null` bila sesi sudah tidak ada. */
  fetchDetail: (sessionId: string) => Promise<CallRecord | null>;
}

const sectionTitle =
  "font-display text-lg leading-7 font-bold tracking-tight text-foreground";

/** Metrik profil komunikasi yang sepadan dengan aspek suara. */
const PROFILE_KEY: Partial<
  Record<TelefunAspect["key"], CommunicationMetric["key"]>
> = {
  speakingRate: "speakingRate",
  intonation: "intonation",
  articulation: "articulation",
  fillerWords: "fillers",
  emotionalTone: "tone",
};

function barColor(score: number): string {
  if (score < TELEFUN_FIX_THRESHOLD) return "bg-chart-orange";
  if (score >= 8.5) return "bg-chart-green";
  return "bg-fg2";
}

function scoreChange(score: number, previous: number | null): string | null {
  if (previous === null) return null;
  const delta = Math.round((score - previous) * 10) / 10;
  if (delta > 0)
    return `naik ${formatTelefunScore(delta)} dari panggilan sebelumnya`;
  if (delta < 0)
    return `turun ${formatTelefunScore(-delta)} dari panggilan sebelumnya`;
  return "sama dengan panggilan sebelumnya";
}

function previousScore(
  record: CallRecord,
  history: readonly CallRecord[],
): number | null {
  const time = new Date(record.date).getTime();
  const earlier = sortTelefunNewestFirst(history).find(
    (item) =>
      item.id !== record.id &&
      new Date(item.date).getTime() < time &&
      readTelefunScore(item) !== null,
  );
  return earlier ? readTelefunScore(earlier) : null;
}

function mapAnnotation(row: TelefunReplayAnnotation): ReplayAnnotationItem {
  return {
    id: row.id,
    timestampMs: row.timestamp_ms,
    category: row.category,
    moment: row.moment,
    text: row.text,
    isManual: row.is_manual,
    createdBy: row.user_id,
  };
}

function downloadTranscript(
  record: CallRecord,
  transcript: readonly TelefunTranscriptEntry[],
) {
  const lines = transcript.map(
    (entry) =>
      `${formatClock(entry.startMs)}  ${entry.speaker === "agent" ? "Agen" : "Konsumen"}: ${entry.text}`,
  );
  const text = [
    `${record.scenarioTitle} · ${record.consumerName}`,
    "",
    ...lines,
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["﻿", text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `Telefun_transkrip_${record.id}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Tahap Telaah Telefun: rekaman dan transkrip di kiri, hasil di kanan. */
export function TelefunReviewStage({
  record,
  history,
  onBack,
  onPracticeAgain,
  onRecordChange,
  onWatchScoring,
  fetchDetail,
}: TelefunReviewStageProps) {
  const playerRef = useRef<TelefunCallPlayerHandle | null>(null);
  const lineRefs = useRef(new Map<number, HTMLLIElement>());
  const [currentMs, setCurrentMs] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState("fix");
  const recording = useTelefunRecordingUrl(record);
  const state = telefunAnalysisState(record);
  const transcript = useMemo(
    () => record.transcript ?? [],
    [record.transcript],
  );
  const holds = holdIntervals(record);
  const assessment = state === "scored" ? record.voiceAssessment : null;
  const fillerPattern = useMemo(
    () => buildFillerPattern(assessment?.fillerWords.examples ?? []),
    [assessment],
  );

  // Sesi yang belum dinilai diperiksa sekali saat dibuka; pemantau berhenti
  // sendiri pada status akhir atau batas waktu.
  const watchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (watchedRef.current === record.id) return;
    if (state === "scored" || state === "no_recording") return;
    watchedRef.current = record.id;
    onWatchScoring(record.id);
  }, [record.id, state, onWatchScoring]);

  const annotationsOpen = tab === "notes";
  const annotations = useApi<TelefunReplayAnnotation[]>(
    annotationsOpen ? `/telefun/annotations/${record.id}` : null,
  );
  const summary = useApi<TelefunCoachingSummary>(
    annotationsOpen ? `/telefun/coaching-summary/${record.id}` : null,
  );
  const annotationItems = useMemo(
    () => (annotations.data ?? []).map(mapAnnotation),
    [annotations.data],
  );
  const recommendations: CoachingRecommendationItem[] = useMemo(
    () =>
      (summary.data?.recommendations ?? []).map((item) => ({
        text: item.text,
        priority: item.priority,
      })),
    [summary.data],
  );
  const notes = useMemo(
    () =>
      [...annotationItems]
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .map((item, index) => ({
          id: item.id,
          timestampMs: item.timestampMs,
          number: index + 1,
        })),
    [annotationItems],
  );

  const showLine = useCallback((startMs: number) => {
    const element = lineRefs.current.get(startMs);
    setHighlighted(startMs);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.focus({ preventScroll: true });
  }, []);

  const playFrom = (startMs: number) => {
    setHighlighted(null);
    playerRef.current?.playFrom(startMs);
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const fresh = await fetchDetail(record.id);
      if (fresh) onRecordChange(fresh);
      onWatchScoring(record.id);
    } catch {
      notify.error("Status analisis belum bisa diperiksa. Coba lagi.");
    } finally {
      setChecking(false);
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const response = await unwrapResponse(
        await telefunClient.score[":id"].$post({
          param: { id: record.id },
          json: {},
        }),
      );
      const result = parseTelefunScoreResult(response);
      if (!result) throw new Error("invalid score result");
      const scored: CallRecord = {
        ...record,
        score: result.score,
        feedback: result.feedback,
        voiceAssessment: result.assessment,
        scoringStatus: "completed",
      };
      onRecordChange(scored);
      // Baris server hanya dipakai bila sudah menyimpan skor yang sama barunya.
      void fetchDetail(record.id)
        .then((fresh) => {
          if (fresh && isTelefunRecordScored(fresh)) onRecordChange(fresh);
        })
        .catch(() => {});
    } catch (error) {
      const status = (error as { details?: { scoringStatus?: unknown } })
        ?.details?.scoringStatus;
      if (status === "pending" || status === "processing") {
        onRecordChange({ ...record, scoringStatus: status });
        onWatchScoring(record.id);
      } else {
        onRecordChange({ ...record, scoringStatus: "failed" });
        notify.error("Analisis belum berhasil. Coba lagi beberapa saat lagi.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const addAnnotation = async (
    annotation: Omit<ReplayAnnotationItem, "id" | "isManual" | "createdBy">,
  ) => {
    try {
      await unwrapResponse(
        await telefunClient.annotations[":id"].$post({
          param: { id: record.id },
          json: {
            timestamp_ms: annotation.timestampMs,
            category: annotation.category,
            moment: annotation.moment,
            text: annotation.text,
            is_manual: true,
          },
        }),
      );
      await annotations.refetch();
      await summary.refetch();
      notify.success("Catatan tersimpan.");
    } catch {
      notify.error("Catatan belum tersimpan. Coba lagi.");
    }
  };

  const deleteAnnotation = async (annotationId: string) => {
    try {
      await unwrapResponse(
        await telefunClient.annotations[":annotationId"].$delete({
          param: { annotationId },
        }),
      );
      await annotations.refetch();
      notify.success("Catatan dihapus.");
    } catch {
      notify.error("Catatan belum terhapus. Coba lagi.");
    }
  };

  // Baris yang sedang diputar: baris terakhir yang dimulai sebelum posisi putar.
  const nowStartMs =
    currentMs > 0
      ? (transcript.filter((entry) => entry.startMs <= currentMs).at(-1)
          ?.startMs ?? null)
      : null;
  const participant =
    record.simulationSubject?.type === "participant"
      ? formatSimulationSubjectLabel(record.simulationSubject, {
          includeParticipantDetails: false,
        })
      : null;

  return (
    <div
      data-module="telefun"
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-elevated px-4 py-2 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="min-h-[44px] gap-2 px-2 text-[13px] text-fg2"
        >
          <ArrowLeft data-icon="inline-start" />
          Telefun
        </Button>
        <TelefunStageNav />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={transcript.length === 0}
            onClick={() => downloadTranscript(record, transcript)}
            className="min-h-[44px] gap-2 px-3 text-[13px]"
          >
            <Download data-icon="inline-start" />
            <span className="max-sm:sr-only">Unduh transkrip</span>
          </Button>
          <Button
            type="button"
            onClick={onPracticeAgain}
            className="min-h-[44px] px-4 text-[13px] font-semibold"
          >
            Latihan lagi
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          aria-labelledby="telefun-transcript-title"
          className="flex min-w-0 flex-col border-border bg-background lg:order-first lg:flex-[1_1_55%] lg:overflow-y-auto lg:border-r"
        >
          <div className="flex flex-col gap-3 border-b border-border bg-surface-elevated p-4 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="telefun-transcript-title" className={sectionTitle}>
                <span className="sr-only">Rekaman dan transkrip: </span>
                {record.scenarioTitle}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {[
                  record.consumerName,
                  participant,
                  formatCallDuration(record.duration),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <TelefunCallPlayer
              ref={playerRef}
              source={recording.source}
              onRetry={recording.retry}
              fallbackDurationMs={record.duration * 1000}
              holds={holds}
              notes={notes}
              downloadName={`Telefun_${record.consumerName || "rekaman"}_${record.id}.webm`}
              onTimeChange={setCurrentMs}
            />
          </div>

          {transcript.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground sm:px-6">
              Transkrip belum tersedia untuk panggilan ini.
            </p>
          ) : (
            <ol className="flex flex-col gap-1 p-4 sm:px-6">
              {transcript.map((entry, index) => {
                const clock = formatClock(entry.startMs);
                const isAgent = entry.speaker === "agent";
                const nextStart =
                  transcript[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
                const holdsAfter = holds.filter(
                  (hold) =>
                    hold.startedAtMs >= entry.startMs &&
                    hold.startedAtMs < nextStart,
                );
                return (
                  <Fragment key={`${entry.startMs}-${index}`}>
                    <li
                      ref={(element) => {
                        if (element)
                          lineRefs.current.set(entry.startMs, element);
                        else lineRefs.current.delete(entry.startMs);
                      }}
                      tabIndex={-1}
                      data-testid={`telefun-line-${clock}`}
                      data-highlighted={highlighted === entry.startMs}
                      className={cn(
                        "grid grid-cols-[3.25rem_4.5rem_minmax(0,1fr)] items-start gap-2 rounded-lg px-2 py-1.5 text-sm outline-none",
                        nowStartMs === entry.startMs && "bg-module-telefun/10",
                        highlighted === entry.startMs &&
                          "outline-2 outline-offset-0 outline-foreground",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => playFrom(entry.startMs)}
                        aria-label={`Putar dari ${clock}`}
                        className="-my-1.5 min-h-[44px] rounded-md text-left font-mono text-xs font-medium text-module-telefun tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {clock}
                      </button>
                      <span className="pt-px text-xs text-muted-foreground">
                        {isAgent ? "Agen" : "Konsumen"}
                      </span>
                      <span
                        className={cn(
                          "leading-6",
                          isAgent ? "text-foreground" : "text-fg2",
                        )}
                      >
                        {isAgent
                          ? withFillerMarks(entry.text, fillerPattern)
                          : entry.text}
                      </span>
                    </li>
                    {holdsAfter.map((hold) => (
                      <li
                        key={`hold-${hold.sequence}`}
                        className="mx-2 rounded-lg border border-dashed border-chart-orange px-3 py-1.5 text-xs text-fg2"
                      >
                        Hold {formatClock(hold.startedAtMs)} –{" "}
                        {formatClock(hold.endedAtMs)} ·{" "}
                        {Math.round(hold.durationMs / 1000)} detik ·{" "}
                        {hold.exceededByMs > 0
                          ? `lewat ${Math.round(hold.exceededByMs / 1000)} detik dari batas`
                          : "dalam batas"}
                      </li>
                    ))}
                  </Fragment>
                );
              })}
            </ol>
          )}
        </section>

        <section
          aria-labelledby="telefun-result-title"
          className="order-first flex min-w-0 flex-col gap-6 bg-surface-elevated p-4 sm:p-6 lg:order-last lg:flex-[1_1_45%] lg:overflow-y-auto"
        >
          <h2 id="telefun-result-title" className="sr-only">
            Hasil telaah
          </h2>
          {state === "scored" && assessment ? (
            <ReviewResult
              record={record}
              assessment={assessment}
              previous={previousScore(record, history)}
              transcript={transcript}
              tab={tab}
              onTabChange={setTab}
              onShowLine={showLine}
              notes={
                <Suspense
                  fallback={
                    <p className="text-[13px] text-muted-foreground">
                      Memuat catatan…
                    </p>
                  }
                >
                  <ReplayAnnotator
                    sessionId={record.id}
                    annotations={annotationItems}
                    recommendations={recommendations}
                    isLoading={annotations.loading || summary.loading}
                    error={
                      annotations.error || summary.error
                        ? "Catatan belum bisa dimuat."
                        : undefined
                    }
                    onRetry={() => {
                      void annotations.refetch();
                      void summary.refetch();
                    }}
                    onAddAnnotation={addAnnotation}
                    onDeleteAnnotation={deleteAnnotation}
                    sessionDurationMs={record.duration * 1000}
                  />
                </Suspense>
              }
            />
          ) : state === "scored" ? (
            <ScoreOnly record={record} />
          ) : (
            <TelefunReviewStatus
              record={record}
              state={state}
              analyzing={analyzing}
              checking={checking}
              onAnalyze={() => void analyze()}
              onCheckStatus={() => void checkStatus()}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/** Sesi lama yang punya skor tetapi tanpa rincian penilaian. */
function ScoreOnly({ record }: { record: CallRecord }) {
  const score = readTelefunScore(record) ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <ScoreBlock score={score} change={null} />
      <p className="max-w-[60ch] text-[15px] leading-6 text-fg2">
        Rincian per aspek tidak tersimpan untuk panggilan lama ini.
      </p>
      {record.feedback && (
        <p className="max-w-[65ch] text-[15px] leading-6 whitespace-pre-wrap text-fg2">
          {record.feedback}
        </p>
      )}
    </div>
  );
}

function ScoreBlock({
  score,
  change,
}: {
  score: number;
  change: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border pb-5">
      <div className="flex flex-col">
        <span className="text-[13px] text-muted-foreground">Skor suara</span>
        <span className="flex items-baseline gap-1.5">
          <span
            data-testid="telefun-voice-score"
            className="font-mono text-5xl leading-none font-extrabold tracking-[-0.04em] text-foreground tabular-nums"
          >
            {formatTelefunScore(score)}
          </span>
          <span className="font-mono text-lg font-medium text-muted-foreground">
            / 10
          </span>
        </span>
      </div>
      <p className="flex flex-col pb-1">
        <strong className="font-semibold text-foreground">
          {telefunScoreVerdict(score)}
        </strong>
        {change && (
          <span className="text-[13px] text-muted-foreground">{change}</span>
        )}
      </p>
    </div>
  );
}

function ReviewResult({
  record,
  assessment,
  previous,
  transcript,
  tab,
  onTabChange,
  onShowLine,
  notes,
}: {
  record: CallRecord;
  assessment: VoiceQualityAssessment;
  previous: number | null;
  transcript: readonly TelefunTranscriptEntry[];
  tab: string;
  onTabChange: (tab: string) => void;
  onShowLine: (startMs: number) => void;
  notes: ReactNode;
}) {
  const score = readTelefunScore(record) ?? assessment.overallScore;
  const aspects = readTelefunAspects(assessment);
  const profile = getCommunicationProfileFromAssessment(assessment);
  const scored = aspects.filter(
    (aspect): aspect is TelefunAspect & { score: number } =>
      aspect.score !== null,
  );
  const toFix = scored
    .filter((aspect) => aspect.score < TELEFUN_FIX_THRESHOLD)
    .sort((a, b) => a.score - b.score);
  const good = scored.filter((aspect) => aspect.score >= TELEFUN_FIX_THRESHOLD);
  const fillerLine = firstFillerLine(
    transcript,
    assessment.fillerWords.examples,
  );
  const metricOf = (aspect: TelefunAspect) => {
    const key = PROFILE_KEY[aspect.key];
    return key
      ? profile?.metrics.find((metric) => metric.key === key)
      : undefined;
  };
  const nextSteps = assessment.overallNextSteps ?? [];

  return (
    <>
      <ScoreBlock score={score} change={scoreChange(score, previous)} />

      <ul aria-label="Skor per aspek" className="flex flex-col gap-3">
        {aspects.map((aspect) => (
          <li
            key={aspect.key}
            className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.5rem] items-center gap-x-3 gap-y-0.5 text-[13px]"
          >
            <span className="text-fg2">{aspect.label}</span>
            <span
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              {aspect.score !== null && (
                <span
                  className={cn(
                    "block h-full rounded-full",
                    barColor(aspect.score),
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(100, aspect.score * 10))}%`,
                  }}
                />
              )}
            </span>
            <span className="text-right font-mono font-bold text-foreground tabular-nums">
              {aspect.score !== null ? formatTelefunScore(aspect.score) : "–"}
            </span>
            {aspect.raw && (
              <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
                {aspect.raw}
              </span>
            )}
          </li>
        ))}
      </ul>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") onTabChange(value);
        }}
        className="gap-4"
      >
        <TabsList
          variant="line"
          aria-label="Rincian telaah"
          className="relative w-full justify-start overflow-x-auto border-b border-border"
        >
          <TabsTrigger
            value="fix"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Perbaiki dulu ({toFix.length})
          </TabsTrigger>
          <TabsTrigger
            value="good"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Sudah baik ({good.length})
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Catatan trainer
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="min-h-[44px] shrink-0 flex-none px-3 text-[13px]"
          >
            Profil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fix" className="flex flex-col gap-3">
          {toFix.length === 0 ? (
            <Empty>
              Tidak ada aspek dengan skor di bawah{" "}
              {formatTelefunScore(TELEFUN_FIX_THRESHOLD)}.
            </Empty>
          ) : (
            <ol className="flex flex-col gap-3">
              {toFix.map((aspect) => {
                const metric = metricOf(aspect);
                const line = aspect.key === "fillerWords" ? fillerLine : null;
                const tip =
                  metric?.improvementTip ??
                  metric?.drill ??
                  (aspect.key === "holdManagement"
                    ? assessment.holdManagement?.drill
                    : undefined);
                return (
                  <li
                    key={aspect.key}
                    className="flex flex-col gap-1.5 rounded-xl border border-border bg-background px-4 py-3"
                  >
                    {line ? (
                      <button
                        type="button"
                        onClick={() => onShowLine(line.startMs)}
                        className="-my-2 min-h-[44px] self-start text-left font-mono text-xs font-medium text-module-telefun hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {formatClock(line.startMs)} · {aspect.label}
                      </button>
                    ) : (
                      <span className="font-mono text-xs font-medium text-module-telefun">
                        {aspect.label}
                      </span>
                    )}
                    <p className="text-sm text-foreground">{aspect.feedback}</p>
                    {tip && (
                      <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-6 text-foreground">
                        <span className="font-semibold">Latihan: </span>
                        {tip}
                      </p>
                    )}
                    {metric?.examplePhrase && (
                      <p className="text-[13px] leading-6 text-fg2">
                        Contoh: “{metric.examplePhrase}”
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {nextSteps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Langkah latihan berikutnya
              </h4>
              <PlainList items={nextSteps.slice(0, 3)} ordered />
            </div>
          )}
        </TabsContent>

        <TabsContent value="good" className="flex flex-col gap-3">
          {good.map((aspect) => (
            <article
              key={aspect.key}
              className="flex flex-col gap-1 rounded-xl border border-border bg-background px-4 py-3"
            >
              <h4 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
                {aspect.label}
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  {formatTelefunScore(aspect.score)} · {aspect.verdict}
                </span>
              </h4>
              <p className="text-[13px] leading-6 text-fg2">
                {aspect.feedback}
              </p>
            </article>
          ))}
          {assessment.strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Kekuatan
              </h4>
              <PlainList items={assessment.strengths} />
            </div>
          )}
          {good.length === 0 && assessment.strengths.length === 0 && (
            <Empty>
              Belum ada aspek dengan skor{" "}
              {formatTelefunScore(TELEFUN_FIX_THRESHOLD)} ke atas.
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="notes">{notes}</TabsContent>

        <TabsContent value="profile" className="flex flex-col gap-3">
          {profile ? (
            <>
              <p className="max-w-[65ch] text-[13px] leading-6 text-fg2">
                {profile.overallSummary}
              </p>
              <Suspense
                fallback={
                  <p className="text-[13px] text-muted-foreground">
                    Memuat diagram…
                  </p>
                }
              >
                <VoiceRadarChart profile={profile} compact />
              </Suspense>
            </>
          ) : (
            <Empty>Profil komunikasi belum tersedia untuk panggilan ini.</Empty>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function PlainList({
  items,
  ordered = false,
}: {
  items: readonly string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List
      className={cn(
        "flex flex-col gap-1.5 pl-5 text-[13px] leading-6 text-fg2 marker:text-muted-foreground",
        ordered ? "list-decimal" : "list-disc",
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </List>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}
