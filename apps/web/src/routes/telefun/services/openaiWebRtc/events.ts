import {
  OPENAI_WEBRTC_MAX_DATA_CHANNEL_MESSAGE_CHARS,
  type OpenAIWebRtcEvent,
} from "./contracts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOpenAIWebRtcDataChannelMessage(
  raw: string,
): OpenAIWebRtcEvent {
  if (raw.length > OPENAI_WEBRTC_MAX_DATA_CHANNEL_MESSAGE_CHARS) {
    return { kind: "invalid", reason: "oversized_message" };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || typeof parsed.type !== "string") {
      return { kind: "invalid", reason: "invalid_shape" };
    }

    return {
      kind: "event",
      type: parsed.type,
      payload: parsed,
    };
  } catch {
    return { kind: "invalid", reason: "malformed_json" };
  }
}
