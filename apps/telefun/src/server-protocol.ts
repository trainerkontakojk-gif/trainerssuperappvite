export function isGeminiForwardableMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.setup || record.realtimeInput || record.clientContent);
}

export function isGeminiSetupMessage(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as any).setup);
}

export function hasGeminiSetupComplete(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as any).setupComplete !== undefined);
}

