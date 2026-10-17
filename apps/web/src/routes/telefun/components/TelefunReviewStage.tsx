import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Download } from "lucide-react";
import type {
  TelefunCoachingSummary,
  TelefunReplayAnnotation,
  TelefunTranscriptEntry,
} from "@trainers/types";
import { cn } from "cn";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { withQuoteMarks } from "../../../components/simulation/quoteMarks";
import { Button } from "../../../components/ui/button";
import { useApi } from "../../../hooks/useApi";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { notify } from "../../../lib/toast";
import { parseTelefunScoreResult } from "../../../lib/voiceAssessmentUtils";
import { useRecordingAnalysis } from "../hooks/useRecordingAnalysis";
import { useTelefunRecordingUrl } from "../hooks/useTelefunRecordingUrl";
import type { CallRecord } from "../types";
import { isTelefunRecordScored } from "../types";
import {
  annotationItemId,
  buildTelefunQuoteMarks,
  contentItemId,
} from "../utils/contentMarks";
import { buildFillerPattern, withFillerMarks } from "../utils/fillerMarks";
import { windowsInRecording } from "../utils/recordingAudio";
import {
  formatCallDuration,
  formatClock,
  holdIntervals,
  readTelefunScore,
  sortTelefunNewestFirst,
  telefunAnalysisState,
} from "../utils/reviewDisplay";
import type {
  CoachingRecommendationItem,
  ReplayAnnotationItem,
} from "./ReplayAnnotator";
import {
  TelefunCallPlayer,
  type TelefunCallPlayerHandle,
} from "./TelefunCallPlayer";
import { ReviewResult, ScoreOnly } from "./TelefunReviewResult";
import { TelefunReviewStatus } from "./TelefunReviewStatus";
import { TelefunStageNav } from "./TelefunStageNav";

