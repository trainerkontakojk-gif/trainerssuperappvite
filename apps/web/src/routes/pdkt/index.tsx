import { can } from "@trainers/types";
import { usePdktSubject } from "./utils/usePdktSubject";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SimulationSubjectPicker } from "../../components/simulation/SimulationSubjectPicker";
import { useAuthStore } from "../../store/authStore";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, History, SlidersHorizontal } from "lucide-react";
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
import { APP_MODULES } from "../../lib/app-config";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import { createSettingsVersionStore } from "../../lib/settings-contract";

/** Kepanjangan PDKT dari metadata modul kanonik (`lib/app-config.ts`). */
const PDKT_EXPANDED_TITLE =
  APP_MODULES.find((module) => module.id === "pdkt")?.expandedTitle ??
  "Paham Dulu Kasih Tanggapan";

const navButtonClass =
  "min-h-[44px] gap-2 bg-surface-elevated px-3.5 text-[13px]";

export default function PdktLanding() {
  const navigate = useNavigate();
  const {
    sesi: requestedSessionId,
    ruang,
    email,
    tahap,
    dari,
  } = useSearch({ from: "/pdkt" });
  const view = ruang === 1 || requestedSessionId || email ? "mailbox" : "home";
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const profile = useAuthStore((st) => st.profile);
  const session = useAuthStore((st) => st.session);
  const accountKey = session?.user?.id ?? null;
  const canPickParticipant = can(profile?.role, "simulation.subject.select");
  const [simulationSubject, setSimulationSubject] = usePdktSubject(
    accountKey,
    canPickParticipant,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
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

  const replaySession = requestedSessionId
    ? (history.find((item) => item.id === requestedSessionId) ?? null)
    : null;
  const selectedId =
    email ??
    (replaySession
      ? (mailboxItems?.find((item) => item.history_id === replaySession.id)
          ?.id ?? `replay_${replaySession.id}`)
      : null);

  const handleSelectSession = (session: SessionHistory) => {
    void navigate({ to: "/pdkt", search: { ruang: 1, sesi: session.id } });
  };

  // Tautan valid tetap di URL. Hanya sesi hilang/gagal yang kembali ke landing.
  useEffect(() => {
    if (!requestedSessionId || (!historyError && !historyReady)) return;
    if (!historyError && replaySession) return;
    notify.error(
      historyError
        ? "Riwayat belum bisa dimuat, jadi sesi itu belum bisa dibuka."
        : "Sesi itu tidak ada lagi di riwayat Anda.",
    );
    void navigate({ to: "/pdkt", search: {}, replace: true });
  }, [requestedSessionId, historyReady, historyError, replaySession, navigate]);

  // Berpindah Pahami/Telaah pada email yang sama mempertahankan asal Riwayat.
  const handleSelectedIdChange = useCallback(
    (id: string | null, replace = false, review = false) =>
      navigate({
        to: "/pdkt",
        search: {
          ruang: 1,
          ...(id ? { email: id } : {}),
          ...(id && review ? { tahap: "telaah" as const } : {}),
          ...(id && dari && id === selectedId ? { dari } : {}),
        },
        replace,
      }),
    [navigate, dari, selectedId],
  );

  const captureUsageBaseline = useCallback(async () => {
    try {
      const summary = await fetchUsageSummary("pdkt");
      if (summary) {
        usageSnapshotRef.current = summary;
      }
    } catch (err) {
      console.error("[PDKT] Failed to capture usage baseline:", err);
    }
  }, []);

  useEffect(() => {
    if (view !== "mailbox") return;
    void captureUsageBaseline();
    setSessionDelta(null);
    setSessionDeltaPending(false);
  }, [view, captureUsageBaseline]);

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
    setShowSubjectPicker(false);
  }, [accountKey, canPickParticipant]);

  const handleStartSimulation = (mailboxId: string | null = null) => {
    if (mailboxId) {
      void navigate({ to: "/pdkt", search: { ruang: 1, email: mailboxId } });
    } else if (canPickParticipant) {
      setShowSubjectPicker(true);
    } else {
      handleConfirmSubject({ type: "self" });
    }
  };

  const handleConfirmSubject = (selection: SimulationSubjectSelection) => {
    setSimulationSubject(selection);
    setShowSubjectPicker(false);
    void navigate({ to: "/pdkt", search: { ruang: 1 } });
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
              <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-x-14 gap-y-10 px-6 pt-10 pb-14">
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
                    <p
                      data-testid="pdkt-hero-intro"
                      className="max-w-[52ch] text-base leading-7 text-pretty text-fg2 sm:text-[17px]"
                    >
                      PDKT (
                      <span className="font-semibold text-foreground">
                        {PDKT_EXPANDED_TITLE}
                      </span>
                      ) adalah latihan membalas email konsumen. Baca emailnya
                      sampai paham, tulis balasan dengan kata-kata Anda sendiri,
                      lalu AI menelaah balasan itu dan menunjukkan bagian yang
                      perlu diperbaiki.
                    </p>
                  </div>

                  {/* Aksi utama, lalu menu PDKT sebagai baris kedua yang lebih tenang. */}
                  <div className="flex flex-col items-start gap-3">
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => handleStartSimulation()}
                      className="min-h-[44px] gap-2.5 px-5 text-sm font-semibold"
                    >
                      Mulai simulasi
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                    <nav
                      aria-label="Menu PDKT"
                      className="flex flex-wrap gap-2"
                    >
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
                              <span className="sr-only">Balasan terakhir </span>
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
                </div>

                <div className="mx-auto flex min-w-0 max-w-[600px] flex-[1_1_480px]">
                  <PdktStageDemo />
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
              {requestedSessionId && !replaySession ? (
                <div
                  role="status"
                  className="p-6 text-sm text-muted-foreground"
                >
                  Memuat sesi latihan…
                </div>
              ) : (
                <PdktSimulation
                  key={accountKey}
                  canPickParticipant={canPickParticipant}
                  simulationSubject={simulationSubject}
                  selectedId={selectedId}
                  isReviewOpen={
                    tahap === "telaah" || Boolean(requestedSessionId)
                  }
                  onSelectedIdChange={handleSelectedIdChange}
                  onBack={() => {
                    void navigate({ to: "/pdkt", search: {} });
                    void refetchMailbox();
                  }}
                  onBackToHistory={
                    dari === "riwayat" ? handleOpenHistory : undefined
                  }
                  onBeforeActivity={captureUsageBaseline}
                  onAfterActivity={(reason) =>
                    void computeUsageDeltaNow(reason)
                  }
                  initialReplaySession={replaySession}
                  initialSettings={settingsReady ? settings : undefined}
                  initialSettingsVersion={
                    settingsReady ? settingsVersion : undefined
                  }
                  initialHistory={historyReady ? history : undefined}
                  onSettingsChange={handleSessionSettingsChange}
                  onHistoryChange={handleSessionHistoryChange}
                  initialScenarios={defaultScenarios ?? undefined}
                  initialConsumerTypes={
                    defaultConsumerTypesFromApi ?? undefined
                  }
                />
              )}
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
