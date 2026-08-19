import {
  getTelefunSession,
  type TelefunSessionRow,
} from "./telefunApi";
import { ApiError } from "../../lib/api";

/**
 * Session-scoped scoring reconciliation after WebRTC finalization.
 *
 * State machine (plan §C):
 *
 *   idle
 *     -> waiting_for_scoring (pending / scoring not started)
 *     -> processing
 *     -> completed          -- upsert score+feedback+assessment; stop
 *     -> failed_retryable   -- show scheduled retry; stop current poll
 *     -> failed_final       -- explicit retry only; stop
 *     -> timed_out          -- keep pending truth; allow explicit refresh
 *
 * Polling: immediate fetch, then backoff 2s/5s/10s/15s capped at 15s, with a
 * 120s maximum total active wait (the baseline from plan §C; no adjustment was
 * needed because the worker claim timeout is also 120s).
 *
 * Polling stops on: unmount (dispose), session deleted (server 404 or explicit
 * stop), a new session replacing the run, terminal status, or timeout. An
 * AbortController plus a run token ensure late responses can never resurrect a
 * deleted row, overwrite another session in Review, write local storage after
 * unmount, or mutate a new call's state. Polling pauses while offline/hidden
 * and resumes with a single refetch on online/visible.
 */

export type TelefunSessionReconciliationStatus =
  | "idle"
  | "waiting_for_scoring"
  | "processing"
  | "completed"
  | "failed_retryable"
  | "failed_final"
  | "timed_out";

export const SESSION_RECONCILIATION_BACKOFF_MS = [2000, 5000, 10000, 15000] as const;
export const SESSION_RECONCILIATION_MAX_INTERVAL_MS = 15000;
export const SESSION_RECONCILIATION_MAX_WAIT_MS = 120000;

export interface TelefunSessionReconcilerDependencies {
  fetchSessionDetail: (
    sessionId: string,
    options: { signal?: AbortSignal },
  ) => Promise<TelefunSessionRow | null>;
  nowMs?: () => number;
  setTimeout?: (handler: () => void, delayMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  addOfflineListener?: (handler: () => void) => () => void;
  addOnlineListener?: (handler: () => void) => () => void;
  addVisibilityListener?: (handler: () => void) => () => void;
  isDocumentVisible?: () => boolean;
  /** Called with every authoritative row fetched (drives the upsert). */
  onRow?: (row: TelefunSessionRow) => void;
  onStatusChange?: (
    status: TelefunSessionReconciliationStatus,
    sessionId: string,
  ) => void;
}

const defaultDependencies: Required<
  Pick<
    TelefunSessionReconcilerDependencies,
    | "nowMs"
    | "setTimeout"
    | "clearTimeout"
    | "addOfflineListener"
    | "addOnlineListener"
    | "addVisibilityListener"
    | "isDocumentVisible"
  >
> = {
  nowMs: () => Date.now(),
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (timer) =>
    clearTimeout(timer as ReturnType<typeof setTimeout>),
  addOfflineListener: (handler) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("offline", handler);
    return () => window.removeEventListener("offline", handler);
  },
  addOnlineListener: (handler) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  },
  addVisibilityListener: (handler) => {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  },
  isDocumentVisible: () =>
    typeof document === "undefined" || document.visibilityState === "visible",
};

const TERMINAL_STATUSES: ReadonlySet<TelefunSessionReconciliationStatus> =
  new Set(["completed", "failed_retryable", "failed_final"]);

