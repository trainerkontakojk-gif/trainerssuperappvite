import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { Phone, Settings, History, Play, BarChart3 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { TelefunAppSettings } from "./telefunSettings";
import {
  DEFAULT_TELEFUN_SETTINGS,
  resolveFinalIdentity,
  parseTelefunSettings,
} from "./telefunSettings";
import { SettingsModal } from "./components/SettingsModal";
import { PhoneInterface } from "./components/PhoneInterface";
import { HistoryModal } from "./components/HistoryModal";
import { UsageModal } from "../../components/UsageModal";
import { notify } from "../../lib/toast";
import type { CallRecord } from "./types";
import {
  canOverwriteTelefunLocalHistory,
  parseTelefunLocalHistory,
  shouldPersistTelefunLocalHistory,
} from "./telefunLocalHistory";
import ModuleWorkspaceIntro from "../../components/ModuleWorkspaceIntro";
import {
  saveTelefunSession,
  scoreTelefunSession,
  type SavedTelefunSession,
} from "./sessionFinalizer";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import {
  getTelefunSettings,
  saveTelefunSettings,
  getTelefunSessions,
  createTelefunSession,
  deleteTelefunSession,
  clearTelefunHistory,
  mapTelefunSessionRow,
  getTelefunWebRtcCapability,
} from "./telefunApi";
import {
  isAllowedTelefunWebRtc,
  OPENAI_WEBRTC_MODEL_ID,
  OPENAI_WEBRTC_TRANSPORT,
} from "./services/telefunWebRtcCapability";
import { buildTelefunLiveSystemInstruction } from "./services/promptBuilder";
import { createRetainedObjectUrlOwner } from "./services/openaiWebRtc/cleanup";
import {
  installTelefunRecordingReconciliation,
  reconcileTelefunRecordingQueue,
} from "./services/telefun-recording-reconciliation";

const accentClassName = "text-violet-600";
const accentSoftClassName = "bg-violet-100";

const ReviewModal = lazy(() =>
  import("./components/ReviewModal").then((m) => ({ default: m.ReviewModal })),
);

function TelefunReviewModalFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="rounded-xl border border-border/60 bg-background px-5 py-4 text-sm font-semibold text-muted-foreground shadow-xl">
        Memuat review...
      </div>
    </div>
  );
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

