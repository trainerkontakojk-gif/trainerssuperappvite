import { randomUUID } from "node:crypto";
import {
  claimKetikReview,
  KETIK_REVIEW_LEASE_SECONDS,
  processClaimedKetikReview,
  releaseKetikReview,
  type KetikReviewClaim,
} from "../services/ketik/review-lifecycle";
import { subscribeKetikReviewQueued } from "../services/ketik/review-queue-signal";

export interface KetikWorkerConfig {
  intervalMs: number;
  idleMaxMs: number;
  shutdownMs: number;
  healthPort: number;
  /** Test-only shortened processing deadline; never changes the DB lease. */
  testDeadlineMs?: number;
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
  const intervalMs = number(
    "KETIK_REVIEW_WORKER_INTERVAL_MS",
    5000,
    250,
    60000,
  );
  const idleMaxMs = number(
    "KETIK_REVIEW_WORKER_IDLE_MAX_MS",
    Math.max(30000, intervalMs),
    250,
    300000,
  );
  if (idleMaxMs < intervalMs)
    throw new Error("INVALID_KETIK_REVIEW_WORKER_IDLE_MAX_MS");
  const testDeadlineMs = env.KETIK_REVIEW_WORKER_DEADLINE_MS;
  if (testDeadlineMs !== undefined && env.NODE_ENV !== "test")
    throw new Error("INVALID_KETIK_REVIEW_WORKER_DEADLINE_MS");
  return {
    intervalMs,
    idleMaxMs,
    ...(testDeadlineMs === undefined
      ? {}
      : {
          testDeadlineMs: number(
            "KETIK_REVIEW_WORKER_DEADLINE_MS",
            1000,
            250,
            3600000,
          ),
        }),
    shutdownMs: number("KETIK_REVIEW_WORKER_SHUTDOWN_MS", 10000, 250, 30000),
    healthPort: number("KETIK_REVIEW_WORKER_HEALTH_PORT", 3014, 0, 65535),
  };
}

type PollState = { delayMs: number; wakePending: boolean };
type PollEvent = "found-work" | "empty" | "error" | "wake" | "consume-wake";
function transitionPoll(
  state: PollState,
  event: PollEvent,
  config: KetikWorkerConfig,
): PollState {
  if (event === "wake")
    return { delayMs: config.intervalMs, wakePending: true };
  if (event === "consume-wake") return { ...state, wakePending: false };
  if (state.wakePending) return state;
  return {
    delayMs:
      event === "found-work"
        ? config.intervalMs
        : Math.min(state.delayMs * 2, config.idleMaxMs),
    wakePending: false,
  };
}

type HostWork =
  | { phase: "waiting" | "claiming" | "release_timed_out" }
  | { phase: "processing" | "releasing"; claim: KetikReviewClaim };
type HostState =
  | { status: "idle" }
  | { status: "running"; work: HostWork }
  | { status: "stopping"; work: HostWork }
  | { status: "stopped" };
type HostEvent =
  | { type: "start" | "claim" | "cycle_finished" | "stop" | "loop_stopped" }
  | {
      type: "claimed" | "release" | "release_finished" | "release_timed_out";
      claim: KetikReviewClaim;
    };

