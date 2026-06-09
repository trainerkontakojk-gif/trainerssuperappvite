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

export interface SessionEndRequest {
  type: "session_end_request";
  reason: "user" | "timeout" | "cleanup";
}

export interface SessionEndComplete {
  type: "session_end_complete";
  outcome: "turn_complete" | "quiet_timeout" | "hard_timeout";
}

export type TelefunControlMessage = SessionEndRequest | SessionEndComplete;

const VALID_SESSION_END_REASONS = new Set(["user", "timeout", "cleanup"]);
const VALID_SESSION_END_OUTCOMES = new Set([
  "turn_complete",
  "quiet_timeout",
  "hard_timeout",
]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function parseControlMessage(value: unknown): TelefunControlMessage | null {
  if (!isRecord(value)) return null;
  if (!isString(value.type)) return null;

  if (value.type === "session_end_request") {
    const reason = value.reason;
    if (!isString(reason) || !VALID_SESSION_END_REASONS.has(reason)) return null;
    return { type: "session_end_request", reason } as SessionEndRequest;
  }

  if (value.type === "session_end_complete") {
    const outcome = value.outcome;
    if (!isString(outcome) || !VALID_SESSION_END_OUTCOMES.has(outcome)) return null;
    return { type: "session_end_complete", outcome } as SessionEndComplete;
  }

  return null;
}

export function isSessionEndRequest(
  msg: TelefunControlMessage,
): msg is SessionEndRequest {
  return msg.type === "session_end_request";
}

export function isSessionEndComplete(
  msg: TelefunControlMessage,
): msg is SessionEndComplete {
  return msg.type === "session_end_complete";
}