function isTerminal(
  status: TelefunSessionReconciliationStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export class TelefunSessionReconciler {
  private readonly deps: Required<
    Pick<
      TelefunSessionReconcilerDependencies,
      | "fetchSessionDetail"
      | "nowMs"
      | "setTimeout"
      | "clearTimeout"
      | "addOfflineListener"
      | "addOnlineListener"
      | "addVisibilityListener"
      | "isDocumentVisible"
      | "onRow"
      | "onStatusChange"
    >
  >;

  private runToken = 0;
  private sessionId: string | null = null;
  private active = false;
  private paused = false;
  private disposed = false;
  private status: TelefunSessionReconciliationStatus = "idle";
  private timer: unknown = null;
  private abortController: AbortController | null = null;
  private attempt = 0;
  private waitedMs = 0;
  private inFlight = false;
  private refreshQueued = false;
  private removeListeners: (() => void) | null = null;

  constructor(
    dependencies?: Partial<TelefunSessionReconcilerDependencies>,
  ) {
    this.deps = {
      fetchSessionDetail:
        dependencies?.fetchSessionDetail ?? fetchProductionSessionDetail,
      nowMs: dependencies?.nowMs ?? defaultDependencies.nowMs,
      setTimeout: dependencies?.setTimeout ?? defaultDependencies.setTimeout,
      clearTimeout:
        dependencies?.clearTimeout ?? defaultDependencies.clearTimeout,
      addOfflineListener:
        dependencies?.addOfflineListener ??
        defaultDependencies.addOfflineListener,
      addOnlineListener:
        dependencies?.addOnlineListener ?? defaultDependencies.addOnlineListener,
      addVisibilityListener:
        dependencies?.addVisibilityListener ??
        defaultDependencies.addVisibilityListener,
      isDocumentVisible:
        dependencies?.isDocumentVisible ??
        defaultDependencies.isDocumentVisible,
      onRow: dependencies?.onRow ?? (() => {}),
      onStatusChange: dependencies?.onStatusChange ?? (() => {}),
    };
  }

  /** Starts (or restarts) reconciliation for a session; replaces any run. */
  start(sessionId: string): void {
    if (!sessionId) return;
    this.teardownRun();
    this.sessionId = sessionId;
    this.active = true;
    this.paused = false;
    this.status = "idle";
    this.attempt = 0;
    this.waitedMs = 0;
    this.installListeners();
    const token = this.runToken;
    void this.poll(token, true);
  }

  /**
   * Stops the run. When a sessionId is given it only stops when it matches
   * the active run, so deleting one history row never halts another session's
   * reconciliation.
   */
  stop(sessionId?: string): void {
    if (sessionId !== undefined && sessionId !== this.sessionId) return;
    this.teardownRun();
    this.sessionId = null;
    this.active = false;
  }

  /** Stops the run and removes listeners (page unmount). */
  dispose(): void {
    this.disposed = true;
    this.teardownRun();
    this.sessionId = null;
    this.active = false;
    this.removeListeners?.();
    this.removeListeners = null;
  }

  /**
   * One authoritative refetch for the current session. Reopening Review,
   * online/visibility recovery, and manual refresh all land here. While the
   * run is active the schedule continues; on a stopped run (terminal/timeout)
   * it is a single one-shot fetch that never re-arms polling.
   */
  refresh(): void {
    if (!this.sessionId || this.paused) return;
    if (this.inFlight) {
      this.refreshQueued = true;
      return;
    }
    this.clearTimer();
    const token = this.runToken;
    void this.poll(token, this.active);
  }

  /** Refresh an active run, or start a fresh run for another session. */
  watch(sessionId: string): void {
    if (!sessionId) return;
    if (this.sessionId === sessionId) {
      this.refresh();
    } else {
      this.start(sessionId);
    }
  }

  private installListeners(): void {
    if (this.removeListeners || this.disposed) return;
    const removeOffline = this.deps.addOfflineListener(() => {
      this.handlePause();
    });
    const removeOnline = this.deps.addOnlineListener(() => {
      this.handleResume();
    });
    const removeVisibility = this.deps.addVisibilityListener(() => {
      if (this.deps.isDocumentVisible()) {
        this.handleResume();
      } else {
        this.handlePause();
      }
    });
    this.removeListeners = () => {
      removeOffline();
      removeOnline();
      removeVisibility();
      this.removeListeners = null;
    };
  }

  private handlePause(): void {
    if (this.paused) return;
    this.paused = true;
    this.abortController?.abort();
    this.clearTimer();
  }

  private handleResume(): void {
    if (!this.paused || !this.active) return;
    this.paused = false;
    this.refresh();
  }

  private teardownRun(): void {
    this.runToken += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.clearTimer();
    this.inFlight = false;
    this.refreshQueued = false;
  }

  private async poll(token: number, rearm: boolean): Promise<void> {
    if (token !== this.runToken || this.paused || this.inFlight) return;
    this.inFlight = true;
    const controller = new AbortController();
    this.abortController = controller;
    let row: TelefunSessionRow | null = null;
    let errored = false;
    try {
      row = await this.deps.fetchSessionDetail(this.sessionId!, {
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted || token !== this.runToken) return;
      errored = true;
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this.inFlight = false;
    }
    if (token !== this.runToken || !this.sessionId) return;

    if (this.refreshQueued) {
      this.refreshQueued = false;
      void this.poll(token, this.active);
      return;
    }

    if (!errored && row === null) {
      // Session deleted server-side: stop without resurrecting anything.
      this.teardownRun();
      this.sessionId = null;
      this.active = false;
      return;
    }

    if (!errored && row !== null) {
      this.deps.onRow(row);
      const nextStatus = this.deriveStatus(row);
      this.setStatus(nextStatus);
      if (isTerminal(nextStatus)) {
        this.active = false;
        this.clearTimer();
        return;
      }
    }

    if (!rearm) return; // one-shot refresh on a stopped run
    this.scheduleNext(token);
  }

  private deriveStatus(
    row: TelefunSessionRow,
  ): TelefunSessionReconciliationStatus {
    switch (row.scoring_status) {
      case "completed":
        return "completed";
      case "processing":
        return "processing";
      case "failed":
        return row.scoring_retryable === true
          ? "failed_retryable"
          : "failed_final";
      case "pending":
      case null:
      case undefined:
      default:
        return "waiting_for_scoring";
    }
  }

  private setStatus(nextStatus: TelefunSessionReconciliationStatus): void {
    if (nextStatus === this.status || !this.sessionId) return;
    this.status = nextStatus;
    this.deps.onStatusChange(nextStatus, this.sessionId);
  }

  private nextDelay(): number {
    const index = Math.min(
      this.attempt,
      SESSION_RECONCILIATION_BACKOFF_MS.length - 1,
    );
    this.attempt += 1;
    return Math.min(
      SESSION_RECONCILIATION_BACKOFF_MS[index]!,
      SESSION_RECONCILIATION_MAX_INTERVAL_MS,
    );
  }

  private scheduleNext(token: number): void {
    if (token !== this.runToken || !this.active || this.paused) return;
    const remaining = SESSION_RECONCILIATION_MAX_WAIT_MS - this.waitedMs;
    if (remaining <= 0) {
      this.active = false;
      this.setStatus("timed_out");
      return;
    }
    const delay = Math.min(this.nextDelay(), remaining);
    this.waitedMs += delay;
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      void this.poll(token, true);
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.deps.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

async function fetchProductionSessionDetail(
  sessionId: string,
  options: { signal?: AbortSignal },
): Promise<TelefunSessionRow | null> {
  try {
    return await getTelefunSession(sessionId, { signal: options.signal });
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

export function createTelefunSessionReconciler(
  dependencies?: Partial<TelefunSessionReconcilerDependencies>,
): TelefunSessionReconciler {
  return new TelefunSessionReconciler(dependencies);
}

export const telefunSessionReconciler =
  new TelefunSessionReconciler();
