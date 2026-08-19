import type { TelefunWebRtcModelId } from "./contracts.js";

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
  allowedModelIds: readonly TelefunWebRtcModelId[];
}

/** Membership of a persisted model id in the server allowed set. */
export function isTelefunOpenAiWebRtcModelAllowed(
  modelId: string | null | undefined,
  allowedModelIds: readonly TelefunWebRtcModelId[],
): modelId is TelefunWebRtcModelId {
  return (
    typeof modelId === "string" &&
    (allowedModelIds as readonly string[]).includes(modelId)
  );
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
