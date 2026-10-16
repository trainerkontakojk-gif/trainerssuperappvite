import { can, normalizeRole } from "@trainers/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, History, SlidersHorizontal } from "lucide-react";
import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikHistorySummaryItem,
  KetikServerSession,
  KetikAssignmentSnapshot,
  KetikQuickTemplate,
  SimulationSubjectSelection,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS, KETIK_ERROR_MESSAGES } from "@trainers/types";
import { ketikApi } from "./ketikApi";
import { KetikStageDemo } from "./components/KetikStageDemo";
import {
  KetikLandingOverview,
  type KetikLoadState,
} from "./components/KetikLandingOverview";
import { KetikReviewStage } from "./components/KetikReviewStage";
import { ChatInterface } from "./components/ChatInterface";
import { SettingsModal } from "./components/SettingsModal";
import {
  useKetikHistoryDetail,
  useKetikLandingSummary,
} from "./hooks/useKetikHistoryDetail";
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
import { KetikAssignmentDialog } from "./components/KetikAssignmentDialog";

/** Kepanjangan KETIK dari metadata modul kanonik (`lib/app-config.ts`). */
const KETIK_EXPANDED_TITLE =
  APP_MODULES.find((module) => module.id === "ketik")?.expandedTitle ??
  "Kelas Etika & Trik Komunikasi";

const navButtonClass =
  "min-h-[44px] gap-2 bg-surface-elevated px-3.5 text-[13px]";

function isCurrentAccount(accountId: string | undefined) {
  return useAuthStore.getState().session?.user?.id === accountId;
}

