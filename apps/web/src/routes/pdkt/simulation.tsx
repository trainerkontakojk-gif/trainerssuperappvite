import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  MailboxSidebar,
  type MailboxFilter,
  type MailboxReviewState,
} from "./components/MailboxSidebar";
import { EmailDetailPane } from "./components/EmailDetailPane";
import { PdktReplyStage } from "./components/PdktReplyStage";
import { PdktReviewStage } from "./components/PdktReviewStage";
import { PdktWorkspaceHeader } from "./components/PdktWorkspaceHeader";
import { CreateEmailModal } from "./components/CreateEmailModal";
import { SettingsModal } from "./components/SettingsModal";
import {
  PdktDetailPending,
  PdktEmptyDetail,
  PdktInboxError,
  PdktInboxLoading,
  PdktMailboxRetryBanner,
} from "./components/PdktWorkspaceStates";
import { useNavigate } from "@tanstack/react-router";
import { mapHistoryRow, type SessionHistory } from "./utils/sessionHistory";
import { useApi } from "../../hooks/useApi";
import { pdktClient, unwrapResponse } from "../../lib/api";
import type {
  PdktMailboxItem,
  PdktMailboxListItem,
  PdktScenario,
  PdktConsumerType,
  PdktEvaluationResult,
  PdktIdentity,
  EmailMessage,
  SimulationSubjectSelection,
} from "@trainers/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { notify } from "../../lib/toast";
import { usePdktMailboxDetail } from "./utils/usePdktMailboxDetail";
import type { PdktSettingsResource } from "./utils/usePdktSettings";
import { PdktSettingsNotice } from "./components/PdktSettingsNotice";
import {
  type PdktAppSettings,
  generatePdktSessionConfig,
  DEFAULT_PDKT_MODEL_ID,
  PDKT_FALLBACK_CONSUMER_TYPES as defaultConsumerTypes,
} from "./pdktSettings";
import {
  extractMailboxRetryDraft,
  pdktReplyErrorMessage,
  type PdktMailboxRetryDraft,
} from "./utils/pdktErrors";
import { buildReplayMailboxItem } from "./utils/replaySession";
import { usePdktEvaluations } from "./utils/usePdktEvaluations";
import { usePdktMailboxDelete } from "./utils/usePdktMailboxDelete";

interface PdktSimulationProps {
  canPickParticipant: boolean;
  selectedId: string | null;
  isReviewOpen?: boolean;
  onSelectedIdChange: (
    id: string | null,
    replace?: boolean,
    review?: boolean,
  ) => Promise<void>;
  onBackToHistory?: () => void;
  simulationSubject?: SimulationSubjectSelection;
  onBack?: () => void;
  onBeforeActivity?: () => Promise<void>;
  /** `reply` setelah balasan terkirim; `review` setelah telaah selesai. */
  onAfterActivity?: (reason: "reply" | "review") => void;
  initialReplaySession?: SessionHistory | null;
  /** Shared account settings, including loading/error and revision state. */
  settingsResource: PdktSettingsResource;
  /** Omitted landing data is fetched by the workspace. */
  initialHistory?: SessionHistory[];
  initialScenarios?: PdktScenario[];
  initialConsumerTypes?: PdktConsumerType[];
  onHistoryChange?: (history: SessionHistory[]) => void;
}

