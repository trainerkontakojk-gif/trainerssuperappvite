import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MailboxSidebar } from "./components/MailboxSidebar";
import { EmailDetailPane } from "./components/EmailDetailPane";
import { ReplyComposer } from "./components/ReplyComposer";
import { CreateEmailModal } from "./components/CreateEmailModal";
import { SettingsModal } from "./components/SettingsModal";
import { HistoryModal, type SessionHistory } from "./components/HistoryModal";
import { useApi } from "../../hooks/useApi";
import { pdktClient, unwrapResponse } from "../../lib/api";
import type {
  PdktMailboxItem,
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
  EmailMessage,
} from "@trainers/types";
import { Link } from "@tanstack/react-router";
import { Plus, ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { notify } from "../../lib/toast";
import {
  type PdktAppSettings,
  generatePdktSessionConfig,
  DEFAULT_PDKT_MODEL_ID,
} from "./pdktSettings";

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

const EVALUATION_RETRY_START_GRACE_MS = 15_000;

interface PdktSimulationProps {
  onBack?: () => void;
  onBeforeActivity?: () => Promise<void>;
  onAfterActivity?: () => void;
}

export default function PdktSimulation({
  onBack,
  onBeforeActivity,
  onAfterActivity,
}: PdktSimulationProps = {}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  // Bulk selection states
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // History state
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Tab filter state
  const [filter, setFilter] = useState<"all" | "open" | "replied">("open");
  const [replayItem, setReplayItem] = useState<PdktMailboxItem | null>(null);

  // Timer for time_taken (per mailbox)
  const sessionStartTimeRef = useRef<Record<string, number>>({});

  // Evaluation tracking by mailbox id
  const [evaluations, setEvaluations] = useState<
    Record<
      string,
      {
        result: any | null;
        status: "pending" | "processing" | "completed" | "failed";
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
  } = useApi<PdktMailboxItem[]>("/pdkt/mailbox");
  const { data: defaultScenarios } = useApi<PdktScenario[]>("/pdkt/scenarios");
  const { data: defaultConsumerTypesFromApi } = useApi<PdktConsumerType[]>(
    "/pdkt/consumer-types",
  );

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

  const selectedItem = visibleMailboxItems.find(
    (item) => item.id === selectedId,
  );

  const handleSelectMailboxItem = (id: string) => {
    setSelectedId(id);

    if (replayItem && replayItem.id !== id) {
      setReplayItem(null);
    }
  };

  // Fetch Settings & History from DB
  const fetchSettings = async () => {
    try {
      const res = await (unwrapResponse(
        await pdktClient.settings.$get(),
      ) as Promise<PdktAppSettings | null>);
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
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, [fetchHistory]);

  // Auto-sync selection when filter tab changes or items change
  useEffect(() => {
    if (window.innerWidth < 768) {
      if (selectedId && mailboxItems) {
        const currentFiltered =
          filter === "all"
            ? visibleMailboxItems
            : visibleMailboxItems.filter((item) => item.status === filter);
        if (!currentFiltered.some((item) => item.id === selectedId)) {
          setSelectedId(null);
        }
      }
      return;
    }

    if (visibleMailboxItems.length > 0) {
      const currentFiltered =
        filter === "all"
          ? visibleMailboxItems
          : visibleMailboxItems.filter((item) => item.status === filter);
      if (currentFiltered.length > 0) {
        if (
          !selectedId ||
          !currentFiltered.some((item) => item.id === selectedId)
        ) {
          setSelectedId(currentFiltered[0].id);
        }
      } else {
        setSelectedId(null);
      }
    } else {
      setSelectedId(null);
    }
  }, [mailboxItems, visibleMailboxItems, filter, selectedId]);

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

  const notifyAfter = useCallback(() => {
    onAfterActivity?.();
  }, [onAfterActivity]);

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
        notifyAfter();
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
    try {
      await unwrapResponse(
        await pdktClient.settings.$post({ json: { settings: newSettings } }),
      );
      setSettings(newSettings);
      // Refetch history as scenarios configuration might affect display
      await fetchHistory();
    } catch (err) {
      notify.error("Gagal menyimpan pengaturan.");
    }
  };

  // Delete specific history session
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

  // Clear all history
  const handleClearHistory = async () => {
    try {
      await unwrapResponse(await pdktClient.history.$delete());
      setHistory([]);
    } catch (err) {
      notify.error("Gagal membersihkan riwayat.");
    }
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
      setSelectedId(matchingMailbox.id);
    } else if (session.config && session.emails && session.emails.length > 0) {
      const firstInbound = session.emails.find((e: any) => !e.isAgent);
      const syntheticId = "replay_" + session.id;
      const ts =
        typeof session.timestamp === "string"
          ? session.timestamp
          : session.timestamp instanceof Date
            ? session.timestamp.toISOString()
            : new Date().toISOString();
      const cfg = session.config as any;
      const syntheticItem: PdktMailboxItem = {
        id: syntheticId,
        user_id: "",
        status: "replied",
        created_at: ts,
        sender_name: cfg.identity?.name || "Konsumen",
        sender_email: cfg.identity?.email || "",
        subject: (firstInbound as any)?.subject || "",
        snippet:
          ((firstInbound as any)?.body as string)?.substring(0, 100) || "",
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
        emails_thread: session.emails as any,
        history_id: session.id,
        last_activity_at: ts,
        time_taken: session.timeTaken ?? null,
        permissions: { can_delete: false },
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
      setSelectedId(syntheticId);
    }
    setIsHistoryOpen(false);
  }; // Start new simulation session
  const handleStartNew = async (scenario: PdktScenario) => {
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
      notify.error("Gagal memulai simulasi baru.");
    } finally {
      setIsStartingNew(false);
    }
  };

  const handleReplyOpen = () => {
    setIsReplyOpen(true);
  };

  const handleReplySubmit = async (replyText: string) => {
    if (!selectedId || !selectedItem) return;
    setIsReplying(true);
    await notifyBefore();
    try {
      const startTime = sessionStartTimeRef.current[selectedId] || Date.now();
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
            mailboxId: selectedId,
            reply,
            timeTaken,
          },
        }),
      );

      await refetch();
      await fetchHistory();
      setIsReplyOpen(false);
      setFilter("replied");
      notifyAfter();
      notify.success("Balasan terkirim! Evaluasi AI sedang berjalan.");
    } catch (err: any) {
      console.error("[PDKT] Reply error:", err);
      notify.error(err?.message || "Gagal mengirim balasan.");
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
    } catch (err: any) {
      retryStartDeadlinesRef.current.delete(historyId);
      setEvaluations((prev) => {
        const next = {
          ...prev,
          [mailboxId]: {
            result: null,
            status: "failed" as const,
            error: err?.message || "Gagal memulai ulang evaluasi.",
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

  const handleBulkDelete = async () => {
    if (selectedBulkIds.size === 0) return;
    if (!confirm(`Hapus ${selectedBulkIds.size} email terpilih?`)) return;

    try {
      const ids = Array.from(selectedBulkIds);
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
        notify.warning(
          `${result.successCount} email berhasil dihapus, ${result.failureCount} gagal.`,
          result.errors[0],
        );
      } else {
        notify.success(`${result.successCount} email berhasil dihapus.`);
      }

      setSelectedBulkIds(new Set());
      setIsBulkMode(false);
      await refetch();
      if (selectedId && selectedBulkIds.has(selectedId)) {
        setSelectedId(null);
      }
    } catch (_err) {
      notify.error("Gagal menghapus email.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus email ini?")) return;
    try {
      await unwrapResponse(
        await pdktClient.mailbox[":id"].$delete({
          param: { id },
        }),
      );
      await refetch();
      if (selectedId === id) setSelectedId(null);
    } catch (_err) {
      notify.error("Gagal menghapus email.");
    }
  };

  if (loading && !mailboxItems) {
    return (
      <div className="flex flex-col h-screen w-full bg-[var(--bg)] text-[var(--fg)] relative">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 z-10">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                onClick={onBack}
                className="min-h-10 min-w-10 hover:bg-[var(--bg)] rounded-lg transition-colors flex items-center justify-center"
                title="Kembali ke Laman Utama"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--fg2)]" />
              </button>
            ) : (
              <Link
                to="/pdkt"
                className="min-h-10 min-w-10 hover:bg-[var(--bg)] rounded-lg transition-colors flex items-center justify-center"
                title="Kembali ke Laman Utama"
              >
                <ArrowLeft className="w-5 h-5 text-[var(--fg2)]" />
              </Link>
            )}
            <h1 className="font-semibold text-[var(--fg)] text-lg">
              Simulasi PDKT
            </h1>
          </div>
        </div>

        {/* Main Content Area Skeleton */}
        <div className="flex flex-1 overflow-hidden p-4 gap-4">
          <div className="flex-1 flex bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden relative">
            {/* Sidebar Skeleton (w-80) */}
            <div className="w-full md:w-80 border-r border-[var(--border)] flex flex-col h-full bg-[var(--surface)] shrink-0 animate-pulse">
              {/* Header skeleton */}
              <div className="p-4 border-b border-[var(--border)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-[var(--border)] rounded w-24"></div>
                  <div className="flex gap-2">
                    <div className="w-7 h-7 bg-[var(--border)] rounded-lg"></div>
                    <div className="w-7 h-7 bg-[var(--border)] rounded-lg"></div>
                    <div className="w-7 h-7 bg-[var(--border)] rounded-lg"></div>
                  </div>
                </div>
                <div className="h-8 bg-[var(--bg)] rounded-lg w-full"></div>
                <div className="h-6 bg-[var(--bg)] rounded-lg w-full"></div>
              </div>

              {/* Items list skeleton */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-10 h-10 bg-[var(--border)] rounded-full shrink-0"></div>
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between">
                        <div className="h-3 bg-[var(--border)] rounded w-20"></div>
                        <div className="h-2 bg-[var(--border)] rounded w-10"></div>
                      </div>
                      <div className="h-3 bg-[var(--border)] rounded w-36"></div>
                      <div className="h-2 bg-[var(--bg)] rounded w-24"></div>
                      <div className="h-2.5 bg-[var(--border)] rounded w-16 mt-1"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Detail Pane Skeleton */}
            <div className="hidden md:flex flex-1 flex-col min-w-0 bg-[var(--surface)] animate-pulse">
              {/* Detail Header skeleton */}
              <div className="p-6 border-b border-[var(--border)] flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[var(--border)] rounded-full"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-[var(--border)] rounded w-32"></div>
                    <div className="h-3 bg-[var(--bg)] rounded w-48"></div>
                  </div>
                </div>
                <div className="h-8 bg-[var(--bg)] rounded-lg w-24"></div>
              </div>

              {/* Detail Body skeleton */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                <div className="space-y-3">
                  <div className="h-4 bg-[var(--border)] rounded w-1/3"></div>
                  <div className="h-3 bg-[var(--bg)] rounded w-full"></div>
                  <div className="h-3 bg-[var(--bg)] rounded w-full"></div>
                  <div className="h-3 bg-[var(--bg)] rounded w-4/5"></div>
                </div>

                <div className="space-y-3">
                  <div className="h-4 bg-[var(--border)] rounded w-1/4"></div>
                  <div className="h-3 bg-[var(--bg)] rounded w-full"></div>
                  <div className="h-3 bg-[var(--bg)] rounded w-5/6"></div>
                </div>

                <div className="pt-6 border-t border-[var(--border)] flex justify-end">
                  <div className="h-10 bg-[var(--border)] rounded-lg w-32"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !mailboxItems) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-14 h-14 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-[var(--chart-amber)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--fg)] mb-1">
              Gagal Memuat Email
            </p>
            <p className="text-xs text-[var(--fg2)] leading-relaxed">{error}</p>
          </div>
          <button
            onClick={refetch}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--inv-bg)] text-[var(--inv-fg)] rounded-lg text-xs font-semibold hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      </div>
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
    selectedModel: "gemini-3.1-flash-lite",
    consumerNameMentionPattern: "random",
    writingStyleMode: "training",
    customIdentity: {
      senderName: "",
      email: "",
      city: "",
      bodyName: "",
    },
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg)] text-[var(--fg)] relative">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 z-10">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              onClick={onBack}
              className="min-h-10 min-w-10 hover:bg-[var(--bg)] rounded-lg transition-colors flex items-center justify-center"
              title="Kembali ke Laman Utama"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--fg2)]" />
            </button>
          ) : (
            <Link
              to="/pdkt"
              className="min-h-10 min-w-10 hover:bg-[var(--bg)] rounded-lg transition-colors flex items-center justify-center"
              title="Kembali ke Laman Utama"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--fg2)]" />
            </Link>
          )}
          <h1 className="font-semibold text-[var(--fg)] text-lg">
            Simulasi PDKT
          </h1>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        <div className="flex-1 flex bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden relative">
          <div
            className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 md:shrink-0`}
          >
            <MailboxSidebar
              items={filteredByTab}
              selectedId={selectedId}
              onSelect={handleSelectMailboxItem}
              onNew={() => setIsNewModalOpen(true)}
              onSettings={() => setIsSettingsOpen(true)}
              onHistory={async () => {
                await fetchHistory();
                setIsHistoryOpen(true);
              }}
              filter={filter}
              onFilterChange={setFilter}
              selectedBulkIds={selectedBulkIds}
              onToggleBulkId={handleToggleBulkId}
              isBulkMode={isBulkMode}
              onToggleBulkMode={handleToggleBulkMode}
              onBulkDelete={handleBulkDelete}
            />
          </div>

          <div
            className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 flex flex-col min-w-0 relative`}
          >
            {selectedItem ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <EmailDetailPane
                  item={selectedItem}
                  onReply={handleReplyOpen}
                  onDelete={() => handleDelete(selectedItem.id)}
                  isComposerOpen={isReplyOpen}
                  evaluation={evaluations[selectedItem.id]?.result || null}
                  evaluationStatus={
                    evaluations[selectedItem.id]?.status || null
                  }
                  evaluationError={evaluations[selectedItem.id]?.error || null}
                  onRetryEval={() =>
                    selectedItem.history_id &&
                    handleRetryEval(selectedItem.id, selectedItem.history_id)
                  }
                  onBackToList={() => setSelectedId(null)}
                />
                {isReplyOpen && (
                  <div className="shrink-0">
                    <ReplyComposer
                      key={selectedItem.id}
                      mailboxId={selectedItem.id}
                      recipient={selectedItem.sender_email}
                      subject={`Re: ${selectedItem.subject}`}
                      onSend={handleReplySubmit}
                      onClose={() => setIsReplyOpen(false)}
                      isLoading={isReplying}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--fg2)]">
                <Plus className="w-12 h-12 mb-4 text-[var(--fg3)]" />
                <p className="text-sm font-medium text-[var(--fg)]">
                  Pilih email atau buat simulasi baru
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsNewModalOpen(true)}
                    className="mt-4 px-4 py-2 bg-[var(--inv-bg)] text-[var(--inv-fg)] rounded-lg text-xs font-semibold hover:opacity-90 transition-all"
                  >
                    Simulasi Baru
                  </button>
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="mt-4 px-4 py-2 border border-[var(--border)] text-[var(--fg)] rounded-lg text-xs font-semibold hover:bg-[var(--bg)] transition-all"
                  >
                    Pengaturan
                  </button>
                </div>
              </div>
            )}
          </div>

          <CreateEmailModal
            isOpen={isNewModalOpen}
            onClose={() => setIsNewModalOpen(false)}
            scenarios={activeScenarios}
            onCreate={handleStartNew}
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

          <HistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            history={history}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onClearHistory={handleClearHistory}
          />
        </div>
      </div>
    </div>
  );
}
