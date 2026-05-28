import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Play, Settings, History, BarChart3 } from "lucide-react";
import ModuleWorkspaceIntro from "../../components/ModuleWorkspaceIntro";
import PdktSimulation from "./simulation";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryModal, type SessionHistory } from "./components/HistoryModal";
import { UsageModal } from "../../components/UsageModal";
import { useApi, getApi, deleteApi } from "../../hooks/useApi";
import type { PdktAppSettings } from "./pdktSettings";
import { DEFAULT_PDKT_MODEL_ID } from "./pdktSettings";
import type { PdktScenario, PdktConsumerType } from "@trainers/types";
import { notify } from "../../lib/toast";
import { computeUsageDelta, formatUsageDeltaLabel, type UsageDelta, type UsageSnapshot } from "../../lib/usage-snapshot";

const accentClassName = "text-purple-500";
const accentSoftClassName = "bg-purple-100";

const defaultConsumerTypes: PdktConsumerType[] = [
  {
    id: "marah",
    name: "Marah & Emosional",
    description: "Sangat marah, emosional, tidak sabar.",
    difficulty: "Hard",
    tone: "Marah, menggunakan tanda seru.",
  },
  {
    id: "bingung",
    name: "Bingung & Gaptek",
    description: "Kebingungan, tidak paham teknologi.",
    difficulty: "Medium",
    tone: "Bingung, ragu-ragu.",
  },
  {
    id: "kritis",
    name: "Kritis & Detail",
    description: "Kritis, menanyakan dasar hukum.",
    difficulty: "Hard",
    tone: "Kritis, logis, skeptis.",
  },
  {
    id: "ramah",
    name: "Ramah & Kooperatif",
    description: "Ramah, sopan, kooperatif.",
    difficulty: "Easy",
    tone: "Ramah, sopan.",
  },
  {
    id: "terburu-buru",
    name: "Terburu-buru",
    description: "Ingin jawaban singkat dan cepat.",
    difficulty: "Medium",
    tone: "Singkat, padat.",
  },
  {
    id: "pasrah",
    name: "Pasrah & Sedih",
    description: "Putus asa, nada sedih.",
    difficulty: "Medium",
    tone: "Sedih, memohon bantuan.",
  },
];

