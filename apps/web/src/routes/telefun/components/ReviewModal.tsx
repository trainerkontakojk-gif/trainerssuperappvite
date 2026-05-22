import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  BarChart3,
  FileText,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import type { CallRecord } from "../types";
import type {
  VoiceQualityAssessment,
  TelefunCoachingSummary,
  TelefunReplayAnnotation,
} from "@trainers/types";
import type { VoiceDashboardMetrics } from "../services/realisticMode/types";
import { VoiceAssessmentSection } from "./VoiceAssessmentSection";
import { VoiceEvaluationDashboard } from "./VoiceEvaluationDashboard";
import {
  ReplayAnnotator,
  type ReplayAnnotationItem,
  type CoachingRecommendationItem,
} from "./ReplayAnnotator";
import { useApi, postApi, deleteApi } from "../../../hooks/useApi";
import { notify } from "../../../lib/toast";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CallRecord | null;
  onAssessmentComplete?: (
    sessionId: string,
    assessment: VoiceQualityAssessment,
  ) => void;
}

export type ReviewModalTab =
  | "details"
  | "assessment"
  | "voice_dashboard"
  | "replay";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";

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
}) => {
  const [activeTab, setActiveTab] = useState<ReviewModalTab>("details");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<VoiceQualityAssessment | null>(
    record?.voiceAssessment ?? null,
  );
  const [voiceDashboardMetrics, setVoiceDashboardMetrics] =
    useState<VoiceDashboardMetrics | null>(
      record?.voiceDashboardMetrics
        ? (record.voiceDashboardMetrics as VoiceDashboardMetrics)
        : null,
    );

  const summaryPath =
    isOpen && record ? `/telefun/coaching-summary/${record.id}` : null;
  const annotationsPath =
    isOpen && record ? `/telefun/annotations/${record.id}` : null;

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
      return;
    }

    setActiveTab("details");
    setAssessment(record.voiceAssessment ?? null);
    setVoiceDashboardMetrics(
      record.voiceDashboardMetrics
        ? (record.voiceDashboardMetrics as VoiceDashboardMetrics)
        : null,
    );
    setRecordingError(null);
    setRecordingLoading(false);

    if (record.url) {
      setRecordingUrl(record.url);
      return;
    }

    let cancelled = false;

    const loadRecordingUrl = async () => {
      setRecordingLoading(true);
      try {
        const token =
          localStorage.getItem("auth_token") ??
          localStorage.getItem("supabase_token");
        const response = await fetch(
          `${API_BASE}/telefun/recording/${record.id}`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );
        const json = await response.json();

        if (cancelled) return;

        if (json?.success && json.url) {
          setRecordingUrl(json.url);
        } else {
          setRecordingUrl(null);
          setRecordingError(
            json?.error?.message || "Tautan rekaman belum tersedia.",
          );
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
  }, [isOpen, record]);

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

  const effectiveAssessment = assessment ?? record?.voiceAssessment ?? null;
  const effectiveVoiceMetrics =
    voiceDashboardMetrics ??
    (record?.voiceDashboardMetrics
      ? (record.voiceDashboardMetrics as VoiceDashboardMetrics)
      : null);
  const sessionDurationMs = (record?.duration ?? 0) * 1000;

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
        await postApi(`/telefun/annotations/${record.id}`, {
          timestamp_ms: annotation.timestampMs,
          category: annotation.category,
          moment: annotation.moment,
          text: annotation.text,
          is_manual: true,
        });

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
        await deleteApi(`/telefun/annotations/${annotationId}`);
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
      <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          className="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950 max-h-[92vh]"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-950/10 px-6 py-5 dark:border-white/10">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Phone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Review Telefun
                </h2>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/40">
                  {record.scenarioTitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-950/10 p-2 transition hover:bg-slate-950/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              <X className="h-5 w-5 text-slate-500 dark:text-white/55" />
            </button>
          </header>

          <div className="flex border-b border-slate-950/10 px-4 sm:px-6 dark:border-white/10 overflow-x-auto">
            {(
              [
                { id: "details", label: "Detail", icon: FileText },
                { id: "assessment", label: "Assessment", icon: Sparkles },
                {
                  id: "voice_dashboard",
                  label: "Dashboard Suara",
                  icon: BarChart3,
                },
                { id: "replay", label: "Replay", icon: MessageSquare },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-4 text-sm font-bold tracking-tight transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="telefun-review-tab"
                    className="absolute inset-x-4 bottom-0 h-1 rounded-t-full bg-emerald-500"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === "details" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Tanggal"
                    value={formatDateLabel(record.date)}
                    icon={Calendar}
                  />
                  <StatCard
                    label="Durasi"
                    value={formatDuration(record.duration)}
                    icon={Clock}
                  />
                  <StatCard
                    label="Skor"
                    value={
                      record.score != null
                        ? `${record.score}/100`
                        : "Belum dinilai"
                    }
                    icon={Star}
                  />
                  <StatCard
                    label="Mode"
                    value={
                      record.realisticModeEnabled ? "Realistic" : "Standar"
                    }
                    icon={Sparkles}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_0.9fr]">
                  <div className="rounded-3xl border border-slate-950/10 bg-slate-950/[0.02] p-5 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-4 flex items-center gap-2">
                      <User className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                        Ringkasan Sesi
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm text-slate-700 dark:text-white/75">
                      <p>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Konsumen:
                        </span>{" "}
                        {record.consumerName}
                      </p>
                      <p>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Durasi Limit:
                        </span>{" "}
                        {record.configuredDuration
                          ? `${record.configuredDuration} menit`
                          : "Tidak dibatasi"}
                      </p>
                      <p>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Scenario:
                        </span>{" "}
                        {record.scenarioTitle}
                      </p>
                      <p>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Recording:
                        </span>{" "}
                        {recordingLoading
                          ? "Memuat tautan..."
                          : recordingUrl
                            ? "Tersedia"
                            : recordingError || "Tidak tersedia"}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={downloadRecording}
                        disabled={!recordingUrl}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="h-4 w-4" />
                        Unduh Rekaman
                      </button>
                      {recordingError && (
                        <button
                          type="button"
                          onClick={() => setRecordingError(null)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-950/10 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-950/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Coba Lagi
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                        Catatan AI
                      </h3>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-white/75">
                        {record.feedback ||
                          "Belum ada feedback AI untuk sesi ini."}
                      </p>
                    </div>

                    <div className="rounded-3xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                        Status Data
                      </h3>
                      <ul className="space-y-2 text-sm text-slate-700 dark:text-white/75">
                        <li>
                          Assessment:{" "}
                          {effectiveAssessment ? "Ada" : "Belum ada"}
                        </li>
                        <li>
                          Dashboard suara:{" "}
                          {effectiveVoiceMetrics ? "Ada" : "Belum ada"}
                        </li>
                        <li>Anotasi replay: {mappedAnnotations.length}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {effectiveAssessment && (
                  <div className="rounded-3xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                    <div className="mb-4 flex items-center gap-2">
                      <Mic2 className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                        Snapshot Assessment
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <MiniMetric
                        label="Overall"
                        value={`${effectiveAssessment.overallScore}/10`}
                      />
                      <MiniMetric
                        label="Kecepatan"
                        value={`${effectiveAssessment.speakingRate.score}/10`}
                      />
                      <MiniMetric
                        label="Intonasi"
                        value={`${effectiveAssessment.intonation.score}/10`}
                      />
                      <MiniMetric
                        label="Artikulasi"
                        value={`${effectiveAssessment.articulation.score}/10`}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "assessment" && (
              <div className="space-y-4">
                <VoiceAssessmentSection
                  sessionId={record.id}
                  initialAssessment={effectiveAssessment}
                  hasAgentRecording={Boolean(
                    record.agentRecordingPath ||
                    record.recordingPath ||
                    recordingUrl,
                  )}
                  onAssessmentUpdate={handleAssessmentUpdate}
                />

                {effectiveAssessment && (
                  <div className="rounded-3xl border border-slate-950/10 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
                    <div className="mb-4 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
                        Ringkasan Cepat
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <MiniMetric
                        label="Overall"
                        value={`${effectiveAssessment.overallScore}/10`}
                      />
                      <MiniMetric
                        label="WPM"
                        value={`${effectiveAssessment.speakingRate.wordsPerMinute}`}
                      />
                      <MiniMetric
                        label="Intonasi"
                        value={effectiveAssessment.intonation.verdict}
                      />
                      <MiniMetric
                        label="Artikulasi"
                        value={effectiveAssessment.articulation.verdict}
                      />
                      <MiniMetric
                        label="Emosi"
                        value={effectiveAssessment.emotionalTone.dominant}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "voice_dashboard" && (
              <VoiceEvaluationDashboard
                sessionId={record.id}
                metrics={effectiveVoiceMetrics}
                isLoading={false}
                notice={
                  record.realisticModeEnabled
                    ? "Metrik suara belum tersedia pada sesi ini."
                    : "Realistic mode belum aktif pada sesi ini."
                }
                onRetry={() => {
                  setVoiceDashboardMetrics(
                    record.voiceDashboardMetrics
                      ? (record.voiceDashboardMetrics as VoiceDashboardMetrics)
                      : null,
                  );
                }}
              />
            )}

            {activeTab === "replay" && (
              <ReplayAnnotator
                sessionId={record.id}
                annotations={mappedAnnotations}
                recommendations={recommendations}
                isLoading={summaryLoading || annotationsLoading}
                error={summaryError || annotationsError || undefined}
                onRetry={() => {
                  void refetchSummary();
                  void refetchAnnotations();
                }}
                onAddAnnotation={handleAddAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                sessionDurationMs={sessionDurationMs}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-3xl border border-slate-950/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-lg bg-emerald-500/10 p-1.5">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">
          {label}
        </span>
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-950/5 bg-slate-950/[0.03] p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
