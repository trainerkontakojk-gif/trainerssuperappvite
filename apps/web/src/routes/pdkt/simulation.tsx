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
import { useNavigate } from "@tanstack/react-router";
import { mapHistoryRow, type SessionHistory } from "./utils/sessionHistory";
import { useApi } from "../../hooks/useApi";
import { ApiError, pdktClient, unwrapResponse } from "../../lib/api";
import type {
  PdktMailboxItem,
  PdktMailboxDetailItem,
  PdktMailboxListItem,
  PdktScenario,
  PdktConsumerType,
  PdktEvaluationResult,
  PdktIdentity,
  EmailMessage,
  SimulationSubjectSelection,
} from "@trainers/types";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { notify } from "../../lib/toast";
import { createSettingsVersionStore } from "../../lib/settings-contract";
import {
  type PdktAppSettings,
  generatePdktSessionConfig,
  DEFAULT_PDKT_MODEL_ID,
  PDKT_FALLBACK_CONSUMER_TYPES as defaultConsumerTypes,
} from "./pdktSettings";
import { PDKT_NO_SUBJECT } from "./utils/emailDisplay";
import { pdktReplyErrorMessage } from "./utils/pdktErrors";

const EVALUATION_RETRY_START_GRACE_MS = 15_000;

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
  /**
   * Data already loaded by the landing page. `undefined` means "not provided"
   * and keeps the session fetching it itself; `null` (settings only) means the
   * server confirmed there is nothing stored.
   */
  initialSettings?: PdktAppSettings | null;
  initialSettingsVersion?: string;
  initialHistory?: SessionHistory[];
  initialScenarios?: PdktScenario[];
  initialConsumerTypes?: PdktConsumerType[];
  onSettingsChange?: (
    settings: PdktAppSettings,
    version: string | undefined,
  ) => void;
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
  initialSettings,
  initialSettingsVersion,
  initialHistory,
  initialScenarios,
  initialConsumerTypes,
  onSettingsChange,
  onHistoryChange,
}: PdktSimulationProps) {
  const hasInitialSettings = initialSettings !== undefined;
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
  const [pendingMailboxRetry, setPendingMailboxRetry] = useState<{
    token: string;
    message: EmailMessage;
    subjectLabel?: string;
  } | null>(null);

  // Bulk selection states
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkMode, setIsBulkMode] = useState(false);
  // Konfirmasi hapus email; dirender di dalam lapisan ruang kerja.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "single"; id: string } | { kind: "bulk"; ids: string[] } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();

  // Settings state
  const [settings, setSettings] = useState<PdktAppSettings | null>(
    initialSettings ?? null,
  );
  const [settingsLoading, setSettingsLoading] = useState(!hasInitialSettings);

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
  const settingsVersionRef = useRef(createSettingsVersionStore());
  const onHistoryChangeRef = useRef(onHistoryChange);

  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);

  // Evaluation tracking by mailbox id
  const [evaluations, setEvaluations] = useState<
    Record<
      string,
      {
        result: any | null;
        status:
          "not_started" | "pending" | "processing" | "completed" | "failed";
        error: string | null;
      }
    >
  >({});
  const evaluationsRef = useRef(evaluations);
  const inFlightEvaluationIdsRef = useRef(new Set<string>());
  const handledTerminalHistoryIdsRef = useRef(new Set<string>());
  const retryRequestHistoryIdsRef = useRef(new Set<string>());
  const retryStartDeadlinesRef = useRef(new Map<string, number>());

  useEffect(() => {
    evaluationsRef.current = evaluations;
  }, [evaluations]);

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
  const visibleMailboxItemsRef = useRef(visibleMailboxItems);

  useEffect(() => {
    visibleMailboxItemsRef.current = visibleMailboxItems;
  }, [visibleMailboxItems]);

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
  const [mailboxDetails, setMailboxDetails] = useState<
    Record<string, PdktMailboxDetailItem>
  >({});

  useEffect(() => {
    if (!selectedId || mailboxDetails[selectedId]) return;
    // Replay rows are synthesized from history and already hold full payloads.
    if (!mailboxItems?.some((item) => item.id === selectedId)) return;

    let cancelled = false;

    void (async () => {
      try {
        const detail = (await unwrapResponse(
          await pdktClient.mailbox[":id"].$get({ param: { id: selectedId } }),
        )) as PdktMailboxDetailItem | null;
        if (!cancelled && detail) {
          setMailboxDetails((prev) => ({ ...prev, [detail.id]: detail }));
        }
      } catch (err) {
        console.error("[PDKT] Failed to load mailbox detail:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, mailboxDetails, mailboxItems]);

  const invalidateMailboxDetail = (id: string | null) => {
    if (!id) return;
    setMailboxDetails((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const selectedItem = selectedId
    ? (mailboxDetails[selectedId] ??
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
    } catch (err) {
      console.error("[PDKT] Failed to load settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

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
    if (!hasInitialSettings) fetchSettings();
    if (!hasInitialHistory) fetchHistory();
  }, [fetchHistory, hasInitialSettings, hasInitialHistory]);

  // Settings saved from inside the session must keep the optimistic-concurrency
  // version that the landing page already captured.
  useEffect(() => {
    if (initialSettingsVersion) {
      settingsVersionRef.current.restore(initialSettingsVersion);
    }
  }, [initialSettingsVersion]);

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

  // Synchronize evaluations state from history and the visible mailbox.
  useEffect(() => {
    if (visibleMailboxItems.length === 0) return;

    setEvaluations((prev) => {
      const next = { ...prev };
      let changed = false;

      visibleMailboxItems.forEach((item) => {
        if (item.status !== "replied" || !item.history_id) return;

        const historyItem = history.find(
          (candidate) => candidate.id === item.history_id,
        );
        const current = next[item.id];

        if (!historyItem && current) return;

        const status =
          historyItem?.evaluationStatus ||
          (historyItem?.evaluation ? "completed" : "processing");
        const result = historyItem?.evaluation || null;
        const error = historyItem?.evaluationError || null;

        if (
          !current ||
          current.status !== status ||
          current.error !== error ||
          JSON.stringify(current.result) !== JSON.stringify(result)
        ) {
          next[item.id] = {
            result,
            status: status as "pending" | "processing" | "completed" | "failed",
            error,
          };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [visibleMailboxItems, history]);

  // Poll evaluation status for processing/pending items.
  useEffect(() => {
    let cancelled = false;

    const pollEvaluationStatuses = async () => {
      const processingItems = visibleMailboxItemsRef.current.filter((item) => {
        if (item.status !== "replied" || !item.history_id) return false;

        const status = evaluationsRef.current[item.id]?.status;
        return !status || status === "pending" || status === "processing";
      });

      const terminalResults = await Promise.all(
        processingItems.map(async (item) => {
          const historyId = item.history_id;

          if (
            !historyId ||
            inFlightEvaluationIdsRef.current.has(historyId) ||
            retryRequestHistoryIdsRef.current.has(historyId)
          ) {
            return false;
          }

          inFlightEvaluationIdsRef.current.add(historyId);

          try {
            const response = (await unwrapResponse(
              await pdktClient.history.eval[":id"].$get({
                param: { id: historyId },
              }),
            )) as any;

            if (cancelled || !response) return false;

            const retryStartDeadline =
              retryStartDeadlinesRef.current.get(historyId);
            if (retryStartDeadline) {
              if (
                response.evaluation_status === "failed" &&
                Date.now() < retryStartDeadline
              ) {
                return false;
              }
              retryStartDeadlinesRef.current.delete(historyId);
            }

            const previousStatus =
              evaluationsRef.current[item.id]?.status ?? "processing";
            const nextEvaluation = {
              result: response.evaluation || null,
              status: response.evaluation_status || "processing",
              error: response.evaluation_error || null,
            } as const;

            setEvaluations((prev) => {
              const current = prev[item.id];
              if (
                current?.status === nextEvaluation.status &&
                current?.error === nextEvaluation.error &&
                JSON.stringify(current.result) ===
                  JSON.stringify(nextEvaluation.result)
              ) {
                return prev;
              }

              const next = {
                ...prev,
                [item.id]: nextEvaluation,
              };
              evaluationsRef.current = next;
              return next;
            });

            const becameTerminal =
              (previousStatus === "pending" ||
                previousStatus === "processing") &&
              (nextEvaluation.status === "completed" ||
                nextEvaluation.status === "failed");

            if (
              becameTerminal &&
              !handledTerminalHistoryIdsRef.current.has(historyId)
            ) {
              handledTerminalHistoryIdsRef.current.add(historyId);
              return true;
            }

            return false;
          } catch (err) {
            if (!cancelled) {
              console.error("[PDKT] Failed to poll evaluation:", err);
            }
            return false;
          } finally {
            inFlightEvaluationIdsRef.current.delete(historyId);
          }
        }),
      );

      if (cancelled || !terminalResults.some(Boolean)) return;

      await Promise.all([refetch(), fetchHistory()]);

      if (!cancelled) {
        notifyAfter("review");
      }
    };

    void pollEvaluationStatuses();

    const timer = window.setInterval(() => {
      void pollEvaluationStatuses();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refetch, fetchHistory, notifyAfter]);

  // Trigger parent-level usage delta computation on activity
  const notifyBefore = async () => {
    if (onBeforeActivity) await onBeforeActivity();
  };

  // Save Settings handler
  const handleSaveSettings = async (newSettings: PdktAppSettings) => {
    const response = await pdktClient.settings.$post(
      { json: { settings: newSettings } },
      settingsVersionRef.current.requiredRequestOptions(),
    );
    await unwrapResponse(response);
    settingsVersionRef.current.capture(response);
    setSettings(newSettings);
    onSettingsChange?.(newSettings, settingsVersionRef.current.current());
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
    const sessionEmails = Array.isArray(session.emails)
      ? (session.emails.filter(Boolean) as any[])
      : [];
    if (sessionEmails.length > 0) {
      const firstInbound = sessionEmails.find((e: any) => !e?.isAgent);
      const syntheticId = "replay_" + session.id;
      const ts =
        typeof session.timestamp === "string"
          ? session.timestamp
          : session.timestamp instanceof Date
            ? session.timestamp.toISOString()
            : new Date().toISOString();
      const cfg = (session.config ?? {}) as any;
      const syntheticItem: PdktMailboxItem = {
        id: syntheticId,
        user_id: "",
        status: "replied",
        created_at: ts,
        sender_name: cfg.identity?.name || "Konsumen",
        sender_email: cfg.identity?.email || "",
        subject:
          (typeof (firstInbound as any)?.subject === "string"
            ? (firstInbound as any).subject
            : "") || PDKT_NO_SUBJECT,
        snippet:
          (typeof (firstInbound as any)?.body === "string"
            ? ((firstInbound as any).body as string).substring(0, 100)
            : "") || "",
        scenario_snapshot: cfg.scenarios?.[0] || ({} as PdktScenario),
        config_snapshot: cfg as any,
        inbound_email: (firstInbound || {
          id: "msg_replay",
          from: "",
          to: "",
          subject: "",
          body: "",
          timestamp: new Date().toISOString(),
          isAgent: false,
        }) as any,
        emails_thread: sessionEmails as any,
        history_id: session.id,
        last_activity_at: ts,
        time_taken: session.timeTaken ?? null,
        permissions: { can_delete: false },
        simulationSubject: session.simulationSubject ?? null,
      };

      setEvaluations((prev) => {
        if (prev[syntheticId]) return prev;
        return {
          ...prev,
          [syntheticId]: {
            result: session.evaluation || null,
            status: session.evaluationStatus || "completed",
            error: session.evaluationError || null,
          },
        };
      });

      setReplayItem(syntheticItem);
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
      const details =
        err instanceof ApiError
          ? err.details
          : err && typeof err === "object" && "details" in err
            ? (err as { details?: unknown }).details
            : null;
      const retryDraft =
        details && typeof details === "object" && "retryDraft" in details
          ? (details as { retryDraft?: unknown }).retryDraft
          : null;
      const retryToken =
        retryDraft && typeof retryDraft === "object" && "token" in retryDraft
          ? (retryDraft as { token?: unknown }).token
          : null;
      const retryMessage =
        retryDraft &&
        typeof retryDraft === "object" &&
        "inbound_email" in retryDraft
          ? (retryDraft as { inbound_email?: unknown }).inbound_email
          : null;
      if (
        typeof retryToken === "string" &&
        retryMessage &&
        typeof retryMessage === "object"
      ) {
        setPendingMailboxRetry({
          token: retryToken,
          message: retryMessage as EmailMessage,
          subjectLabel:
            typeof (retryMessage as { subject?: unknown }).subject === "string"
              ? (retryMessage as { subject: string }).subject
              : undefined,
        });
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
      invalidateMailboxDetail(mailboxId);
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

  const handleRetryEval = async (mailboxId: string, historyId: string) => {
    retryRequestHistoryIdsRef.current.add(historyId);

    try {
      await unwrapResponse(
        await pdktClient.history["retry-eval"].$post({
          json: { historyId },
        }),
      );
      handledTerminalHistoryIdsRef.current.delete(historyId);
      retryStartDeadlinesRef.current.set(
        historyId,
        Date.now() + EVALUATION_RETRY_START_GRACE_MS,
      );
      setEvaluations((prev) => {
        const next = {
          ...prev,
          [mailboxId]: {
            result: null,
            status: "processing" as const,
            error: null,
          },
        };
        evaluationsRef.current = next;
        return next;
      });
    } catch (err: unknown) {
      console.error("[PDKT] Failed to retry evaluation:", err);
      retryStartDeadlinesRef.current.delete(historyId);
      notify.error("Telaah belum bisa diulang. Coba lagi dalam beberapa saat.");
      setEvaluations((prev) => {
        const next = {
          ...prev,
          [mailboxId]: {
            result: null,
            status: "failed" as const,
            error: null,
          },
        };
        evaluationsRef.current = next;
        return next;
      });
    } finally {
      retryRequestHistoryIdsRef.current.delete(historyId);
    }
  };

  const handleToggleBulkId = (id: string) => {
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleBulkMode = () => {
    setIsBulkMode((prev) => !prev);
    setSelectedBulkIds(new Set());
  };

  // Teks galat dari server tidak ditampilkan ke peserta; cukup di log.
  useEffect(() => {
    if (error) console.error("[PDKT] Failed to load mailbox:", error);
  }, [error]);

  const handleBulkDelete = () => {
    if (selectedBulkIds.size === 0) return;
    setPendingDelete({ kind: "bulk", ids: Array.from(selectedBulkIds) });
  };

  const handleDelete = (id: string) => {
    setPendingDelete({ kind: "single", id });
  };

  const deleteBulk = async (ids: string[]) => {
    try {
      const result = (await unwrapResponse(
        await pdktClient.mailbox["batch-delete"].$post({
          json: { ids },
        }),
      )) as {
        successCount: number;
        failureCount: number;
        errors: string[];
      };

      if (result.failureCount > 0) {
        // Pesan server memuat ID email; jangan ditampilkan.
        console.warn("[PDKT] Bulk delete partially failed:", result.errors);
        notify.warning(
          `${result.successCount} email dihapus. ${result.failureCount} email tidak bisa dihapus karena hanya pembuatnya, admin, atau trainer yang boleh menghapus.`,
        );
      } else {
        notify.success(`${result.successCount} email dihapus.`);
      }

      setSelectedBulkIds(new Set());
      setIsBulkMode(false);
      await refetch();
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      console.error("[PDKT] Bulk delete failed:", err);
      notify.error("Email belum bisa dihapus. Coba lagi.");
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await unwrapResponse(
        await pdktClient.mailbox[":id"].$delete({
          param: { id },
        }),
      );
      await refetch();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error("[PDKT] Delete failed:", err);
      notify.error("Email belum bisa dihapus. Coba lagi.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      if (pendingDelete.kind === "bulk") {
        await deleteBulk(pendingDelete.ids);
      } else {
        await deleteOne(pendingDelete.id);
      }
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  if (loading && !mailboxItems) {
    return (
      <main className="relative flex h-screen w-full flex-col bg-background text-foreground">
        <PdktWorkspaceHeader mode="inbox" onBack={onBack} />
        <div role="status" className="flex min-h-0 flex-1">
          <span className="sr-only">Memuat kotak masuk…</span>
          <div className="flex w-full flex-col gap-4 border-r border-border p-4 md:w-[22rem]">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="flex flex-col gap-2 py-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
          <div className="hidden flex-1 flex-col gap-4 p-8 md:flex">
            <Skeleton className="h-9 w-72 rounded-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full max-w-[720px]" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !mailboxItems) {
    return (
      <main className="relative flex h-screen w-full flex-col bg-background text-foreground">
        <PdktWorkspaceHeader mode="inbox" onBack={onBack} />
        <div className="flex flex-1 items-center justify-center px-4">
          <Alert variant="destructive" className="max-w-md items-start">
            <AlertCircle aria-hidden="true" />
            <div>
              <AlertDescription className="font-semibold text-foreground">
                Kotak masuk belum bisa dimuat
              </AlertDescription>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                Periksa koneksi Anda, lalu coba lagi. Email yang sudah ada tidak
                hilang.
              </p>
            </div>
            <Button
              type="button"
              onClick={refetch}
              className="ml-auto min-h-11 gap-2 text-xs"
            >
              <RefreshCw aria-hidden="true" />
              Coba lagi
            </Button>
          </Alert>
        </div>
      </main>
    );
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
      score: typeof review.result?.score === "number" ? review.result.score : null,
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
  const practiceUnavailableReason = repeatSubject
    ? undefined
    : reviewedSubject?.type === "participant"
      ? "Latihan lagi tidak tersedia karena peserta ini sudah dihapus. Kembali ke halaman awal PDKT untuk memilih peserta aktif."
      : "Latihan lagi tidak tersedia karena peserta sesi ini tidak tercatat. Kembali ke halaman awal PDKT untuk memilih peserta.";

  const detailSkeleton = (
    <div role="status" className="flex flex-1 flex-col gap-4 p-6">
      <span className="sr-only">Memuat detail email…</span>
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
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
            void handleRetryEval(selectedItem.id, selectedItem.history_id);
          }
        }}
        onInbox={backToInbox}
        onDelete={
          selectedItem.permissions?.can_delete === true
            ? () => handleDelete(selectedItem.id)
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
      detailSkeleton
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1">
        <div
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[22rem] md:shrink-0`}
        >
          <MailboxSidebar
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
            selectedBulkIds={selectedBulkIds}
            onToggleBulkId={handleToggleBulkId}
            isBulkMode={isBulkMode}
            onToggleBulkMode={handleToggleBulkMode}
            onBulkDelete={handleBulkDelete}
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
                  ? () => handleDelete(selectedItem.id)
                  : undefined
              }
              onOpenReview={openReview}
              reviewStatus={evaluations[selectedItem.id]?.status ?? null}
              onBackToList={() => setSelectedId(null)}
            />
          ) : selectedId ? (
            detailSkeleton
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-card p-12 text-center">
              <Inbox
                aria-hidden="true"
                className="size-10 text-muted-foreground"
              />
              <p className="max-w-xs text-sm text-muted-foreground">
                Pilih email dari kotak masuk, atau buat email baru untuk mulai
                berlatih.
              </p>
              <Button
                type="button"
                onClick={() => {
                  setPracticeSubject(null);
                  setIsNewModalOpen(true);
                }}
                className="min-h-11 text-xs"
              >
                Buat email baru
              </Button>
            </div>
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
        <Alert
          variant="destructive"
          className="flex shrink-0 flex-col gap-3 rounded-none border-x-0 border-t-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <AlertDescription className="font-semibold text-foreground">
              Email konsumen belum masuk ke kotak masuk
            </AlertDescription>
            <p className="truncate text-xs text-foreground">
              {pendingMailboxRetry.subjectLabel || PDKT_NO_SUBJECT}: simpan lagi
              tanpa membuat ulang email.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleRetryMailboxSave()}
              disabled={isRetryingMailboxSave}
              className="min-h-11 gap-2 text-xs"
            >
              <RefreshCw
                aria-hidden="true"
                className={
                  isRetryingMailboxSave
                    ? "animate-spin motion-reduce:animate-none"
                    : ""
                }
              />
              {isRetryingMailboxSave ? "Menyimpan…" : "Simpan lagi"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingMailboxRetry(null)}
              disabled={isRetryingMailboxSave}
              className="min-h-11 text-xs"
            >
              Tutup
            </Button>
          </div>
        </Alert>
      )}

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
        open={pendingDelete !== null}
        container={dialogContainer}
        title={
          pendingDelete?.kind === "bulk"
            ? `Hapus ${pendingDelete.ids.length} email?`
            : "Hapus email ini?"
        }
        description={
          pendingDelete?.kind === "bulk"
            ? `${pendingDelete.ids.length} email terpilih akan dihapus dari kotak masuk.`
            : "Email ini akan dihapus dari kotak masuk."
        }
        confirmLabel="Hapus email"
        busy={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
