import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  X,
  Phone,
  Calendar,
  Clock,
  Star,
  MessageSquare,
  Download,
  User,
  Mic2,
} from "lucide-react";
import type { CallRecord } from "../types";
import { getTelefunScoringStatusLabel, isTelefunRecordScored } from "../types";
import type {
  VoiceQualityAssessment,
  TelefunCoachingSummary,
  TelefunReplayAnnotation,
} from "@trainers/types";
import { VoiceAssessmentSection } from "./VoiceAssessmentSection";
import type {
  ReplayAnnotationItem,
  CoachingRecommendationItem,
} from "./ReplayAnnotator";
import { useApi } from "../../../hooks/useApi";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";

const ReplayAnnotator = lazy(() =>
  import("./ReplayAnnotator").then((module) => ({
    default: module.ReplayAnnotator,
  })),
);

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CallRecord | null;
  onAssessmentComplete?: (
    sessionId: string,
    assessment: VoiceQualityAssessment,
  ) => void;
  /**
   * Requested once per open when the record is not scored yet, so the parent
   * can run one authoritative detail refetch (session reconciler).
   */
  onRequestScoringRefresh?: (sessionId: string) => void;
}

export type ReviewModalTab = "details" | "assessment" | "replay";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDateLabel(dateValue: string): string {
  return new Date(dateValue).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatExecutorLabel(record: CallRecord): string {
  return record.userEmail || record.userId || "Akun pemilik sesi";
}

function mapAnnotation(
  annotation: TelefunReplayAnnotation,
): ReplayAnnotationItem {
  return {
    id: annotation.id,
    timestampMs: annotation.timestamp_ms,
    category: annotation.category,
    moment: annotation.moment,
    text: annotation.text,
    isManual: annotation.is_manual,
    createdBy: annotation.user_id,
  };
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  record,
  onAssessmentComplete,
  onRequestScoringRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<ReviewModalTab>("details");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<VoiceQualityAssessment | null>(
    record?.voiceAssessment ?? null,
  );
  const [retryTrigger, setRetryTrigger] = useState(0);
  const requestedScoringRefreshRef = useRef<string | null>(null);
  const onRequestScoringRefreshRef = useRef(onRequestScoringRefresh);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const shouldReduceMotion = useReducedMotion();
  const recordId = record?.id;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !recordId) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const getFocusableElements = () => {
      if (!dialogRef.current) return [] as HTMLElement[];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        event.shiftKey &&
        (!active || active === first || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (!active || active === last || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen, recordId]);

  useEffect(() => {
    onRequestScoringRefreshRef.current = onRequestScoringRefresh;
  });

  const summaryPath =
    isOpen && record && activeTab === "replay"
      ? `/telefun/coaching-summary/${record.id}`
      : null;
  const annotationsPath =
    isOpen && record && activeTab === "replay"
      ? `/telefun/annotations/${record.id}`
      : null;

  const {
    data: coachingSummary,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useApi<TelefunCoachingSummary>(summaryPath);

  const {
    data: annotationRows,
    loading: annotationsLoading,
    error: annotationsError,
    refetch: refetchAnnotations,
  } = useApi<TelefunReplayAnnotation[]>(annotationsPath);

  useEffect(() => {
    if (!isOpen || !record) {
      setRecordingUrl(null);
      setRecordingError(null);
      setRecordingLoading(false);
      requestedScoringRefreshRef.current = null;
      return;
    }

    // Only reset activeTab to details when opening, not on retry Trigger
    if (retryTrigger === 0) {
      setActiveTab("details");
    }
    setAssessment(record.voiceAssessment ?? null);
    setRecordingError(null);
    setRecordingLoading(false);

    // Reopening an unscored session triggers one authoritative refetch.
    if (
      !isTelefunRecordScored(record) &&
      requestedScoringRefreshRef.current !== record.id
    ) {
      requestedScoringRefreshRef.current = record.id;
      onRequestScoringRefreshRef.current?.(record.id);
    }

    const hasPersistentRecording = Boolean(
      record.recordingPath || record.agentRecordingPath,
    );

    if (record.url && !hasPersistentRecording && retryTrigger === 0) {
      setRecordingUrl(record.url);
      return;
    }

    let cancelled = false;

    const loadRecordingUrl = async () => {
      setRecordingLoading(true);
      try {
        const json = await unwrapResponse(
          await telefunClient.recording[":id"].$get({
            param: { id: record.id },
          }),
        );

        if (cancelled) return;

        if ((json as any)?.url) {
          setRecordingUrl((json as any).url);
        } else {
          setRecordingUrl(null);
          setRecordingError("Tautan rekaman belum tersedia.");
        }
      } catch (error) {
        if (!cancelled) {
          setRecordingUrl(null);
          setRecordingError(
            error instanceof Error
              ? error.message
              : "Gagal memuat tautan rekaman.",
          );
        }
      } finally {
        if (!cancelled) {
          setRecordingLoading(false);
        }
      }
    };

    loadRecordingUrl();

    return () => {
      cancelled = true;
    };
  }, [isOpen, record, retryTrigger]);

  const mappedAnnotations = useMemo(
    () => (annotationRows || []).map(mapAnnotation),
    [annotationRows],
  );

  const recommendations: CoachingRecommendationItem[] = useMemo(
    () =>
      (coachingSummary?.recommendations ?? []).map((rec) => ({
        text: rec.text,
        priority: rec.priority,
      })),
    [coachingSummary],
  );

  const handleAssessmentUpdate = useCallback(
    (nextAssessment: VoiceQualityAssessment) => {
      setAssessment(nextAssessment);
      if (record) {
        onAssessmentComplete?.(record.id, nextAssessment);
      }
    },
    [onAssessmentComplete, record],
  );

  const handleAddAnnotation = useCallback(
    async (
      annotation: Omit<ReplayAnnotationItem, "id" | "isManual" | "createdBy">,
    ) => {
      if (!record) return;

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

        await refetchAnnotations();
        await refetchSummary();
        notify.success("Anotasi berhasil disimpan");
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : "Gagal menyimpan anotasi.",
        );
      }
    },
    [record, refetchAnnotations, refetchSummary],
  );

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      try {
        await unwrapResponse(
          await telefunClient.annotations[":annotationId"].$delete({
            param: { annotationId },
          }),
        );
        await refetchAnnotations();
        notify.success("Anotasi berhasil dihapus");
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : "Gagal menghapus anotasi.",
        );
      }
    },
    [refetchAnnotations],
  );

  const downloadRecording = () => {
    if (!recordingUrl) return;
    const link = document.createElement("a");
    link.href = recordingUrl;
    link.download = `Telefun_${record?.consumerName || "session"}_${record?.id || "recording"}.webm`;
    link.click();
  };

  if (!isOpen || !record) return null;

  return (
    <AnimatePresence>
      {isOpen && record && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onCloseRef.current();
            }}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="telefun-review-title"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="relative w-full max-w-2xl bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] max-h-dvh"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-b border-border shrink-0 bg-foreground/[0.02]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <Phone
                    className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2
                    id="telefun-review-title"
                    className="text-xl font-bold tracking-tight text-foreground leading-tight"
                  >
                    {record.scenarioTitle}
                  </h2>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                    Detail Sesi
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => onCloseRef.current()}
                className="min-h-11 min-w-11 p-2 hover:bg-foreground/5 rounded-full transition-colors border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Tutup detail sesi"
              >
                <X
                  className="w-6 h-6 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Tab Navigation */}
            <div
              className="px-4 pt-4 sm:px-6 flex gap-6 border-b border-border bg-foreground/[0.01] overflow-x-auto scrollbar-hide shrink-0"
              role="tablist"
              aria-label="Bagian detail sesi"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "details"}
                aria-controls="telefun-review-panel-details"
                onClick={() => setActiveTab("details")}
                className={`min-h-11 pb-3 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-sm font-bold tracking-tight transition-all relative whitespace-nowrap shrink-0 ${activeTab === "details" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"}`}
              >
                Detail Sesi
                {activeTab === "details" && (
                  <motion.div
                    layoutId={shouldReduceMotion ? undefined : "tab-underline"}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-full"
                  />
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "assessment"}
                aria-controls="telefun-review-panel-assessment"
                onClick={() => setActiveTab("assessment")}
                className={`min-h-11 pb-3 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-sm font-bold tracking-tight transition-all relative whitespace-nowrap shrink-0 ${activeTab === "assessment" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"}`}
              >
                Kualitas Suara Agen
                {activeTab === "assessment" && (
                  <motion.div
                    layoutId={shouldReduceMotion ? undefined : "tab-underline"}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-full"
                  />
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "replay"}
                aria-controls="telefun-review-panel-replay"
                onClick={() => setActiveTab("replay")}
                className={`min-h-11 pb-3 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary text-sm font-bold tracking-tight transition-all relative whitespace-nowrap shrink-0 ${activeTab === "replay" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"}`}
              >
                Anotasi Replay
                {activeTab === "replay" && (
                  <motion.div
                    layoutId={shouldReduceMotion ? undefined : "tab-underline"}
                    className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-full"
                  />
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              <AnimatePresence mode="wait">
                {activeTab === "details" && (
                  <motion.div
                    id="telefun-review-panel-details"
                    role="tabpanel"
                    aria-label="Detail sesi"
                    key="details"
                    initial={
                      shouldReduceMotion ? undefined : { opacity: 0, x: -10 }
                    }
                    animate={
                      shouldReduceMotion ? undefined : { opacity: 1, x: 0 }
                    }
                    exit={
                      shouldReduceMotion ? undefined : { opacity: 0, x: 10 }
                    }
                    transition={
                      shouldReduceMotion ? { duration: 0 } : undefined
                    }
                    className="space-y-6"
                  >
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Konsumen
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {record.consumerName}
                        </p>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Target simulasi
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {formatSimulationSubjectLabel(record.simulationSubject)}
                        </p>
                        {record.simulationSubject?.type === "participant" &&
                          (record.simulationSubject.batchName ||
                            record.simulationSubject.team) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[
                                record.simulationSubject.batchName &&
                                  `Batch: ${record.simulationSubject.batchName}`,
                                record.simulationSubject.team &&
                                  `Tim: ${record.simulationSubject.team}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Pelaksana
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {formatExecutorLabel(record)}
                        </p>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Tanggal
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {formatDateLabel(record.date)}
                        </p>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Durasi
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {formatDuration(record.duration)}
                          {record.configuredDuration ? (
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              / limit {record.configuredDuration}m
                            </span>
                          ) : (
                            ""
                          )}
                        </p>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Skor
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">
                          {isTelefunRecordScored(record)
                            ? `${record.score}/10`
                            : (getTelefunScoringStatusLabel(record)?.text ??
                              "—")}
                        </p>
                      </div>
                    </div>

                    {/* Feedback */}
                    {record.feedback && (
                      <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Feedback
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                          {record.feedback}
                        </p>
                      </div>
                    )}

                    {/* Recording */}
                    <div className="bg-foreground/[0.02] border border-border rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Mic2 className="w-4 h-4 text-emerald-600/60 dark:text-emerald-400/60" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Rekaman Sesi
                          </span>
                        </div>
                        {recordingLoading && (
                          <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin motion-reduce:animate-none" />
                        )}
                      </div>

                      {recordingUrl ? (
                        <div className="space-y-4">
                          <audio
                            controls
                            className="w-full h-10"
                            src={recordingUrl}
                            onError={() => {
                              console.warn(
                                "Audio element failed to load recording. Attempting to refresh signed URL.",
                              );
                              setRetryTrigger((prev) => prev + 1);
                            }}
                          >
                            Browser Anda tidak mendukung pemutaran audio.
                          </audio>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={downloadRecording}
                              className="inline-flex min-h-11 items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-xl border border-emerald-500/10 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <Download
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              Unduh Rekaman
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center border border-dashed border-border rounded-xl">
                          <p className="text-xs text-muted-foreground">
                            {recordingError ||
                              "Rekaman tidak tersedia atau telah dihapus."}
                          </p>
                          {recordingError && (
                            <button
                              type="button"
                              onClick={() => {
                                setRecordingError(null);
                                setRetryTrigger((prev) => prev + 1);
                              }}
                              className="mt-2 min-h-11 px-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              Coba Lagi
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === "assessment" && (
                  <motion.div
                    id="telefun-review-panel-assessment"
                    role="tabpanel"
                    aria-label="Kualitas suara agen"
                    key="assessment"
                    initial={
                      shouldReduceMotion ? undefined : { opacity: 0, x: 10 }
                    }
                    animate={
                      shouldReduceMotion ? undefined : { opacity: 1, x: 0 }
                    }
                    exit={
                      shouldReduceMotion ? undefined : { opacity: 0, x: -10 }
                    }
                    transition={
                      shouldReduceMotion ? { duration: 0 } : undefined
                    }
                  >
                    <VoiceAssessmentSection
                      sessionId={record.id}
                      initialAssessment={assessment || undefined}
                      initialScoringStatus={record.scoringStatus ?? null}
                      hasAgentRecording={Boolean(record.agentRecordingPath)}
                      onAssessmentUpdate={handleAssessmentUpdate}
                      transcript={record.transcript}
                    />
                  </motion.div>
                )}

                {activeTab === "replay" && (
                  <motion.div
                    id="telefun-review-panel-replay"
                    role="tabpanel"
                    aria-label="Anotasi replay"
                    key="replay"
                    initial={
                      shouldReduceMotion ? undefined : { opacity: 0, x: 10 }
                    }
                    animate={
                      shouldReduceMotion ? undefined : { opacity: 1, x: 0 }
                    }
                    exit={
                      shouldReduceMotion ? undefined : { opacity: 0, x: -10 }
                    }
                    transition={
                      shouldReduceMotion ? { duration: 0 } : undefined
                    }
                  >
                    <Suspense
                      fallback={
                        <div className="text-sm text-muted-foreground">
                          Memuat anotasi replay...
                        </div>
                      }
                    >
                      <ReplayAnnotator
                        sessionId={record.id}
                        annotations={mappedAnnotations}
                        recommendations={recommendations}
                        isLoading={annotationsLoading || summaryLoading}
                        error={
                          annotationsError || summaryError
                            ? String(annotationsError || summaryError)
                            : undefined
                        }
                        onRetry={() => {
                          void refetchAnnotations();
                          void refetchSummary();
                        }}
                        onAddAnnotation={handleAddAnnotation}
                        onDeleteAnnotation={handleDeleteAnnotation}
                        sessionDurationMs={record.duration * 1000}
                      />
                    </Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
