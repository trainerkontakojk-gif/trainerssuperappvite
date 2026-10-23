import { can } from "@trainers/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, History, SlidersHorizontal } from "lucide-react";
import type {
  SessionMetrics,
  SimulationSubjectSelection,
  SimulationSubjectSnapshot,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import { SimulationSubjectPicker } from "../../components/simulation/SimulationSubjectPicker";
import { UsagePopover } from "../../components/simulation/UsagePopover";
import { ApiError } from "../../lib/api";
import { formatSimulationSubjectLabel } from "../../lib/simulation-subject-display";
import { notify } from "../../lib/toast";
import { practiceQuotaMessage } from "../../lib/practice-quota";
import { usePracticeQuota } from "../../hooks/usePracticeQuota";
import { QuotaLine } from "../../components/simulation/QuotaLine";
import {
  formatUsageDeltaLabel,
  pollUsageDelta,
  type UsageDelta,
  type UsageSnapshot,
} from "../../lib/usage-snapshot";
import { fetchUsageSummary } from "../../lib/usage-summary";
import { useAuthStore } from "../../store/authStore";
import { MicCheck, type MicCheckStatus } from "./components/MicCheck";
import { PhoneInterface } from "./components/PhoneInterface";
import { SettingsModal } from "./components/SettingsModal";
import { TelefunLandingOverview } from "./components/TelefunLandingOverview";
import { TelefunReviewStage } from "./components/TelefunReviewStage";
import { TelefunStageDemo } from "./components/TelefunStageDemo";
import { useTelefunHistory } from "./hooks/useTelefunHistory";
import { saveTelefunSession, scoreTelefunSession } from "./sessionFinalizer";
import {
  createTelefunSessionReconciler,
  type TelefunSessionReconciler,
} from "./sessionReconciler";
import {
  installTelefunRecordingReconciliation,
  reconcileTelefunRecordingQueue,
} from "./services/telefun-recording-reconciliation";
import {
  createTelefunSession,
  getTelefunMonthCount,
  getTelefunSession,
  getTelefunSettings,
  mapTelefunSessionRow,
  saveTelefunSettings,
} from "./telefunApi";
import type { TelefunAppSettings } from "./telefunSettings";
import {
  DEFAULT_TELEFUN_SETTINGS,
  normalizeTelefunBrowserSelection,
  parseTelefunSettings,
  resolveFinalIdentity,
} from "./telefunSettings";
import type { CallRecord } from "./types";
import { summarizeTelefunLanding } from "./utils/landingSummary";

const navButtonClass =
  "min-h-[44px] gap-2 bg-surface-elevated px-3.5 text-[13px]";

type ActiveTelefunSessionConfig = TelefunAppSettings & {
  simulationSubject?: SimulationSubjectSnapshot | null;
  simulationSubjectSelection?: SimulationSubjectSelection;
  microphoneDeviceId?: string;
};

interface ActiveCall {
  config: ActiveTelefunSessionConfig;
  accessToken: string;
  sessionId: string;
  scenarioTitle: string;
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

async function fetchDetail(sessionId: string): Promise<CallRecord | null> {
  try {
    return mapTelefunSessionRow(await getTelefunSession(sessionId));
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export default function TelefunLanding() {
  const navigate = useNavigate();
  const { sesi: requestedSessionId } = useSearch({ from: "/telefun" });
  const shouldReduceMotion = useReducedMotion();
  const authSession = useAuthStore((st) => st.session);
  const authProfile = useAuthStore((st) => st.profile);
  const accountKey = authSession?.user?.id ?? null;
  const canPickParticipant = can(
    authProfile?.role,
    "simulation.subject.select",
  );

  const [settings, setSettings] = useState<TelefunAppSettings>(
    DEFAULT_TELEFUN_SETTINGS,
  );
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [micStatus, setMicStatus] = useState<MicCheckStatus>("asking");
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string>();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [sessionDelta, setSessionDelta] = useState<UsageDelta | null>(null);
  const [sessionDeltaPending, setSessionDeltaPending] = useState(false);
  const telefunHistory = useTelefunHistory();
  const { history, state: historyState, upsert } = telefunHistory;

  const sessionBaselineRef = useRef<UsageSnapshot | null>(null);
  const sessionRunIdRef = useRef(0);
  const startCallInFlightRef = useRef(false);
  const failedSessionIdsRef = useRef(new Set<string>());
  const quota = usePracticeQuota("telefun");
  // Panggilan aktif dibaca lewat ref: callback rekaman bisa selesai setelah render berikutnya.
  const activeCallRef = useRef<ActiveCall | null>(null);
  // ID sesi yang dikonfirmasi server suara; bisa berbeda dari ID awal.
  const callSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeCallRef.current = activeCall;
    callSessionIdRef.current = activeCall?.sessionId ?? null;
  }, [activeCall]);

  useEffect(() => installTelefunRecordingReconciliation(), []);

  useEffect(() => {
    setShowSubjectPicker(false);
  }, [accountKey, canPickParticipant]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getTelefunSettings();
        if (!cancelled) {
          setSettings(
            data ? parseTelefunSettings(data) : DEFAULT_TELEFUN_SETTINGS,
          );
        }
      } catch {
        if (!cancelled) setSettings(DEFAULT_TELEFUN_SETTINGS);
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
          void reconcileTelefunRecordingQueue();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pemantau status analisis: memperbarui sesi di riwayat sampai skor ada.
  const sessionReconcilerRef = useRef<TelefunSessionReconciler | null>(null);
  useEffect(() => {
    const reconciler = createTelefunSessionReconciler({
      fetchSessionDetail: async (sessionId, { signal }) => {
        try {
          return await getTelefunSession(sessionId, { signal });
        } catch (error) {
          if (error instanceof ApiError && error.code === "NOT_FOUND") {
            return null;
          }
          throw error;
        }
      },
      onRow: (row) => upsert(mapTelefunSessionRow(row)),
    });
    sessionReconcilerRef.current = reconciler;
    return () => {
      reconciler.dispose();
      sessionReconcilerRef.current = null;
    };
  }, [upsert]);

  const watchScoring = useCallback((sessionId: string) => {
    sessionReconcilerRef.current?.watch(sessionId);
  }, []);

  const listedRecord = requestedSessionId
    ? (history.find((record) => record.id === requestedSessionId) ?? null)
    : null;
  // Daftar riwayat tidak membawa transkrip: Telaah memuat sesi penuh sekali.
  const summaryId = listedRecord?.detail === "summary" ? listedRecord.id : null;
  const reviewRecord = summaryId ? null : listedRecord;
  const [detailFailedId, setDetailFailedId] = useState<string | null>(null);
  useEffect(() => {
    if (!summaryId) return;
    let cancelled = false;
    fetchDetail(summaryId)
      .then((full) => {
        if (cancelled) return;
        if (full) upsert(full);
        else setDetailFailedId(summaryId);
      })
      .catch((error) => {
        console.warn("[Telefun] Session detail unavailable", error);
        if (!cancelled) setDetailFailedId(summaryId);
      });
    return () => {
      cancelled = true;
    };
  }, [summaryId, upsert]);

  // Tautan valid tetap di URL. Hanya sesi hilang/gagal dimuat yang kembali ke landing.
  useEffect(() => {
    const detailFailed =
      detailFailedId !== null && detailFailedId === requestedSessionId;
    if (
      !requestedSessionId ||
      historyState === "loading" ||
      reviewRecord ||
      (summaryId && !detailFailed)
    ) {
      return;
    }
    notify.error(
      detailFailed
        ? "Panggilan itu belum bisa dibuka. Coba lagi."
        : historyState === "error"
          ? "Riwayat belum bisa dimuat, jadi sesi itu belum bisa dibuka."
          : "Sesi itu tidak ada lagi di riwayat Anda.",
    );
    setDetailFailedId(null);
    void navigate({ to: "/telefun", search: {}, replace: true });
  }, [
    requestedSessionId,
    historyState,
    reviewRecord,
    summaryId,
    detailFailedId,
    navigate,
  ]);

  const openSession = (record: CallRecord) => {
    void navigate({
      to: "/telefun",
      search: { sesi: record.id, tahap: "telaah" },
    });
  };

  const openHistory = () => {
    void navigate({ to: "/telefun/history" });
  };

  const handleSaveSettings = async (newSettings: TelefunAppSettings) => {
    try {
      await saveTelefunSettings(newSettings);
      setSettings(newSettings);
      notify.success("Pengaturan Telefun tersimpan.");
    } catch (error) {
      notify.error("Pengaturan belum tersimpan. Coba lagi.");
      throw error;
    }
  };

  const startCallOnce = async (
    selection: SimulationSubjectSelection,
    retryConfig?: ActiveTelefunSessionConfig,
  ) => {
    const token = getToken();
    if (!token) {
      notify.error("Sesi Anda telah berakhir. Silakan login kembali.");
      return;
    }

    const activeScenarios = settings.scenarios.filter((s) => s.isActive);
    if (!retryConfig && activeScenarios.length === 0) {
      notify.warning("Aktifkan minimal satu skenario di Pengaturan.");
      setIsSettingsOpen(true);
      return;
    }
    const scenario = retryConfig?.activeScenario ?? pickRandom(activeScenarios);
    const consumerType =
      retryConfig?.activeConsumerType ??
      (settings.preferredConsumerTypeId === "random"
        ? pickRandom(settings.consumerTypes)
        : (settings.consumerTypes.find(
            (ct) => ct.id === settings.preferredConsumerTypeId,
          ) ?? settings.consumerTypes[0]));

    const normalizedSelection = normalizeTelefunBrowserSelection(
      settings.telefunModelId,
      settings.telefunTransport,
    );
    const identity =
      retryConfig?.resolvedIdentity ??
      resolveFinalIdentity(
        settings.identitySettings,
        normalizedSelection.model.id,
      );

    const config: ActiveTelefunSessionConfig = retryConfig
      ? { ...retryConfig }
      : {
          ...settings,
          microphoneDeviceId,
          telefunModelId: normalizedSelection.model.id,
          telefunTransport: "gemini-live",
          activeScenario: scenario,
          activeConsumerType: consumerType,
          scenarioTitle: scenario.title,
          consumerName: identity.name,
          consumerGender: identity.gender,
          voiceName: identity.voiceName || settings.voiceName,
          resolvedIdentity: identity,
        };

    let sessionId: string;
    try {
      const res = await createTelefunSession({
        scenario_title: scenario.title,
        consumer_name: identity.name,
        consumer_gender: identity.gender,
        consumer_phone: identity.phone,
        consumer_city: identity.city,
        persona_config: {
          consumerType: consumerType?.name || consumerType?.id,
        },
        configured_duration: config.maxCallDuration * 60,
        response_pacing_mode: config.responsePacingMode,
        telefun_model_id: config.telefunModelId,
        telefun_transport: config.telefunTransport,
        simulationSubject: selection,
      });
      if (!res.id) throw new Error("missing session id");
      sessionId = res.id;
      config.sessionId = res.id;
      config.simulationSubject = res.simulationSubject ?? null;
      config.simulationSubjectSelection = selection;
    } catch (error) {
      notify.error(
        practiceQuotaMessage(error) ??
          "Gagal membuat sesi panggilan. Silakan coba lagi.",
      );
      return;
    }

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

    setActiveCall({
      config,
      accessToken: token,
      sessionId,
      scenarioTitle: scenario.title,
    });
  };

  const startCall = async (
    selection: SimulationSubjectSelection,
    retryConfig?: ActiveTelefunSessionConfig,
    closeFailedAttempt?: () => Promise<boolean>,
  ) => {
    if (startCallInFlightRef.current) return;
    startCallInFlightRef.current = true;
    try {
      if (closeFailedAttempt && !(await closeFailedAttempt())) return;
      await startCallOnce(selection, retryConfig);
    } finally {
      startCallInFlightRef.current = false;
      setShowSubjectPicker(false);
      void quota.refetch();
    }
  };

  const requestStartCall = () => {
    if (quota.blocked) return;
    if (!canPickParticipant) {
      void startCall({ type: "self" });
      return;
    }
    setMicStatus("asking");
    setMicrophoneDeviceId(undefined);
    setShowSubjectPicker(true);
  };

  const handleEndCall = (reason?: "completed" | "failed" | "timeout") => {
    if (reason === "failed" && activeCallRef.current) {
      failedSessionIdsRef.current.add(
        callSessionIdRef.current ?? activeCallRef.current.sessionId,
      );
    }
    setActiveCall(null);
  };

  const startUsagePolling = (runId: number, baseline: UsageSnapshot | null) => {
    if (!baseline || runId !== sessionRunIdRef.current) return;
    setSessionDeltaPending(true);
    pollUsageDelta(() => fetchUsageSummary("telefun"), baseline)
      .then((delta) => {
        if (runId !== sessionRunIdRef.current) return;
        setSessionDelta(delta);
        if (delta && (delta.costIdr > 0 || delta.totalTokens > 0)) {
          notify.info(
            `Pemakaian AI panggilan ini: ${formatUsageDeltaLabel(delta)}`,
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (runId === sessionRunIdRef.current) setSessionDeltaPending(false);
      });
  };

  const handleRecordingReady = async (
    url: string | null,
    consumerName: string,
    duration: number,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: SessionMetrics,
    call = activeCallRef.current,
  ) => {
    if (!call) return;
    const { config, scenarioTitle } = call;
    const sessionId =
      activeCallRef.current === call
        ? (callSessionIdRef.current ?? call.sessionId)
        : call.sessionId;
    const usageRunId = sessionRunIdRef.current;
    const usageBaseline = sessionBaselineRef.current;

    let saved: Awaited<ReturnType<typeof saveTelefunSession>> | null = null;
    try {
      saved = await saveTelefunSession({
        sessionId,
        fullBlob,
        agentBlob,
        duration,
        metrics,
        localUrl: url,
        sessionConfig: config,
        scenarioTitle,
        consumerName,
      });
    } catch (error) {
      console.error("[Telefun] Failed to finalize session", error);
    }

    if (saved && !saved.saveFailed) {
      if (saved.uploadFailed) {
        notify.warning(
          "Rekaman gagal diunggah, tetapi panggilan tetap tersimpan.",
        );
      }
      upsert({ ...saved.record, consumerCity: config.resolvedIdentity?.city });
    } else {
      notify.error(
        "Panggilan belum tersimpan di server. Rekaman hanya ada di perangkat ini.",
      );
      upsert({
        id: sessionId,
        date: new Date().toISOString(),
        url: url ?? "",
        consumerName: config.consumerName || consumerName,
        consumerCity: config.resolvedIdentity?.city,
        scenarioTitle,
        duration,
        sessionMetrics: metrics,
        simulationSubject: config.simulationSubject ?? null,
        syncStatus: "unsynced",
      });
    }

    // A failed recording still saves normally, but must not replace a retry
    // (or the return-to-landing action) with the old attempt's Telaah screen.
    if (!failedSessionIdsRef.current.has(sessionId)) {
      setActiveCall(null);
      void navigate({
        to: "/telefun",
        search: { sesi: sessionId, tahap: "telaah" },
      });
    }

    const savedForScoring = saved && !saved.saveFailed ? saved : null;
    const scoring = savedForScoring?.agentRecordingPath
      ? scoreTelefunSession({
          sessionId,
          agentRecordingPath: savedForScoring.agentRecordingPath,
          transport: config.telefunTransport,
        }).then((result) => {
          if (result.scoringStatus === "succeeded") {
            upsert({
              ...savedForScoring.record,
              consumerCity: config.resolvedIdentity?.city,
              // Skor yang tidak ada tetap kosong ("–"), tidak dipaksa 0.
              score: result.score ?? undefined,
              feedback: result.feedback,
              voiceAssessment: result.voiceAssessment,
              scoringStatus: "completed",
            });
          } else {
            // Antrean penilaian di server tetap berjalan; pantau statusnya.
            watchScoring(sessionId);
          }
        })
      : Promise.resolve();
    void scoring
      .catch((error) => {
        console.error("[Telefun] Background scoring failed:", error);
        watchScoring(sessionId);
      })
      .finally(() => startUsagePolling(usageRunId, usageBaseline));
  };

  // Panggilan bulan ini dari server; `null` = belum/gagal dihitung ("–").
  // Dihitung ulang saat riwayat bertambah (mis. panggilan baru tersimpan).
  const [serverMonthCount, setServerMonthCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTelefunMonthCount()
      .then((count) => {
        if (!cancelled) setServerMonthCount(count);
      })
      .catch((error) => {
        console.warn("[Telefun] Month count unavailable", error);
        if (!cancelled) setServerMonthCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [history.length]);
  const summary = useMemo(
    () => summarizeTelefunLanding(history, serverMonthCount),
    [history, serverMonthCount],
  );
  const hasSessionDelta = Boolean(
    sessionDelta &&
    (sessionDelta.costIdr > 0 ||
      sessionDelta.totalTokens > 0 ||
      sessionDelta.totalCalls > 0),
  );

  const view = activeCall ? "call" : requestedSessionId ? "telaah" : "home";

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
              aria-labelledby="telefun-hero-title"
              className="border-b border-border bg-surface-elevated"
            >
              <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-x-14 gap-y-10 px-6 pt-10 pb-14">
                <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
                  <div className="flex flex-col gap-5">
                    <h1
                      id="telefun-hero-title"
                      className="font-display text-4xl leading-[1.08] font-extrabold tracking-[-0.04em] text-balance text-foreground sm:text-5xl lg:text-[3.5rem]"
                    >
                      Dengarkan konsumennya.{" "}
                      <span className="block text-module-telefun">
                        Jawab dengan suara yang tenang.
                      </span>
                    </h1>
                    <p className="max-w-[52ch] text-base leading-7 text-pretty text-fg2 sm:text-[17px]">
                      Telefun adalah latihan menerima telepon konsumen. Konsumen
                      virtual berbicara seperti penelepon sungguhan, panggilan
                      direkam, lalu AI menilai cara Anda berbicara: kecepatan,
                      intonasi, artikulasi, filler, nada, dan penggunaan hold.
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3">
                    <Button
                      type="button"
                      size="lg"
                      onClick={requestStartCall}
                      disabled={settingsLoading || quota.blocked}
                      aria-describedby={
                        quota.status?.limit != null
                          ? "telefun-quota-status"
                          : undefined
                      }
                      className="min-h-[44px] gap-2.5 px-5 text-sm font-semibold"
                    >
                      {settingsLoading ? "Menyiapkan…" : "Mulai simulasi"}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                    <QuotaLine
                      id="telefun-quota-status"
                      status={quota.status}
                    />
                    <nav
                      aria-label="Menu Telefun"
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
                        module="telefun"
                        triggerClassName={navButtonClass}
                        sessionDelta={sessionDelta}
                        sessionDeltaPending={sessionDeltaPending}
                        triggerBadge={
                          hasSessionDelta &&
                          sessionDelta && (
                            <span className="rounded-full bg-module-telefun/10 px-2 py-px text-xs font-semibold text-module-telefun">
                              <span className="sr-only">
                                Panggilan terakhir{" "}
                              </span>
                              {formatUsageDeltaLabel(sessionDelta)}
                            </span>
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsSettingsOpen(true)}
                        disabled={settingsLoading}
                        className={navButtonClass}
                      >
                        <SlidersHorizontal data-icon="inline-start" />
                        Pengaturan
                      </Button>
                    </nav>
                  </div>
                </div>

                <div className="mx-auto flex w-full max-w-[440px] min-w-0 flex-[1_1_360px]">
                  <TelefunStageDemo />
                </div>
              </div>
            </section>

            <TelefunLandingOverview
              summary={summary}
              historyState={historyState}
              onRetryHistory={() => void telefunHistory.load()}
              onOpenSession={openSession}
              onOpenHistory={openHistory}
            />
          </motion.div>
        )}

        {view === "call" && activeCall && (
          <motion.div
            key="call"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-[100] bg-background"
          >
            <PhoneInterface
              key={activeCall.sessionId}
              config={activeCall.config}
              accessToken={activeCall.accessToken}
              onEndSession={handleEndCall}
              onRetry={(closeFailedAttempt) =>
                startCall(
                  activeCall.config.simulationSubjectSelection ?? {
                    type: "self",
                  },
                  activeCall.config,
                  closeFailedAttempt,
                )
              }
              onRecordingReady={(
                url,
                name,
                duration,
                fullBlob,
                agentBlob,
                metrics,
              ) =>
                handleRecordingReady(
                  url,
                  name,
                  duration,
                  fullBlob,
                  agentBlob,
                  metrics,
                  activeCall,
                )
              }
              participantLabel={
                activeCall.config.simulationSubject?.type === "participant"
                  ? formatSimulationSubjectLabel(
                      activeCall.config.simulationSubject,
                      { includeParticipantDetails: false },
                    )
                  : null
              }
              onSessionCreated={(id) => {
                // Disimpan di ref supaya PhoneInterface tidak dipasang ulang.
                callSessionIdRef.current = id;
              }}
            />
          </motion.div>
        )}

        {view === "telaah" &&
          (reviewRecord ? (
            <TelefunReviewStage
              key={reviewRecord.id}
              record={reviewRecord}
              history={history}
              onBack={() => void navigate({ to: "/telefun", search: {} })}
              onPracticeAgain={() => {
                void navigate({ to: "/telefun", search: {} });
                requestStartCall();
              }}
              onRecordChange={upsert}
              onWatchScoring={watchScoring}
              fetchDetail={fetchDetail}
            />
          ) : (
            <div
              key="telaah-loading"
              role="status"
              className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground"
            >
              Memuat panggilan…
            </div>
          ))}
      </AnimatePresence>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
      {showSubjectPicker && (
        <SimulationSubjectPicker
          accountKey={accountKey}
          canPickParticipant={canPickParticipant}
          title="Siapa yang berlatih?"
          description="Pilih peserta latihan dan pastikan mikrofon siap. Batal tidak membuat sesi atau memicu AI."
          confirmLabel="Mulai panggilan"
          confirmDisabled={micStatus !== "ready"}
          onConfirm={(selection) => startCall(selection)}
          onCancel={() => setShowSubjectPicker(false)}
        >
          <MicCheck
            onStatusChange={setMicStatus}
            onDeviceChange={setMicrophoneDeviceId}
          />
        </SimulationSubjectPicker>
      )}
    </div>
  );
}
