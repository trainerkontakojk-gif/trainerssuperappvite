import type { AttemptOutcome } from "./durable-db.js";

export interface OrphanLeaseCandidate {
  leaseId: string;
  attemptId: string;
  sessionId: string;
  userId: string;
  provider: "openai-webrtc";
  providerCallReference: string | null;
  sidebandConnected: boolean;
}

export interface OrphanCleanupStore {
  claim(limit: number): Promise<OrphanLeaseCandidate[]>;
  complete(input: {
    leaseId: string;
    attemptId: string;
    outcome: Extract<AttemptOutcome, "orphaned">;
    providerClosed: boolean;
    sidebandClosed: boolean;
    errorCode?: string;
  }): Promise<void>;
}

export interface OrphanCleanupWorker {
  runOnce(): Promise<{ claimed: number; completed: number; failed: number }>;
  start(): void;
  stop(): void;
}

export function createOrphanCleanupWorker(options: {
  store: OrphanCleanupStore;
  closeProvider: (providerCallReference: string) => Promise<boolean>;
  closeSideband?: (candidate: OrphanLeaseCandidate) => Promise<boolean>;
  onOrphan?: (input: {
    candidate: OrphanLeaseCandidate;
    completed: boolean;
  }) => void;
  limit?: number;
  intervalMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}): OrphanCleanupWorker {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)));
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const emitOrphan = (input: {
    candidate: OrphanLeaseCandidate;
    completed: boolean;
  }) => {
    try {
      options.onOrphan?.(input);
    } catch {
      // Metrics/alerts must not change cleanup ownership or retry behavior.
    }
  };

  const runOnce = async () => {
    if (running) return { claimed: 0, completed: 0, failed: 0 };
    running = true;
    try {
      const candidates = await options.store.claim(limit);
      let completed = 0;
      let failed = 0;
      for (const candidate of candidates) {
        let providerClosed = candidate.providerCallReference === null;
        let sidebandClosed = !candidate.sidebandConnected;
        let errorCode: string | undefined;
        try {
          if (candidate.providerCallReference) {
            providerClosed = await options.closeProvider(
              candidate.providerCallReference,
            );
          }
          if (options.closeSideband) {
            sidebandClosed = await options.closeSideband(candidate);
          }
        } catch {
          errorCode = "cleanup_exception";
        }
        try {
          await options.store.complete({
            leaseId: candidate.leaseId,
            attemptId: candidate.attemptId,
            outcome: "orphaned",
            providerClosed,
            sidebandClosed,
            ...(errorCode ? { errorCode } : {}),
          });
          const cleanupCompleted =
            providerClosed && sidebandClosed && !errorCode;
          if (cleanupCompleted) completed += 1;
          else failed += 1;
          emitOrphan({
            candidate,
            completed: cleanupCompleted,
          });
        } catch {
          failed += 1;
          emitOrphan({ candidate, completed: false });
        }
      }
      return { claimed: candidates.length, completed, failed };
    } finally {
      running = false;
    }
  };

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = setIntervalFn(
        () => {
          void runOnce().catch(() => undefined);
        },
        Math.max(1_000, Math.floor(options.intervalMs ?? 30_000)),
      );
      const unref = (timer as unknown as { unref?: () => void }).unref;
      unref?.call(timer);
    },
    stop() {
      if (!timer) return;
      clearIntervalFn(timer);
      timer = null;
    },
  };
}
