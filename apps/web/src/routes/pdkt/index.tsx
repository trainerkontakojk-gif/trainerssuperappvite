import { can } from "@trainers/types";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SimulationSubjectPicker } from "../../components/simulation/SimulationSubjectPicker";
import { useAuthStore } from "../../store/authStore";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, History, Mail, SlidersHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { PdktStageDemo } from "./components/PdktStageDemo";
import {
  PdktLandingOverview,
  type PdktLoadState,
} from "./components/PdktLandingOverview";
import { summarizePdktLanding } from "./utils/landingSummary";
import PdktSimulation from "./simulation";
import { SettingsModal } from "./components/SettingsModal";
import { mapHistoryRow, type SessionHistory } from "./utils/sessionHistory";
import { UsagePopover } from "./components/UsagePopover";
import { useApi } from "../../hooks/useApi";
import { pdktClient, unwrapResponse } from "../../lib/api";
import type { PdktAppSettings } from "./pdktSettings";
import {
  DEFAULT_PDKT_MODEL_ID,
  PDKT_FALLBACK_CONSUMER_TYPES as defaultConsumerTypes,
} from "./pdktSettings";
import type {
  PdktMailboxListItem,
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

const navButtonClass = "min-h-11 gap-2 bg-surface-elevated px-3.5 text-[13px]";

export default function PdktLanding() {
  const [view, setView] = useState<"home" | "mailbox">("home");
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [simulationSubject, setSimulationSubject] =
    useState<SimulationSubjectSelection>({ type: "self" });
  const profile = useAuthStore((st) => st.profile);
  const session = useAuthStore((st) => st.session);
  const accountKey = session?.user?.id ?? null;
  const canPickParticipant = can(profile?.role, "simulation.subject.select");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  // Email yang dipilih dari landing ("Belum dibalas"), dibuka setelah pemilih peserta.
  const [pendingMailboxId, setPendingMailboxId] = useState<string | null>(null);
  const [initialMailboxId, setInitialMailboxId] = useState<string | null>(null);

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
  // Daftar ringan (tanpa snapshot) untuk ringkasan dan daftar "Belum dibalas".
  const {
    data: mailboxItems,
    error: mailboxError,
    refetch: refetchMailbox,
  } = useApi<PdktMailboxListItem[]>("/pdkt/mailbox");

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
    setHistoryError(false);
    try {
      const res = (await unwrapResponse(
        await pdktClient.history.$get(),
      )) as any[];
      if (res) {
        setHistory(res.map(mapHistoryRow));
        setHistoryReady(true);
      }
    } catch (err) {
      console.error("[PDKT] Failed to load history:", err);
      setHistoryError(true);
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

  const [replaySession, setReplaySession] = useState<SessionHistory | null>(
    null,
  );

  const handleSelectSession = (session: SessionHistory) => {
    setReplaySession(session);
    setView("mailbox");
  };

  // `/pdkt?sesi=<id>` dari halaman Riwayat: buka sesi itu setelah riwayat termuat.
  const navigate = useNavigate();
  const { sesi: requestedSessionId } = useSearch({ from: "/pdkt" });
  useEffect(() => {
    if (!requestedSessionId) return;
    if (historyError) {
      notify.error(
        "Riwayat belum bisa dimuat, jadi sesi itu belum bisa dibuka.",
      );
    } else if (!historyReady) {
      return;
    } else {
      const session = history.find((item) => item.id === requestedSessionId);
      if (session) {
        handleSelectSession(session);
      } else {
        notify.error("Sesi itu tidak ada lagi di riwayat Anda.");
      }
    }
    void navigate({ to: "/pdkt", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSessionId, historyReady, historyError, history]);

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

  // Baseline diambil ulang tepat sebelum setiap balasan, jadi selisihnya adalah
  // pemakaian balasan terakhir (kirim + telaah). "Masih dihitung" hanya tampil
  // selama `computeUsageDeltaNow` berjalan; balasan yang gagal terkirim tidak
  // menyalakannya.
  const computeUsageDeltaNow = async (reason: "reply" | "review") => {
    if (!usageSnapshotRef.current) {
      setSessionDeltaPending(false);
      return;
    }
    setSessionDeltaPending(true);
    try {
      const delta = await pollUsageDelta(
        () => fetchUsageSummary("pdkt"),
        usageSnapshotRef.current,
      );
      setSessionDelta(delta);
      // Satu pemberitahuan per balasan: setelah telaah selesai, saat biaya
      // pembuatan email dan telaah sudah tercatat.
      if (
        reason === "review" &&
        delta &&
        (delta.costIdr > 0 || delta.totalTokens > 0)
      ) {
        const format = (v: number) =>
          v.toLocaleString("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          });
        const parts: string[] = [];
        const sim = delta.breakdown.simulation;
        const rev = delta.breakdown.review;

        if (sim.costIdr > 0 || sim.calls > 0) {
          parts.push(`Pembuatan email ${format(sim.costIdr)}`);
        }
        if (rev.costIdr > 0 || rev.calls > 0) {
          parts.push(`Telaah balasan ${format(rev.costIdr)}`);
        }
        notify.info(
          `Pemakaian AI: ${formatUsageDeltaLabel(delta)}`,
          parts.length ? parts.join(" · ") : undefined,
        );
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

  const handleStartSimulation = async (mailboxId: string | null = null) => {
    setPendingMailboxId(mailboxId);
    if (!canPickParticipant) {
      await handleConfirmSubject({ type: "self" }, mailboxId);
      return;
    }
    setShowSubjectPicker(true);
  };

  const handleConfirmSubject = async (
    sel: SimulationSubjectSelection,
    mailboxId: string | null = pendingMailboxId,
  ) => {
    setSimulationSubject(sel);
    setShowSubjectPicker(false);
    setInitialMailboxId(mailboxId);
    setPendingMailboxId(null);
    // Baseline usage is only needed for the delta notification; never block
    // opening the mailbox on it.
    void captureUsageBaseline();
    setSessionDelta(null);
    setSessionDeltaPending(false);
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

  const handleOpenHistory = () => {
    void navigate({ to: "/pdkt/history" });
  };

  const hasSessionDelta = Boolean(
    sessionDelta &&
    (sessionDelta.costIdr > 0 ||
      sessionDelta.totalTokens > 0 ||
      sessionDelta.totalCalls > 0),
  );
  const historyState: PdktLoadState = historyLoading
    ? "loading"
    : historyError
      ? "error"
      : "ready";
  const mailboxState: PdktLoadState = mailboxError
    ? "error"
    : mailboxItems
      ? "ready"
      : "loading";
  const landingSummary = useMemo(
    () => summarizePdktLanding(history, mailboxItems ?? []),
    [history, mailboxItems],
  );

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
            <section
              aria-labelledby="pdkt-hero-title"
              className="border-b border-border bg-surface-elevated"
            >
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pt-6 pb-16">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-3 pl-1.5 text-xs font-semibold text-fg2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-module-pdkt/10">
                      <Mail
                        aria-hidden="true"
                        className="size-3.5 text-module-pdkt"
                      />
                    </span>
                    PDKT · Simulasi email konsumen
                  </span>
                  <nav aria-label="Menu PDKT" className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenHistory}
                      className={navButtonClass}
                    >
                      <History data-icon="inline-start" />
                      Riwayat
                    </Button>
                    <UsagePopover
                      triggerClassName={navButtonClass}
                      sessionDelta={sessionDelta}
                      sessionDeltaPending={sessionDeltaPending}
                      triggerBadge={
                        hasSessionDelta &&
                        sessionDelta && (
                          <span className="rounded-full bg-module-pdkt/10 px-2 py-px text-xs font-semibold text-module-pdkt">
                            <span className="sr-only">
                              Kunjungan terakhir ke kotak masuk{" "}
                            </span>
                            {formatUsageDeltaLabel(sessionDelta)}
                          </span>
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenSettings}
                      className={navButtonClass}
                    >
                      <SlidersHorizontal data-icon="inline-start" />
                      Pengaturan
                    </Button>
                  </nav>
                </div>

                <div className="flex flex-wrap items-center gap-14">
                  <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
                    <div className="flex flex-col gap-5">
                      <h1
                        id="pdkt-hero-title"
                        className="font-display text-4xl leading-[1.08] font-extrabold tracking-[-0.04em] text-balance text-foreground sm:text-5xl lg:text-[3.5rem]"
                      >
                        Pahami keluhannya.{" "}
                        <span className="block text-module-pdkt">
                          Balas dengan tepat.
                        </span>
                      </h1>
                      <p className="max-w-[46ch] text-base leading-7 text-pretty text-fg2 sm:text-[17px]">
                        Baca email konsumen, tulis balasan sendiri tanpa
                        petunjuk jawaban, lalu lihat telaah AI tentang apa yang
                        perlu diperbaiki.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => handleStartSimulation()}
                        className="min-h-12 gap-2.5 px-5 text-sm font-semibold"
                      >
                        Mulai simulasi
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </div>

                  <div className="mx-auto flex min-w-0 flex-[1_1_480px] max-w-[600px]">
                    <PdktStageDemo />
                  </div>
                </div>
              </div>
            </section>

            <PdktLandingOverview
              summary={landingSummary}
              historyState={historyState}
              mailboxState={mailboxState}
              onRetryHistory={() => {
                setHistoryLoading(true);
                void fetchHistory();
              }}
              onRetryMailbox={() => void refetchMailbox()}
              onOpenMailbox={(mailboxId) =>
                void handleStartSimulation(mailboxId ?? null)
              }
              onOpenSession={handleSelectSession}
              onOpenHistory={handleOpenHistory}
            />
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
                  setInitialMailboxId(null);
                  void refetchMailbox();
                }}
                onBeforeActivity={captureUsageBaseline}
                onAfterActivity={(reason) => void computeUsageDeltaNow(reason)}
                initialSelectedMailboxId={initialMailboxId}
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
          onCancel={() => {
            setShowSubjectPicker(false);
            setPendingMailboxId(null);
          }}
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
    </div>
  );
}
