import { createHash, randomUUID } from "node:crypto";
import {
  getOpenAIUsageDiagnostics,
  summarizeOpenAIUsageAccumulator,
} from "../usage.js";
import {
  buildCanonicalWebRtcSession,
  POC_TRANSPORT,
  type TelefunWebRtcModelId,
} from "./contracts.js";
import {
  OpenAiCallCreationError,
  type OpenAiCallsClient,
} from "./openai-calls-client.js";
import { SidebandEventObserver } from "./sideband-event-observer.js";
import {
  WebRtcDurabilityError,
  type AttemptOutcome,
  type TelefunWebRtcDb,
  type WebRtcAttemptClaim,
} from "../db.js";
import {
  boundedDurationSeconds,
  boundedFailureMessage,
  boundedTimeout,
  isEnded,
  isEndingOrEnded,
  isFinalizationConflictReason,
  isSafeProviderCallId,
  normalizedTranscriptText,
  withTimeout,
} from "./call-manager-utils.js";
import { runProviderAndSidebandBarrier } from "./call-manager-finalization-barrier.js";
import { finalizeLegacy as finalizeLegacyOperation } from "./call-manager-legacy-finalizer.js";
import { shutdownBindings } from "./call-manager-shutdown.js";
import type { DistributedWebRtcLeaseHandle } from "./distributed-lease.js";
import type { WebRtcMetricInput } from "./observability.js";
import {
  createActiveBinding,
  WebRtcCallConflictError,
  WebRtcCallQuotaError,
  WebRtcRateLimitError,
  WebRtcShutdownError,
  type ActiveBinding,
  type WebRtcCallManager,
  type WebRtcCallManagerOptions,
} from "./call-manager-types.js";

export {
  WebRtcCallConflictError,
  WebRtcCallQuotaError,
  WebRtcRateLimitError,
  WebRtcShutdownError,
} from "./call-manager-types.js";
export type {
  ActiveBinding,
  WebRtcCallBinding,
  WebRtcCallManager,
  WebRtcCallManagerOptions,
} from "./call-manager-types.js";

export function hashProviderCallId(callId: string): string {
  return createHash("sha256").update(callId, "utf8").digest("hex");
}

/**
 * Truthful first-owner source for server-side WebRTC finalization. Every
 * internal path supplies its real source when it can be determined; never a
 * guess derived from the requested outcome.
 */
type FinalizationSource =
  | "browser_delete"
  | "provider_error"
  | "sideband_close"
  | "lease_lost"
  | "shutdown"
  | "start_failure"
  | "unknown";

const DEFAULT_SIDEBAND_DRAIN_TIMEOUT_MS = 5_000;
const DEFAULT_PROVIDER_HANGUP_TIMEOUT_MS = 15_000;
const DEFAULT_PERSISTENCE_TIMEOUT_MS = 10_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

export type WebRtcCleanupManager = Pick<
  WebRtcCallManager,
  "endCall" | "failCall" | "shutdown"
>;

