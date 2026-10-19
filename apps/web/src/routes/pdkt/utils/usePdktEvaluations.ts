import { useEffect, useRef, useState } from "react";
import type { PdktMailboxListItem } from "@trainers/types";
import { pdktClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import type { MailboxReviewState } from "../components/MailboxSidebar";
import type { SessionHistory } from "./sessionHistory";

const EVALUATION_RETRY_START_GRACE_MS = 15_000;

export interface PdktEvaluationEntry {
  result: any | null;
  status: MailboxReviewState["status"];
  error: string | null;
  /** Seeded from a summary history row: `result` holds only the score. */
  partial?: boolean;
}

interface UsePdktEvaluationsOptions {
  visibleMailboxItems: PdktMailboxListItem[];
  history: SessionHistory[];
  refetch: () => Promise<unknown>;
  fetchHistory: () => Promise<void>;
  /** Called once per poll round in which some evaluation finished. */
  onEvaluationFinished: () => void;
}

/**
 * AI review state per mailbox id: seeded from history, polled every 5 s while
 * any replied email is still pending or processing, and retried on request.
 */
export function usePdktEvaluations({
  visibleMailboxItems,
  history,
  refetch,
  fetchHistory,
  onEvaluationFinished,
}: UsePdktEvaluationsOptions) {
  // Evaluation tracking by mailbox id
  const [evaluations, setEvaluations] = useState<
    Record<string, PdktEvaluationEntry>
  >({});
  const evaluationsRef = useRef(evaluations);
  const inFlightEvaluationIdsRef = useRef(new Set<string>());
  const handledTerminalHistoryIdsRef = useRef(new Set<string>());
  const retryRequestHistoryIdsRef = useRef(new Set<string>());
  const retryStartDeadlinesRef = useRef(new Map<string, number>());
  const visibleMailboxItemsRef = useRef(visibleMailboxItems);
  // Statuses guessed as "processing" without a history row (someone else's
  // email, or our own before history loads). Their first poll answer only
  // records the real status; it is not a finish that warrants a reload.
  const guessedStatusIdsRef = useRef(new Set<string>());

  useEffect(() => {
    evaluationsRef.current = evaluations;
  }, [evaluations]);

  useEffect(() => {
    visibleMailboxItemsRef.current = visibleMailboxItems;
  }, [visibleMailboxItems]);

  // Synchronize evaluations state from history and the visible mailbox.
  useEffect(() => {
    if (visibleMailboxItems.length === 0) return;

    setEvaluations((prev) => {
      const next = { ...prev };
      let changed = false;

      visibleMailboxItems.forEach((item) => {
        if (item.status !== "replied") return;
        if (!item.history_id) {
          if (next[item.id]?.status !== "unavailable") {
            next[item.id] = {
              result: null,
              status: "unavailable",
              error: null,
            };
            changed = true;
          }
          return;
        }

        const historyItem = history.find(
          (candidate) => candidate.id === item.history_id,
        );
        const current = next[item.id];

        if (!historyItem && current) return;

        if (historyItem) guessedStatusIdsRef.current.delete(item.id);
        else guessedStatusIdsRef.current.add(item.id);
        const status =
          historyItem?.evaluationStatus ||
          (historyItem?.evaluation ? "completed" : "processing");
        const result = historyItem?.evaluation || null;
        const error = historyItem?.evaluationError || null;
        const partial = historyItem?.detail === "summary";
        // A full result already loaded outlives the summary row it came from.
        if (partial && current && !current.partial && current.status === status)
          return;

        if (
          !current ||
          current.status !== status ||
          current.error !== error ||
          Boolean(current.partial) !== partial ||
          JSON.stringify(current.result) !== JSON.stringify(result)
        ) {
          next[item.id] = {
            result,
            status: status as "pending" | "processing" | "completed" | "failed",
            error,
            ...(partial ? { partial } : {}),
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

            const guessed = guessedStatusIdsRef.current.delete(item.id);
            const previousStatus = guessed
              ? undefined
              : (evaluationsRef.current[item.id]?.status ?? "processing");
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
        onEvaluationFinished();
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
  }, [refetch, fetchHistory, onEvaluationFinished]);

  const retryEvaluation = async (mailboxId: string, historyId: string) => {
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
      // A rejected retry request did not change the saved assessment.
      // Keep the existing result/status and its explicit retry action.
    } finally {
      retryRequestHistoryIdsRef.current.delete(historyId);
    }
  };

  /** Replaces a summary-seeded result with the full review before Telaah shows it. */
  const loadFullResult = async (mailboxId: string, historyId: string) => {
    if (inFlightEvaluationIdsRef.current.has(historyId)) return;
    inFlightEvaluationIdsRef.current.add(historyId);
    try {
      const response = (await unwrapResponse(
        await pdktClient.history.eval[":id"].$get({
          param: { id: historyId },
        }),
      )) as any;
      if (!response) return;
      setEvaluations((prev) => {
        const next = {
          ...prev,
          [mailboxId]: {
            result: response.evaluation || null,
            status: response.evaluation_status || "processing",
            error: response.evaluation_error || null,
          },
        };
        evaluationsRef.current = next;
        return next;
      });
    } catch (err) {
      console.error("[PDKT] Failed to load review:", err);
      notify.error("Telaah belum bisa dimuat. Buka ulang email ini.");
    } finally {
      inFlightEvaluationIdsRef.current.delete(historyId);
    }
  };

  /** Seeds the review shown with a replay item, keeping any known state. */
  const seedEvaluation = (mailboxId: string, entry: PdktEvaluationEntry) => {
    setEvaluations((prev) => {
      if (prev[mailboxId]) return prev;
      return { ...prev, [mailboxId]: entry };
    });
  };

  return { evaluations, retryEvaluation, seedEvaluation, loadFullResult };
}
