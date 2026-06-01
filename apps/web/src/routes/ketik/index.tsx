import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  History,
  Play,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikSessionConfig,
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
  KetikSessionReview,
  KetikTypoFinding,
  KetikReviewDetail,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { ketikApi } from "./ketikApi";
import ModuleWorkspaceIntro from "../../components/ModuleWorkspaceIntro";
import { ChatInterface } from "./components/ChatInterface";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryModal } from "./components/HistoryModal";
import { UsageModal } from "../../components/UsageModal";
import { SessionReviewModal } from "./components/SessionReviewModal";
import { useAuthStore } from "../../store/authStore";
import { notify } from "../../lib/toast";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import { resolveKetikSessionIdentity } from "./ketikIdentity";

const accentClassName = "text-emerald-600";
const accentSoftClassName = "bg-emerald-100";

export default function KetikLanding() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const canStartReview = ["admin", "trainer", "qa"].includes(
    profile?.role || "",
  );
  const [view, setView] = useState<"home" | "chat">("home");
  const [settings, setSettings] = useState<KetikAppSettings>(
    DEFAULT_KETIK_SETTINGS,
  );
  const [history, setHistory] = useState<KetikSessionHistoryItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<KetikSessionConfig | null>(
    null,
  );
  const [currentScenario, setCurrentScenario] = useState<KetikScenario | null>(
    null,
  );
  const [reviewMessages, setReviewMessages] = useState<ChatMessage[]>([]);
  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);

  const [selectedReview, setSelectedReview] =
    useState<KetikSessionReview | null>(null);
  const [selectedTypos, setSelectedTypos] = useState<KetikTypoFinding[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedSessionForReview, setSelectedSessionForReview] =
    useState<KetikSessionHistoryItem | null>(null);

  const [reviewProgress, setReviewProgress] = useState<{
    status:
      | "idle"
      | "starting"
      | "processing"
      | "delayed"
      | "loading-result"
      | "ready"
      | "failed";
    percent: number;
    etaSeconds: number;
  }>({ status: "idle", percent: 0, etaSeconds: 0 });

  const sessionBaselineRef = useRef<any>(null);
  const sessionRunIdRef = useRef(0);
  const reviewStartedAtRef = useRef<number>(0);

  useEffect(() => {
    const init = async () => {
      try {
        const s = await ketikApi.getSettings();
        setSettings(s);
      } catch (e) {
        console.warn("[Ketik] Failed to load settings, using defaults");
      }
      try {
        const h = await ketikApi.getHistory();
        setHistory(h);
      } catch (e) {
        console.warn("[Ketik] Failed to load history");
      }
    };
    init();
  }, []);

  const handleSaveSettings = async (newSettings: KetikAppSettings) => {
    setSettings(newSettings);
    try {
      await ketikApi.saveSettings(newSettings);
    } catch (e) {
      console.error("[Ketik] Failed to save settings:", e);
    }
  };

  const handleClearHistory = async () => {
    try {
      await ketikApi.clearHistory();
      setHistory([]);
    } catch (e) {
      console.error("[Ketik] Failed to clear history:", e);
      notify.error("Gagal menghapus riwayat.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await ketikApi.deleteSession(id);
      setHistory((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error("[Ketik] Failed to delete session:", e);
      notify.error("Gagal menghapus sesi.");
    }
  };

  const POLLING_TIMEOUT_SECONDS = 120;

  const handleStartManualReview = async (sessionId: string) => {
    reviewStartedAtRef.current = (() => Date.now())();
    setReviewProgress({ status: "starting", percent: 0, etaSeconds: 35 });

    // Auto-transition: starting → processing after 2 detik agar UI tidak terasa stuck
    const transitionTimer = setTimeout(() => {
      setReviewProgress((prev) =>
        prev.status === "starting"
          ? { ...prev, status: "processing", percent: 10, etaSeconds: 25 }
          : prev,
      );
    }, 2000);

    try {
      const result = await ketikApi.startReview(sessionId);
      clearTimeout(transitionTimer);

      if (
        selectedSessionForReview &&
        selectedSessionForReview.id === sessionId
      ) {
        const returnedStatus = result?.status;
        if (returnedStatus === "completed") {
          // Map scores from API response to session object
          const sessionWithScores = result?.scores
            ? {
                ...selectedSessionForReview,
                reviewStatus: "completed" as const,
                finalScore: result.scores.final,
                empathyScore: result.scores.empathy,
                probingScore: result.scores.probing,
                typoScore: result.scores.typo,
                complianceScore: result.scores.compliance,
              }
            : {
                ...selectedSessionForReview,
                reviewStatus: "completed" as const,
              };

          setSelectedSessionForReview(sessionWithScores);
          setHistory((prev) =>
            prev.map((item) =>
              item.id === sessionId ? sessionWithScores : item,
            ),
          );
          setReviewProgress({
            status: "loading-result",
            percent: 90,
            etaSeconds: 3,
          });
          handleViewReview(sessionWithScores);
          handleReviewComplete();
          return;
        }

        if (returnedStatus === "failed") {
          setReviewProgress((prev) => ({ ...prev, status: "failed" }));
          notify.error(result?.error || "Analisis AI gagal. Silakan coba lagi.");
          const failedSession = {
            ...selectedSessionForReview,
            reviewStatus: "failed" as const,
          };
          setSelectedSessionForReview(failedSession);
          setHistory((prev) =>
            prev.map((item) => (item.id === sessionId ? failedSession : item)),
          );
          return;
        }

        const updatedSession = {
          ...selectedSessionForReview,
          reviewStatus: "processing" as const,
        };
        setSelectedSessionForReview(updatedSession);
        setHistory((prev) =>
          prev.map((item) => (item.id === sessionId ? updatedSession : item)),
        );
        setReviewProgress({
          status: "processing",
          percent: 15,
          etaSeconds: 25,
        });
      }
    } catch (error) {
      clearTimeout(transitionTimer);
      console.error("[Ketik] Error starting manual review:", error);
      setReviewProgress((prev) => ({ ...prev, status: "failed" }));
      notify.error("Gagal memulai analisis AI. Silakan coba lagi.");
    }
  };

  const startSimulation = async () => {
    if (!session?.access_token) {
      notify.error("Sesi Anda telah berakhir. Silakan login kembali.");
      return;
    }

    const activeScenarios = settings.scenarios.filter((s) => s.isActive);
    if (activeScenarios.length === 0) {
      notify.warning("Pilih minimal satu skenario di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }
    const scenario =
      activeScenarios[Math.floor(Math.random() * activeScenarios.length)];

    let consumerType: KetikConsumerType;
    if (settings.activeConsumerTypeId === "random") {
      consumerType =
        settings.consumerTypes[
          Math.floor(Math.random() * settings.consumerTypes.length)
        ];
    } else {
      consumerType =
        settings.consumerTypes.find(
          (c) => c.id === settings.activeConsumerTypeId,
        ) || settings.consumerTypes[0];
    }

    const identity = resolveKetikSessionIdentity(settings.identitySettings);

    const config: KetikSessionConfig = {
      scenarios: activeScenarios,
      consumerType,
      identity,
      selectedModel: settings.selectedModel,
      simulationDuration: settings.simulationDuration || 5,
      responsePacingMode: settings.responsePacingMode || "realistic",
    };

    setCurrentConfig(config);
    setCurrentScenario(scenario);
    setReviewMessages([]);
    setSessionDelta(null);
    sessionBaselineRef.current = null;
    const runId = ++sessionRunIdRef.current;
    setIsLoading(true);

    try {
      const usage = await fetchUsageSummary("ketik");
      if (usage && runId === sessionRunIdRef.current) {
        sessionBaselineRef.current = usage;
      }
    } catch (e) {
      console.warn("[Ketik] Failed to fetch usage baseline");
    }
    setIsLoading(false);
    setView("chat");
  };

  const endSession = async (messages: ChatMessage[]) => {
    if (
      currentConfig &&
      currentScenario &&
      messages.length > 0 &&
      currentScenario.id !== "review"
    ) {
      setIsLoading(true);
      try {
        const session = await ketikApi.persistSession({
          scenarioTitle: currentScenario.title,
          consumerName: currentConfig.identity.name,
          consumerPhone: currentConfig.identity.phone,
          consumerCity: currentConfig.identity.city,
          messages,
          simulationDuration: currentConfig.simulationDuration,
        });

        const newSession: KetikSessionHistoryItem = {
          id: session.id,
          date: session.date,
          scenarioTitle: session.scenarioTitle,
          consumerName: session.consumerName,
          consumerPhone: session.consumerPhone,
          consumerCity: session.consumerCity,
          messages: session.messages,
          simulationDuration: session.simulationDuration,
          reviewStatus: session.reviewStatus ?? "pending",
        };

        setHistory((prev) => [newSession, ...prev]);
        setSelectedSessionForReview(newSession);
        setIsReviewOpen(true);
        setSelectedReview(null);
        setSelectedTypos([]);
      } catch (error) {
        console.error("Error ending session:", error);
        notify.error("Gagal menyimpan sesi.");
      } finally {
        setIsLoading(false);
      }
    }

    const runId = sessionRunIdRef.current;
    const baseline = sessionBaselineRef.current;
    setSessionDeltaPending(true);

    // Poll for usage delta (covers /ketik/generate calls)
    if (baseline && runId === sessionRunIdRef.current) {
      pollUsageDelta(() => fetchUsageSummary("ketik"), baseline)
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
              const parts = [`Biaya sesi ini: ${formatUsageDeltaLabel(delta)}`];
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
    } else {
      setSessionDeltaPending(false);
    }

    setView("home");
    setCurrentConfig(null);
    setCurrentScenario(null);
    setReviewMessages([]);
  };

  const handleReviewComplete = async () => {
    const baseline = sessionBaselineRef.current;
    if (!baseline) return;
    setSessionDeltaPending(true);
    try {
      const delta = await pollUsageDelta(
        () => fetchUsageSummary("ketik"),
        baseline,
      );
      setSessionDelta(delta);
      if (delta && (delta.costIdr > 0 || delta.totalTokens > 0)) {
        const format = (v: number) =>
          v.toLocaleString("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          });
        const parts = [`Biaya penilaian: ${formatUsageDeltaLabel(delta)}`];
        const rev = delta.breakdown.review;

        if (rev.costIdr > 0 || rev.calls > 0) {
          parts.push(`Penilaian AI ${format(rev.costIdr)}`);
        }
        notify.success(parts.join(" | "));
      }
    } catch (e) {
      console.warn("[Ketik] Failed to recompute delta after review:", e);
    } finally {
      setSessionDeltaPending(false);
      sessionBaselineRef.current = null;
    }
  };

  const handleReviewHistory = (session: KetikSessionHistoryItem) => {
    const matchingScenario = settings.scenarios.find(
      (s) => s.title === session.scenarioTitle,
    );

    const newConfig: KetikSessionConfig = currentConfig || {
      identity: {
        name: session.consumerName,
        city: session.consumerCity || "",
        phone: session.consumerPhone || "",
      },
      consumerType: settings.consumerTypes[0],
      responsePacingMode: settings.responsePacingMode || "realistic",
      simulationDuration: settings.simulationDuration || 5,
      selectedModel: settings.selectedModel || "openai",
      scenarios: settings.scenarios,
    };

    setCurrentConfig({
      ...newConfig,
      identity: {
        name: session.consumerName,
        city: session.consumerCity || "",
        phone: session.consumerPhone || "",
      },
    });
    setCurrentScenario(
      matchingScenario
        ? { ...matchingScenario, id: "review" }
        : {
            id: "review",
            title: session.scenarioTitle,
            description: "",
            category: "Review",
            isActive: true,
          },
    );
    setReviewMessages(session.messages);
    setIsHistoryOpen(false);
    setIsReviewOpen(false);
    setView("chat");
  };

  const handleViewReview = async (session: KetikSessionHistoryItem) => {
    const isSameSession = selectedSessionForReview?.id === session.id;
    if (!isSameSession) {
      setSelectedSessionForReview(session);
      setSelectedReview(null);
      setSelectedTypos([]);
    }

    if (
      session.reviewStatus === "pending" ||
      session.reviewStatus === "failed" ||
      !session.reviewStatus
    ) {
      setIsReviewOpen(true);
      return;
    }

    if (session.reviewStatus === "completed") {
      setIsReviewOpen(true);
      if (isSameSession && selectedReview) {
        setReviewProgress({ status: "ready", percent: 100, etaSeconds: 0 });
        return;
      }

      setReviewProgress((prev) => ({
        ...prev,
        status: "loading-result",
        percent: Math.max(prev.percent, 92),
      }));

      try {
        const detail = await ketikApi.getReviewDetail(session.id);
        if (detail) {
          // Map scores from detail ke session object (defense-in-depth)
          const sessionWithScores = {
            ...session,
            finalScore: detail.scores.final,
            empathyScore: detail.scores.empathy,
            probingScore: detail.scores.probing,
            typoScore: detail.scores.typo,
            complianceScore: detail.scores.compliance,
          };
          setSelectedSessionForReview(sessionWithScores);
          setHistory((prev) =>
            prev.map((item) =>
              item.id === session.id ? sessionWithScores : item,
            ),
          );
          setSelectedReview(detail.review);
          setSelectedTypos(detail.typos);
          setReviewProgress({ status: "ready", percent: 100, etaSeconds: 0 });
        } else {
          console.warn("[Ketik] Review marked completed but data missing");
          notify.error("Data review tidak ditemukan.");
          const failedSession = { ...session, reviewStatus: "failed" as const };
          setSelectedSessionForReview(failedSession);
          setHistory((prev) =>
            prev.map((item) => (item.id === session.id ? failedSession : item)),
          );
          setReviewProgress({ status: "failed", percent: 0, etaSeconds: 0 });
        }
      } catch (err) {
        console.error("[Ketik] Error fetching review details:", err);
        setReviewProgress({ status: "failed", percent: 0, etaSeconds: 0 });
      }
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let progressInterval: ReturnType<typeof setInterval>;

    const currentSessionId = selectedSessionForReview?.id;
    if (!currentSessionId) return;

    const shouldPoll =
      selectedSessionForReview &&
      (selectedSessionForReview.reviewStatus === "processing" ||
        (selectedSessionForReview.reviewStatus === "pending" &&
          reviewProgress.status !== "idle"));

    if (shouldPoll) {
      progressInterval = setInterval(() => {
        setReviewProgress((prev) => {
          if (
            prev.status === "ready" ||
            prev.status === "failed" ||
            prev.status === "idle"
          )
            return prev;
          let increment: number;
          if (prev.percent < 10) increment = 2;
          else if (prev.percent < 40) increment = 1.2;
          else if (prev.percent < 70) increment = 0.6;
          else if (prev.percent < 90) increment = 0.2;
          else increment = 0.05;

          const nextPercent = Math.min(
            prev.percent + increment,
            prev.status === "delayed"
              ? 92
              : prev.status === "loading-result"
                ? 98
                : 95,
          );
          const nextEta = Math.max(0, prev.etaSeconds - 1);
          let nextStatus = prev.status;
          if (nextPercent >= 92 && prev.status === "processing") {
            nextStatus = "delayed";
          }
          return {
            ...prev,
            percent: nextPercent,
            etaSeconds: nextEta,
            status: nextStatus as any,
          };
        });
      }, 1000);

      const poll = async () => {
        try {
          // Polling timeout guard
          if (
            reviewStartedAtRef.current > 0 &&
            Date.now() - reviewStartedAtRef.current >
              POLLING_TIMEOUT_SECONDS * 1000
          ) {
            console.warn(
              `[Ketik] Polling timeout after ${POLLING_TIMEOUT_SECONDS}s for session ${currentSessionId}`,
            );
            setReviewProgress((prev) => ({ ...prev, status: "failed" }));
            const staleSession = {
              ...selectedSessionForReview,
              reviewStatus: "failed" as const,
            };
            setSelectedSessionForReview(staleSession);
            setHistory(
              (prev) =>
                prev.map((item) =>
                  item.id === staleSession.id ? staleSession : item,
                ) as KetikSessionHistoryItem[],
            );
            notify.warning(
              "Analisis AI melebihi batas waktu. Silakan coba lagi.",
            );
            return;
          }

          const data = await ketikApi.getReviewStatus(currentSessionId);
          if (selectedSessionForReview?.id !== currentSessionId) return;

          const updatedStatus = data.status;
          if (updatedStatus !== selectedSessionForReview.reviewStatus) {
            let updatedSession = {
              ...selectedSessionForReview,
              reviewStatus: updatedStatus,
            };
            if (updatedStatus === "completed" && data.scores) {
              updatedSession = {
                ...updatedSession,
                finalScore: data.scores.final,
                empathyScore: data.scores.empathy,
                probingScore: data.scores.probing,
                typoScore: data.scores.typo,
                complianceScore: data.scores.compliance,
              };
            }
            setSelectedSessionForReview(updatedSession);
            setHistory((prev) =>
              prev.map((item) =>
                item.id === updatedSession.id ? updatedSession : item,
              ),
            );

            if (updatedStatus === "completed" && data.resultReady) {
              handleViewReview(updatedSession);
              handleReviewComplete();
            } else if (updatedStatus === "failed") {
              setReviewProgress((prev) => ({ ...prev, status: "failed" }));
              notify.error(
                data.errorMessage ||
                  "Analisis AI gagal diproses. Silakan jalankan ulang.",
              );
            }
          }
        } catch (e) {
          console.error("[Ketik] Polling error:", e);
        }
      };
      interval = setInterval(poll, 3000);
      poll();
    }

    return () => {
      if (interval) clearInterval(interval);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [
    selectedSessionForReview?.id,
    selectedSessionForReview?.reviewStatus,
    !!selectedReview,
    reviewProgress.status,
  ]);

  return (
    <div className="min-h-screen transition-colors duration-500 font-sans">
      <AnimatePresence mode="wait">
        {view === "home" ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10 py-6"
          >
            <ModuleWorkspaceIntro
              eyebrow="Kelas Etika & Trik Komunikasi"
              title="Latih komunikasi chat dalam satu workspace yang fokus."
              description="Mulai simulasi, buka pengaturan, dan tinjau riwayat percakapan dari satu alur kerja yang konsisten dengan modul lain."
              accentClassName={accentClassName}
              accentSoftClassName={accentSoftClassName}
              icon={<MessageSquare className="h-8 w-8" />}
              actions={
                <>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={startSimulation}
                    disabled={isLoading}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all bg-emerald-600 text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                  >
                    {isLoading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>{isLoading ? "Memulai..." : "Mulai Simulasi"}</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setIsSettingsOpen(true)}
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
                        <span className="ml-auto text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                          {formatUsageDeltaLabel(sessionDelta)} sesi terakhir
                        </span>
                      )}
                  </motion.button>
                </>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden transition-colors duration-500 bg-background"
          >
            <div className="w-full max-w-5xl h-full md:max-h-[92vh] md:rounded-[2rem] overflow-hidden relative flex flex-col shadow-2xl shadow-black/10 border border-border/50 bg-card">
              {currentConfig && currentScenario && (
                <ChatInterface
                  config={currentConfig}
                  scenario={currentScenario}
                  onEndSession={endSession}
                  isReviewMode={currentScenario.id === "review"}
                  initialMessages={reviewMessages}
                  isEnding={isLoading}
                  authReady={true}
                  currentUserId=""
                  templates={settings.quickTemplates}
                  signatureName={settings.identitySettings.signatureName}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        onClear={handleClearHistory}
        onDelete={handleDeleteSession}
        onReview={handleViewReview}
      />
      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        module="ketik"
        sessionDelta={sessionDelta}
        sessionDeltaPending={sessionDeltaPending}
      />

      {selectedSessionForReview && (
        <SessionReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          session={selectedSessionForReview}
          review={selectedReview || undefined}
          typos={selectedTypos}
          onReplay={() => handleReviewHistory(selectedSessionForReview)}
          onStartReview={handleStartManualReview}
          progress={reviewProgress}
          canStartReview={canStartReview}
          reviewAccessMessage={
            !canStartReview
              ? "Hanya admin, trainer, dan QA yang dapat menjalankan analisis AI."
              : undefined
          }
        />
      )}
    </div>
  );
}