export interface WebRtcCleanupManagerOptions {
  db: TelefunWebRtcDb;
  callsClient: { closeCall(callId: string): Promise<boolean> };
  /**
   * Server-only decryption boundary for a persisted historical reference.
   * Returning null (including for a missing key) keeps a bound call retryable.
   */
  decryptProviderCallReference?: (
    providerCallReference: string,
  ) => string | null;
  now?: () => number;
  providerHangupTimeoutMs?: number;
  persistenceTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

/**
 * Cleanup-only facade for historical calls. The returned boundary has no
 * startCall method, cannot create sidebands, and skips usage persistence.
 */
export function createWebRtcCleanupManager(
  options: WebRtcCleanupManagerOptions,
): WebRtcCleanupManager {
  const callsClient: OpenAiCallsClient = {
    createCall: async () => {
      throw new Error("OpenAI WebRTC starts are disabled");
    },
    closeCall: options.callsClient.closeCall,
  };
  const manager = createWebRtcCallManagerInternal(
    {
      db: options.db,
      callsClient,
      createSideband: () => {
        throw new Error("OpenAI WebRTC sideband is disabled");
      },
      now: options.now,
      providerHangupTimeoutMs: options.providerHangupTimeoutMs,
      persistenceTimeoutMs: options.persistenceTimeoutMs,
      shutdownTimeoutMs: options.shutdownTimeoutMs,
    },
    true,
    options.decryptProviderCallReference,
  );
  return {
    endCall: manager.endCall,
    failCall: manager.failCall,
    shutdown: manager.shutdown,
  };
}

/** Legacy internal manager retained for historical lifecycle compatibility. */
export function createWebRtcCallManager(
  options: WebRtcCallManagerOptions,
): WebRtcCallManager {
  return createWebRtcCallManagerInternal(options, false);
}

function createWebRtcCallManagerInternal(
  options: WebRtcCallManagerOptions,
  cleanupOnly: boolean,
  decryptProviderCallReference?: (providerCallReference: string) => string | null,
): WebRtcCallManager {
  if (!options.db && !options.updateSession) {
    throw new Error("WebRTC persistence is not configured");
  }

  const bindings = new Map<string, ActiveBinding>();
  const inFlightNoBindingFinalizations = new Map<string, Promise<void>>();
  const now = options.now ?? Date.now;
  const createAttemptId = options.createAttemptId ?? randomUUID;
  const leaseTtlMs = boundedTimeout(options.leaseTtlMs, 30_000, 1_000, 120_000);
  const maxUserSessions = Math.max(
    1,
    Math.min(100, Math.floor(options.maxUserSessions ?? 1)),
  );
  const maxProviderSessions = Math.max(
    1,
    Math.min(10_000, Math.floor(options.maxProviderSessions ?? 100)),
  );
  const rateLimitPerMinute = Math.max(
    1,
    Math.min(10_000, Math.floor(options.rateLimitPerMinute ?? 10)),
  );
  const sidebandDrainTimeoutMs = boundedTimeout(
    options.sidebandDrainTimeoutMs,
    DEFAULT_SIDEBAND_DRAIN_TIMEOUT_MS,
    100,
    30_000,
  );
  const providerHangupTimeoutMs = boundedTimeout(
    options.providerHangupTimeoutMs,
    DEFAULT_PROVIDER_HANGUP_TIMEOUT_MS,
    100,
    120_000,
  );
  const persistenceTimeoutMs = boundedTimeout(
    options.persistenceTimeoutMs,
    DEFAULT_PERSISTENCE_TIMEOUT_MS,
    100,
    30_000,
  );
  const shutdownTimeoutMs = boundedTimeout(
    options.shutdownTimeoutMs,
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    1_000,
    60_000,
  );
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  // First-owner finalization-source bookkeeping. WeakSet keeps it per binding
  // object, so retries and concurrent events never emit a contradictory
  // second source log for the same attempt.
  const finalizationSourceLogged = new WeakSet<ActiveBinding>();

  const logFirstFinalizationSource = (input: {
    binding: ActiveBinding;
    source: FinalizationSource;
    reason: string;
    requestedOutcome: AttemptOutcome;
  }): void => {
    if (finalizationSourceLogged.has(input.binding)) return;
    finalizationSourceLogged.add(input.binding);
    try {
      console.warn("[Telefun] OpenAI WebRTC finalization", {
        source: input.source,
        reason: input.reason.slice(0, 128),
        sessionId: input.binding.sessionId,
        attemptId: input.binding.attemptId,
        requestedOutcome: input.requestedOutcome,
        state: input.binding.state,
        sidebandConnected: input.binding.state === "sideband_connected",
      });
    } catch {
      // Observability is deliberately non-authoritative for lifecycle.
    }
  };

  const emitMetric = (metric: WebRtcMetricInput): void => {
    try {
      options.onMetric?.(metric);
    } catch {
      // Observability is deliberately non-authoritative for lifecycle.
    }
  };

  const acquireLease = async (input: {
    userId: string;
    sessionId: string;
    attemptId: string;
  }): Promise<DistributedWebRtcLeaseHandle | null> => {
    if (!options.lease) return null;
    const result = await options.lease.acquire({
      ...input,
      provider: "openai-webrtc",
      ttlMs: leaseTtlMs,
      maxUserSessions,
      maxProviderSessions,
    });
    if (!result.handle) {
      emitMetric({
        name: "session_cap",
        userId: input.userId,
        sessionId: input.sessionId,
        attemptId: input.attemptId,
        metadata: { reason: result.reason },
      });
      throw new WebRtcCallQuotaError();
    }
    return result.handle;
  };

  const consumeStartRateLimit = async (input: {
    userId: string;
    sessionId: string;
  }): Promise<void> => {
    if (!options.db?.consumeRateLimit) return;
    const result = await persist("consume_rate_limit", () =>
      options.db!.consumeRateLimit!({
        scopeKey: `user:${input.userId}:session:${input.sessionId}:provider:openai-webrtc:call-start`,
        userId: input.userId,
        sessionId: input.sessionId,
        provider: "openai-webrtc",
        windowSeconds: 60,
        requestLimit: rateLimitPerMinute,
      }),
    );
    if (!result.allowed) throw new WebRtcRateLimitError(result.resetAt);
  };

  const persist = <T>(
    operation: string,
    task: () => PromiseLike<T>,
  ): Promise<T> =>
    withTimeout(
      Promise.resolve().then(task),
      persistenceTimeoutMs,
      () => new WebRtcDurabilityError(operation),
    );

  const closeProviderCall = async (callId: string): Promise<boolean> => {
    if (!callId) return true;
    if (!options.callsClient.closeCall || !isSafeProviderCallId(callId)) {
      return false;
    }
    try {
      return await options.callsClient.closeCall(callId);
    } catch {
      return false;
    }
  };

  const closeLateProviderCall = async (
    binding: ActiveBinding,
    callId: string,
  ): Promise<boolean> => {
    const acknowledged = await withTimeout(
      closeProviderCall(callId),
      providerHangupTimeoutMs,
      () => new WebRtcDurabilityError("provider_hangup"),
    ).catch(() => false);
    if (acknowledged) binding.providerClosed = true;
    return acknowledged;
  };

  const closeBindingProvider = async (
    binding: ActiveBinding,
  ): Promise<boolean> => {
    if (binding.providerClosed) return true;
    if (!binding.callId) return !binding.providerRecoveryRequired;
    let acknowledged: boolean;
    try {
      acknowledged = await withTimeout(
        closeProviderCall(binding.callId),
        providerHangupTimeoutMs,
        () => new WebRtcDurabilityError("provider_hangup"),
      );
    } catch {
      return false;
    }
    if (acknowledged) binding.providerClosed = true;
    return acknowledged;
  };

  const runBarrier = (binding: ActiveBinding) =>
    runProviderAndSidebandBarrier(binding, {
      closeProvider: () => closeBindingProvider(binding),
      sidebandDrainTimeoutMs,
    });

  const runFinalizationBarrier = async (binding: ActiveBinding) => {
    if (!cleanupOnly) return runBarrier(binding);
    // Historical DELETE cleanup is provider-hangup-only. It never opens,
    // drains, or closes a sideband and never performs usage work.
    binding.state = "ending";
    if (!binding.callId) binding.startController.abort();
    return {
      providerClosed: await closeBindingProvider(binding),
      sidebandFailure: null,
    };
  };

  const releaseLease = async (
    binding: ActiveBinding,
    outcome: AttemptOutcome,
  ): Promise<void> => {
    const lease = await binding.leasePromise.catch(() => null);
    if (!lease) return;
    try {
      await lease.release(outcome);
    } catch {
      emitMetric({
        name: "orphan",
        userId: binding.userId,
        sessionId: binding.sessionId,
        attemptId: binding.attemptId,
        metadata: { reason: "lease_release_failed" },
      });
    }
  };

  const createLegacyClaim = (attemptId: string): WebRtcAttemptClaim => ({
    claimed: true,
    attemptId,
    finalizationKey: randomUUID(),
    usageRequestId: `telefun-webrtc:${attemptId}`,
    state: "claimed",
    reason: "legacy_compatibility",
  });

  const claimAttempt = (
    userId: string,
    sessionId: string,
    attemptId: string,
    modelId: TelefunWebRtcModelId,
  ): Promise<WebRtcAttemptClaim> => {
    if (!options.db) return Promise.resolve(createLegacyClaim(attemptId));
    return persist("claim_attempt", () =>
      options.db!.claimAttempt({
        sessionId,
        userId,
        attemptId,
        modelId,
        transport: POC_TRANSPORT,
      }),
    ).then((claim) => {
      if (!claim.claimed || claim.attemptId !== attemptId) {
        throw new WebRtcCallConflictError();
      }
      return claim;
    });
  };

  const queueTranscriptCheckpoint = (
    binding: ActiveBinding,
    isPartial: boolean,
  ): Promise<void> => {
    if (!options.db) return Promise.resolve();
    const previous =
      binding.checkpointPromise?.catch(() => undefined) ?? Promise.resolve();
    const next = previous.then(async () => {
      const entries = binding.transcript.snapshot();
      for (
        let index = binding.checkpointSequence;
        index < entries.length;
        index += 1
      ) {
        const entry = entries[index]!;
        const text = normalizedTranscriptText(entry.text);
        if (!text) continue;
        const result = await persist("checkpoint_transcript", () =>
          options.db!.checkpointTranscript({
            attemptId: binding.attemptId,
            userId: binding.userId,
            sequence: index + 1,
            dedupeKey: `transcript:${index}`,
            speaker: entry.speaker,
            text,
            startMs: Math.max(0, Math.floor(entry.startMs)),
            isPartial,
          }),
        );
        if (!result.accepted || result.checkpointSequence < index + 1) {
          throw new WebRtcDurabilityError("checkpoint_transcript");
        }
        if (result.operation === "duplicate") {
          emitMetric({
            name: "duplicate_write",
            userId: binding.userId,
            sessionId: binding.sessionId,
            attemptId: binding.attemptId,
            metadata: { operation: "checkpoint_transcript" },
          });
        }
        binding.checkpointSequence = Math.max(
          binding.checkpointSequence,
          result.checkpointSequence,
        );
      }
    });
    binding.checkpointPromise = next;
    void next.catch(() => undefined);
    return next;
  };

  const markUsage = async (
    binding: ActiveBinding,
    status: "persisted" | "incomplete" | "failed",
    error?: string,
  ): Promise<void> => {
    if (!options.db) return;
    const result = await persist("mark_usage", () =>
      options.db!.markUsage({
        attemptId: binding.attemptId,
        userId: binding.userId,
        status,
        ...(error ? { error: boundedFailureMessage(error) } : {}),
      }),
    );
    if (
      (!result.applied && !result.idempotent) ||
      result.usageRequestId !== binding.claim!.usageRequestId ||
      (status === "persisted" && result.status !== "persisted")
    ) {
      throw new WebRtcDurabilityError("mark_usage");
    }
    // A failed priceable write is only an audit checkpoint; keep the
    // aggregate retryable so a later same-key finalization can persist it.
    if (status !== "failed") binding.usagePersisted = true;
  };

  const persistDurableUsage = async (
    binding: ActiveBinding,
    durationMs: number,
  ): Promise<void> => {
    if (!options.db || binding.usagePersisted) return;

    const aggregate = summarizeOpenAIUsageAccumulator(binding.usage);
    const diagnostics = getOpenAIUsageDiagnostics(binding.usage);
    const incomplete =
      !aggregate ||
      aggregate.unpriceableUsageCount > 0 ||
      diagnostics.warnings.length > 0;

    if (incomplete) {
      const warning = diagnostics.warnings.length
        ? diagnostics.warnings.join(", ")
        : "missing_openai_realtime_usage";
      if (options.auditFailedUsage) {
        const audited = await persist("usage_audit", () =>
          options.auditFailedUsage!({
            attemptId: binding.attemptId,
            usageRequestId: binding.claim!.usageRequestId,
            userId: binding.userId,
            sessionId: binding.sessionId,
            modelId: binding.modelId,
            errorMessage: boundedFailureMessage(warning),
          }),
        );
        if (!audited) throw new WebRtcDurabilityError("usage_audit");
      }
      await markUsage(binding, "incomplete", warning);
      emitMetric({
        name: "missing_usage",
        userId: binding.userId,
        sessionId: binding.sessionId,
        attemptId: binding.attemptId,
        value: diagnostics.missingUsageCount,
        metadata: { warning },
      });
      emitMetric({
        name: "cost_reconciliation",
        userId: binding.userId,
        sessionId: binding.sessionId,
        attemptId: binding.attemptId,
        metadata: { status: "incomplete" },
      });
      return;
    }

    const persisted = options.flushUsage
      ? await persist("usage_persistence", () =>
          options.flushUsage!({
            attemptId: binding.attemptId,
            usageRequestId: binding.claim!.usageRequestId,
            userId: binding.userId,
            sessionId: binding.sessionId,
            modelId: binding.modelId,
            aggregate,
            durationMs,
          }),
        )
      : false;
    if (persisted) {
      await markUsage(binding, "persisted");
      emitMetric({
        name: "cost_reconciliation",
        userId: binding.userId,
        sessionId: binding.sessionId,
        attemptId: binding.attemptId,
        metadata: { status: "reconciled" },
      });
      return;
    }

    const failure = "OpenAI usage persistence failed";
    await markUsage(binding, "failed", failure).catch(() => undefined);
    throw new WebRtcDurabilityError("usage_persistence");
  };

  const finalizeLegacy = (
    binding: ActiveBinding,
    requestedStatus: AttemptOutcome,
  ): Promise<void> =>
    finalizeLegacyOperation(binding, requestedStatus, {
      options,
      bindings,
      now,
      persist,
      runBarrier,
    });

  const finalizeDurable = async (
    binding: ActiveBinding,
    requestedStatus: AttemptOutcome,
  ): Promise<void> => {
    if (!options.db) return finalizeLegacy(binding, requestedStatus);
    let claim: WebRtcAttemptClaim;
    try {
      claim = await binding.claimPromise;
    } catch (error) {
      if (
        error instanceof WebRtcCallConflictError ||
        error instanceof WebRtcCallQuotaError ||
        error instanceof WebRtcRateLimitError
      ) {
        // These failures happen before a durable attempt can be finalized.
        // Remove the local reservation so a rejected start cannot block a
        // later retry or turn a pre-attempt error into a false conflict.
        if (bindings.get(binding.sessionId) === binding) {
          bindings.delete(binding.sessionId);
        }
        throw error;
      }
      throw error;
    }

    // The durable attempt must exist before the lease RPC can validate its
    // foreign key and owner. A quota rejection still leaves a claimed attempt
    // that this finalizer can terminalize; infrastructure failures stay
    // retryable and fail closed.
    try {
      await binding.leasePromise;
    } catch (error) {
      if (!(error instanceof WebRtcCallQuotaError)) throw error;
    }

    const desiredStatus: AttemptOutcome =
      binding.terminalStatus ??
      (requestedStatus !== "completed" || binding.state !== "sideband_connected"
        ? requestedStatus === "completed"
          ? "failed"
          : requestedStatus
        : "completed");
    binding.terminalStatus = desiredStatus;

    const beginFinalization = (outcome: AttemptOutcome) =>
      persist("begin_finalization", () =>
        options.db!.beginFinalization({
          attemptId: claim.attemptId,
          userId: binding.userId,
          finalizationKey: claim.finalizationKey,
          outcome,
        }),
      );

    const requestFailedOutcome = async (): Promise<void> => {
      const failedBegin = await beginFinalization("failed");
      if (!failedBegin.accepted) {
        if (isFinalizationConflictReason(failedBegin.reason)) {
          throw new WebRtcCallConflictError();
        }
        throw new WebRtcDurabilityError("begin_finalization");
      }
    };

    let begin: Awaited<ReturnType<TelefunWebRtcDb["beginFinalization"]>>;
    try {
      // beginFinalization is always the first durable finalization operation.
      begin = await beginFinalization(desiredStatus);
    } catch (error) {
      const { providerClosed, sidebandFailure } =
        await runFinalizationBarrier(binding);
      if (sidebandFailure) throw sidebandFailure;
      if (!providerClosed) binding.terminalStatus = "failed";
      throw error instanceof WebRtcDurabilityError
        ? error
        : new WebRtcDurabilityError("begin_finalization");
    }
    if (!begin.accepted) {
      const { providerClosed, sidebandFailure } =
        await runFinalizationBarrier(binding);
      if (sidebandFailure) throw sidebandFailure;
      if (!providerClosed) binding.terminalStatus = "failed";
      if (isFinalizationConflictReason(begin.reason)) {
        throw new WebRtcCallConflictError();
      }
      throw new WebRtcDurabilityError("begin_finalization");
    }
    if (!begin.shouldFinalize || begin.state === "ended") {
      const { providerClosed, sidebandFailure } =
        await runFinalizationBarrier(binding);
      if (sidebandFailure) throw sidebandFailure;
      if (!providerClosed) {
        await requestFailedOutcome();
        throw new WebRtcDurabilityError("provider_hangup");
      }
      binding.state = "ended";
      await releaseLease(binding, binding.terminalStatus ?? desiredStatus);
      if (bindings.get(binding.sessionId) === binding) {
        bindings.delete(binding.sessionId);
      }
      return;
    }

    // Full legacy finalization keeps sideband admission open while hangup is
    // in flight. Cleanup-only finalization bypasses sideband work entirely.
    const { providerClosed, sidebandFailure } =
      await runFinalizationBarrier(binding);
    if (sidebandFailure) {
      binding.terminalStatus = "failed";
      try {
        await requestFailedOutcome();
      } catch {
        // The original bounded barrier failure remains the safe retry signal.
      }
      throw sidebandFailure;
    }

    const durationMs = Math.max(0, now() - binding.startedAtMs);
    if (!cleanupOnly) {
      binding.transcript.flush(now());
      await queueTranscriptCheckpoint(
        binding,
        binding.terminalStatus === "failed",
      );
      await persistDurableUsage(binding, durationMs);
    }

    if (!providerClosed) {
      binding.terminalStatus = "failed";
      await requestFailedOutcome();
      throw new WebRtcDurabilityError("provider_hangup");
    }

    const outcome: AttemptOutcome =
      binding.terminalStatus && binding.terminalStatus !== "completed"
        ? binding.terminalStatus
        : desiredStatus;
    if (outcome === "failed" && desiredStatus !== "failed") {
      await requestFailedOutcome();
    }
    const result = await persist("finalize_attempt", () =>
      options.db!.finalizeAttempt({
        attemptId: claim.attemptId,
        userId: binding.userId,
        finalizationKey: claim.finalizationKey,
        outcome,
        durationSeconds: boundedDurationSeconds(durationMs),
      }),
    );
    if (!result.applied && !result.idempotent) {
      if (isFinalizationConflictReason(result.reason)) {
        throw new WebRtcCallConflictError();
      }
      throw new WebRtcDurabilityError("finalize_attempt");
    }

    binding.state = "ended";
    await releaseLease(binding, outcome);
    if (bindings.get(binding.sessionId) === binding) {
      bindings.delete(binding.sessionId);
    }
  };

  const finalize = (
    binding: ActiveBinding,
    requestedStatus: AttemptOutcome,
    source: FinalizationSource,
    reason: string,
  ): Promise<void> => {
    // First-owner observability: emit the truthful source exactly once,
    // before any terminal mutation so `state` reflects the pre-finalization
    // evidence this feature exists to capture.
    logFirstFinalizationSource({
      binding,
      source,
      reason,
      requestedOutcome: requestedStatus,
    });
    if (requestedStatus !== "completed")
      binding.terminalStatus = requestedStatus;
    else if (!binding.terminalStatus) {
      binding.terminalStatus =
        binding.state === "sideband_connected" ? "completed" : "failed";
    }
    if (binding.finalization) return binding.finalization;
    const finalization = finalizeDurable(binding, requestedStatus).finally(
      () => {
        if (binding.state !== "ended") binding.finalization = null;
      },
    );
    binding.finalization = finalization;
    return finalization;
  };

  const bindProvider = async (
    binding: ActiveBinding,
    callId: string,
  ): Promise<void> => {
    if (!isSafeProviderCallId(callId)) {
      throw new Error("provider call failed");
    }
    binding.callId = callId;
    if (!options.db || binding.providerBound) return;
    const result = await persist("bind_provider_call", () =>
      options.db!.bindProviderCall(
        binding.attemptId,
        binding.userId,
        hashProviderCallId(callId),
      ),
    );
    if (!result.accepted) throw new WebRtcDurabilityError("bind_provider_call");
    binding.providerBound = true;
    binding.state = result.state;
    if (
      options.encryptProviderCallReference &&
      options.db.storeProviderCallReference
    ) {
      const stored = await persist("store_provider_call_reference", () =>
        options.db!.storeProviderCallReference!({
          attemptId: binding.attemptId,
          userId: binding.userId,
          providerCallReferenceCiphertext:
            options.encryptProviderCallReference!(callId),
        }),
      );
      if (!stored.accepted) {
        throw new WebRtcDurabilityError("store_provider_call_reference");
      }
    }
  };

  const recoverProviderCall = (
    attempt: NonNullable<Awaited<ReturnType<TelefunWebRtcDb["getAttempt"]>>>,
  ): { callId: string; providerRecoveryRequired: boolean } => {
    if (!attempt.providerCallIdHash) {
      // An existing attempt without a persisted provider identity is not proof
      // that no upstream call exists (the process may have died before bind).
      // Keep it retryable; only a true no-attempt read may finalize locally.
      return { callId: "", providerRecoveryRequired: true };
    }
    if (
      !cleanupOnly ||
      !attempt.providerCallReference ||
      !decryptProviderCallReference
    ) {
      return { callId: "", providerRecoveryRequired: true };
    }
    try {
      const callId = decryptProviderCallReference(attempt.providerCallReference);
      if (
        !callId ||
        !isSafeProviderCallId(callId) ||
        hashProviderCallId(callId) !== attempt.providerCallIdHash
      ) {
        return { callId: "", providerRecoveryRequired: true };
      }
      return { callId, providerRecoveryRequired: false };
    } catch {
      return { callId: "", providerRecoveryRequired: true };
    }
  };

  const recoverBinding = async (
    sessionId: string,
    userId: string,
    attempt: NonNullable<Awaited<ReturnType<TelefunWebRtcDb["getAttempt"]>>>,
  ): Promise<ActiveBinding> => {
    const claim = {
      claimed: true,
      attemptId: attempt.attemptId,
      finalizationKey: attempt.finalizationKey,
      usageRequestId: attempt.usageRequestId as `telefun-webrtc:${string}`,
      state: attempt.state,
      reason: "recovered",
    } satisfies WebRtcAttemptClaim;
    const binding = createActiveBinding({
      userId,
      sessionId,
      attemptId: attempt.attemptId,
      modelId: attempt.modelId,
      claimPromise: Promise.resolve(claim),
      leasePromise: Promise.resolve(null),
      now,
    });
    binding.claim = claim;
    binding.state = attempt.state;
    binding.startInFlight = false;
    const recoveredProviderCall = recoverProviderCall(attempt);
    binding.callId = recoveredProviderCall.callId;
    binding.providerRecoveryRequired =
      recoveredProviderCall.providerRecoveryRequired;
    bindings.set(sessionId, binding);
    return binding;
  };

  const recoverForEnd = async (
    sessionId: string,
    userId: string | undefined,
  ): Promise<ActiveBinding | null> => {
    if (!options.db || !userId) return null;
    const attempt = await persist("get_attempt", () =>
      options.db!.getAttempt(sessionId, userId),
    );
    if (!attempt || attempt.state === "ended") return null;
    if (bindings.has(sessionId)) return bindings.get(sessionId)!;
    return recoverBinding(sessionId, userId, attempt);
  };

  const failSessionWithoutAttempt = async (
    sessionId: string,
    userId: string | undefined,
    requestedOutcome: AttemptOutcome,
  ): Promise<void> => {
    const startedAtMs = now();
    let outcomeLogged = false;
    const logOutcome = (input: {
      applied: boolean;
      terminal: boolean;
      reason: string;
      errorClass?: "durability" | "conflict";
    }): void => {
      if (outcomeLogged) return;
      outcomeLogged = true;
      try {
        console.warn("[Telefun] OpenAI WebRTC no-attempt finalization", {
          sessionId,
          requestedOutcome,
          applied: input.applied,
          terminal: input.terminal,
          reason: input.reason.slice(0, 128),
          durationMs: Math.max(0, now() - startedAtMs),
          ...(input.errorClass ? { errorClass: input.errorClass } : {}),
        });
      } catch {
        // Observability is non-authoritative for lifecycle.
      }
    };
    if (!options.db || !userId || !options.db.failSessionWithoutAttempt) {
      logOutcome({
        applied: false,
        terminal: false,
        reason: "persistence_unavailable",
        errorClass: "durability",
      });
      throw new WebRtcDurabilityError("fail_session_without_attempt");
    }
    try {
      const result = await persist("fail_session_without_attempt", () =>
        options.db!.failSessionWithoutAttempt!(sessionId, userId),
      );
      if (result.applied || result.terminal) {
        logOutcome(result);
        return;
      }
      if (result.reason.startsWith("attempt_exists")) {
        logOutcome({
          applied: false,
          terminal: false,
          reason: result.reason,
          errorClass: "conflict",
        });
        throw new WebRtcCallConflictError();
      }
      logOutcome({
        applied: false,
        terminal: false,
        reason: result.reason,
        errorClass: "durability",
      });
      throw new WebRtcDurabilityError("fail_session_without_attempt");
    } catch (error) {
      if (error instanceof WebRtcCallConflictError) {
        logOutcome({
          applied: false,
          terminal: false,
          reason: "attempt_exists_active",
          errorClass: "conflict",
        });
      } else if (error instanceof WebRtcDurabilityError) {
        logOutcome({
          applied: false,
          terminal: false,
          reason: "persistence_unavailable",
          errorClass: "durability",
        });
      }
      throw error;
    }
  };

  return {
    async startCall({
      userId,
      sessionId,
      offerSdp,
      modelId,
      livePromptInstructions,
      consumerGender,
      signal,
    }) {
      if (shuttingDown) {
        throw new WebRtcShutdownError(bindings.size);
      }
      if (bindings.has(sessionId)) throw new WebRtcCallConflictError();
      let canonicalSession;
      try {
        canonicalSession = buildCanonicalWebRtcSession(
          modelId,
          livePromptInstructions,
          consumerGender,
        );
      } catch {
        throw new WebRtcDurabilityError("invalid_live_prompt_instructions");
      }
      const attemptId = createAttemptId();
      // Reserve the in-process session slot before awaiting distributed rate
      // limiting. A concurrent DELETE must see this binding and join the same
      // durable lifecycle instead of racing a pre-created history row.
      const rateLimitPromise = consumeStartRateLimit({ userId, sessionId });
      const claimPromise = rateLimitPromise.then(() =>
        claimAttempt(userId, sessionId, attemptId, modelId),
      );
      const leasePromise = claimPromise.then(() =>
        acquireLease({ userId, sessionId, attemptId }),
      );
      const binding = createActiveBinding({
        userId,
        sessionId,
        attemptId,
        modelId,
        claimPromise,
        leasePromise,
        now,
      });
      if (!options.db) binding.claim = createLegacyClaim(attemptId);
      bindings.set(sessionId, binding);
      void leasePromise
        .then((lease) => {
          if (!lease) return;
          void lease.whenLost.then(() => {
            if (binding.state === "ended") return;
            binding.terminalStatus = "network_lost";
            if (binding.state === "ending") return;
            void finalize(
              binding,
              "network_lost",
              "lease_lost",
              "distributed_lease_lost",
            ).catch(() => undefined);
          });
        })
        .catch(() => undefined);

      const abortStart = () => {
        // Once a provider call ID exists, its sideband must not be pre-empted
        // by the browser start signal; finalization owns the hangup barrier.
        if (!binding.callId) binding.startController.abort();
        binding.terminalStatus = "failed";
        void finalize(
          binding,
          "failed",
          "start_failure",
          "request_aborted",
        ).catch(() => undefined);
      };
      if (signal?.aborted) abortStart();
      else signal?.addEventListener("abort", abortStart, { once: true });

      try {
        if (options.db?.consumeRateLimit) await rateLimitPromise;
        if (options.db) {
          await claimPromise;
          await leasePromise;
        }
        if (
          binding.startController.signal.aborted ||
          binding.terminalStatus !== null ||
          binding.state === "ended"
        ) {
          throw new Error("provider call aborted");
        }

        const created = await options.callsClient.createCall({
          offerSdp,
          session: canonicalSession,
          signal: binding.startController.signal,
        });
        await bindProvider(binding, created.callId);
        if (binding.terminalStatus !== null || isEndingOrEnded(binding)) {
          // This is the late-provider result race. There is no sideband yet,
          // so close the newly bound provider call before returning the setup
          // error; normal sideband cleanup remains finalizer-owned.
          await closeBindingProvider(binding);
          throw new Error("provider call aborted");
        }

        binding.observer = new SidebandEventObserver({
          transcript: binding.transcript,
          usage: binding.usage,
          now,
          maxDedupeEntries: options.sidebandMaxDedupeEntries,
          onDiagnostic: (diagnostic) =>
            options.onSidebandDiagnostic?.(diagnostic),
          onTurnComplete: () => {
            if (binding.state === "ending" || binding.state === "ended") return;
            void queueTranscriptCheckpoint(binding, false).catch(
              () => undefined,
            );
          },
          onProviderError: (signal) => {
            if (binding.state === "ended" || binding.sidebandAdmissionSealed)
              return;
            binding.terminalStatus = "failed";
            if (binding.state === "ending") return;
            void finalize(
              binding,
              "failed",
              "provider_error",
              signal?.code || "provider_error",
            ).catch(() => undefined);
          },
          onCapacityExceeded: () => {
            if (binding.state === "ended" || binding.sidebandAdmissionSealed)
              return;
            binding.terminalStatus = "failed";
            if (binding.state === "ending") return;
            void finalize(
              binding,
              "failed",
              "unknown",
              "observer_capacity_exceeded",
            ).catch(() => undefined);
          },
        });
        if (binding.terminalStatus !== null || isEndingOrEnded(binding)) {
          throw new Error("provider call aborted");
        }

        binding.sideband = options.createSideband(created.callId, {
          onEvent: (event) => binding.observer?.observe(event),
          onDiagnostic: (diagnostic) =>
            options.onSidebandDiagnostic?.(diagnostic),
          onClose: (unexpected) => {
            if (
              !unexpected ||
              binding.state === "ended" ||
              binding.sidebandAdmissionSealed
            ) {
              return;
            }
            binding.terminalStatus = "network_lost";
            emitMetric({
              name: "sideband_disconnect",
              userId: binding.userId,
              sessionId: binding.sessionId,
              attemptId: binding.attemptId,
              metadata: { unexpected: true },
            });
            if (binding.state === "ending") return;
            void finalize(
              binding,
              "network_lost",
              "sideband_close",
              "unexpected_disconnect",
            ).catch(() => undefined);
          },
        });
        if (binding.terminalStatus !== null || isEndingOrEnded(binding)) {
          throw new Error("provider call aborted");
        }
        const sidebandConnectPromise = binding.sideband.connect();
        binding.sidebandConnectPromise = sidebandConnectPromise;
        // Do not pass the provider-start abort signal after a call ID has
        // been bound. Finalization closes a pending sideband connect.
        await sidebandConnectPromise;
        if (options.db) {
          const sidebandState = await persist("mark_sideband_connected", () =>
            options.db!.markSidebandConnected(
              binding.attemptId,
              binding.userId,
            ),
          );
          if (!sidebandState.accepted) {
            throw new WebRtcDurabilityError("mark_sideband_connected");
          }
          binding.state = sidebandState.state;
        } else {
          binding.state = "sideband_connected";
        }
        if (binding.terminalStatus !== null || isEndingOrEnded(binding)) {
          throw new Error("provider call aborted");
        }
        return { answerSdp: created.answerSdp };
      } catch (error) {
        if (error instanceof OpenAiCallCreationError && error.callId) {
          if (isSafeProviderCallId(error.callId)) binding.callId = error.callId;
        }
        let lateProviderCleanupFailed = false;
        if (binding.callId && options.db && !binding.providerBound) {
          // A provider may resolve after DELETE already terminalized the
          // attempt. Durable binding is then expected to reject; the raw call
          // still belongs to this invocation and must be closed independently.
          const closed = await closeLateProviderCall(binding, binding.callId);
          lateProviderCleanupFailed = !closed;
        }
        // The finalizer owns sideband admission, drain, and close on every
        // setup/provider error path. Never close it before finalize().
        let finalizationError: unknown = null;
        try {
          await finalize(binding, "failed", "start_failure", "start_exception");
        } catch (finalizationFailure) {
          finalizationError = finalizationFailure;
        }
        if (lateProviderCleanupFailed) {
          throw new WebRtcDurabilityError("provider_hangup");
        }
        if (finalizationError instanceof WebRtcDurabilityError) {
          throw finalizationError;
        }
        if (error instanceof WebRtcCallConflictError) throw error;
        if (error instanceof WebRtcCallQuotaError) throw error;
        if (error instanceof WebRtcRateLimitError) throw error;
        if (error instanceof WebRtcDurabilityError) throw error;
        if (error instanceof OpenAiCallCreationError) {
          if (finalizationError) throw finalizationError;
          throw new OpenAiCallCreationError(
            "provider call failed",
            binding.callId || undefined,
          );
        }
        if (finalizationError) throw finalizationError;
        throw new Error("provider call failed", { cause: error });
      } finally {
        signal?.removeEventListener("abort", abortStart);
        binding.startInFlight = false;
      }
    },

    async endCall(sessionId, userId, requestedOutcome) {
      const binding =
        bindings.get(sessionId) ?? (await recoverForEnd(sessionId, userId));
      if (!binding) {
        if (options.db) {
          await failSessionWithoutAttempt(
            sessionId,
            userId,
            requestedOutcome ?? "completed",
          );
        }
        return;
      }
      if (userId && binding.userId !== userId) {
        throw new WebRtcCallConflictError();
      }
      const normalEnd =
        requestedOutcome === "completed" ||
        (!requestedOutcome &&
          (binding.terminalStatus === "completed" ||
            binding.state === "sideband_connected"));
      await finalize(
        binding,
        requestedOutcome ?? (normalEnd ? "completed" : "failed"),
        "browser_delete",
        "authenticated_delete_end",
      );
    },

    async failCall(sessionId, userId, requestedOutcome = "failed") {
      const binding =
        bindings.get(sessionId) ?? (await recoverForEnd(sessionId, userId));
      if (binding) {
        if (userId && binding.userId !== userId) {
          throw new WebRtcCallConflictError();
        }
        await finalize(
          binding,
          requestedOutcome,
          "browser_delete",
          "authenticated_delete_fail",
        );
        return;
      }
      if (options.db) {
        await failSessionWithoutAttempt(sessionId, userId, requestedOutcome);
        return;
      }
      if (!userId || !options.updateSession) return;
      const inFlight = inFlightNoBindingFinalizations.get(sessionId);
      if (inFlight) {
        await inFlight;
        return;
      }
      const finalization = persist("session_persistence", () =>
        options.updateSession!(sessionId, userId, {
          status: "failed",
          duration_seconds: 0,
          messages: [],
        }),
      );
      inFlightNoBindingFinalizations.set(sessionId, finalization);
      try {
        await finalization;
      } finally {
        if (inFlightNoBindingFinalizations.get(sessionId) === finalization) {
          inFlightNoBindingFinalizations.delete(sessionId);
        }
      }
    },

    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      const currentBindings = [...new Set(bindings.values())];
      const deadline = now() + shutdownTimeoutMs;
      shutdownPromise = (async () => {
        const { failureCount, pendingCount } = await shutdownBindings({
          bindings: currentBindings,
          deadlineMs: deadline,
          now,
          isPending: (binding) =>
            bindings.get(binding.sessionId) === binding && !isEnded(binding),
          finalize: (binding) =>
            finalize(binding, "failed", "shutdown", "service_shutdown"),
        });
        if (failureCount > 0 || pendingCount > 0) {
          throw new WebRtcShutdownError(Math.max(pendingCount, failureCount));
        }
      })();
      return shutdownPromise;
    },
  };
}
