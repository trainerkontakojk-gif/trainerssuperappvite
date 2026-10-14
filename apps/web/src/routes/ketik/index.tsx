import { can, normalizeRole } from "@trainers/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, History, SlidersHorizontal } from "lucide-react";
import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikSessionConfig,
  KetikScenario,
  ChatMessage,
  KetikQuickTemplate,
  SimulationSubjectSelection,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { ketikApi } from "./ketikApi";
import { KetikStageDemo } from "./components/KetikStageDemo";
import {
  KetikLandingOverview,
  type KetikLoadState,
} from "./components/KetikLandingOverview";
import { KetikReviewStage } from "./components/KetikReviewStage";
import { ChatInterface } from "./components/ChatInterface";
import { SettingsModal } from "./components/SettingsModal";
import { summarizeKetikLanding } from "./utils/landingSummary";
import { UsagePopover } from "../../components/simulation/UsagePopover";
import { SimulationSubjectPicker } from "../../components/simulation/SimulationSubjectPicker";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useAuthStore } from "../../store/authStore";
import { APP_MODULES } from "../../lib/app-config";
import { notify } from "../../lib/toast";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import { resolveKetikSessionIdentity } from "./ketikIdentity";

/** Kepanjangan KETIK dari metadata modul kanonik (`lib/app-config.ts`). */
const KETIK_EXPANDED_TITLE =
  APP_MODULES.find((module) => module.id === "ketik")?.expandedTitle ??
  "Kelas Etika & Trik Komunikasi";

const navButtonClass =
  "min-h-[44px] gap-2 bg-surface-elevated px-3.5 text-[13px]";

