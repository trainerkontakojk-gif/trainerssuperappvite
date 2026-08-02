import { WebRtcDurabilityError } from "../db.js";
import { withTimeout } from "./call-manager-utils.js";

export async function shutdownBindings<T>(input: {
  bindings: readonly T[];
  deadlineMs: number;
  now: () => number;
  isPending: (binding: T) => boolean;
  finalize: (binding: T) => Promise<void>;
}): Promise<{ failureCount: number; pendingCount: number }> {
  const failures = await Promise.all(
    input.bindings.map(async (binding) => {
      let lastFailure: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!input.isPending(binding)) return null;
        const remainingMs = input.deadlineMs - input.now();
        if (remainingMs <= 0) return new WebRtcDurabilityError("shutdown");
        try {
          await withTimeout(
            input.finalize(binding),
            remainingMs,
            () => new WebRtcDurabilityError("shutdown"),
          );
          if (!input.isPending(binding)) return null;
        } catch (error) {
          lastFailure = error;
          if (attempt === 1) return lastFailure;
        }
      }
      return lastFailure ?? new WebRtcDurabilityError("shutdown");
    }),
  );

  return {
    failureCount: failures.filter(Boolean).length,
    pendingCount: input.bindings.filter(input.isPending).length,
  };
}
