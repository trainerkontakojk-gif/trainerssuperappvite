import { useCallback, useEffect, useReducer, useRef } from "react";
import { useAuthStore } from "../../../store/authStore";
import { fetchUsageSummary } from "../../../lib/usage-summary";
import {
  pollUsageDelta,
  formatUsageDeltaLabel,
  type UsageDelta,
  type UsageSnapshot,
} from "../../../lib/usage-snapshot";
import { notify } from "../../../lib/toast";

interface UsageState {
  status:
    "idle" | "capturing" | "tracking" | "polling" | "ready" | "unavailable";
  account: string | undefined;
  epoch: number;
  request: number;
  sessionId: string | null;
  baseline: UsageSnapshot | null;
  delta: UsageDelta | null;
}
const INITIAL: UsageState = {
  status: "idle",
  account: undefined,
  epoch: 0,
  request: 0,
  sessionId: null,
  baseline: null,
  delta: null,
};
type UsageEvent =
  | { type: "reset" | "begin"; epoch: number; account: string | undefined }
  | { type: "cancel"; epoch: number; nextEpoch: number }
  | { type: "bind"; epoch: number; sessionId: string }
  | { type: "captured"; epoch: number; baseline: UsageSnapshot | null }
  | { type: "poll"; epoch: number; request: number }
  | {
      type: "result";
      epoch: number;
      request: number;
      delta: UsageDelta | null;
      notified: boolean;
    };

function usageReducer(state: UsageState, event: UsageEvent): UsageState {
  switch (event.type) {
    case "reset":
    case "begin":
      return {
        ...INITIAL,
        account: event.account,
        epoch: event.epoch,
        status: event.type === "begin" ? "capturing" : "idle",
        delta:
          event.type === "begin" && state.account === event.account
            ? state.delta
            : null,
      };
    case "cancel":
      return state.epoch === event.epoch
        ? {
            ...INITIAL,
            account: state.account,
            epoch: event.nextEpoch,
            status: state.delta ? "ready" : "idle",
            delta: state.delta,
          }
        : state;
    case "bind":
      return state.epoch === event.epoch
        ? { ...state, sessionId: event.sessionId, delta: null }
        : state;
    case "captured":
      return state.epoch === event.epoch && state.status === "capturing"
        ? {
            ...state,
            baseline: event.baseline,
            status: event.baseline ? "tracking" : "unavailable",
          }
        : state;
    case "poll":
      return state.epoch === event.epoch && state.baseline && state.sessionId
        ? { ...state, status: "polling", request: event.request }
        : state;
    case "result":
      return state.epoch === event.epoch &&
        state.request === event.request &&
        state.status === "polling"
        ? {
            ...state,
            status: event.delta ? "ready" : "unavailable",
            delta: event.delta,
            baseline: event.notified ? null : state.baseline,
          }
        : state;
  }
}

/** Session-owned display estimate; shared monthly-summary arithmetic is unchanged. */
export function useKetikUsageDelta(
  userId: string | undefined,
  requestedSessionId: string | undefined,
) {
  const [state, dispatch] = useReducer(usageReducer, {
    ...INITIAL,
    account: userId,
  });
  const current = useRef(state);
  const epoch = useRef(0);
  const request = useRef(0);
  const transition = useCallback((event: UsageEvent) => {
    current.current = usageReducer(current.current, event);
    dispatch(event);
  }, []);
  const reset = useCallback(
    () =>
      transition({ type: "reset", epoch: ++epoch.current, account: userId }),
    [transition, userId],
  );
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
    };
    reset();
    return invalidate;
  }, [reset]);
  useEffect(() => {
    if (
      requestedSessionId &&
      current.current.sessionId &&
      requestedSessionId !== current.current.sessionId
    )
      reset();
  }, [requestedSessionId, reset]);

  const begin = () => {
    const scope = ++epoch.current;
    transition({ type: "begin", epoch: scope, account: userId });
    // Capture in the background: starting chat must never wait for this read.
    void fetchUsageSummary("ketik").then((baseline) => {
      if (
        epoch.current === scope &&
        useAuthStore.getState().session?.user.id === userId
      )
        transition({ type: "captured", epoch: scope, baseline });
    });
    return scope;
  };
  const bind = (scope: number, sessionId: string) =>
    transition({ type: "bind", epoch: scope, sessionId });
  const cancel = (scope: number) => {
    if (scope === epoch.current)
      transition({ type: "cancel", epoch: scope, nextEpoch: ++epoch.current });
  };
  const compute = async (notifyUser: boolean) => {
    const owner = current.current;
    if (!owner.baseline || !owner.sessionId || owner.account !== userId) return;
    const id = ++request.current;
    const isCurrent = () =>
      epoch.current === owner.epoch &&
      current.current.request === id &&
      useAuthStore.getState().session?.user.id === userId;
    transition({ type: "poll", epoch: owner.epoch, request: id });
    try {
      const delta = await pollUsageDelta(
        // A cancelled helper may finish its bounded wait, but cannot issue more reads.
        () =>
          isCurrent() ? fetchUsageSummary("ketik") : Promise.resolve(null),
        owner.baseline,
      );
      if (!isCurrent()) return;
      const notified = Boolean(
        notifyUser && delta && (delta.costIdr > 0 || delta.totalTokens > 0),
      );
      transition({
        type: "result",
        epoch: owner.epoch,
        request: id,
        delta,
        notified,
      });
      if (notified && delta)
        notify.info(`Pemakaian AI sesi ini: ${formatUsageDeltaLabel(delta)}`);
    } catch (error) {
      if (!isCurrent()) return;
      transition({
        type: "result",
        epoch: owner.epoch,
        request: id,
        delta: null,
        notified: false,
      });
      console.warn("[Ketik] Failed to compute usage delta:", error);
    }
  };
  return {
    begin,
    bind,
    cancel,
    compute,
    sessionDelta: state.account === userId ? state.delta : null,
    sessionDeltaPending: state.account === userId && state.status === "polling",
  };
}
