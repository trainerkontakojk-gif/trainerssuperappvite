const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TelefunOpenAiWebRtcEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test";

export interface TelefunOpenAiWebRtcRolloutConfig {
  enabled: boolean;
  nodeEnv: string;
  allowedUserIds: readonly string[];
}

export function parseTelefunOpenAiWebRtcAllowedUserIds(
  value: string | undefined,
): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => UUID_PATTERN.test(item));
}

export function isTelefunOpenAiWebRtcAllowed(
  input: TelefunOpenAiWebRtcRolloutConfig & { userId: string },
): boolean {
  if (
    !input.enabled ||
    !["development", "staging", "production"].includes(input.nodeEnv)
  ) {
    return false;
  }
  return input.allowedUserIds.includes(input.userId);
}
