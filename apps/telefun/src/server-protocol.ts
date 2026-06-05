export function isGeminiForwardableMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.setup || record.realtimeInput || record.clientContent);
}

export function isGeminiSetupMessage(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as any).setup);
}

export function hasGeminiSetupComplete(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as any).setupComplete !== undefined,
  );
}

export function getGeminiGoAwayTimeLeftSeconds(value: unknown): number | null {
  const raw = (value as any)?.goAway?.timeLeft;
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getSessionResumptionHandle(value: unknown): string | null {
  const update = (value as any)?.sessionResumptionUpdate;
  if (!update?.resumable || typeof update.newHandle !== "string") return null;
  const handle = update.newHandle.trim();
  return handle.length > 0 ? handle : null;
}

export function isCurrentGeminiSocket(
  activeSocket: unknown,
  eventSocket: unknown,
): boolean {
  return activeSocket === eventSocket;
}
