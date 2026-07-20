import {
  getTelefunLiveModel,
  isGeminiLiveVoiceName,
  isOpenAiRealtimeVoiceName,
  type TelefunLiveModel,
  type TelefunSessionConfigure,
} from "@trainers/types";

// Bound untrusted prompt text before it is ever handed to a provider adapter.
// The limit is measured in JavaScript string code units and intentionally keeps
// normal Telefun prompts while rejecting unexpectedly large control frames.
export const TELEFUN_MAX_INSTRUCTIONS_LENGTH = 16_000;

export type TelefunConfigureErrorReason =
  | "invalid_envelope"
  | "unknown_model"
  | "model_transport_mismatch"
  | "invalid_voice"
  | "invalid_audio_format"
  | "invalid_sample_rate"
  | "invalid_response_pacing_mode"
  | "invalid_instructions";

export interface ValidatedTelefunSessionConfigure {
  configure: TelefunSessionConfigure;
  model: TelefunLiveModel;
}

export type TelefunConfigureParseResult =
  | { ok: true; value: ValidatedTelefunSessionConfigure }
  | { ok: false; reason: TelefunConfigureErrorReason };

export function parseTelefunSessionConfigure(
  value: unknown,
): TelefunConfigureParseResult {
  if (!isRecord(value) || value.type !== "telefun_session_configure") {
    return { ok: false, reason: "invalid_envelope" };
  }

  const inputAudio = value.inputAudio;
  if (
    typeof value.modelId !== "string" ||
    typeof value.transport !== "string" ||
    typeof value.voice !== "string" ||
    typeof value.instructions !== "string" ||
    typeof value.responsePacingMode !== "string" ||
    !isRecord(inputAudio) ||
    typeof inputAudio.format !== "string" ||
    typeof inputAudio.sampleRate !== "number"
  ) {
    return { ok: false, reason: "invalid_envelope" };
  }

  const model = getTelefunLiveModel(value.modelId);
  if (!model) return { ok: false, reason: "unknown_model" };
  if (value.transport !== model.realtime.transport) {
    return { ok: false, reason: "model_transport_mismatch" };
  }

  const voiceIsValid =
    model.realtime.voiceProvider === "gemini"
      ? isGeminiLiveVoiceName(value.voice)
      : isOpenAiRealtimeVoiceName(value.voice);
  if (!voiceIsValid) return { ok: false, reason: "invalid_voice" };
  if (inputAudio.format !== "pcm16") {
    return { ok: false, reason: "invalid_audio_format" };
  }
  if (
    (inputAudio.sampleRate !== 16_000 && inputAudio.sampleRate !== 24_000) ||
    inputAudio.sampleRate !== model.realtime.inputSampleRateHz
  ) {
    return { ok: false, reason: "invalid_sample_rate" };
  }
  if (
    value.responsePacingMode !== "realistic" &&
    value.responsePacingMode !== "training_fast"
  ) {
    return { ok: false, reason: "invalid_response_pacing_mode" };
  }
  if (
    value.instructions.trim().length === 0 ||
    value.instructions.length > TELEFUN_MAX_INSTRUCTIONS_LENGTH
  ) {
    return { ok: false, reason: "invalid_instructions" };
  }

  const configure: TelefunSessionConfigure = {
    type: "telefun_session_configure",
    modelId: value.modelId,
    transport: model.realtime.transport,
    voice: value.voice,
    instructions: value.instructions,
    inputAudio: {
      format: "pcm16",
      sampleRate: inputAudio.sampleRate,
    },
    responsePacingMode: value.responsePacingMode,
  };

  return { ok: true, value: { configure, model } };
}

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

export function buildGeminiReconnectSetupMessage(
  cachedSetupMessage: string | null,
  latestSessionHandle: string | null,
): string | null {
  if (!cachedSetupMessage) return null;

  const setupMsg = JSON.parse(cachedSetupMessage);
  if (latestSessionHandle) {
    setupMsg.setup = {
      ...setupMsg.setup,
      sessionResumption: {
        ...(setupMsg.setup?.sessionResumption ?? {}),
        handle: latestSessionHandle,
      },
    };
  }

  return JSON.stringify(setupMsg);
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

export interface TelefunAuthMessage {
  type: "authenticate";
  token: string;
  sessionId?: string;
}

export function parseTelefunAuthMessage(
  value: unknown,
): TelefunAuthMessage | null {
  if (!isRecord(value) || value.type !== "authenticate") return null;
  if (!isString(value.token) || value.token.trim().length === 0) return null;
  if (
    value.sessionId !== undefined &&
    (!isString(value.sessionId) || value.sessionId.trim().length === 0)
  ) {
    return null;
  }

  return {
    type: "authenticate",
    token: value.token,
    ...(isString(value.sessionId) ? { sessionId: value.sessionId } : {}),
  };
}

export function parseControlMessage(
  value: unknown,
): TelefunControlMessage | null {
  if (!isRecord(value)) return null;
  if (!isString(value.type)) return null;

  if (value.type === "session_end_request") {
    const reason = value.reason;
    if (!isString(reason) || !VALID_SESSION_END_REASONS.has(reason))
      return null;
    return { type: "session_end_request", reason } as SessionEndRequest;
  }

  if (value.type === "session_end_complete") {
    const outcome = value.outcome;
    if (!isString(outcome) || !VALID_SESSION_END_OUTCOMES.has(outcome))
      return null;
    return { type: "session_end_complete", outcome } as SessionEndComplete;
  }

  return null;
}

export function isTelefunControlEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.type)) return false;
  return (
    value.type === "session_end_request" ||
    value.type === "session_end_complete"
  );
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