function transitionHost(state: HostState, event: HostEvent): HostState {
  if (event.type === "start") {
    if (state.status !== "idle") throw new Error("WORKER_ALREADY_STARTED");
    return { status: "running", work: { phase: "waiting" } };
  }
  if (event.type === "stop") {
    if (state.status === "idle") return { status: "stopped" };
    return state.status === "running"
      ? { ...state, status: "stopping" }
      : state;
  }
  if (event.type === "loop_stopped") return { status: "stopped" };
  if (state.status !== "running" && state.status !== "stopping") return state;
  const work = state.work;
  switch (event.type) {
    case "claim":
      return state.status === "running" &&
        (work.phase === "waiting" || work.phase === "release_timed_out")
        ? { ...state, work: { phase: "claiming" } }
        : state;
    case "claimed":
      return work.phase === "claiming"
        ? { ...state, work: { phase: "processing", claim: event.claim } }
        : state;
    case "release":
    case "release_finished":
    case "release_timed_out":
      if (!("claim" in work) || work.claim !== event.claim) return state;
      return {
        ...state,
        work:
          event.type === "release"
            ? { phase: "releasing", claim: event.claim }
            : {
                phase:
                  event.type === "release_timed_out"
                    ? "release_timed_out"
                    : "waiting",
              },
      };
    case "cycle_finished":
      // Preserve the explicit timeout outcome until the next admission attempt.
      return work.phase === "release_timed_out" || work.phase === "waiting"
        ? state
        : { ...state, work: { phase: "waiting" } };
  }
}

function activeClaim(state: HostState): KetikReviewClaim | null {
  return (state.status === "running" || state.status === "stopping") &&
    "claim" in state.work
    ? state.work.claim
    : null;
}

class ReleaseTimeout extends Error {
  override name = "ReleaseTimeout";
  constructor() {
    super("RELEASE_TIMEOUT");
  }
}