export default function PdktLanding() {
  const [view, setView] = useState<"home" | "mailbox">("home");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const usageSnapshotRef = useRef<UsageSnapshot | null>(null);

  const { data: defaultScenarios } = useApi<PdktScenario[]>("/pdkt/scenarios");
  const { data: defaultConsumerTypesFromApi } = useApi<PdktConsumerType[]>(
    "/pdkt/consumer-types",
  );

  const fetchSettings = async () => {
    try {
      const res = await getApi<PdktAppSettings | null>("/pdkt/settings");
      if (res) {
        setSettings(res);
      } else {
        setSettings(null);
      }
    } catch (err) {
      console.error("[PDKT] Failed to load settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await getApi<any[]>("/pdkt/history");
      if (res) {
        const mapped = res.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp,
          config: item.config,
          emails: item.emails || [],
          evaluation: item.evaluation,
          evaluationStatus:
            item.evaluation_status ||
            (item.evaluation ? "completed" : "processing"),
          evaluationError: item.evaluation_error,
          timeTaken: item.time_taken,
        }));
        setHistory(mapped);
      }
    } catch (err) {
      console.error("[PDKT] Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, []);

  const handleSaveSettings = async (newSettings: PdktAppSettings) => {
    try {
      const { postApi } = await import("../../hooks/useApi");
      await postApi("/pdkt/settings", { settings: newSettings });
      setSettings(newSettings);
      await fetchHistory();
    } catch (err) {
      notify.error("Gagal menyimpan pengaturan.");
    }
  };

  const handleDeleteSession = async (historyId: string) => {
    try {
      await deleteApi(`/pdkt/history/${historyId}`);
      setHistory((prev) => prev.filter((h) => h.id !== historyId));
    } catch (err) {
      console.error("[PDKT] Failed to delete session:", err);
      notify.error("Gagal menghapus riwayat sesi.");
    }
  };

  const handleClearHistory = async () => {
    try {
      await deleteApi("/pdkt/history");
      setHistory([]);
    } catch (err) {
      notify.error("Gagal membersihkan riwayat.");
    }
  };

  const [replaySession, setReplaySession] = useState<SessionHistory | null>(null);

  const handleSelectSession = (session: SessionHistory) => {
    setReplaySession(session);
    setIsHistoryOpen(false);
    setView("mailbox");
  };

  const captureUsageBaseline = async () => {
    try {
      const summary = await getApi<any>("/ai/usage/summary?module=pdkt");
      if (summary) {
        usageSnapshotRef.current = {
          totalCalls: summary.totalCalls ?? 0,
          totalTokens: summary.totalTokens ?? 0,
          totalCostIdr: summary.totalCostIdr ?? 0,
        };
      }
    } catch (err) {
      console.error("[PDKT] Failed to capture usage baseline:", err);
    }
  };

  const doComputeDelta = async (retriesLeft = 5) => {
    if (!usageSnapshotRef.current) {
      setSessionDeltaPending(false);
      return;
    }
    try {
      const summary = await getApi<any>("/ai/usage/summary?module=pdkt");
      if (summary && usageSnapshotRef.current) {
        const after = {
          totalCalls: summary.totalCalls ?? 0,
          totalTokens: summary.totalTokens ?? 0,
          totalCostIdr: summary.totalCostIdr ?? 0,
        };
        const delta = computeUsageDelta(usageSnapshotRef.current, after);
        if (delta) {
          if ((delta.costIdr === 0 && delta.totalTokens === 0 && delta.totalCalls === 0) && retriesLeft > 0) {
            setTimeout(() => {
              doComputeDelta(retriesLeft - 1);
            }, 3000);
            return;
          }
          setSessionDelta(delta);
        }
      }
    } catch (err) {
      console.error("[PDKT] Failed to compute usage delta:", err);
    } finally {
      setSessionDeltaPending(false);
    }
  };

  const computeUsageDeltaNow = async () => {
    setSessionDeltaPending(true);
    await doComputeDelta();
  };

  const handleStartSimulation = async () => {
    await captureUsageBaseline();
    setSessionDelta(null);
    setSessionDeltaPending(true);
    setView("mailbox");
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleOpenHistory = async () => {
    await fetchHistory();
    setIsHistoryOpen(true);
  };

  const handleOpenUsage = () => {
    setIsUsageOpen(true);
  };

  const currentSettings: PdktAppSettings = settings || {
    scenarios: defaultScenarios || [],
    consumerTypes: defaultConsumerTypesFromApi || defaultConsumerTypes,
    enableImageGeneration: true,
    globalConsumerTypeId: "random",
    selectedModel: DEFAULT_PDKT_MODEL_ID,
    consumerNameMentionPattern: "random",
    writingStyleMode: "training",
  };

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
              eyebrow="Paham Dulu Kasih Tanggapan"
              title="Buka simulasi email dengan pengalaman workspace yang seragam."
              description="Atur skenario, telaah riwayat evaluasi, lalu lanjutkan respons email dalam satu workspace terpadu yang konsisten dengan modul lain."
              accentClassName={accentClassName}
              accentSoftClassName={accentSoftClassName}
              icon={<Mail className="h-8 w-8" />}
              actions={
                <>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleStartSimulation}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all bg-purple-600 text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Mulai Simulasi</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleOpenSettings}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <Settings className="h-4 w-4 opacity-60" />
                    <span>Pengaturan</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleOpenHistory}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <History className="h-4 w-4 opacity-60" />
                    <span>Riwayat</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleOpenUsage}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-[10px] font-black uppercase tracking-[0.18em] transition-all border border-border/50 text-muted-foreground hover:bg-foreground/5"
                  >
                    <BarChart3 className="h-4 w-4 opacity-60" />
                    <span>Usage Bulan Ini</span>
                    {sessionDelta &&
                      (sessionDelta.costIdr > 0 ||
                        sessionDelta.totalTokens > 0 ||
                        sessionDelta.totalCalls > 0) && (
                        <span className="ml-auto text-[10px] font-black text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                          {formatUsageDeltaLabel(sessionDelta)} sesi
                          terakhir
                        </span>
                      )}
                  </motion.button>
                </>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="mailbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden transition-colors duration-500 bg-background"
          >
            <div className="w-full h-full relative flex flex-col bg-card">
              <PdktSimulation onBack={() => setView("home")} onBeforeActivity={captureUsageBaseline} onAfterActivity={computeUsageDeltaNow} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={currentSettings}
        onSave={handleSaveSettings}
        defaultScenarios={defaultScenarios || []}
        defaultConsumerTypes={
          defaultConsumerTypesFromApi || defaultConsumerTypes
        }
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onClearHistory={handleClearHistory}
      />

      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        module="pdkt"
        sessionDelta={sessionDelta}
        sessionDeltaPending={sessionDeltaPending}
      />
    </div>
  );
}
