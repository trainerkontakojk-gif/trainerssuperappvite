import { createHash, randomUUID } from "node:crypto";
import type { AttemptOutcome } from "./durable-db.js";

const CLOSED_RENEWAL_REJECTION_REASONS = [
  "lease_not_found",
  "owner_mismatch",
  "inactive",
  "expired",
  "invalid_ttl",
] as const;

type ClosedRenewalRejectionReason =
  (typeof CLOSED_RENEWAL_REJECTION_REASONS)[number];

export type DistributedWebRtcLeaseLossReason =
  | "local_expiry"
  | "rpc_error"
  | "invalid_response"
  | "renewal_rejected"
  | ClosedRenewalRejectionReason;

function normalizeRenewalRejectionReason(
  reason: string,
): DistributedWebRtcLeaseLossReason {
  return (CLOSED_RENEWAL_REJECTION_REASONS as readonly string[]).includes(
    reason,
  )
    ? (reason as ClosedRenewalRejectionReason)
    : "renewal_rejected";
}

export interface DistributedWebRtcLeaseStore {
  acquire(input: {
    userId: string;
    sessionId: string;
    attemptId: string;
    provider: "openai-webrtc";
    leaseTokenHash: string;
    ttlMs: number;
    maxUserSessions: number;
    maxProviderSessions: number;
  }): Promise<{
    granted: boolean;
    leaseId?: string;
    expiresAtMs?: number;
    activeCount: number;
    reason: string;
  }>;
  renew(input: {
    leaseId: string;
    userId: string;
    sessionId: string;
    attemptId: string;
    leaseTokenHash: string;
    ttlMs: number;
  }): Promise<{ renewed: boolean; expiresAtMs?: number; reason: string }>;
  release(input: {
    leaseId: string;
    userId: string;
    sessionId: string;
    attemptId: string;
    leaseTokenHash: string;
    outcome: AttemptOutcome;
  }): Promise<{ released: boolean; idempotent: boolean; reason: string }>;
}

export interface DistributedWebRtcLeaseHandle {
  readonly leaseId: string;
  readonly attemptId: string;
  readonly tokenHash: string;
  readonly expiresAtMs: number;
  readonly lost: boolean;
  /** Resolves once this replica no longer owns the distributed lease. */
  readonly whenLost: Promise<void>;
  renew(): Promise<boolean>;
  release(outcome: AttemptOutcome): Promise<void>;
}

export interface DistributedWebRtcLeaseCoordinator {
  acquire(input: {
    userId: string;
    sessionId: string;
    attemptId: string;
    provider: "openai-webrtc";
    ttlMs: number;
    maxUserSessions?: number;
    maxProviderSessions?: number;
  }): Promise<{
    handle: DistributedWebRtcLeaseHandle | null;
    activeCount: number;
    reason: string;
  }>;
}

export function createDistributedWebRtcLeaseCoordinator(
  store: DistributedWebRtcLeaseStore,
  options: {
    heartbeatMs?: number;
    now?: () => number;
    createToken?: () => string;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
    onLost?: (input: {
      userId: string;
      sessionId: string;
      attemptId: string;
      leaseId: string;
      reason: DistributedWebRtcLeaseLossReason;
    }) => void;
  } = {},
): DistributedWebRtcLeaseCoordinator {
  const heartbeatMs = Math.max(250, Math.floor(options.heartbeatMs ?? 10_000));
  const now = options.now ?? Date.now;
  const createToken = options.createToken ?? randomUUID;
  const setIntervalFn = options.setInterval ?? setInterval;
  const clearIntervalFn = options.clearInterval ?? clearInterval;

  return {
    async acquire(input) {
      const tokenHash = createHash("sha256")
        .update(createToken(), "utf8")
        .digest("hex");
      const acquired = await store.acquire({
        ...input,
        maxUserSessions: input.maxUserSessions ?? 1,
        maxProviderSessions: input.maxProviderSessions ?? 100,
        leaseTokenHash: tokenHash,
      });
      if (
        !acquired.granted ||
        !acquired.leaseId ||
        acquired.expiresAtMs === undefined
      ) {
        return {
          handle: null,
          activeCount: acquired.activeCount,
          reason: acquired.reason,
        };
      }

      let lost = false;
      let released = false;
      let expiresAtMs = acquired.expiresAtMs;
      let timer: ReturnType<typeof setInterval> | null = null;
      let resolveLost: () => void = () => {};
      const whenLost = new Promise<void>((resolve) => {
        resolveLost = resolve;
      });

      const markLost = (reason: DistributedWebRtcLeaseLossReason) => {
        if (lost || released) return;
        lost = true;
        if (timer) clearIntervalFn(timer);
        timer = null;
        resolveLost();
        try {
          options.onLost?.({
            userId: input.userId,
            sessionId: input.sessionId,
            attemptId: input.attemptId,
            leaseId: acquired.leaseId!,
            reason,
          });
        } catch {
          // Lease loss is authoritative even when the observer is unavailable.
        }
      };

      const renew = async (): Promise<boolean> => {
        if (lost || released) return false;
        if (now() >= expiresAtMs) {
          markLost("local_expiry");
          return false;
        }
        let result: Awaited<ReturnType<DistributedWebRtcLeaseStore["renew"]>>;
        try {
          result = await store.renew({
            leaseId: acquired.leaseId!,
            userId: input.userId,
            sessionId: input.sessionId,
            attemptId: input.attemptId,
            leaseTokenHash: tokenHash,
            ttlMs: input.ttlMs,
          });
        } catch {
          markLost("rpc_error");
          return false;
        }
        if (!result.renewed) {
          markLost(normalizeRenewalRejectionReason(result.reason));
          return false;
        }
        if (
          result.expiresAtMs === undefined ||
          !Number.isFinite(result.expiresAtMs) ||
          result.expiresAtMs <= now()
        ) {
          markLost("invalid_response");
          return false;
        }
        expiresAtMs = result.expiresAtMs;
        return true;
      };

      const handle: DistributedWebRtcLeaseHandle = {
        leaseId: acquired.leaseId,
        attemptId: input.attemptId,
        tokenHash,
        get expiresAtMs() {
          return expiresAtMs;
        },
        get lost() {
          return lost;
        },
        whenLost,
        renew,
        async release(outcome) {
          if (released) return;
          released = true;
          if (timer) clearIntervalFn(timer);
          timer = null;
          await store.release({
            leaseId: acquired.leaseId!,
            userId: input.userId,
            sessionId: input.sessionId,
            attemptId: input.attemptId,
            leaseTokenHash: tokenHash,
            outcome,
          });
        },
      };

      timer = setIntervalFn(() => {
        void renew().catch(() => {
          // A rejected heartbeat is a lost lease, never an unhandled process
          // rejection. The orphan worker owns the later provider cleanup.
          markLost("rpc_error");
        });
      }, heartbeatMs);
      const unref = (timer as unknown as { unref?: () => void }).unref;
      unref?.call(timer);
      return {
        handle,
        activeCount: acquired.activeCount,
        reason: acquired.reason,
      };
    },
  };
}