const ReplayAnnotator = lazy(() =>
  import("./ReplayAnnotator").then((module) => ({
    default: module.ReplayAnnotator,
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
  clockOf: (startMs: number) => string,
) {
  const lines = transcript.map(
    (entry) =>
      `${clockOf(entry.startMs)}  ${entry.speaker === "agent" ? "Agen" : "Konsumen"}: ${entry.text}`,
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
  // Butir panel hasil yang ditunjuk dari penanda di transkrip/garis waktu.
  const [pointed, setPointed] = useState<{ id: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunStartedAt, setRerunStartedAt] = useState<number | null>(null);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(
    null,
  );
  const [rerunFailed, setRerunFailed] = useState(false);
  // Dialog di atas lapisan `fixed z-[100]` harus dirender di dalamnya.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  // Ada pertanyaan konsumen: tab itu dibuka lebih dulu.
  const [tab, setTab] = useState(() =>
    record.voiceAssessment?.contentReview?.consumerPoints.length
      ? "questions"
      : "fix",
  );
  const recording = useTelefunRecordingUrl(record);
  const state = telefunAnalysisState(record);
  const transcript = useMemo(
    () => record.transcript ?? [],
    [record.transcript],
  );
  // Waktu baris tercatat saat transkrip tiba (sesudah orangnya bicara);
  // awal ucapan dibaca dari rekaman bila bisa.
  const { analysis, onsets } = useRecordingAnalysis(
    record,
    recording.source,
    transcript,
  );
  const lineStart = useCallback(
    (startMs: number) => onsets.get(startMs) ?? startMs,
    [onsets],
  );
  const clockOf = useCallback(
    (startMs: number) => formatClock(lineStart(startMs)),
    [lineStart],
  );
  const holds = holdIntervals(record);
  // Jam hold digeser ke jam rekaman, sama untuk pemutar dan label transkrip.
  const [recordingMs, setRecordingMs] = useState(0);
  const sessionDurationMs = record.sessionMetrics?.sessionDurationMs;
  const holdWindows = useMemo(
    () => windowsInRecording(holds, recordingMs, sessionDurationMs),
    [holds, recordingMs, sessionDurationMs],
  );
  const assessment = state === "scored" ? record.voiceAssessment : null;
  const fillerPattern = useMemo(
    () => buildFillerPattern(assessment?.fillerWords.examples ?? []),
    [assessment],
  );
  const pointTo = useCallback(
    (tabValue: string, id: string) => {
      setTab(tabValue);
      setPointed({ id });
    },
    [setTab],
  );
  const quoteMarks = useMemo(
    () =>
      buildTelefunQuoteMarks(assessment?.contentReview, (target) =>
        pointTo(target.tab, contentItemId(target)),
      ),
    [assessment, pointTo],
  );

  // Butir yang ditunjuk baru ada setelah tabnya terbuka.
  useEffect(() => {
    if (!pointed) return;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(pointed.id);
      if (!element) return;
      element.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      element.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pointed, tab]);

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
    element.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    element.focus({ preventScroll: true });
  }, []);

  const playFrom = (startMs: number) => {
    setHighlighted(null);
    playerRef.current?.playFrom(lineStart(startMs));
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
    setAnalyzeStartedAt(Date.now());
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
      setAnalyzeStartedAt(null);
    }
  };

  const rerun = async () => {
    setRerunStartedAt(Date.now());
    setRerunFailed(false);
    try {
      const response = await unwrapResponse(
        await telefunClient.score[":id"].rerun.$post({
          param: { id: record.id },
        }),
      );
      const result = parseTelefunScoreResult(response);
      if (result) {
        onRecordChange({
          ...record,
          score: result.score,
          feedback: result.feedback,
          voiceAssessment: result.assessment,
          scoringStatus: "completed",
        });
      }
      // Hasil sudah tersimpan di server; baris server dipakai bila sudah dinilai.
      const fresh = await fetchDetail(record.id).catch(() => null);
      if (fresh && isTelefunRecordScored(fresh)) onRecordChange(fresh);
    } catch {
      setRerunFailed(true);
    } finally {
      setRerunStartedAt(null);
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
      ? (transcript
          .filter((entry) => lineStart(entry.startMs) <= currentMs)
          .at(-1)?.startMs ?? null)
      : null;
  const participant =
    record.simulationSubject?.type === "participant"
      ? formatSimulationSubjectLabel(record.simulationSubject, {
          includeParticipantDetails: false,
        })
      : null;

  return (
    <div
      ref={setLayer}
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
            onClick={() => downloadTranscript(record, transcript, clockOf)}
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
              analysis={analysis}
              onRetry={recording.retry}
              fallbackDurationMs={record.duration * 1000}
              holdWindows={holdWindows}
              onDurationChange={setRecordingMs}
              notes={notes}
              downloadName={`Telefun_${record.consumerName || "rekaman"}_${record.id}.webm`}
              onTimeChange={setCurrentMs}
              onSelectNote={(id) => pointTo("notes", annotationItemId(id))}
            />
          </div>

          {transcript.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground sm:px-6">
              Transkrip belum tersedia untuk panggilan ini.
            </p>
          ) : (
            <ol className="flex flex-col gap-1 p-4 sm:px-6">
              {transcript.map((entry, index) => {
                const clock = clockOf(entry.startMs);
                const isAgent = entry.speaker === "agent";
                const nextStart =
                  transcript[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
                // Penempatan di antara baris memakai jam sesi (sama dengan
                // `startMs`); labelnya jam rekaman, sama dengan pemutar.
                const holdsAfter = holds.flatMap((hold, holdIndex) =>
                  hold.startedAtMs >= entry.startMs &&
                  hold.startedAtMs < nextStart
                    ? [{ hold, window: holdWindows[holdIndex] }]
                    : [],
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
                      data-testid={`telefun-line-${formatClock(entry.startMs)}`}
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
                        {withQuoteMarks(
                          entry.text,
                          quoteMarks.get(entry.startMs) ?? [],
                          isAgent
                            ? (part) => withFillerMarks(part, fillerPattern)
                            : undefined,
                        )}
                      </span>
                    </li>
                    {holdsAfter.map(({ hold, window }) => (
                      <li
                        key={`hold-${hold.sequence}`}
                        className="mx-2 rounded-lg border border-dashed border-chart-orange px-3 py-1.5 text-xs text-fg2"
                      >
                        Hold {formatClock(window.startMs)} –{" "}
                        {formatClock(window.endMs)} ·{" "}
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
              highlightedId={pointed?.id ?? null}
              clockOf={clockOf}
              rerunStartedAt={rerunStartedAt}
              rerunFailed={rerunFailed}
              onRerun={() => setRerunOpen(true)}
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
                    highlightedId={pointed?.id ?? null}
                    onPlayFrom={(ms) => playerRef.current?.playFrom(ms)}
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
              analyzeStartedAt={analyzeStartedAt}
              checking={checking}
              onAnalyze={() => void analyze()}
              onCheckStatus={() => void checkStatus()}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={rerunOpen}
        title="Telaah ulang panggilan ini?"
        description="AI menilai suara dan isi panggilan ini sekali lagi, lalu hasil sekarang diganti dengan yang baru. Bila telaah ulang gagal, hasil sekarang tetap dipakai."
        confirmLabel="Telaah ulang"
        confirmVariant="default"
        container={layer}
        onCancel={() => setRerunOpen(false)}
        onConfirm={() => {
          setRerunOpen(false);
          void rerun();
        }}
      />
    </div>
  );
}
