import {
  arrayBufferToBase64,
  base64ToUint8Array,
  isRecord,
  normalizeNonNegativeInteger,
  optionalString,
  type NormalizedOpenAiRealtimeEvent,
} from "./common";

export function buildOpenAiInputAudioAppend(buffer: ArrayBuffer) {
  return {
    type: "input_audio_buffer.append" as const,
    audio: arrayBufferToBase64(buffer),
  };
}

export function buildOpenAiTextInputItem(text: string) {
  return {
    type: "conversation.item.create" as const,
    item: {
      type: "message" as const,
      role: "user" as const,
      content: [{ type: "input_text" as const, text }],
    },
  };
}

export function buildOpenAiSystemInputItem(text: string) {
  return {
    type: "conversation.item.create" as const,
    item: {
      type: "message" as const,
      role: "system" as const,
      content: [{ type: "input_text" as const, text }],
    },
  };
}

export function buildOpenAiResponseCreate() {
  return { type: "response.create" as const };
}

export function buildOpenAiResponseCancel() {
  return { type: "response.cancel" as const };
}

export function buildOpenAiConversationItemTruncate(params: {
  itemId: string;
  audioEndMs: number;
}) {
  return {
    type: "conversation.item.truncate" as const,
    item_id: params.itemId,
    content_index: 0 as const,
    audio_end_ms: normalizeNonNegativeInteger(params.audioEndMs),
  };
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function withIdentifiers(record: Record<string, unknown>) {
  const responseId = optionalString(record.response_id);
  const itemId = optionalString(record.item_id);
  return {
    ...(responseId ? { responseId } : {}),
    ...(itemId ? { itemId } : {}),
  };
}

export function parseOpenAiRealtimeEvent(
  input: unknown,
): NormalizedOpenAiRealtimeEvent {
  const value = parseJsonValue(input);
  if (!isRecord(value)) {
    return { kind: "invalid" };
  }
  const eventType = optionalString(value.type);
  if (!eventType) return { kind: "invalid" };

  switch (eventType) {
    case "session.created":
    case "session.updated": {
      if (!isRecord(value.session)) return { kind: "invalid" };
      const sessionId = optionalString(value.session.id);
      if (!sessionId) return { kind: "invalid" };
      const model = optionalString(value.session.model);
      return {
        kind:
          eventType === "session.created"
            ? "session_created"
            : "session_updated",
        sessionId,
        ...(model ? { model } : {}),
      };
    }
    case "input_audio_buffer.speech_started":
      if (
        typeof value.audio_start_ms !== "number" ||
        !Number.isFinite(value.audio_start_ms)
      ) {
        return { kind: "invalid" };
      }
      return {
        kind: "speech_started",
        audioStartMs: normalizeNonNegativeInteger(value.audio_start_ms),
        ...(optionalString(value.item_id)
          ? { itemId: optionalString(value.item_id) }
          : {}),
      };
    case "input_audio_buffer.speech_stopped":
      if (
        typeof value.audio_end_ms !== "number" ||
        !Number.isFinite(value.audio_end_ms)
      ) {
        return { kind: "invalid" };
      }
      return {
        kind: "speech_stopped",
        audioEndMs: normalizeNonNegativeInteger(value.audio_end_ms),
        ...(optionalString(value.item_id)
          ? { itemId: optionalString(value.item_id) }
          : {}),
      };
    case "response.created": {
      if (!isRecord(value.response)) return { kind: "invalid" };
      const responseId = optionalString(value.response.id);
      const status = optionalString(value.response.status);
      if (!responseId || !status) return { kind: "invalid" };
      return { kind: "response_created", responseId, status };
    }
    case "response.output_audio.delta": {
      if (typeof value.delta !== "string" || value.delta.length === 0) {
        return { kind: "invalid" };
      }
      try {
        return {
          kind: "audio_delta",
          ...withIdentifiers(value),
          data: base64ToUint8Array(value.delta),
          sampleRate: 24000,
        };
      } catch {
        return { kind: "invalid" };
      }
    }
    case "response.output_audio_transcript.delta":
      if (typeof value.delta !== "string") return { kind: "invalid" };
      return {
        kind: "transcript_delta",
        ...withIdentifiers(value),
        delta: value.delta,
      };
    case "response.output_audio_transcript.done":
      if (typeof value.transcript !== "string") return { kind: "invalid" };
      return {
        kind: "transcript_done",
        ...withIdentifiers(value),
        transcript: value.transcript,
      };
    case "response.done": {
      if (!isRecord(value.response)) return { kind: "invalid" };
      const responseId = optionalString(value.response.id);
      const status = optionalString(value.response.status);
      if (!responseId || !status) return { kind: "invalid" };
      return {
        kind: "turn_complete",
        responseId,
        status,
        ...(value.response.usage !== undefined
          ? { usage: value.response.usage }
          : {}),
      };
    }
    case "response.cancelled": {
      const responseId =
        optionalString(value.response_id) ??
        (isRecord(value.response)
          ? optionalString(value.response.id)
          : undefined);
      return {
        kind: "response_cancelled",
        ...(responseId ? { responseId } : {}),
      };
    }
    case "error": {
      if (!isRecord(value.error)) return { kind: "invalid" };
      const errorType = optionalString(value.error.type);
      const code = optionalString(value.error.code);
      const message =
        optionalString(value.error.message) ?? "Layanan suara mengalami error.";
      return {
        kind: "error",
        ...(errorType ? { errorType } : {}),
        ...(code ? { code } : {}),
        message,
      };
    }
    default:
      return { kind: "unknown", eventType };
  }
}
