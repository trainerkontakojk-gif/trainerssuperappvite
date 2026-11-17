import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  KetikReviewDetail,
  KetikSessionHistoryItem,
} from "@trainers/types";
import { ApiError } from "../../../lib/api";
import { ketikApi } from "../ketikApi";

import {
  INITIAL_REVIEW,
  reviewReducer,
  type KetikReviewFailure,
} from "./reviewLifecycle";
export type {
  KetikReviewPhase,
  KetikReviewFailure,
  KetikReviewState,
} from "./reviewLifecycle";

const POLL_INTERVAL_MS = 3_000;
function withScores(
  session: KetikSessionHistoryItem,
  scores: KetikReviewDetail["scores"],
): KetikSessionHistoryItem {
  return {
    ...session,
    reviewStatus: "completed",
    finalScore: scores.final,
    empathyScore: scores.empathy,
    probingScore: scores.probing,
    resolutionScore: scores.resolution,
    typoScore: scores.typo,
    complianceScore: scores.compliance,
  };
}

/** Only server status can declare a job failed. Poll/network failures preserve the unknown state. */
export function useKetikReviewStatus(
  session: KetikSessionHistoryItem | null,
  onSessionChange: (session: KetikSessionHistoryItem) => void,
) {
  const [state, dispatch] = useReducer(reviewReducer, INITIAL_REVIEW);
  const sessionRef = useRef(session);
  const onChangeRef = useRef(onSessionChange);
  const runRef = useRef(0);
  // Same-run read fence: a response applies only while no newer read has
  // applied. A failed read only reports polling health and never supersedes,
  // so it cannot discard an older read's in-flight result. Like runRef, these
  // are async response fences, not lifecycle state (phases live in reviewReducer).
  const issuedReadRef = useRef(0);
  const appliedReadRef = useRef(0);
  const requestRef = useRef<{
    sessionId: string;
    requestId: string;
    rerun: boolean;
  } | null>(null);
  const sessionId = session?.id ?? null;
  useEffect(() => {
    sessionRef.current = session;
    onChangeRef.current = onSessionChange;
  });
  const update = useCallback((next: KetikSessionHistoryItem) => {
    sessionRef.current = next;
    onChangeRef.current(next);
  }, []);
  const isCurrent = useCallback(
    (run: number, read: number) =>
      run === runRef.current && read >= appliedReadRef.current,
    [],
  );
  const fail = useCallback(
    (run: number, failure: KetikReviewFailure, confirmed = false) => {
      if (run !== runRef.current || !sessionRef.current) return;
      dispatch({ type: "failed", failure });
      if (confirmed) {
        requestRef.current = null;
        update({ ...sessionRef.current, reviewStatus: "failed" });
      }
    },
    [update],
  );
  const loadResult = useCallback(
    async (
      run: number,
      read: number,
      known?: KetikReviewDetail,
      previousKept = false,
    ) => {
      const current = sessionRef.current;
      if (!current || !isCurrent(run, read)) return;
      appliedReadRef.current = read;
      dispatch({ type: "load-result" });
      try {
        const detail = known ?? (await ketikApi.getReviewDetail(current.id));
        if (!isCurrent(run, read)) return;
        requestRef.current = null;
        update(withScores(current, detail.scores));
        dispatch({
          type: "result",
          detail,
          previousKept,
        });
      } catch {
        if (!isCurrent(run, read)) return;
        fail(run, "result");
      }
    },
    [fail, isCurrent, update],
  );
  const checkStatus = useCallback(
    async (run: number, initial = false) => {
      const current = sessionRef.current;
      if (!current || run !== runRef.current) return;
      const read = ++issuedReadRef.current;
      try {
        const data = await ketikApi.getReviewStatus(current.id);
        if (!isCurrent(run, read)) return;
        appliedReadRef.current = read;
        dispatch({ type: "poll-ok", rerunsLeft: data.rerunsLeft });
        if (data.status === "failed" && data.previousKept && data.resultReady) {
          await loadResult(run, read, data.detail, true);
        } else if (data.status === "completed" && data.resultReady) {
          await loadResult(run, read, data.detail);
        } else if (data.status === "failed") {
          fail(run, "review", true);
        } else if (data.status === "queued" || data.status === "processing") {
          if (
            current.reviewStatus !== "completed" &&
            current.reviewStatus !== "processing"
          )
            update({ ...current, reviewStatus: "processing" });
          const queueStatus = data.status;
          dispatch({ type: "queued", status: queueStatus });
        } else if (!initial) {
          // The server confirms no active request. Retrying can reuse the unacknowledged UUID.
          fail(run, "review");
        } else {
          dispatch({ type: "idle" });
        }
      } catch {
        if (!isCurrent(run, read)) return;
        dispatch({ type: "poll-failed" });
        if (initial && current.reviewStatus === "completed")
          await loadResult(run, read);
      }
    },
    [fail, isCurrent, loadResult, update],
  );
  useEffect(() => {
    const invalidate = () => ++runRef.current;
    const run = invalidate();
    requestRef.current = null;
    const current = sessionRef.current;
    dispatch({ type: "reset", status: current?.reviewStatus });
    if (sessionId && current?.reviewStatus === "completed")
      void checkStatus(run, true);
    return () => {
      invalidate();
    };
  }, [sessionId, checkStatus]);
  useEffect(() => {
    if (state.phase !== "reviewing" || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = runRef.current;
    const poll = async () => {
      await checkStatus(run);
      if (!cancelled)
        timer = setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
    };
    // Give the enqueue request a chance to return before polling a previously pending row.
    timer = setTimeout(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.phase, sessionId, checkStatus]);
  const submit = useCallback(
    async (rerun: boolean) => {
      const current = sessionRef.current;
      if (
        !current ||
        state.phase === "reviewing" ||
        state.phase === "loading-result"
      )
        return;
      const run = ++runRef.current;
      const request =
        requestRef.current?.sessionId === current.id &&
        requestRef.current.rerun === rerun
          ? requestRef.current
          : { sessionId: current.id, requestId: crypto.randomUUID(), rerun };
      requestRef.current = request;
      dispatch({ type: "submit" });
      try {
        const result = await ketikApi.startReview(current.id, {
          rerun,
          requestId: request.requestId,
        });
        if (run !== runRef.current || requestRef.current !== request) return;
        if (result.status === "completed")
          await loadResult(run, ++issuedReadRef.current);
        else if (result.status === "failed") await checkStatus(run);
        else {
          if (
            current.reviewStatus !== "completed" &&
            current.reviewStatus !== "processing"
          )
            update({ ...current, reviewStatus: "processing" });
          const queueStatus = result.status;
          dispatch({ type: "enqueue-ack", status: queueStatus });
        }
      } catch (error) {
        if (run !== runRef.current || requestRef.current !== request) return;
        if (error instanceof ApiError && error.code === "RERUN_LIMIT") {
          // Refused before anything changed: keep showing the current result.
          requestRef.current = null;
          dispatch({ type: "rerun-refused", message: error.message });
          await loadResult(run, ++issuedReadRef.current);
          return;
        }
        // Acceptance may have succeeded despite a lost response; polling is the primary recovery path.
        if (run === runRef.current) dispatch({ type: "poll-failed" });
      }
    },
    [state.phase, loadResult, checkStatus, update],
  );
  return {
    ...state,
    rerunFailed: state.resultSource === "previous-after-failure",
    pollFailed: state.polling === "failed",
    start: () => submit(false),
    rerun: () => submit(true),
    retryResult: () => {
      void loadResult(++runRef.current, ++issuedReadRef.current);
    },
    refreshStatus: () => {
      void checkStatus(runRef.current);
    },
  };
}