export function createKetikReviewWorker(config: KetikWorkerConfig) {
  const workerId = `ketik-${randomUUID()}`;
  let host: HostState = { status: "idle" };
  const transitionHostState = (event: HostEvent) => {
    host = transitionHost(host, event);
  };
  // Resource handles only; lifecycle decisions come from HostState.
  let releasePromise: Promise<boolean> | null = null;
  let loopPromise: Promise<void> | null = null;
  let wake: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let pollState: PollState = { delayMs: config.intervalMs, wakePending: false };
  const transition = (event: PollEvent) => {
    pollState = transitionPoll(pollState, event, config);
  };
  let lastPollAt: number | null = null;
  let errorClass: string | null = null;
  let shutdownPromise: Promise<void> | null = null;
  const log = (event: string) => console.log(JSON.stringify({ event }));

  function releaseWithin(
    claim: KetikReviewClaim,
    ms: number,
  ): Promise<boolean> {
    // Deadline and shutdown can meet while a release is in flight. Join that
    // bounded attempt rather than issuing a second settlement RPC.
    if (releasePromise) return releasePromise;
    transitionHostState({ type: "release", claim });
    releasePromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const released = await Promise.race([
          releaseKetikReview(claim),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ReleaseTimeout()), ms);
          }),
        ]);
        transitionHostState({ type: "release_finished", claim });
        return released;
      } catch (error) {
        if (error instanceof ReleaseTimeout)
          transitionHostState({ type: "release_timed_out", claim });
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        releasePromise = null;
      }
    })();
    return releasePromise;
  }

  async function runCycle() {
    transitionHostState({ type: "claim" });
    const claim = await claimKetikReview(workerId);
    lastPollAt = Date.now();
    errorClass = null;
    transition(claim ? "found-work" : "empty");
    if (!claim || claim.status !== "processing") return;
    transitionHostState({ type: "claimed", claim });
    if (host.status !== "running") {
      await releaseWithin(claim, Math.min(config.shutdownMs, 20_000));
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
            Math.min(
              config.testDeadlineMs ?? Infinity,
              ((claim.leaseSeconds ?? KETIK_REVIEW_LEASE_SECONDS) - 30) * 1000,
            ),
          );
        }),
      ]);
      if (result === "deadline") {
        try {
          const released = await releaseWithin(
            claim,
            Math.min(config.shutdownMs, 20_000),
          );
          log(
            released
              ? "ketik_review_worker.deadline_released"
              : "ketik_review_worker.lease_lost",
          );
        } catch (error) {
          if (!(error instanceof ReleaseTimeout)) throw error;
          errorClass = "ReleaseTimeout";
          log("ketik_review_worker.deadline_release_timeout");
          // Leave the old claim to expiry and keep admission alive. The next
          // successful poll clears degraded health; late RPCs remain fenced.
        }
      }
      lastPollAt = Date.now();
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }
  async function loop() {
    try {
      while (host.status === "running") {
        try {
          await runCycle();
        } catch (error) {
          errorClass = error instanceof Error ? error.name : "DatabaseError";
          transition("error");
          log("ketik_review_worker.cycle_failed");
        } finally {
          transitionHostState({ type: "cycle_finished" });
        }
        if (host.status !== "running") break;
        if (pollState.wakePending) {
          transition("consume-wake");
          continue;
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = null;
            resolve();
          }, pollState.delayMs);
          wake = () => {
            clearTimeout(timer);
            wake = null;
            resolve();
          };
        });
        if (pollState.wakePending) transition("consume-wake");
      }
    } finally {
      transitionHostState({ type: "loop_stopped" });
    }
  }
  async function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      const claimAtShutdown = activeClaim(host);
      transitionHostState({ type: "stop" });
      unsubscribe?.();
      unsubscribe = null;
      wake?.();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settled = await Promise.race([
        (loopPromise ?? Promise.resolve()).then(
          () => true,
          () => true,
        ),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), config.shutdownMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      // A deadline release may time out and finish the loop during this grace
      // period. That is deferred recovery, not a successfully fenced shutdown.
      if (claimAtShutdown && errorClass === "ReleaseTimeout")
        throw new ReleaseTimeout();
      const claim = activeClaim(host);
      if (!settled && claim) {
        await releaseWithin(claim, Math.min(config.shutdownMs, 20_000));
        log("ketik_review_worker.shutdown_claim_fenced");
      } else if (!settled) {
        // A hung admission RPC may still acquire a lease; expiry is its bounded recovery backstop.
        log("ketik_review_worker.shutdown_recovery_deferred");
      }
    })();
    return shutdownPromise;
  }
  return {
    start() {
      transitionHostState({ type: "start" });
      unsubscribe = subscribeKetikReviewQueued(() => {
        transition("wake");
        wake?.();
      });
      loopPromise = loop();
    },
    shutdown,
    health() {
      const loopAlive = host.status === "running" || host.status === "stopping";
      const stopping = host.status === "stopping" || host.status === "stopped";
      const active = activeClaim(host);
      const healthy =
        loopAlive &&
        !stopping &&
        errorClass === null &&
        lastPollAt !== null &&
        Date.now() - lastPollAt <
          (active !== null
            ? (active.leaseSeconds ?? KETIK_REVIEW_LEASE_SECONDS) * 1000
            : Math.max(config.idleMaxMs * 3, 15000));
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

export type KetikReviewWorker = ReturnType<typeof createKetikReviewWorker>;

/**
 * Embedded host for the API process (same contract as the Telefun embedded
 * worker): disabled unless KETIK_REVIEW_WORKER_ENABLED === "true"; enabled but
 * invalid config throws so the API refuses to start. Call before HTTP listen,
 * then `start()` once listening. No health server: the loopback health port is
 * a standalone-only diagnostic.
 */
export function prepareEmbeddedKetikReviewWorker(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): { start: () => KetikReviewWorker | null } {
  if (env.KETIK_REVIEW_WORKER_ENABLED !== "true") {
    log(JSON.stringify({ event: "ketik_review_worker.disabled" }));
    return { start: () => null };
  }
  let config: KetikWorkerConfig;
  try {
    config = parseKetikWorkerConfig(env);
  } catch {
    log(JSON.stringify({ event: "ketik_review_worker.config_rejected" }));
    throw new Error("ketik_review_worker.config_rejected");
  }
  return {
    start() {
      const runtime = createKetikReviewWorker(config);
      runtime.start();
      log(
        JSON.stringify({
          event: "ketik_review_worker.started",
          embedded: true,
          intervalMs: config.intervalMs,
          idleMaxMs: config.idleMaxMs,
        }),
      );
      return runtime;
    },
  };
}
