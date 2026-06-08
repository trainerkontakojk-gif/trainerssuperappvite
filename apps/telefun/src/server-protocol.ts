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

export interface GeminiTranscriptionChunk {
  speaker: "agent" | "consumer";
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractGeminiTranscriptionChunks(
  message: unknown,
): GeminiTranscriptionChunk[] {
  if (!isRecord(message)) return [];

  const serverContent = message.serverContent;
  if (!isRecord(serverContent)) return [];

  const chunks: GeminiTranscriptionChunk[] = [];

  const inputTranscription = serverContent.inputTranscription;
  if (
    isRecord(inputTranscription) &&
    typeof inputTranscription.text === "string" &&
    inputTranscription.text.trim().length > 0
  ) {
    chunks.push({
      speaker: "agent",
      text: inputTranscription.text,
    });
  }

  const outputTranscription = serverContent.outputTranscription;
  if (
    isRecord(outputTranscription) &&
    typeof outputTranscription.text === "string" &&
    outputTranscription.text.trim().length > 0
  ) {
    chunks.push({
      speaker: "consumer",
      text: outputTranscription.text,
    });
  }

  return chunks;
}