export default function TelefunLanding() {
  const [view, setView] = useState<"home" | "chat">("home");
  const [settings, setSettings] = useState<TelefunAppSettings>(
    DEFAULT_TELEFUN_SETTINGS,
  );
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [reviewRecord, setReviewRecord] = useState<CallRecord | null>(null);

  const [activeSessionConfig, setActiveSessionConfig] =
    useState<TelefunAppSettings | null>(null);
  const [activeAccessToken, setActiveAccessToken] = useState<string | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<{
    title: string;
    instruction: string;
  } | null>(null);
  const [history, setHistory] = useState<CallRecord[]>([]);

  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const sessionBaselineRef = useRef<UsageSnapshot | null>(null);
  const sessionRunIdRef = useRef(0);
  const startCallInFlightRef = useRef(false);
  const optimisticRecordIdRef = useRef<string | null>(null);
  const [retainedObjectUrlOwner] = useState(() =>
    createRetainedObjectUrlOwner(),
  );
  const pageMountedRef = useRef(true);
  const localHistoryIsCorruptRef = useRef(false);

  const releaseRetainedObjectUrl = useCallback(
    () => retainedObjectUrlOwner.release(),
    [retainedObjectUrlOwner],
  );

  const retainObjectUrl = useCallback(
    (url: string | null): boolean =>
      pageMountedRef.current && retainedObjectUrlOwner.retain(url),
    [retainedObjectUrlOwner],
  );

  const isObjectUrlRetained = useCallback(
    (url: string) => retainedObjectUrlOwner.isRetained(url),
    [retainedObjectUrlOwner],
  );

  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
      releaseRetainedObjectUrl();
    };
  }, [releaseRetainedObjectUrl]);

  useEffect(() => installTelefunRecordingReconciliation(), []);

  // Auto-sync reviewRecord when history updates
  useEffect(() => {
    if (reviewRecord) {
      const updated = history.find((r) => r.id === reviewRecord.id);
      if (updated && updated !== reviewRecord) {
        setReviewRecord(updated);
      }
    }
  }, [history, reviewRecord]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const data = await getTelefunSettings();
        if (cancelled) return;

        if (data) {
          setSettings(parseTelefunSettings(data));
        } else {
          setSettings(DEFAULT_TELEFUN_SETTINGS);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_TELEFUN_SETTINGS);
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
          void reconcileTelefunRecordingQueue();
        }
      }
    };

    const loadHistory = async () => {
      const savedHistory = localStorage.getItem("telefun_history");
      const { records: localRecords, isCorrupt: localHistoryIsCorrupt } =
        parseTelefunLocalHistory(savedHistory, notify.warning);
      localHistoryIsCorruptRef.current = localHistoryIsCorrupt;

      try {
        const rows = await getTelefunSessions();
        if (cancelled) return;

        const dbRecords = rows.map(mapTelefunSessionRow);
        const dbRecordIds = new Set(dbRecords.map((r) => r.id));

        const merged = [
          ...dbRecords,
          ...localRecords.filter((lr) => !dbRecordIds.has(lr.id)),
        ].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        setHistory(merged);
        if (shouldPersistTelefunLocalHistory(merged, localHistoryIsCorrupt)) {
          localStorage.setItem("telefun_history", JSON.stringify(merged));
        }
        void reconcileTelefunRecordingQueue();
      } catch {
        // ignore
      }
    };

    loadSettings();
    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSettings = async (newSettings: TelefunAppSettings) => {
    try {
      await saveTelefunSettings(newSettings);
      setSettings(newSettings);
      notify.success("Pengaturan Telefun berhasil disimpan");
    } catch (error) {
      notify.error("Gagal menyimpan pengaturan");
      throw error;
    }
  };

  const startCallOnce = async () => {
    const token = getToken();
    if (!token) {
      notify.error("Token tidak ditemukan. Silakan login terlebih dahulu.");
      return;
    }

    const activeScenarios = settings.scenarios.filter((s) => s.isActive);
    if (activeScenarios.length === 0) {
      notify.error("Pilih minimal satu skenario di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }

    const randomScenario =
      activeScenarios[Math.floor(Math.random() * activeScenarios.length)];
    setActiveScenario(randomScenario);

    const consumerType =
      settings.preferredConsumerTypeId === "random"
        ? settings.consumerTypes[
            Math.floor(Math.random() * settings.consumerTypes.length)
          ]
        : settings.consumerTypes.find(
            (ct) => ct.id === settings.preferredConsumerTypeId,
          ) || settings.consumerTypes[0];

    const identity = resolveFinalIdentity(
      settings.identitySettings,
      settings.telefunModelId,
    );
    const voiceName = identity.voiceName || settings.voiceName;

    const requestedTransport = settings.telefunTransport ?? "gemini-live";
    const requestsWebRtc = requestedTransport === OPENAI_WEBRTC_TRANSPORT;
    if (requestsWebRtc) {
      if (settings.telefunModelId !== OPENAI_WEBRTC_MODEL_ID) {
        notify.error("OpenAI WebRTC hanya tersedia untuk GPT Realtime 2.1.");
        setActiveScenario(null);
        return;
      }
      try {
        const capability = await getTelefunWebRtcCapability();
        if (!isAllowedTelefunWebRtc(capability)) {
          notify.error(
            "Transport OpenAI WebRTC belum tersedia untuk akun ini.",
          );
          setActiveScenario(null);
          return;
        }
      } catch {
        notify.error("Gagal memeriksa ketersediaan OpenAI WebRTC.");
        setActiveScenario(null);
        return;
      }
    }

    const sessionConfig: TelefunAppSettings = {
      ...settings,
      telefunModelId: requestsWebRtc
        ? OPENAI_WEBRTC_MODEL_ID
        : settings.telefunModelId,
      telefunTransport: requestedTransport,
      activeScenario: randomScenario,
      activeConsumerType: consumerType,
      scenarioTitle: randomScenario.title,
      consumerName: identity.name,
      consumerGender: identity.gender,
      voiceName,
      resolvedIdentity: identity,
    };

    const livePromptInstructions = requestsWebRtc
      ? buildTelefunLiveSystemInstruction({
          identity: sessionConfig.resolvedIdentity!,
          scenario: sessionConfig.activeScenario!,
          consumerType: sessionConfig.activeConsumerType!,
          responsePacingMode: sessionConfig.responsePacingMode,
          simulationChallengeTypes: sessionConfig.simulationChallengeTypes,
        })
      : undefined;

    const runId = ++sessionRunIdRef.current;
    setSessionDelta(null);
    sessionBaselineRef.current = null;

    fetchUsageSummary("telefun")
      .then((data) => {
        if (data && runId === sessionRunIdRef.current) {
          sessionBaselineRef.current = data;
        }
      })
      .catch(() => {});

    try {
      const res = await createTelefunSession({
        scenario_title: randomScenario.title,
        consumer_name: identity.name,
        consumer_gender: identity.gender,
        consumer_phone: identity.phone,
        consumer_city: identity.city,
        persona_config: {
          consumerType: consumerType?.name || consumerType?.id,
        },
        disruption_config: settings.simulationChallengeTypes,
        configured_duration: settings.maxCallDuration * 60,
        response_pacing_mode: settings.responsePacingMode,
        telefun_model_id: sessionConfig.telefunModelId,
        telefun_transport: sessionConfig.telefunTransport,
        ...(requestsWebRtc
          ? { live_prompt_instructions: livePromptInstructions }
          : {}),
      });
      if (res?.id) {
        setActiveSessionId(res.id);
        sessionConfig.sessionId = res.id;
      } else if (requestsWebRtc) {
        throw new Error("Sesi OpenAI WebRTC tidak berhasil dibuat.");
      }
    } catch (e) {
      if (requestsWebRtc) {
        notify.error(
          e instanceof Error ? e.message : "Gagal membuat sesi OpenAI WebRTC.",
        );
        setActiveScenario(null);
        return;
      }
      console.warn("Failed to create session upfront", e);
    }

    setActiveSessionConfig(sessionConfig);
    setActiveAccessToken(token);
    setView("chat");
  };

  const startCall = async () => {
    if (startCallInFlightRef.current) return;
    startCallInFlightRef.current = true;
    try {
      await startCallOnce();
    } finally {
      startCallInFlightRef.current = false;
    }
  };

  const handleEndCall = () => {
    // A timed-out callback may settle after navigation. Retire its URL so the
    // late callback cannot reclaim media that parent navigation abandoned.
    retainedObjectUrlOwner.releaseIfNotTransferredToReview();
    setView("home");
    setActiveSessionId(null);
    setActiveScenario(null);
    setActiveSessionConfig(null);
    setActiveAccessToken(null);
  };

  const handleRecordingReady = async (
    url: string | null,
    consumerName: string,
    duration: number,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: any,
    captureStatus?: "ready" | "failed",
  ) => {
    let sessionId = activeSessionId;
    const finalScenario = activeScenario;
    const sessionConfig = activeSessionConfig;
    const isWebRtcSession =
      sessionConfig?.telefunTransport === "openai-webrtc";

    if (!sessionId && isWebRtcSession) {
      notify.error("Sesi OpenAI WebRTC tidak tersedia untuk disimpan.");
      // Return the synchronous page handoff without revoking; the recording
      // session sees the callback reject retention and performs the one revoke.
      retainedObjectUrlOwner.returnToSession(url);
      setActiveSessionId(null);
      setActiveScenario(null);
      setView("home");
      setActiveSessionConfig(null);
      setActiveAccessToken(null);
      return undefined;
    }

    if (!sessionId) {
      console.warn(
        "No activeSessionId found during finalization. Attempting fallback session creation.",
      );
      try {
        const res = await createTelefunSession({
          scenario_title:
            finalScenario?.title || sessionConfig?.scenarioTitle || "Custom",
          consumer_name:
            sessionConfig?.consumerName || consumerName || "Konsumen",
          consumer_gender: sessionConfig?.consumerGender || "female",
          consumer_phone:
            sessionConfig?.resolvedIdentity?.phone || "08123456789",
          consumer_city: sessionConfig?.resolvedIdentity?.city || "Jakarta",
          persona_config: {
            consumerType:
              sessionConfig?.activeConsumerType?.name ||
              sessionConfig?.activeConsumerType?.id,
          },
          disruption_config: sessionConfig?.simulationChallengeTypes || [],
          configured_duration: (sessionConfig?.maxCallDuration || 0) * 60,
          response_pacing_mode: sessionConfig?.responsePacingMode,
          telefun_model_id: sessionConfig?.telefunModelId,
          telefun_transport: sessionConfig?.telefunTransport,
        });
        if (res?.id) {
          sessionId = res.id;
        }
      } catch (err) {
        console.error("Failed to create fallback session:", err);
      }
    }

    const finalSessionId = sessionId || `offline-${Date.now()}`;
    const optimisticId = optimisticRecordIdRef.current || finalSessionId;
    optimisticRecordIdRef.current = optimisticId;
    let savedSession: SavedTelefunSession | null = null;
    let usedFallbackRecord = false;

    try {
      savedSession = await saveTelefunSession({
        sessionId: finalSessionId,
        fullBlob,
        agentBlob,
        duration,
        metrics,
        captureStatus,
        localUrl: url,
        sessionConfig,
        scenarioTitle: finalScenario?.title || "Custom",
        consumerName,
      });

      const { record, saveFailed, uploadFailed } = savedSession;

      if (saveFailed) {
        notify.error(
          "Gagal menyimpan sesi. Coba ulangi dari riwayat atau hubungi admin.",
        );
        throw new Error("Save session failed");
      }

      if (uploadFailed) {
        notify.warning("Rekaman gagal diunggah, tetapi sesi tetap tersimpan.");
      }

      setHistory((prev) => {
        const withoutOptimistic = prev.filter((r) => r.id !== optimisticId);
        const alreadyExists = withoutOptimistic.some(
          (r) => r.id === finalSessionId,
        );
        const merged = alreadyExists
          ? withoutOptimistic
          : [record, ...withoutOptimistic];
        if (canOverwriteTelefunLocalHistory(localHistoryIsCorruptRef.current)) {
          localStorage.setItem("telefun_history", JSON.stringify(merged));
        }
        return merged;
      });

      setReviewRecord(record);
      setIsReviewOpen(true);
    } catch (e) {
      usedFallbackRecord = true;
      console.error("Failed to finalize session", e);
      if (e instanceof Error && e.message === "Save session failed") {
        // Already handled by toast above
      } else {
        notify.error("Gagal menyimpan sesi");
      }

      const fallbackRecord: CallRecord = {
        id: optimisticId,
        date: new Date().toISOString(),
        url: url || "",
        consumerName: sessionConfig?.consumerName || consumerName,
        scenarioTitle:
          finalScenario?.title || sessionConfig?.scenarioTitle || "Custom",
        duration,
      };

      setReviewRecord(fallbackRecord);
      setIsReviewOpen(true);
    } finally {
      setActiveSessionId(null);
      setActiveScenario(null);
      setView("home");
      setActiveSessionConfig(null);
      setActiveAccessToken(null);
    }

    // Snapshot the completed run before background scoring yields. A new call may
    // replace these refs before the older scoring request finishes.
    const usageRunIdAtEndCall = sessionRunIdRef.current;
    const usageBaselineAtEndCall = sessionBaselineRef.current;

    const startUsagePolling = () => {
      const runId = usageRunIdAtEndCall;
      const baseline = usageBaselineAtEndCall;

      if (baseline && runId === sessionRunIdRef.current) {
        setSessionDeltaPending(true);
        pollUsageDelta(() => fetchUsageSummary("telefun"), baseline)
          .then((delta) => {
            if (runId === sessionRunIdRef.current) {
              setSessionDelta(delta);
              if (delta && (delta.costIdr > 0 || delta.totalTokens > 0)) {
                const format = (v: number) =>
                  v.toLocaleString("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                  });
                const parts = [
                  `Biaya sesi ini: ${formatUsageDeltaLabel(delta)}`,
                ];
                const sim = delta.breakdown.simulation;
                const rev = delta.breakdown.review;

                if (sim.costIdr > 0 || sim.calls > 0) {
                  parts.push(`Simulasi ${format(sim.costIdr)}`);
                }
                if (rev.costIdr > 0 || rev.calls > 0) {
                  parts.push(`Penilaian AI ${format(rev.costIdr)}`);
                }
                notify.success(parts.join(" | "));
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            if (runId === sessionRunIdRef.current) {
              setSessionDeltaPending(false);
            }
          });
      }
    };

    const savedSessionForScoring =
      savedSession && !savedSession.saveFailed ? savedSession : null;
    const scoringTask =
      !isWebRtcSession && savedSessionForScoring?.agentRecordingPath
        ? scoreTelefunSession({
            sessionId: finalSessionId,
            agentRecordingPath: savedSessionForScoring.agentRecordingPath,
            transport: sessionConfig?.telefunTransport,
          })
          .then((scoring) => {
            if (scoring.scoringStatus === "failed") {
              notify.warning("Sesi tersimpan, analisis suara belum tersedia.");
              return;
            }
            if (scoring.scoringStatus !== "succeeded") return;

            const scoredRecord: CallRecord = {
              ...savedSessionForScoring.record,
              score: scoring.score ?? 0,
              feedback: scoring.feedback,
              voiceAssessment: scoring.voiceAssessment,
            };
            setHistory((prev) => {
              const updated = prev.map((record) =>
                record.id === finalSessionId || record.id === optimisticId
                  ? scoredRecord
                  : record,
              );
              if (
                canOverwriteTelefunLocalHistory(
                  localHistoryIsCorruptRef.current,
                )
              ) {
                localStorage.setItem(
                  "telefun_history",
                  JSON.stringify(updated),
                );
              }
              return updated;
            });
            setReviewRecord((previous) =>
              previous?.id === finalSessionId || previous?.id === optimisticId
                ? scoredRecord
                : previous,
            );
          })
          .catch((err) => {
            console.error("Background Telefun scoring failed:", err);
            notify.warning("Sesi tersimpan, analisis suara belum tersedia.");
          })
      : Promise.resolve();

    void scoringTask.finally(startUsagePolling).catch(() => {});

    if (sessionConfig?.telefunTransport === "openai-webrtc") {
      const shouldRetainObjectUrl = usedFallbackRecord || !savedSession?.remuxed;
      if (!shouldRetainObjectUrl) {
        retainedObjectUrlOwner.returnToSession(url);
        return undefined;
      }
      const retained = retainObjectUrl(url);
      const transferred =
        retained && url
          ? retainedObjectUrlOwner.transferToReview(url)
          : false;
      return transferred ? { retainObjectUrl: true } : undefined;
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (reviewRecord?.id === id) {
      releaseRetainedObjectUrl();
    }
    try {
      await deleteTelefunSession(id);
      setHistory((prev) => {
        const updated = prev.filter((h) => h.id !== id);
        if (canOverwriteTelefunLocalHistory(localHistoryIsCorruptRef.current)) {
          localStorage.setItem("telefun_history", JSON.stringify(updated));
        }
        return updated;
      });
      notify.success("Sesi dihapus");
    } catch {
      notify.error("Gagal menghapus sesi");
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearTelefunHistory();
      setHistory([]);
      localStorage.removeItem("telefun_history");
      localHistoryIsCorruptRef.current = false;
      notify.success("Riwayat dibersihkan");
    } catch {
      notify.error("Gagal membersihkan riwayat");
    }
  };

  const handleReviewSession = (record: CallRecord) => {
    if (reviewRecord?.id !== record.id) releaseRetainedObjectUrl();
    setReviewRecord(record);
    setIsReviewOpen(true);
  };

  const handleAssessmentComplete = (sessionId: string, assessment: any) => {
    setHistory((prev) => {
      const updated = prev.map((r) =>
        r.id === sessionId ? { ...r, voiceAssessment: assessment } : r,
      );
      if (canOverwriteTelefunLocalHistory(localHistoryIsCorruptRef.current)) {
        localStorage.setItem("telefun_history", JSON.stringify(updated));
      }
      return updated;
    });
    if (reviewRecord?.id === sessionId) {
      setReviewRecord((prev) =>
        prev ? { ...prev, voiceAssessment: assessment } : null,
      );
    }
  };

  return (
    <>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onDeleteSession={handleDeleteSession}
        onClearHistory={handleClearHistory}
        onReviewSession={handleReviewSession}
      />

      <Suspense fallback={isReviewOpen ? <TelefunReviewModalFallback /> : null}>
        <ReviewModal
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            releaseRetainedObjectUrl();
          }}
          record={reviewRecord}
          onAssessmentComplete={handleAssessmentComplete}
        />
      </Suspense>

      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        module="telefun"
        sessionDelta={sessionDelta}
        sessionDeltaPending={sessionDeltaPending}
      />

      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10 py-6"
          >
            <ModuleWorkspaceIntro
              eyebrow="Voice Simulation Trainer"
              title="Latih penanganan keluhan telepon dalam workspace yang fokus."
              description="Mulai simulasi panggilan telepon dengan konsumen bertenaga AI untuk menguji dan melatih kemampuan penanganan keluhan secara langsung."
              accentClassName={accentClassName}
              accentSoftClassName={accentSoftClassName}
              icon={<Phone className="h-8 w-8 text-violet-600" />}
              actions={
                <>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={startCall}
                    disabled={settingsLoading}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all bg-violet-600 text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-600/20"
                  >
                    {settingsLoading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>
                      {settingsLoading ? "Memulai..." : "Mulai Panggilan"}
                    </span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsSettingsOpen(true)}
                    disabled={settingsLoading}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <Settings className="h-4 w-4 opacity-60" />
                    <span>Pengaturan</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsHistoryOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <History className="h-4 w-4 opacity-60" />
                    <span>Riwayat</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsUsageOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <BarChart3 className="h-4 w-4 opacity-60" />
                    <span>Usage Bulan Ini</span>
                    {sessionDelta &&
                      (sessionDelta.costIdr > 0 ||
                        sessionDelta.totalTokens > 0 ||
                        sessionDelta.totalCalls > 0) && (
                        <span className="ml-auto text-[10px] font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                          {formatUsageDeltaLabel(sessionDelta)} sesi terakhir
                        </span>
                      )}
                  </motion.button>
                </>
              }
            />
          </motion.div>
        )}

        {view === "chat" && activeSessionConfig && activeAccessToken && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950"
          >
            <PhoneInterface
              config={activeSessionConfig}
              accessToken={activeAccessToken}
              isObjectUrlRetained={isObjectUrlRetained} canRetainObjectUrl={activeSessionId !== null}
              retainObjectUrl={retainObjectUrl}
              onEndSession={handleEndCall}
              onRecordingReady={handleRecordingReady}
              onSessionCreated={(id) => {
                setActiveSessionId(id);
                // Jangan update activeSessionConfig di sini — bikin object reference baru
                // yang trigger parent re-render → PhoneInterface unmount/remount
                // sessionId udah disimpen di activeSessionId state terpisah
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