export default function PdktSimulation({
  canPickParticipant,
  simulationSubject = { type: "self" },
  onBack,
  onBeforeActivity,
  onAfterActivity,
  initialReplaySession = null,
  selectedId,
  isReviewOpen = false,
  onSelectedIdChange: setSelectedId,
  onBackToHistory,
  settingsResource,
  initialHistory,
  initialScenarios,
  initialConsumerTypes,
  onHistoryChange,
}: PdktSimulationProps) {
  const hasInitialHistory = initialHistory !== undefined;
  const hasInitialScenarios = initialScenarios !== undefined;
  const hasInitialConsumerTypes = initialConsumerTypes !== undefined;
  // Auto-select hanya pada pembukaan pertama; Back/aksi daftar tidak membukanya lagi.
  const autoSelectPendingRef = useRef(!selectedId && !initialReplaySession);
  const autoSelectedIdRef = useRef<string | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [practiceSubject, setPracticeSubject] =
    useState<SimulationSubjectSelection | null>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [isRetryingMailboxSave, setIsRetryingMailboxSave] = useState(false);
  const [pendingMailboxRetry, setPendingMailboxRetry] =
    useState<PdktMailboxRetryDraft | null>(null);

  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();

  // Settings state
  const { settings } = settingsResource;
  const canCreateEmail = settingsResource.status === "ready";

  // History state
  const [history, setHistory] = useState<SessionHistory[]>(
    initialHistory ?? [],
  );
  const [historyLoading, setHistoryLoading] = useState(!hasInitialHistory);

  // Tab filter state
  const [filter, setFilter] = useState<MailboxFilter>("open");
  const [replayItem, setReplayItem] = useState<PdktMailboxItem | null>(null);

  // Timer for time_taken (per mailbox)
  const sessionStartTimeRef = useRef<Record<string, number>>({});
  const onHistoryChangeRef = useRef(onHistoryChange);

  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);

  const {
    data: mailboxItems,
    loading,
    error,
    refetch,
  } = useApi<PdktMailboxListItem[]>("/pdkt/mailbox");
  const { data: fetchedScenarios } = useApi<PdktScenario[]>(
    hasInitialScenarios ? null : "/pdkt/scenarios",
  );
  const { data: fetchedConsumerTypes } = useApi<PdktConsumerType[]>(
    hasInitialConsumerTypes ? null : "/pdkt/consumer-types",
  );
  const mailboxDelete = usePdktMailboxDelete({
    selectedId,
    setSelectedId,
    refetch,
  });
  const defaultScenarios = hasInitialScenarios
    ? initialScenarios
    : fetchedScenarios;
  const defaultConsumerTypesFromApi = hasInitialConsumerTypes
    ? initialConsumerTypes
    : fetchedConsumerTypes;

  const visibleMailboxItems = useMemo(() => {
    const serverItems = mailboxItems ?? [];

    if (!replayItem || serverItems.some((item) => item.id === replayItem.id)) {
      return serverItems;
    }

    return [...serverItems, replayItem];
  }, [mailboxItems, replayItem]);

  useEffect(() => {
    if (
      replayItem &&
      selectedId &&
      mailboxItems?.some((item) => item.id === selectedId)
    ) {
      setReplayItem(null);
    }
  }, [mailboxItems, replayItem, selectedId]);

  const filteredByTab = useMemo(() => {
    if (filter === "all") return visibleMailboxItems;
    return visibleMailboxItems.filter((item) => item.status === filter);
  }, [visibleMailboxItems, filter]);

  // Detail rows (attachments + full thread) are fetched on demand so opening
  // the session never downloads every inline attachment of the inbox.
  const mailboxDetail = usePdktMailboxDetail(selectedId, mailboxItems);

  const selectedItem = selectedId
    ? (mailboxDetail.detail ??
      (replayItem?.id === selectedId ? replayItem : undefined))
    : undefined;

  const selectedListItem = selectedId
    ? visibleMailboxItems.find((item) => item.id === selectedId)
    : undefined;
  const selectedListStatus = selectedListItem?.status;
  // Sinkronkan tab sekali per email terpilih, setelah statusnya dimuat. Status
  // yang berubah karena balasan baru terkirim tidak memindahkan tab.
  const filterSyncedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      filterSyncedIdRef.current = null;
      return;
    }
    if (!selectedListStatus || filterSyncedIdRef.current === selectedId) return;
    filterSyncedIdRef.current = selectedId;
    if (selectedListStatus === "replied") {
      setFilter((current) => (current === "open" ? "replied" : current));
    }
  }, [selectedId, selectedListStatus]);

  const handleSelectMailboxItem = async (id: string) => {
    // Auto-select adalah preview desktop. Entri sebelum klik harus tetap daftar.
    if (autoSelectedIdRef.current && autoSelectedIdRef.current === selectedId) {
      await setSelectedId(null, true);
    }
    autoSelectedIdRef.current = null;
    await setSelectedId(id);
    if (replayItem && replayItem.id !== id) setReplayItem(null);
  };

  // Fetch Settings & History from DB
  const fetchHistory = useCallback(async () => {
    try {
      const res = (await unwrapResponse(
        await pdktClient.history.$get(),
      )) as any[];
      if (res) {
        const mapped = res.map(mapHistoryRow);
        setHistory(mapped);
        onHistoryChangeRef.current?.(mapped);
      }
    } catch (err) {
      console.error("[PDKT] Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasInitialHistory) fetchHistory();
  }, [fetchHistory, hasInitialHistory]);

  useEffect(() => {
    if (!mailboxItems || initialReplaySession) return;
    if (
      selectedId &&
      visibleMailboxItems.some((item) => item.id === selectedId)
    ) {
      autoSelectPendingRef.current = false;
      return;
    }
    if (!autoSelectPendingRef.current) {
      if (selectedId) void setSelectedId(null, true);
      return;
    }
    autoSelectPendingRef.current = false;
    if (window.innerWidth < 768) return;
    const next = visibleMailboxItems.find((item) => item.status === "open")?.id;
    if (next) {
      autoSelectedIdRef.current = next;
      void setSelectedId(next, true);
    }
  }, [
    mailboxItems,
    visibleMailboxItems,
    initialReplaySession,
    selectedId,
    setSelectedId,
  ]);

  const handleFilterChange = (next: MailboxFilter) => {
    setFilter(next);
    const selected = visibleMailboxItems.find((item) => item.id === selectedId);
    if (selected && next !== "all" && selected.status !== next) {
      setSelectedId(null);
    }
  };

  // Start timer for open items when selected
  useEffect(() => {
    if (selectedId && selectedItem && selectedItem.status === "open") {
      if (!sessionStartTimeRef.current[selectedId]) {
        sessionStartTimeRef.current[selectedId] = Date.now();
      }
    }
  }, [selectedId, selectedItem]);

  // Reset reply state when selecting a new item
  useEffect(() => {
    setIsReplyOpen(false);
  }, [selectedId]);

  const notifyAfter = useCallback(
    (reason: "reply" | "review") => {
      onAfterActivity?.(reason);
    },
    [onAfterActivity],
  );
  const notifyReview = useCallback(() => notifyAfter("review"), [notifyAfter]);

  const { evaluations, retryEvaluation, seedEvaluation } = usePdktEvaluations({
    visibleMailboxItems,
    history,
    refetch,
    fetchHistory,
    onEvaluationFinished: notifyReview,
  });

  // Trigger parent-level usage delta computation on activity
  const notifyBefore = async () => {
    if (onBeforeActivity) await onBeforeActivity();
  };

  // Save Settings handler
  const handleSaveSettings = async (newSettings: PdktAppSettings) => {
    await settingsResource.save(newSettings);
    // Refetch history as scenarios configuration might affect display
    await fetchHistory();
  };

  // Select session from history
  const handleSelectSession = (session: SessionHistory) => {
    const matchingMailbox = visibleMailboxItems.find(
      (item) => item.history_id === session.id,
    );
    if (matchingMailbox) {
      if (
        matchingMailbox.status === "open" ||
        matchingMailbox.status === "replied"
      ) {
        setFilter(matchingMailbox.status);
      }
      return;
    }
    const replay = buildReplayMailboxItem(session);
    if (replay) {
      seedEvaluation(replay.item.id, replay.evaluation);
      setReplayItem(replay.item);
      setFilter("replied");
    }
  };

  const appliedReplayIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialReplaySession) {
      appliedReplayIdRef.current = null;
      setReplayItem(null);
      return;
    }
    if (appliedReplayIdRef.current === initialReplaySession.id) return;
    // Tunggu mailbox selesai load agar pencocokan history_id akurat.
    if (loading) return;
    appliedReplayIdRef.current = initialReplaySession.id;
    handleSelectSession(initialReplaySession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplaySession, loading, visibleMailboxItems.length]); // Start new simulation session
  const handleRetryMailboxSave = async () => {
    if (!pendingMailboxRetry) return;
    setIsRetryingMailboxSave(true);
    try {
      const mailboxId = (await unwrapResponse(
        await pdktClient.mailbox.batch.$post({
          json: { mailboxDraftToken: pendingMailboxRetry.token },
        }),
      )) as string;
      await refetch();
      await fetchHistory();
      setPendingMailboxRetry(null);
      setReplayItem(null);
      setFilter("open");
      setSelectedId(mailboxId);
      notify.success("Email masuk ke kotak masuk.");
    } catch (err) {
      console.error("[PDKT] Failed to save pending mailbox draft:", err);
      notify.error("Email belum bisa disimpan. Coba lagi.");
    } finally {
      setIsRetryingMailboxSave(false);
    }
  };

  const handleStartNew = async (
    scenario: PdktScenario,
    subject: SimulationSubjectSelection = simulationSubject,
  ) => {
    if (!canCreateEmail) return;
    setIsStartingNew(true);
    try {
      // 1. Determine Identity (Fallback)
      const fallbackIdentity = (await unwrapResponse(
        await pdktClient["generate-identity"].$post({ json: {} }),
      )) as PdktIdentity;

      // 2. Build Config
      const currentSettings: PdktAppSettings = settings || {
        scenarios: defaultScenarios || [],
        consumerTypes: defaultConsumerTypesFromApi || defaultConsumerTypes,
        enableImageGeneration: true,
        globalConsumerTypeId: "random",
        selectedModel: DEFAULT_PDKT_MODEL_ID,
        consumerNameMentionPattern: "random",
        writingStyleMode: "training",
      };

      const config = generatePdktSessionConfig(
        currentSettings,
        scenario,
        fallbackIdentity,
      );

      // 3. Create session in backend (Orchestrated single boundary call)
      const clientRequestId = crypto.randomUUID();
      const result = (await unwrapResponse(
        await pdktClient.session.create.$post({
          json: {
            scenarioId: scenario.id,
            scenarioDraft: scenario,
            consumerTypeId: config.consumerType.id,
            consumerTypeDraft: config.consumerType,
            identity: config.identity,
            enableImageGeneration: config.enableImageGeneration,
            selectedModel: config.selectedModel,
            resolvedConsumerNameMentionPattern:
              config.resolvedConsumerNameMentionPattern,
            writingStyleMode: config.writingStyleMode,
            client_request_id: clientRequestId,
            simulationSubject: subject,
          },
        }),
      )) as { id: string; message: EmailMessage };

      await refetch();
      await fetchHistory(); // update history list as well
      setReplayItem(null);
      setFilter("open");
      setSelectedId(result.id);
      setIsNewModalOpen(false);
    } catch (err) {
      console.error("[PDKT] Failed to start new simulation:", err);
      const retryDraft = extractMailboxRetryDraft(err);
      if (retryDraft) {
        setPendingMailboxRetry(retryDraft);
        notify.error(
          "Email konsumen sudah dibuat, tetapi belum masuk ke kotak masuk. Pilih Simpan lagi di bagian atas.",
        );
      } else {
        notify.error(
          "Email konsumen belum bisa dibuat. Coba lagi dalam beberapa saat.",
        );
      }
    } finally {
      setIsStartingNew(false);
    }
  };

  const handleReplySubmit = async (replyText: string): Promise<boolean> => {
    if (!selectedId || !selectedItem) return false;
    const mailboxId = selectedId;
    setIsReplying(true);
    await notifyBefore();
    try {
      const startTime = sessionStartTimeRef.current[mailboxId] || Date.now();
      const timeTaken = Math.round((Date.now() - startTime) / 1000);
      const reply = {
        id: "reply_" + Date.now(),
        from: "ojk@kontak157.go.id",
        to: selectedItem.sender_email,
        subject: `Re: ${selectedItem.subject}`,
        body: replyText,
        timestamp: new Date().toISOString(),
        isAgent: true,
      };

      await unwrapResponse(
        await pdktClient.mailbox.reply.$post({
          json: {
            mailboxId,
            reply,
            timeTaken,
          },
        }),
      );

      await refetch();
      await fetchHistory();
      mailboxDetail.invalidate(mailboxId);
      setIsReplyOpen(false);
      setFilter("open");
      await setSelectedId(null);
      notify.success(
        "Balasan terkirim dan sedang ditelaah AI. Buka dari tab Dibalas kapan saja.",
      );
      notifyAfter("reply");
      return true;
    } catch (err: unknown) {
      console.error("[PDKT] Reply error:", err);
      notify.error(pdktReplyErrorMessage(err));
      return false;
    } finally {
      setIsReplying(false);
    }
  };

  // Teks galat dari server tidak ditampilkan ke peserta; cukup di log.
  useEffect(() => {
    if (error) console.error("[PDKT] Failed to load mailbox:", error);
  }, [error]);

  if (loading && !mailboxItems) {
    return <PdktInboxLoading onBack={onBack} />;
  }

  if (error && !mailboxItems) {
    return <PdktInboxError onBack={onBack} onRetry={refetch} />;
  }

  // Active scenarios for CreateEmailModal: fallback to defaultScenarios if no custom settings exist
  const activeScenarios = settings?.scenarios || defaultScenarios || [];

  // Prepared PdktAppSettings for SettingsModal
  const currentSettings: PdktAppSettings = settings || {
    scenarios: defaultScenarios || [],
    consumerTypes: defaultConsumerTypesFromApi || defaultConsumerTypes,
    enableImageGeneration: true,
    globalConsumerTypeId: "random",
    selectedModel: DEFAULT_PDKT_MODEL_ID,
    consumerNameMentionPattern: "random",
    writingStyleMode: "training",
    customIdentity: {
      senderName: "",
      email: "",
      city: "",
      bodyName: "",
    },
  };

  // Telaah mengikuti URL; daftar dipakai selama detail email dimuat.
  const selectedStatus = selectedItem?.status ?? selectedListItem?.status;
  const stage =
    selectedStatus === "replied" && isReviewOpen
      ? "telaah"
      : selectedStatus === "open" && isReplyOpen
        ? "tanggapi"
        : "pahami";
  const openReview = () => {
    if (selectedId) void setSelectedId(selectedId, false, true);
  };
  const closeReview = () => {
    if (selectedId) void setSelectedId(selectedId);
  };
  const headerItem = selectedListItem ?? selectedItem ?? null;
  const openCount = visibleMailboxItems.filter(
    (item) => item.status === "open",
  ).length;
  const reviews: Record<string, MailboxReviewState> = {};
  for (const [mailboxId, review] of Object.entries(evaluations)) {
    reviews[mailboxId] = {
      status: review.status,
      score:
        typeof review.result?.score === "number" ? review.result.score : null,
    };
  }

  const backToInbox = () => {
    setIsReplyOpen(false);
    if (stage === "telaah") setSelectedId(null);
  };

  // "Latihan lagi" memakai skenario sesi itu bila masih ada di pengaturan.
  const reviewHistory = selectedItem?.history_id
    ? history.find((entry) => entry.id === selectedItem.history_id)
    : undefined;
  const reviewScenarioId = (
    reviewHistory?.config as { scenarios?: Array<{ id?: string }> } | null
  )?.scenarios?.[0]?.id;
  const practiceScenario = reviewScenarioId
    ? activeScenarios.find(
        (scenario) =>
          scenario.id === reviewScenarioId && scenario.isActive !== false,
      )
    : undefined;

  // Tanpa pemilih peserta, subjek sah hanya self; role lain memakai snapshot email.
  const reviewedSubject = selectedItem?.simulationSubject;
  const repeatSubject: SimulationSubjectSelection | null =
    !canPickParticipant || reviewedSubject?.type === "self"
      ? { type: "self" }
      : reviewedSubject?.type === "participant" && reviewedSubject.participantId
        ? { type: "participant", participantId: reviewedSubject.participantId }
        : null;
  const practiceUnavailableReason = !canCreateEmail
    ? "Muat ulang pengaturan sebelum membuat email baru."
    : repeatSubject
      ? undefined
      : reviewedSubject?.type === "participant"
        ? "Latihan lagi tidak tersedia karena peserta ini sudah dihapus. Kembali ke halaman awal PDKT untuk memilih peserta aktif."
        : "Latihan lagi tidak tersedia karena peserta sesi ini tidak tercatat. Kembali ke halaman awal PDKT untuk memilih peserta.";

  const detailPending = (
    <PdktDetailPending
      failed={mailboxDetail.failed}
      onBackToList={() => void setSelectedId(null)}
      onRetry={mailboxDetail.retry}
    />
  );

  let body: React.ReactNode;
  if (stage === "tanggapi" && selectedItem) {
    body = (
      <PdktReplyStage
        item={selectedItem}
        onSend={handleReplySubmit}
        isSending={isReplying}
      />
    );
  } else if (stage === "telaah") {
    const review = selectedItem ? evaluations[selectedItem.id] : undefined;
    body = selectedItem ? (
      <PdktReviewStage
        key={selectedItem.id}
        item={selectedItem}
        status={review?.status ?? null}
        result={(review?.result as PdktEvaluationResult | null) ?? null}
        onRetry={() => {
          if (selectedItem.history_id) {
            void retryEvaluation(selectedItem.id, selectedItem.history_id);
          }
        }}
        onInbox={backToInbox}
        onDelete={
          selectedItem.permissions?.can_delete === true
            ? () => mailboxDelete.requestDelete(selectedItem.id)
            : undefined
        }
        onPracticeAgain={() => {
          if (!repeatSubject) return;
          if (practiceScenario)
            void handleStartNew(practiceScenario, repeatSubject);
          else {
            setPracticeSubject(repeatSubject);
            setIsNewModalOpen(true);
          }
        }}
        practiceLabel={
          practiceScenario
            ? "Latihan lagi dengan skenario ini"
            : "Buat email baru"
        }
        isStartingPractice={isStartingNew}
        practiceUnavailableReason={practiceUnavailableReason}
      />
    ) : (
      detailPending
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1">
        <div
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[22rem] md:shrink-0`}
        >
          <MailboxSidebar
            creationDisabled={!canCreateEmail}
            items={filteredByTab}
            openCount={openCount}
            reviews={reviews}
            selectedId={selectedId}
            onSelect={handleSelectMailboxItem}
            onNew={() => {
              setPracticeSubject(null);
              setIsNewModalOpen(true);
            }}
            onSettings={() => setIsSettingsOpen(true)}
            onHistory={() => void navigate({ to: "/pdkt/history" })}
            filter={filter}
            onFilterChange={handleFilterChange}
            selectedBulkIds={mailboxDelete.selectedBulkIds}
            onToggleBulkId={mailboxDelete.toggleBulkId}
            isBulkMode={mailboxDelete.isBulkMode}
            onToggleBulkMode={mailboxDelete.toggleBulkMode}
            onBulkDelete={mailboxDelete.requestBulkDelete}
          />
        </div>

        <div
          className={`${selectedId ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col`}
        >
          {selectedItem ? (
            <EmailDetailPane
              item={selectedItem}
              onReply={() => setIsReplyOpen(true)}
              onDelete={
                selectedItem.status === "open" ||
                selectedItem.permissions?.can_delete === true
                  ? () => mailboxDelete.requestDelete(selectedItem.id)
                  : undefined
              }
              onOpenReview={openReview}
              reviewStatus={evaluations[selectedItem.id]?.status ?? null}
              onBackToList={() => setSelectedId(null)}
            />
          ) : selectedId ? (
            detailPending
          ) : (
            <PdktEmptyDetail
              canCreateEmail={canCreateEmail}
              onNew={() => {
                setPracticeSubject(null);
                setIsNewModalOpen(true);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex h-screen w-full flex-col bg-background text-foreground">
      {stage !== "pahami" && headerItem ? (
        <PdktWorkspaceHeader
          mode="focus"
          stage={stage}
          item={headerItem}
          onInbox={backToInbox}
          backLabel={
            stage === "tanggapi"
              ? "Kembali ke email"
              : onBackToHistory
                ? "Riwayat"
                : "Kotak masuk"
          }
          onBack={stage === "telaah" ? onBackToHistory : undefined}
          onSelectStage={
            stage === "tanggapi"
              ? { pahami: () => setIsReplyOpen(false) }
              : selectedListItem
                ? { pahami: closeReview }
                : undefined
          }
        />
      ) : (
        <PdktWorkspaceHeader
          mode="inbox"
          onBack={onBack}
          item={headerItem}
          hideBackOnMobile={Boolean(selectedId)}
        />
      )}

      {pendingMailboxRetry && (
        <PdktMailboxRetryBanner
          subjectLabel={pendingMailboxRetry.subjectLabel}
          isRetrying={isRetryingMailboxSave}
          onRetry={() => void handleRetryMailboxSave()}
          onDismiss={() => setPendingMailboxRetry(null)}
        />
      )}

      <PdktSettingsNotice
        status={settingsResource.status}
        onRetry={() => void settingsResource.reload()}
      />
      {body}

      <CreateEmailModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        scenarios={activeScenarios}
        onCreate={(scenario) =>
          handleStartNew(scenario, practiceSubject ?? simulationSubject)
        }
        isLoading={isStartingNew}
      />

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

      <div ref={setDialogContainer} className="contents" />
      <ConfirmDialog
        open={mailboxDelete.pendingDelete !== null}
        container={dialogContainer}
        title={
          mailboxDelete.pendingDelete?.kind === "bulk"
            ? `Hapus ${mailboxDelete.pendingDelete.ids.length} email?`
            : "Hapus email ini?"
        }
        description={
          mailboxDelete.pendingDelete?.kind === "bulk"
            ? `${mailboxDelete.pendingDelete.ids.length} email terpilih akan dihapus dari kotak masuk.`
            : "Email ini akan dihapus dari kotak masuk."
        }
        confirmLabel="Hapus email"
        busy={mailboxDelete.isDeleting}
        onConfirm={() => void mailboxDelete.confirmDelete()}
        onCancel={mailboxDelete.cancelDelete}
      />
    </main>
  );
}
