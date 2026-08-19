import {
  getOpenAIUsageDiagnostics,
  summarizeOpenAIUsageAccumulator,
} from "../usage.js";
import { WebRtcDurabilityError, type AttemptOutcome } from "../db.js";
import type {
  ActiveBinding,
  WebRtcCallManagerOptions,
} from "./call-manager-types.js";
import {
  boundedDurationSeconds,
  boundedFailureMessage,
} from "./call-manager-utils.js";

export class WebRtcLegacyFinalizationError extends WebRtcDurabilityError {
  constructor() {
    super("legacy_finalization");
    this.name = "WebRtcLegacyFinalizationError";
    this.message = "finalization failed";
  }
}

type Persist = <T>(operation: string, task: () => PromiseLike<T>) => Promise<T>;

type BarrierResult = {
  providerClosed: boolean;
  sidebandFailure: WebRtcDurabilityError | null;
};

export function finalizeLegacy(
  binding: ActiveBinding,
  requestedStatus: AttemptOutcome,
  input: {
    options: WebRtcCallManagerOptions;
    bindings: Map<string, ActiveBinding>;
    now: () => number;
    persist: Persist;
    runBarrier: (binding: ActiveBinding) => Promise<BarrierResult>;
  },
): Promise<void> {
  if (requestedStatus === "failed" && !binding.sessionPersisted) {
    binding.terminalStatus = "failed";
  } else {
    binding.terminalStatus ??= requestedStatus;
  }
  if (binding.finalization) return binding.finalization;
  binding.finalization = (async () => {
    if (binding.state === "ended") return;
    const { providerClosed, sidebandFailure } = await input.runBarrier(binding);
    if (sidebandFailure) {
      binding.terminalStatus = "failed";
      binding.state = "ending";
      throw new WebRtcLegacyFinalizationError();
    }

    binding.transcript.flush(input.now());
    const durationMs = Math.max(0, input.now() - binding.startedAtMs);
    let failure: unknown = providerClosed
      ? null
      : new Error("provider hangup was not acknowledged");

    if (!binding.sessionPersisted) {
      try {
        if (!input.options.updateSession) {
          throw new Error("legacy persistence unavailable");
        }
        await input.persist("session_persistence", () =>
          input.options.updateSession!(binding.sessionId, binding.userId, {
            // The pre-Phase-5 callback only has the legacy history status
            // contract. Network/orphan outcomes remain failed there while the
            // durable attempt keeps the more precise terminal outcome.
            status:
              binding.terminalStatus === "completed" ? "completed" : "failed",
            duration_seconds: boundedDurationSeconds(durationMs),
            messages: binding.transcript.snapshot(),
          }),
        );
        binding.sessionPersisted = true;
      } catch (error) {
        failure ??= error;
      }
    }

    if (!binding.usagePersisted) {
      const aggregate = summarizeOpenAIUsageAccumulator(binding.usage);
      const diagnostics = getOpenAIUsageDiagnostics(binding.usage);
      try {
        if (
          aggregate &&
          aggregate.unpriceableUsageCount === 0 &&
          diagnostics.warnings.length === 0
        ) {
          binding.usagePersisted = input.options.flushUsage
            ? await input.persist("usage_persistence", () =>
                input.options.flushUsage!({
                  attemptId: binding.attemptId,
                  usageRequestId: binding.claim!.usageRequestId,
                  userId: binding.userId,
                  sessionId: binding.sessionId,
                  modelId: binding.modelId,
                  aggregate,
                  durationMs,
                }),
              )
            : true;
        } else if (input.options.auditFailedUsage) {
          const warnings = diagnostics.warnings.length
            ? diagnostics.warnings.join(", ")
            : "missing_openai_realtime_usage";
          binding.usagePersisted = await input.persist("usage_audit", () =>
            input.options.auditFailedUsage!({
              attemptId: binding.attemptId,
              usageRequestId: binding.claim!.usageRequestId,
              userId: binding.userId,
              sessionId: binding.sessionId,
              modelId: binding.modelId,
              errorMessage: boundedFailureMessage(warnings),
            }),
          );
        } else {
          binding.usagePersisted = true;
        }
        if (!binding.usagePersisted) {
          failure ??= new Error("usage persistence failed");
        }
      } catch (error) {
        failure ??= error;
      }
    }

    if (failure) {
      binding.state = "ending";
      throw new WebRtcLegacyFinalizationError();
    }

    binding.state = "ended";
    if (input.bindings.get(binding.sessionId) === binding) {
      input.bindings.delete(binding.sessionId);
    }
  })().finally(() => {
    if (binding.state !== "ended") binding.finalization = null;
  });
  return binding.finalization;
}
