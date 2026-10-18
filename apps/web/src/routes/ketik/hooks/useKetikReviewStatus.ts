import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KetikReviewDetail,
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import { ApiError } from "../../../lib/api";
import { ketikApi } from "../ketikApi";

const POLL_INTERVAL_MS = 3_000;
export type KetikReviewPhase =
  "idle" | "reviewing" | "loading-result" | "ready" | "failed";
export type KetikReviewFailure = "review" | "result";
export interface KetikReviewState {
  phase: KetikReviewPhase;
  failure: KetikReviewFailure | null;
  review: KetikSessionReview | null;
  typos: KetikTypoFinding[];
  rerunFailed: boolean;
  queueStatus: "queued" | "processing" | null;
  pollFailed: boolean;
}
const INITIAL: KetikReviewState = {
  phase: "idle",
  failure: null,
  review: null,
  typos: [],
  rerunFailed: false,
  queueStatus: null,
  pollFailed: false,
};
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
  const [state, setState] = useState<KetikReviewState>(INITIAL);
  // Re-scores left for this reader (undefined = not known yet, null = no limit).
  const [rerunsLeft, setRerunsLeft] = useState<number | null | undefined>();
  const [rerunRefusal, setRerunRefusal] = useState<string | null>(null);
  const sessionRef = useRef(session);
  const onChangeRef = useRef(onSessionChange);
  const runRef = useRef(0);
  const rerunFailedRun = useRef(-1);
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
  const fail = useCallback(
    (run: number, failure: KetikReviewFailure, confirmed = false) => {
      if (run !== runRef.current || !sessionRef.current) return;
      setState({ ...INITIAL, phase: "failed", failure });
      if (confirmed) {
        requestRef.current = null;
        update({ ...sessionRef.current, reviewStatus: "failed" });
      }
    },
    [update],
  );
  const loadResult = useCallback(
    async (run: number) => {
      const current = sessionRef.current;
      if (!current || run !== runRef.current) return;
      setState((prev) => ({ ...prev, phase: "loading-result", failure: null }));
      try {
        const detail = await ketikApi.getReviewDetail(current.id);
        if (run !== runRef.current) return;
        requestRef.current = null;
        update(withScores(current, detail.scores));
        setState((prev) => ({
          ...INITIAL,
          phase: "ready",
          review: detail.review,
          typos: detail.typos ?? [],
          rerunFailed: rerunFailedRun.current === run,
          pollFailed: prev.pollFailed,
        }));
      } catch {
        fail(run, "result");
      }
    },
    [fail, update],
  );
  const checkStatus = useCallback(
    async (run: number, initial = false) => {
      const current = sessionRef.current;
      if (!current || run !== runRef.current) return;
      try {
        const data = await ketikApi.getReviewStatus(current.id);
        if (run !== runRef.current) return;
        setRerunsLeft(data.rerunsLeft);
        setState((prev) => ({ ...prev, pollFailed: false }));
        if (data.status === "failed" && data.previousKept && data.resultReady) {
          rerunFailedRun.current = run;
          await loadResult(run);
        } else if (data.status === "completed" && data.resultReady) {
          await loadResult(run);
        } else if (data.status === "failed") {
          fail(run, "review", true);
        } else if (data.status === "queued" || data.status === "processing") {
          if (
            current.reviewStatus !== "completed" &&
            current.reviewStatus !== "processing"
          )
            update({ ...current, reviewStatus: "processing" });
          const queueStatus = data.status;
          setState((prev) => ({ ...prev, phase: "reviewing", queueStatus }));
        } else if (!initial) {
          // The server confirms no active request. Retrying can reuse the unacknowledged UUID.
          fail(run, "review");
        } else {
          setState(INITIAL);
        }
      } catch {
        if (run !== runRef.current) return;
        setState((prev) => ({ ...prev, pollFailed: true }));
        if (initial && current.reviewStatus === "completed")
          await loadResult(run);
      }
    },
    [fail, loadResult, update],
  );
  useEffect(() => {
    const invalidate = () => ++runRef.current;
    const run = invalidate();
    requestRef.current = null;
    rerunFailedRun.current = -1;
    setRerunsLeft(undefined);
    setRerunRefusal(null);
    const current = sessionRef.current;
    if (!sessionId || !current) setState(INITIAL);
    else if (current.reviewStatus === "completed") void checkStatus(run, true);
    else if (current.reviewStatus === "processing")
      setState({ ...INITIAL, phase: "reviewing" });
    else if (current.reviewStatus === "failed")
      setState({ ...INITIAL, phase: "failed", failure: "review" });
    else setState(INITIAL);
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
      rerunFailedRun.current = -1;
      const request =
        requestRef.current?.sessionId === current.id &&
        requestRef.current.rerun === rerun
          ? requestRef.current
          : { sessionId: current.id, requestId: crypto.randomUUID(), rerun };
      requestRef.current = request;
      setState({ ...INITIAL, phase: "reviewing" });
      try {
        const result = await ketikApi.startReview(current.id, {
          rerun,
          requestId: request.requestId,
        });
        if (run !== runRef.current) return;
        if (result.status === "completed") await loadResult(run);
        else if (result.status === "failed") await checkStatus(run);
        else {
          if (
            current.reviewStatus !== "completed" &&
            current.reviewStatus !== "processing"
          )
            update({ ...current, reviewStatus: "processing" });
          const queueStatus = result.status;
          setState((prev) => ({ ...prev, queueStatus }));
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "RERUN_LIMIT") {
          // Refused before anything changed: keep showing the current result.
          requestRef.current = null;
          setRerunsLeft(0);
          setRerunRefusal(error.message);
          await loadResult(run);
          return;
        }
        // Acceptance may have succeeded despite a lost response; polling is the primary recovery path.
        if (run === runRef.current)
          setState((prev) => ({ ...prev, pollFailed: true }));
      }
    },
    [state.phase, loadResult, checkStatus, update],
  );
  return {
    ...state,
    rerunsLeft,
    rerunRefusal,
    start: () => submit(false),
    rerun: () => submit(true),
    retryResult: () => {
      void loadResult(++runRef.current);
    },
    refreshStatus: () => {
      void checkStatus(runRef.current);
    },
  };
}