interface ActiveChat {
  config: KetikSessionConfig;
  scenario: KetikScenario;
  subject: SimulationSubjectSelection;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export default function KetikLanding() {
  const navigate = useNavigate();
  const { sesi: requestedSessionId } = useSearch({ from: "/ketik" });
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const profile = useAuthStore((s) => s.profile);
  const normalizedRole = normalizeRole(
    profile?.role?.trim().toLowerCase() || "",
  );
  const canManageTemplates = normalizedRole === "admin";
  const canStartReview = can(normalizedRole, "ketik.review");
  const canPickParticipant = can(normalizedRole, "simulation.subject.select");
  const accountKey = userId ?? null;
  const shouldReduceMotion = useReducedMotion();

  const [settings, setSettings] = useState<KetikAppSettings>(
    DEFAULT_KETIK_SETTINGS,
  );
  const [history, setHistory] = useState<KetikSessionHistoryItem[]>([]);
  const [historyState, setHistoryState] = useState<KetikLoadState>("loading");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const usageBaselineRef = useRef<UsageSnapshot | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      setHistory(await ketikApi.getHistory());
      setHistoryState("ready");
    } catch (error) {
      console.warn("[Ketik] Failed to load history", error);
      setHistoryState("error");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await ketikApi.getSettings(userId));
      } catch {
        console.warn("[Ketik] Failed to load settings, using defaults");
      }
    })();
    void loadHistory();
  }, [userId, loadHistory]);

  useEffect(() => {
    setShowSubjectPicker(false);
  }, [accountKey, canPickParticipant]);

  const reviewSession = requestedSessionId
    ? (history.find((item) => item.id === requestedSessionId) ?? null)
    : null;

  // Tautan valid tetap di URL. Hanya sesi hilang/gagal dimuat yang kembali ke landing.
  useEffect(() => {
    if (!requestedSessionId || historyState === "loading" || reviewSession) {
      return;
    }
    notify.error(
      historyState === "error"
        ? "Riwayat belum bisa dimuat, jadi sesi itu belum bisa dibuka."
        : "Sesi itu tidak ada lagi di riwayat Anda.",
    );
    void navigate({ to: "/ketik", search: {}, replace: true });
  }, [requestedSessionId, historyState, reviewSession, navigate]);

  const openSession = (item: KetikSessionHistoryItem) => {
    void navigate({ to: "/ketik", search: { sesi: item.id, tahap: "telaah" } });
  };

  const openHistory = () => {
    void navigate({ to: "/ketik/history" });
  };

  const captureUsageBaseline = async () => {
    try {
      usageBaselineRef.current = await fetchUsageSummary("ketik");
    } catch {
      usageBaselineRef.current = null;
    }
  };

  /**
   * Selisih pemakaian sejak chat dimulai (simulasi + telaah). Pemberitahuan
   * hanya muncul setelah telaah selesai, saat kedua biaya sudah tercatat.
   */
  const computeUsageDelta = async (notifyUser: boolean) => {
    const baseline = usageBaselineRef.current;
    if (!baseline) return;
    setSessionDeltaPending(true);
    try {
      const delta = await pollUsageDelta(
        () => fetchUsageSummary("ketik"),
        baseline,
      );
      setSessionDelta(delta);
      if (notifyUser && delta && (delta.costIdr > 0 || delta.totalTokens > 0)) {
        notify.info(`Pemakaian AI sesi ini: ${formatUsageDeltaLabel(delta)}`);
        usageBaselineRef.current = null;
      }
    } catch (error) {
      console.warn("[Ketik] Failed to compute usage delta:", error);
    } finally {
      setSessionDeltaPending(false);
    }
  };

  const startSimulation = async (subject: SimulationSubjectSelection) => {
    setShowSubjectPicker(false);
    if (!session?.access_token) {
      notify.error("Sesi Anda telah berakhir. Silakan login kembali.");
      return;
    }
    const activeScenarios = settings.scenarios.filter((s) => s.isActive);
    if (activeScenarios.length === 0) {
      notify.warning("Aktifkan minimal satu skenario di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }
    const consumerTypes = Array.isArray(settings.consumerTypes)
      ? settings.consumerTypes
      : [];
    if (consumerTypes.length === 0) {
      notify.warning("Tambahkan minimal satu karakter konsumen di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }
    const consumerType =
      settings.activeConsumerTypeId === "random"
        ? pickRandom(consumerTypes)
        : (consumerTypes.find(
            (item) => item.id === settings.activeConsumerTypeId,
          ) ?? consumerTypes[0]);

    await captureUsageBaseline();
    setSessionDelta(null);
    setActiveChat({
      scenario: pickRandom(activeScenarios),
      subject,
      config: {
        scenarios: activeScenarios,
        consumerType,
        identity: resolveKetikSessionIdentity(settings.identitySettings),
        selectedModel: settings.selectedModel,
        simulationDuration: settings.simulationDuration || 5,
        responsePacingMode: settings.responsePacingMode || "realistic",
      },
    });
  };

  const requestStartSimulation = () => {
    if (canPickParticipant) {
      setShowSubjectPicker(true);
    } else {
      void startSimulation({ type: "self" });
    }
  };

  const endSession = async (messages: ChatMessage[]) => {
    if (!activeChat) return;
    // Chat tanpa balasan agen tidak punya apa pun untuk ditelaah.
    if (!messages.some((message) => message.sender === "agent")) {
      setActiveChat(null);
      return;
    }
    setIsSaving(true);
    try {
      const saved = await ketikApi.persistSession({
        scenarioTitle: activeChat.scenario.title,
        consumerName: activeChat.config.identity.name,
        consumerPhone: activeChat.config.identity.phone,
        consumerCity: activeChat.config.identity.city,
        messages,
        simulationDuration: activeChat.config.simulationDuration,
        simulationSubject: activeChat.subject,
      });
      const item: KetikSessionHistoryItem = {
        ...saved,
        reviewStatus: saved.reviewStatus ?? "pending",
        simulationSubject: saved.simulationSubject ?? null,
      };
      setHistory((prev) => [item, ...prev.filter((s) => s.id !== item.id)]);
      setHistoryState("ready");
      setActiveChat(null);
      void computeUsageDelta(false);
      void navigate({
        to: "/ketik",
        search: { sesi: item.id, tahap: "telaah" },
      });
    } catch (error) {
      console.error("[Ketik] Failed to save session:", error);
      notify.error(
        "Percakapan belum tersimpan. Chat tetap terbuka, coba akhiri lagi.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const historyRef = useRef(history);
  const computeUsageDeltaRef = useRef(computeUsageDelta);
  useEffect(() => {
    historyRef.current = history;
    computeUsageDeltaRef.current = computeUsageDelta;
  });

  const handleSessionChange = useCallback(
    (updated: KetikSessionHistoryItem) => {
      const previous = historyRef.current.find((item) => item.id === updated.id);
      if (
        updated.reviewStatus === "completed" &&
        previous?.reviewStatus !== "completed"
      ) {
        void computeUsageDeltaRef.current(true);
      }
      setHistory((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    },
    [],
  );

  const handleSaveSettings = async (newSettings: KetikAppSettings) => {
    await ketikApi.saveSettings(newSettings, userId);
    setSettings(newSettings);
  };

  const handleSaveTemplates = async (templates: KetikQuickTemplate[]) => {
    await ketikApi.saveTemplates(templates);
  };

  const summary = useMemo(() => summarizeKetikLanding(history), [history]);
  const hasSessionDelta = Boolean(
    sessionDelta &&
    (sessionDelta.costIdr > 0 ||
      sessionDelta.totalTokens > 0 ||
      sessionDelta.totalCalls > 0),
  );

  const view = activeChat ? "chat" : requestedSessionId ? "telaah" : "home";

  return (
    <div className="min-h-screen font-sans">
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="relative z-10"
          >
            <section
              aria-labelledby="ketik-hero-title"
              className="border-b border-border bg-surface-elevated"
            >
              <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-x-14 gap-y-10 px-6 pt-10 pb-14">
                <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
                  <div className="flex flex-col gap-5">
                    <h1
                      id="ketik-hero-title"
                      className="font-display text-4xl leading-[1.08] font-extrabold tracking-[-0.04em] text-balance text-foreground sm:text-5xl lg:text-[3.5rem]"
                    >
                      Pahami konsumennya.{" "}
                      <span className="block text-module-ketik">
                        Balas chat dengan tepat.
                      </span>
                    </h1>
                    <p className="max-w-[52ch] text-base leading-7 text-pretty text-fg2 sm:text-[17px]">
                      KETIK (
                      <span className="font-semibold text-foreground">
                        {KETIK_EXPANDED_TITLE}
                      </span>
                      ) adalah latihan membalas chat konsumen. Chat berjalan
                      seperti percakapan nyata, lalu AI menelaah setiap balasan
                      Anda dan menunjukkan kalimat yang perlu diperbaiki.
                    </p>
                  </div>

                  {/* Aksi utama, lalu menu KETIK sebagai baris kedua yang lebih tenang. */}
                  <div className="flex flex-col items-start gap-3">
                    <Button
                      type="button"
                      size="lg"
                      onClick={requestStartSimulation}
                      className="min-h-[44px] gap-2.5 px-5 text-sm font-semibold"
                    >
                      Mulai simulasi
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                    <nav
                      aria-label="Menu KETIK"
                      className="flex flex-wrap gap-2"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openHistory}
                        className={navButtonClass}
                      >
                        <History data-icon="inline-start" />
                        Riwayat
                      </Button>
                      <UsagePopover
                        module="ketik"
                        triggerClassName={navButtonClass}
                        sessionDelta={sessionDelta}
                        sessionDeltaPending={sessionDeltaPending}
                        triggerBadge={
                          hasSessionDelta &&
                          sessionDelta && (
                            <span className="rounded-full bg-module-ketik/10 px-2 py-px text-xs font-semibold text-module-ketik">
                              <span className="sr-only">Sesi terakhir </span>
                              {formatUsageDeltaLabel(sessionDelta)}
                            </span>
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsSettingsOpen(true)}
                        className={navButtonClass}
                      >
                        <SlidersHorizontal data-icon="inline-start" />
                        Pengaturan
                      </Button>
                    </nav>
                  </div>
                </div>

                <div className="mx-auto flex w-full min-w-0 max-w-[440px] flex-[1_1_360px]">
                  <KetikStageDemo />
                </div>
              </div>
            </section>

            <KetikLandingOverview
              summary={summary}
              historyState={historyState}
              onRetryHistory={() => void loadHistory()}
              onOpenSession={openSession}
              onOpenHistory={openHistory}
            />
          </motion.div>
        )}

        {view === "chat" && activeChat && (
          <motion.div
            key="chat"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background p-2 sm:p-4 md:p-6"
          >
            <Card className="h-full w-full max-w-5xl overflow-hidden border-border bg-card p-0 md:max-h-[92vh] md:rounded-xl">
              <ChatInterface
                config={activeChat.config}
                scenario={activeChat.scenario}
                onEndSession={(messages) => void endSession(messages)}
                isEnding={isSaving}
                templates={settings.quickTemplates}
              />
            </Card>
          </motion.div>
        )}

        {view === "telaah" &&
          (reviewSession ? (
            <KetikReviewStage
              key={reviewSession.id}
              session={reviewSession}
              history={history}
              canStartReview={canStartReview}
              onSessionChange={handleSessionChange}
              onBack={() => void navigate({ to: "/ketik", search: {} })}
              onPracticeAgain={() => {
                void navigate({ to: "/ketik", search: {} });
                requestStartSimulation();
              }}
            />
          ) : (
            <div
              key="telaah-loading"
              role="status"
              className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground"
            >
              Memuat sesi latihan…
            </div>
          ))}
      </AnimatePresence>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        canManageTemplates={canManageTemplates}
        onSaveTemplates={handleSaveTemplates}
      />
      {showSubjectPicker && (
        <SimulationSubjectPicker
          accountKey={accountKey}
          canPickParticipant={canPickParticipant}
          onConfirm={(selection) => void startSimulation(selection)}
          onCancel={() => setShowSubjectPicker(false)}
        />
      )}
    </div>
  );
}
