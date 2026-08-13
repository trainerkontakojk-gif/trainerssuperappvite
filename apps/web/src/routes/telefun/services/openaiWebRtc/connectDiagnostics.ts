export type OpenAIWebRtcConnectStage =
  | "get_user_media"
  | "recording_start"
  | "create_offer"
  | "set_local_description"
  | "broker_request"
  | "set_remote_description"
  | "wait_for_peer";

type CodedError = Error & { code?: string };

const MAX_CONNECT_DIAGNOSTIC_MESSAGE_LENGTH = 200;
const SESSION_DESCRIPTION_DIAGNOSTIC_PATTERN =
  /(?:\bsdp\b|\bsession\s*description\b|\bset(?:local|remote)description\b|\bice-(?:pwd|ufrag)\b|\b(?:candidate|fingerprint)\s*:|(?:^|[\r\n])[ \t]*(?:v|o|s|t|c|m|a)=)/im;

export function createOpenAIWebRtcCodedError(
  message: string,
  code: string,
  cause?: unknown,
): CodedError {
  const error = new Error(message, { cause }) as CodedError;
  error.code = code;
  return error;
}

export function wrapOpenAIWebRtcCodedError(
  error: unknown,
  code: string,
  fallbackMessage: string,
): CodedError {
  const sourceMessage =
    error instanceof Error ? error.message : fallbackMessage;
  const wrapped = createOpenAIWebRtcCodedError(sourceMessage, code, error);
  if (error instanceof Error) wrapped.name = error.name;
  return wrapped;
}

function getSafeConnectDiagnosticMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  if (SESSION_DESCRIPTION_DIAGNOSTIC_PATTERN.test(message)) {
    return "session_description_parse_failed";
  }
  return message.slice(0, MAX_CONNECT_DIAGNOSTIC_MESSAGE_LENGTH);
}

export function warnOpenAIWebRtcConnectStage(
  stage:
    | OpenAIWebRtcConnectStage
    | "broker_request_started"
    | "broker_response",
  error?: unknown,
): void {
  const value =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; message?: unknown })
      : undefined;
  try {
    console.warn({
      stage,
      name: typeof value?.name === "string" ? value.name : undefined,
      code: typeof value?.code === "string" ? value.code : undefined,
      message: getSafeConnectDiagnosticMessage(value?.message),
    });
  } catch {
    // Observability must never block connect failure handling.
  }
}