export default function KetikLanding() {
  const navigate = useNavigate();
  const { sesi: requestedSessionId, tahap } = useSearch({ from: "/ketik" });
  const chatRequested = tahap === "chat";
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
  const [settingsLoad, setSettingsLoad] = useState<{
    userId: string | undefined;
    state: KetikLoadState;
  }>({ userId, state: "loading" });
  const settingsState =
    settingsLoad.userId === userId ? settingsLoad.state : "loading";
  const settingsRequestRef = useRef(0);
  const { summary, historyState, loadHistory } = useKetikLandingSummary(userId);
  const { reviewSession, detailState, retryDetail, updateDetail } =
    useKetikHistoryDetail(
      userId,
      chatRequested ? undefined : requestedSessionId,
    );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [activeChat, setActiveChat] = useState<KetikServerSession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const startRequest = useRef<{ id: string; subjectKey: string } | null>(null);
  const [resumeError, setResumeError] = useState(false);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [assignment, setAssignment] = useState<{
    userId: string | undefined;
    state: KetikLoadState;
    data: KetikAssignmentSnapshot | null;
  }>({ userId, state: "loading", data: null });
  const [assignmentAttempt, setAssignmentAttempt] = useState(0);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const needsAssignment =
    normalizedRole === "agent" || normalizedRole === "leader";
  const assignmentState =
    assignment.userId === userId ? assignment.state : "loading";
  const assignmentBlocked =
    needsAssignment &&
    (assignmentState !== "ready" || !assignment.data?.assignment);
  useEffect(() => {
    if (!needsAssignment) return;
    let cancelled = false;
    setAssignment({ userId, state: "loading", data: null });
    void ketikApi
      .getAssignment()
      .then((data) => {
        if (!cancelled) setAssignment({ userId, state: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setAssignment({ userId, state: "error", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, needsAssignment, assignmentAttempt]);
  useEffect(() => {
    setActiveChat(null);
    setAssignmentOpen(false);
    startRequest.current = null;
    setIsStarting(false);
    setIsSaving(false);
  }, [userId]);
  useEffect(() => {
    if (
      !chatRequested ||
      !requestedSessionId ||
      activeChat?.id === requestedSessionId
    )
      return;
    let cancelled = false;
    setResumeError(false);
    void ketikApi
      .getSession(requestedSessionId)
      .then(async (loaded) => {
        if (cancelled) return;
        if (loaded.state === "active") {
          setActiveChat(loaded);
          return;
        }
        if (loaded.state === "discarded") {
          void navigate({ to: "/ketik", search: {}, replace: true });
          return;
        }
        const item = await ketikApi.finishSession(loaded.id);
        if (cancelled) return;
        if (!item) throw new Error("Finished session missing");
        loadHistory();
        void navigate({
          to: "/ketik",
          search: { sesi: item.id, tahap: "telaah" },
          replace: true,
        });
      })
      .catch(() => {
        if (!cancelled) setResumeError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    chatRequested,
    requestedSessionId,
    activeChat?.id,
    resumeAttempt,
    userId,
    navigate,
    loadHistory,
  ]);
  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const usageBaselineRef = useRef<UsageSnapshot | null>(null);

  const loadSettings = useCallback(async () => {
    const request = ++settingsRequestRef.current;
    setSettingsLoad({ userId, state: "loading" });
    try {
      const loaded = await ketikApi.getSettings(userId);
      if (request !== settingsRequestRef.current) return;
      setSettings(loaded);
      setSettingsLoad({ userId, state: "ready" });
    } catch {
      if (request !== settingsRequestRef.current) return;
      setSettingsLoad({ userId, state: "error" });
    }
  }, [userId]);

  useEffect(() => {
    setIsSettingsOpen(false);
    void loadSettings();
    return () => {
      settingsRequestRef.current += 1;
    };
  }, [loadSettings]);

  useEffect(() => {
    setShowSubjectPicker(false);
  }, [accountKey, canPickParticipant]);

  const openSession = (item: KetikHistorySummaryItem) => {
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
    if (settingsState !== "ready" || assignmentBlocked || isStarting) return;
    const account = userId;
    setShowSubjectPicker(false);
    setIsStarting(true);
    const subjectKey = subject.type === "self" ? "self" : subject.participantId;
    if (startRequest.current?.subjectKey !== subjectKey)
      startRequest.current = { id: crypto.randomUUID(), subjectKey };
    const request = startRequest.current;
    try {
      await captureUsageBaseline();
      if (!isCurrentAccount(account)) return;
      const started = await ketikApi.startSession(request.id, subject);
      if (!isCurrentAccount(account)) return;
      startRequest.current = null;
      setSessionDelta(null);
      setActiveChat(started);
      await navigate({
        to: "/ketik",
        search: { sesi: started.id, tahap: "chat" },
      });
    } catch {
      if (isCurrentAccount(account))
        notify.error(
          "Sesi belum bisa dimulai. Periksa penugasan dan pengaturan, lalu coba lagi.",
        );
    } finally {
      if (isCurrentAccount(account)) setIsStarting(false);
    }
  };
  const requestStartSimulation = () => {
    if (settingsState !== "ready" || assignmentBlocked || isStarting) return;
    if (canPickParticipant) setShowSubjectPicker(true);
    else void startSimulation({ type: "self" });
  };
  const endSession = async () => {
    if (!activeChat || isSaving) return;
    const account = userId;
    setIsSaving(true);
    try {
      const item = await ketikApi.finishSession(activeChat.id);
      if (!isCurrentAccount(account)) return;
      if (!item) {
        await navigate({ to: "/ketik", search: {} });
        setActiveChat(null);
        return;
      }
      loadHistory();
      void computeUsageDelta(false);
      await navigate({
        to: "/ketik",
        search: { sesi: item.id, tahap: "telaah" },
      });
      setActiveChat(null);
    } catch {
      if (isCurrentAccount(account))
        notify.error(
          "Percakapan belum tersimpan. Chat tetap terbuka, coba akhiri lagi.",
        );
    } finally {
      if (isCurrentAccount(account)) setIsSaving(false);
    }
  };

  const reviewSessionRef = useRef(reviewSession);
  const computeUsageDeltaRef = useRef(computeUsageDelta);
  useEffect(() => {
    reviewSessionRef.current = reviewSession;
    computeUsageDeltaRef.current = computeUsageDelta;
  });
  const handleSessionChange = useCallback(
    (updated: KetikSessionHistoryItem) => {
      const previous = reviewSessionRef.current;
      if (!previous || previous.id !== updated.id) return;
      if (
        updated.reviewStatus === "completed" &&
        previous.reviewStatus !== "completed"
      ) {
        void computeUsageDeltaRef.current(true);
      }
      updateDetail({
        ...updated,
        previousFinalScore: previous.previousFinalScore,
      });
      loadHistory();
    },
    [updateDetail, loadHistory],
  );

  const handleSaveSettings = async (newSettings: KetikAppSettings) => {
    await ketikApi.saveSettings(newSettings, userId);
    setSettings(newSettings);
  };

  const handleSaveTemplates = async (templates: KetikQuickTemplate[]) => {
    await ketikApi.saveTemplates(templates);
  };

  const hasSessionDelta = Boolean(
    sessionDelta &&
    (sessionDelta.costIdr > 0 ||
      sessionDelta.totalTokens > 0 ||
      sessionDelta.totalCalls > 0),
  );

  const view =
    activeChat && chatRequested && activeChat.id === requestedSessionId
      ? "chat"
      : requestedSessionId
        ? chatRequested
          ? "resume"
          : "telaah"
        : "home";

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
                      disabled={
                        settingsState !== "ready" ||
                        assignmentBlocked ||
                        isStarting
                      }
                      aria-describedby={
                        settingsState !== "ready"
                          ? "ketik-settings-status"
                          : assignmentBlocked
                            ? "ketik-assignment-status"
                            : undefined
                      }
                      className="min-h-[44px] gap-2.5 px-5 text-sm font-semibold"
                    >
                      Mulai simulasi
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                    {settingsState === "loading" && (
                      <p
                        id="ketik-settings-status"
                        role="status"
                        className="text-sm text-fg2"
                      >
                        Memuat pengaturan…
                      </p>
                    )}
                    {settingsState === "error" && (
                      <div
                        id="ketik-settings-status"
                        role="alert"
                        className="flex flex-wrap items-center gap-3 text-sm text-foreground"
                      >
                        <p>{KETIK_ERROR_MESSAGES.SETTINGS_LOAD_FAILED}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadSettings()}
                          className="min-h-[44px]"
                        >
                          Coba muat pengaturan
                        </Button>
                      </div>
                    )}
                    {needsAssignment && (
                      <div
                        id="ketik-assignment-status"
                        role={assignmentState === "error" ? "alert" : "status"}
                        className="max-w-prose text-sm text-fg2"
                      >
                        {assignmentState === "loading"
                          ? "Memuat penugasan…"
                          : assignmentState === "error"
                            ? "Penugasan belum bisa dimuat. Coba lagi."
                            : assignment.data?.assignment
                              ? "Skenario sudah ditugaskan. Pengaturan pribadi dapat Anda sesuaikan."
                              : "Belum ada penugasan. Hubungi trainer untuk mendapatkan skenario latihan."}
                        {(assignmentState === "error" ||
                          (assignmentState === "ready" &&
                            !assignment.data?.assignment)) && (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 min-h-[44px]"
                            onClick={() => setAssignmentAttempt((n) => n + 1)}
                          >
                            Coba muat penugasan
                          </Button>
                        )}
                      </div>
                    )}
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
                      {can(normalizedRole, "ketik.assignments.write") && (
                        <Button
                          type="button"
                          variant="outline"
                          className={navButtonClass}
                          onClick={() => setAssignmentOpen(true)}
                          disabled={settingsState !== "ready"}
                        >
                          Penugasan
                        </Button>
                      )}
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
                        disabled={settingsState !== "ready"}
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
                key={activeChat.id}
                session={activeChat}
                onEndSession={() => void endSession()}
                isEnding={isSaving}
                templates={settings.quickTemplates}
              />
            </Card>
          </motion.div>
        )}

        {view === "resume" && (
          <div
            key="resume"
            className="mx-auto max-w-6xl px-6 py-10"
            role={resumeError ? "alert" : "status"}
          >
            <p>
              {resumeError
                ? "Sesi belum bisa dimuat. Coba lagi."
                : "Memuat sesi chat…"}
            </p>
            {resumeError && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={() => setResumeAttempt((n) => n + 1)}>
                  Coba muat sesi
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void navigate({ to: "/ketik", search: {} })}
                >
                  Kembali ke KETIK
                </Button>
              </div>
            )}
          </div>
        )}
        {view === "telaah" &&
          (reviewSession ? (
            <KetikReviewStage
              key={reviewSession.id}
              session={reviewSession}
              previousScore={reviewSession.previousFinalScore}
              canStartReview={canStartReview}
              onSessionChange={handleSessionChange}
              onBack={() => void navigate({ to: "/ketik", search: {} })}
              onPracticeAgain={() => {
                void navigate({ to: "/ketik", search: {} });
                requestStartSimulation();
              }}
            />
          ) : detailState === "error" ? (
            <div
              key="telaah-error"
              className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-10"
            >
              <p role="alert">
                Sesi belum bisa dimuat. Sesi mungkin sudah dihapus atau tidak
                dapat diakses.
              </p>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={retryDetail}
              >
                Coba lagi
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => void navigate({ to: "/ketik", search: {} })}
              >
                Kembali ke KETIK
              </Button>
            </div>
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

      {assignmentOpen && (
        <KetikAssignmentDialog
          key={userId}
          onClose={() => setAssignmentOpen(false)}
        />
      )}
      <SettingsModal
        isOpen={isSettingsOpen && settingsState === "ready"}
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
