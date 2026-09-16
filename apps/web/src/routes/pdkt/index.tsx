import { useState, useEffect, useRef, useCallback } from "react";
import { SimulationSubjectPicker } from "../../components/simulation/SimulationSubjectPicker";
import { useAuthStore } from "../../store/authStore";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Settings, History, BarChart3 } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import { PdktMotionFrame } from "./components/PdktMotionFrame";
import PdktSimulation from "./simulation";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryModal, type SessionHistory } from "./components/HistoryModal";
import { UsageModal } from "../../components/UsageModal";
import { useApi } from "../../hooks/useApi";
import { pdktClient, unwrapResponse } from "../../lib/api";
import type { PdktAppSettings } from "./pdktSettings";
import { DEFAULT_PDKT_MODEL_ID } from "./pdktSettings";
import type {
  PdktScenario,
  PdktConsumerType,
  SimulationSubjectSelection,
} from "@trainers/types";
import { notify } from "../../lib/toast";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import { createSettingsVersionStore } from "../../lib/settings-contract";

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
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [simulationSubject, setSimulationSubject] =
    useState<SimulationSubjectSelection>({ type: "self" });
  const profile = useAuthStore((st) => st.profile);
  const session = useAuthStore((st) => st.session);
  const accountKey = session?.user?.id ?? null;
  const canPickParticipant = ["admin", "trainer"].includes(
    (profile?.role || "").toLowerCase(),
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Landing data is handed to the session view so it does not refetch it.
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState<string | undefined>();
  const [historyReady, setHistoryReady] = useState(false);
  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const usageSnapshotRef = useRef<UsageSnapshot | null>(null);
  const settingsVersionRef = useRef(createSettingsVersionStore());
  const shouldReduceMotion = useReducedMotion();

  const { data: defaultScenarios } = useApi<PdktScenario[]>("/pdkt/scenarios");
  const { data: defaultConsumerTypesFromApi } = useApi<PdktConsumerType[]>(
    "/pdkt/consumer-types",
  );

  const fetchSettings = async () => {
    try {
      const response = await pdktClient.settings.$get();
      const res = await (unwrapResponse(
        response,
      ) as Promise<PdktAppSettings | null>);
      settingsVersionRef.current.capture(response);
      if (res) {
        setSettings(res);
      } else {
        setSettings(null);
      }
      setSettingsReady(true);
      setSettingsVersion(settingsVersionRef.current.current());
    } catch (err) {
      console.error("[PDKT] Failed to load settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = (await unwrapResponse(
        await pdktClient.history.$get(),
      )) as any[];
      if (res) {
        const mapped = res.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp,
          user_id: item.user_id ?? null,
          user_email: item.user_email ?? null,
          user_role: item.user_role ?? null,
          config: item.config,
          emails: item.emails || [],
          evaluation: item.evaluation,
          evaluationStatus:
            item.evaluation_status ||
            (item.evaluation ? "completed" : "processing"),
          evaluationError: item.evaluation_error,
          timeTaken: item.time_taken,
          simulationSubject: item.simulationSubject ?? null,
        }));
        setHistory(mapped);
        setHistoryReady(true);
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
    const response = await pdktClient.settings.$post(
      { json: { settings: newSettings } },
      settingsVersionRef.current.requiredRequestOptions(),
    );
    await unwrapResponse(response);
    settingsVersionRef.current.capture(response);
    setSettings(newSettings);
    setSettingsVersion(settingsVersionRef.current.current());
    await fetchHistory();
  };

  const handleDeleteSession = async (historyId: string) => {
    try {
      await unwrapResponse(
        await pdktClient.history[":id"].$delete({ param: { id: historyId } }),
      );
      setHistory((prev) => prev.filter((h) => h.id !== historyId));
    } catch (err) {
      console.error("[PDKT] Failed to delete session:", err);
      notify.error("Gagal menghapus riwayat sesi.");
    }
  };

  const handleClearHistory = async () => {
    try {
      await unwrapResponse(await pdktClient.history.$delete());
      setHistory([]);
    } catch (err) {
      notify.error("Gagal membersihkan riwayat.");
    }
  };

  const [replaySession, setReplaySession] = useState<SessionHistory | null>(
    null,
  );

  const handleSelectSession = (session: SessionHistory) => {
    setReplaySession(session);
    setIsHistoryOpen(false);
    setView("mailbox");
  };

  const captureUsageBaseline = async () => {
    try {
      const summary = await fetchUsageSummary("pdkt");
      if (summary) {
        usageSnapshotRef.current = summary;
      }
    } catch (err) {
      console.error("[PDKT] Failed to capture usage baseline:", err);
    }
  };

  const computeUsageDeltaNow = async () => {
    if (!usageSnapshotRef.current) return;
    setSessionDeltaPending(true);
    try {
      const delta = await pollUsageDelta(
        () => fetchUsageSummary("pdkt"),
        usageSnapshotRef.current,
      );
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
    } catch (err) {
      console.error("[PDKT] Failed to compute usage delta:", err);
    } finally {
      setSessionDeltaPending(false);
    }
  };

  useEffect(() => {
    setSimulationSubject({ type: "self" });
    setShowSubjectPicker(false);
  }, [accountKey, canPickParticipant]);

  const handleStartSimulation = async () => {
    if (!canPickParticipant) {
      await handleConfirmSubject({ type: "self" });
      return;
    }
    setShowSubjectPicker(true);
  };

  const handleConfirmSubject = async (sel: SimulationSubjectSelection) => {
    setSimulationSubject(sel);
    setShowSubjectPicker(false);
    // Baseline usage is only needed for the delta notification; never block
    // opening the mailbox on it.
    void captureUsageBaseline();
    setSessionDelta(null);
    setSessionDeltaPending(true);
    setReplaySession(null);
    setView("mailbox");
  };

  const handleSessionSettingsChange = useCallback(
    (nextSettings: PdktAppSettings, nextVersion: string | undefined) => {
      setSettings(nextSettings);
      setSettingsVersion(nextVersion);
      setSettingsReady(true);
    },
    [],
  );

  const handleSessionHistoryChange = useCallback(
    (nextHistory: SessionHistory[]) => {
      setHistory(nextHistory);
      setHistoryReady(true);
    },
    [],
  );

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
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="relative z-10"
          >
            <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8 lg:py-10">
              <div className="grid gap-8 lg:grid-cols-2 lg:items-stretch">
                {/* Kiri — HP inbox */}
                <div className="flex flex-col">
                  <div className="flex flex-1 flex-col">
                    <PdktMotionFrame />
                  </div>
                  <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                    Daftar email masuk ke konsumen@ojk.go.id. Sesi singkat,
                    telaah langsung tersedia.
                  </p>
                </div>

                {/* Kanan — 1 card */}
                <Card className="flex min-w-0 flex-1 flex-col border-border bg-card py-0">
                  <CardHeader className="gap-4 p-7 lg:p-8">
                    <CardTitle className="max-w-xl text-3xl tracking-tight text-balance lg:text-4xl">
                      Latih balasan email. Pahami dulu, baru tanggapi.
                    </CardTitle>
                    <CardDescription className="max-w-xl text-base leading-7">
                      PDKT — singkatan dari{" "}
                      <span className="font-semibold text-foreground">
                        Paham Dulu, Kasih Tanggapan
                      </span>{" "}
                      — adalah simulasi balasan email berbasis AI untuk melatih
                      pemahaman, analisa, dan ketepatan solusi. Pilih skenario,
                      susun balasan, lalu tinjau telaah secara langsung.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col p-7 pt-0 lg:p-8 lg:pt-0">
                    <Separator className="mt-2" />
                    <div className="pt-6">
                      <h3 className="text-sm font-medium text-foreground">
                        Mulai latihan
                      </h3>
                      <div className="mt-4 space-y-3">
                        <Button
                          type="button"
                          size="lg"
                          onClick={handleStartSimulation}
                          className="min-h-12 w-full justify-start gap-2.5 bg-module-pdkt px-3 text-sm font-semibold text-white hover:bg-module-pdkt/90"
                        >
                          <Play data-icon="inline-start" fill="currentColor" />
                          Mulai simulasi
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          onClick={handleOpenSettings}
                          className="min-h-12 w-full justify-start gap-2.5 px-3 text-sm"
                        >
                          <Settings data-icon="inline-start" />
                          Pengaturan
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          onClick={handleOpenHistory}
                          className="min-h-12 w-full justify-start gap-2.5 px-3 text-sm"
                        >
                          <History data-icon="inline-start" />
                          Riwayat
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          variant="ghost"
                          onClick={handleOpenUsage}
                          className="min-h-12 w-full justify-start gap-2.5 px-3 text-sm text-muted-foreground"
                          aria-label="Buka pemakaian bulan ini"
                        >
                          <BarChart3 data-icon="inline-start" />
                          Pemakaian bulan ini
                          {sessionDelta &&
                            (sessionDelta.costIdr > 0 ||
                              sessionDelta.totalTokens > 0 ||
                              sessionDelta.totalCalls > 0) && (
                              <Badge variant="secondary" className="ml-auto">
                                {formatUsageDeltaLabel(sessionDelta)} sesi
                                terakhir
                              </Badge>
                            )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="mailbox"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden transition-colors duration-500 bg-background"
          >
            <div className="w-full h-full relative flex flex-col bg-card">
              <PdktSimulation
                simulationSubject={simulationSubject}
                onBack={() => {
                  setView("home");
                  setReplaySession(null);
                }}
                onBeforeActivity={captureUsageBaseline}
                onAfterActivity={computeUsageDeltaNow}
                initialReplaySession={replaySession}
                onConsumeReplaySession={() => setReplaySession(null)}
                initialSettings={settingsReady ? settings : undefined}
                initialSettingsVersion={
                  settingsReady ? settingsVersion : undefined
                }
                initialHistory={historyReady ? history : undefined}
                onSettingsChange={handleSessionSettingsChange}
                onHistoryChange={handleSessionHistoryChange}
                initialScenarios={defaultScenarios ?? undefined}
                initialConsumerTypes={defaultConsumerTypesFromApi ?? undefined}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showSubjectPicker && (
        <SimulationSubjectPicker
          accountKey={accountKey}
          canPickParticipant={canPickParticipant}
          onConfirm={handleConfirmSubject}
          onCancel={() => setShowSubjectPicker(false)}
        />
      )}
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
