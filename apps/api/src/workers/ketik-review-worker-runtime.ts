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
  | {
      status: "stopping";
      work: HostWork;
      claimAtStop: KetikReviewClaim | null;
      outcome: "clean" | "recovery_deferred";
    }
  | { status: "stopped"; outcome: "clean" | "recovery_deferred" }
  | { status: "faulted" };
type HostEvent =
  | {
      type:
        | "start"
        | "claim"
        | "cycle_finished"
        | "stop"
        | "loop_stopped"
        | "fault";
    }
  | {
      type:
        | "claimed"
        | "release"
        | "release_finished"
        | "release_timed_out"
        | "release_failed";
      claim: KetikReviewClaim;
    };

class HostTransitionError extends Error {
  override name = "HostTransitionError";
  constructor(
    readonly eventType: HostEvent["type"],
    readonly stateStatus: HostState["status"],
  ) {
    super(
      eventType === "start"
        ? "WORKER_ALREADY_STARTED"
        : "ILLEGAL_HOST_TRANSITION",
    );
  }
}

/**
 * Transition table (R = running, S = stopping; matching claim uses identity):
 * State/phase             Event                         Next / noop
 * idle                    start                         R/waiting
 * idle                    stop                          stopped/clean
 * R/*                     stop                          S/same work, snapshot claim, clean
 * S/*, stopped, faulted   stop                          noop
 * R/waiting|timed_out     claim                         R/claiming
 * R|S/claiming            claimed                       same status/processing
 * R|S/processing          release (matching claim)      same status/releasing
 * R|S/releasing           release_finished|failed (same) same status/waiting
 * R|S/releasing           release_timed_out (same)      same status/release_timed_out;
 *                                                       S defers iff claim === claimAtStop
 * R|S/claiming|processing  cycle_finished                same status/waiting
 * R|S/waiting|timed_out    cycle_finished                noop (preserve timeout)
 * any except faulted      loop_stopped                  stopped (preserve stop outcome)
 * faulted                 loop_stopped                  noop
 * any except faulted      fault                         faulted
 * faulted                 fault                         noop
 * Every other state/event or mismatched claim is illegal (throws).
 *
 * Repeated release attempts join in releaseWithin, never dispatch twice. A late
 * RPC after timeout cannot dispatch another completion (Promise.race settled).
 * Cycle cleanup joins any shutdown release before cycle_finished/loop_stopped,
 * including when provider completion races it. Thus releasing/cycle_finished
 * and completion for a no-longer-active claim are bugs, not stale-event noops.
 */
function transitionHost(state: HostState, event: HostEvent): HostState {
  if (event.type === "fault")
    return state.status === "faulted" ? state : { status: "faulted" };
  if (event.type === "start") {
    if (state.status !== "idle")
      throw new HostTransitionError(event.type, state.status);
    return { status: "running", work: { phase: "waiting" } };
  }
  if (event.type === "stop") {
    if (state.status === "idle") return { status: "stopped", outcome: "clean" };
    return state.status === "running"
      ? {
          ...state,
          status: "stopping",
          claimAtStop: activeClaim(state),
          outcome: "clean",
        }
      : state;
  }
  if (event.type === "loop_stopped") {
    if (state.status === "faulted") return state;
    return {
      status: "stopped",
      outcome:
        state.status === "stopping" || state.status === "stopped"
          ? state.outcome
          : "clean",
    };
  }
  if (state.status !== "running" && state.status !== "stopping")
    throw new HostTransitionError(event.type, state.status);
  const work = state.work;
  switch (event.type) {
    case "claim":
      if (
        state.status === "running" &&
        (work.phase === "waiting" || work.phase === "release_timed_out")
      )
        return { ...state, work: { phase: "claiming" } };
      break;
    case "claimed":
      if (work.phase === "claiming")
        return { ...state, work: { phase: "processing", claim: event.claim } };
      break;
    case "release":
    case "release_finished":
    case "release_timed_out":
    case "release_failed":
      if (
        !("claim" in work) ||
        work.claim !== event.claim ||
        work.phase !== (event.type === "release" ? "processing" : "releasing")
      )
        break;
      return {
        ...state,
        ...(state.status === "stopping" &&
        event.type === "release_timed_out" &&
        event.claim === state.claimAtStop
          ? { outcome: "recovery_deferred" as const }
          : {}),
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
      if (work.phase === "release_timed_out" || work.phase === "waiting")
        return state;
      if (work.phase === "claiming" || work.phase === "processing")
        return { ...state, work: { phase: "waiting" } };
      break;
  }
  throw new HostTransitionError(event.type, state.status);
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
  // Avoid carrying TypeScript's pre-await narrowing across concurrent transitions.
  const currentHost = (): HostState => host;
  const faultHost = (
    eventType: HostEvent["type"],
    stateStatus: HostState["status"],
  ) => {
    if (host.status === "faulted") return;
    host = transitionHost(host, { type: "fault" });
    unsubscribe?.();
    unsubscribe = null;
    wake?.();
    console.error(
      JSON.stringify({
        event: "ketik_review_worker.host_faulted",
        eventType,
        stateStatus,
      }),
    );
  };
  const transitionHostState = (event: HostEvent) => {
    try {
      host = transitionHost(host, event);
    } catch (error) {
      if (error instanceof HostTransitionError)
        faultHost(error.eventType, error.stateStatus);
      throw error;
    }
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
    if (
      (host.status === "running" || host.status === "stopping") &&
      host.work.phase === "releasing" &&
      host.work.claim === claim
    )
      return releasePromise!;
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
        if (!(error instanceof HostTransitionError))
          transitionHostState({
            type:
              error instanceof ReleaseTimeout
                ? "release_timed_out"
                : "release_failed",
            claim,
          });
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
      // Shutdown may already have fenced this claim while the provider ran.
      if (result === "deadline" && activeClaim(host) === claim) {
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
      while (currentHost().status === "running") {
        try {
          try {
            await runCycle();
          } finally {
            // Provider completion/error may race shutdown's bounded release.
            // Join before clearing the work or marking the loop stopped.
            if (
              (host.status === "running" || host.status === "stopping") &&
              host.work.phase === "releasing"
            )
              await releaseWithin(
                host.work.claim,
                Math.min(config.shutdownMs, 20_000),
              );
          }
        } catch (error) {
          if (error instanceof HostTransitionError) throw error;
          errorClass = error instanceof Error ? error.name : "DatabaseError";
          transition("error");
          log("ketik_review_worker.cycle_failed");
        } finally {
          if (host.status !== "faulted")
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
      transitionHostState({ type: "stop" });
      unsubscribe?.();
      unsubscribe = null;
      wake?.();
      if (currentHost().status === "faulted") throw new ReleaseTimeout();
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
      if (
        host.status === "faulted" ||
        ((host.status === "stopping" || host.status === "stopped") &&
          host.outcome === "recovery_deferred")
      )
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
      // Attach immediately: a rejected embedded loop must not crash the API.
      // Transition errors already faulted the host; any other loop failure must
      // also stop admission rather than becoming a plausible healthy success.
      loopPromise = loop().catch(() => faultHost("fault", host.status));
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
