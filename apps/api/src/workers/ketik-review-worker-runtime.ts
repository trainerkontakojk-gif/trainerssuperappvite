import { randomUUID } from "node:crypto";
import {
  claimKetikReview,
  KETIK_REVIEW_LEASE_SECONDS,
  processClaimedKetikReview,
  releaseKetikReview,
  type KetikReviewClaim,
} from "../services/ketik/review-lifecycle";

export interface KetikWorkerConfig {
  intervalMs: number;
  shutdownMs: number;
  healthPort: number;
}
export function parseKetikWorkerConfig(
  env: NodeJS.ProcessEnv,
): KetikWorkerConfig {
  if (env.KETIK_REVIEW_WORKER_ENABLED !== "true")
    throw new Error("WORKER_DISABLED");
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key] ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error(`INVALID_${key}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`INVALID_${key}`);
    return value;
  };
  return {
    intervalMs: number("KETIK_REVIEW_WORKER_INTERVAL_MS", 5000, 250, 60000),
    shutdownMs: number("KETIK_REVIEW_WORKER_SHUTDOWN_MS", 10000, 250, 30000),
    healthPort: number("KETIK_REVIEW_WORKER_HEALTH_PORT", 3014, 0, 65535),
  };
}

export function createKetikReviewWorker(config: KetikWorkerConfig) {
  const workerId = `ketik-${randomUUID()}`;
  let stopping = false;
  let started = false;
  let loopAlive = false;
  let active: KetikReviewClaim | null = null;
  let cycle: Promise<void> | null = null;
  let loopPromise: Promise<void> | null = null;
  let wake: (() => void) | null = null;
  let lastPollAt: number | null = null;
  let errorClass: string | null = null;
  let shutdownPromise: Promise<void> | null = null;
  const log = (event: string) => console.log(JSON.stringify({ event }));

  async function runCycle() {
    const claim = await claimKetikReview(workerId);
    lastPollAt = Date.now();
    errorClass = null;
    if (!claim || claim.status !== "processing") return;
    active = claim;
    if (stopping) {
      await releaseKetikReview(claim);
      active = null;
      return;
    }
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      // Leave persistence grace before the DB lease expires. Late writes are fenced by its token/expiry.
      const result = await Promise.race([
        processClaimedKetikReview(claim).then((result) => {
          if (result.status === "lease_lost")
            log("ketik_review_worker.lease_lost");
          return "settled" as const;
        }),
        new Promise<"deadline">((resolve) => {
          deadline = setTimeout(
            () => resolve("deadline"),
            (KETIK_REVIEW_LEASE_SECONDS - 30) * 1000,
          );
        }),
      ]);
      if (result === "deadline") {
        await releaseKetikReview(claim);
        log("ketik_review_worker.deadline_released");
      }
      lastPollAt = Date.now();
    } finally {
      if (deadline) clearTimeout(deadline);
      if (active === claim) active = null;
    }
  }
  async function loop() {
    loopAlive = true;
    try {
      while (!stopping) {
        cycle = runCycle();
        try {
          await cycle;
        } catch (error) {
          errorClass = error instanceof Error ? error.name : "DatabaseError";
          log("ketik_review_worker.cycle_failed");
        } finally {
          cycle = null;
        }
        if (stopping) break;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = null;
            resolve();
          }, config.intervalMs);
          wake = () => {
            clearTimeout(timer);
            wake = null;
            resolve();
          };
        });
      }
    } finally {
      loopAlive = false;
    }
  }
  async function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      stopping = true;
      wake?.();
      if (!cycle) {
        await loopPromise;
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settled = await Promise.race([
        cycle.then(
          () => true,
          () => true,
        ),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), config.shutdownMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (!settled && active) {
        const claim = active;
        let releaseTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            releaseKetikReview(claim),
            new Promise<never>((_, reject) => {
              releaseTimer = setTimeout(
                () => reject(new Error("RELEASE_TIMEOUT")),
                config.shutdownMs,
              );
            }),
          ]);
          log("ketik_review_worker.shutdown_claim_fenced");
        } finally {
          if (releaseTimer) clearTimeout(releaseTimer);
        }
      } else if (!settled) {
        // A hung admission RPC may still acquire a lease; expiry is its bounded recovery backstop.
        log("ketik_review_worker.shutdown_recovery_deferred");
      }
    })();
    return shutdownPromise;
  }
  return {
    start() {
      if (started) throw new Error("WORKER_ALREADY_STARTED");
      started = true;
      loopPromise = loop();
    },
    shutdown,
    health() {
      const healthy =
        loopAlive &&
        !stopping &&
        errorClass === null &&
        lastPollAt !== null &&
        Date.now() - lastPollAt <
          (active !== null
            ? KETIK_REVIEW_LEASE_SECONDS * 1000
            : Math.max(config.intervalMs * 3, 15000));
      return {
        healthy,
        loopAlive,
        stopping,
        active: active !== null,
        lastSuccessfulPollAt: lastPollAt
          ? new Date(lastPollAt).toISOString()
          : null,
        errorClass,
      };
    },
  };
}
