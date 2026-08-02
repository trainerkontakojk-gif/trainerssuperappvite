import type { ActiveBinding } from "./call-manager-types.js";

const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_TRANSCRIPT_TEXT = 16_000;
const SAFE_CALL_ID = /^rtc_[A-Za-z0-9_-]{1,128}$/;

export function isSafeProviderCallId(value: string): boolean {
  return SAFE_CALL_ID.test(value);
}

export function isFinalizationConflictReason(reason: string): boolean {
  return (
    reason === "finalization_key_conflict" || reason === "terminal_conflict"
  );
}

export function normalizedTranscriptText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_TEXT);
}

export function isEndingOrEnded(binding: ActiveBinding): boolean {
  return binding.state === "ending" || binding.state === "ended";
}

export function isEnded(binding: ActiveBinding): boolean {
  return binding.state === "ended";
}

export const boundedFailureMessage = (value: string): string =>
  value.replace(/\s+/g, " ").trim().slice(0, 240) || "incomplete OpenAI usage";

export function boundedDurationSeconds(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(
    MAX_DURATION_SECONDS,
    Math.max(0, Math.floor(durationMs / 1_000)),
  );
}

export function boundedTimeout(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value!)));
}

export function withTimeout<T>(
  operation: PromiseLike<T> | T,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(
      () => finish(() => reject(onTimeout())),
      timeoutMs,
    );
    Promise.resolve(operation).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
