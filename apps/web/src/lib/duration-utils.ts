export const MIN_DURATION = 1;
export const MAX_DURATION = 60;
export const DEFAULT_DURATION = 5;

export function coerceDuration(raw: unknown): number {
  if (typeof raw !== "number" && typeof raw !== "string") {
    return DEFAULT_DURATION;
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return DEFAULT_DURATION;
  }
  const num = Number(raw);
  if (isNaN(num) || !Number.isFinite(num)) return DEFAULT_DURATION;
  if (num < MIN_DURATION) return MIN_DURATION;
  if (num > MAX_DURATION) return MAX_DURATION;
  return Math.floor(num);
}
