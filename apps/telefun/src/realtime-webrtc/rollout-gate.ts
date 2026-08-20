import type { TelefunWebRtcModelId } from "./contracts.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TelefunOpenAiWebRtcEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test";

/**
 * Deprecated shape retained only so stale deployment config can deserialize.
 * It is never an admission authority.
 */
export interface TelefunOpenAiWebRtcRolloutConfig {
  enabled: boolean;
  nodeEnv: string;
  allowedUserIds: readonly string[];
  allowedModelIds: readonly TelefunWebRtcModelId[];
}

/** Retired model allowlists cannot authorize a new WebRTC call. */
export function isTelefunOpenAiWebRtcModelAllowed(
  _modelId: string | null | undefined,
  _allowedModelIds: readonly TelefunWebRtcModelId[],
): false {
  return false;
}

/** Retained parser for ignored deployment input only. */
export function parseTelefunOpenAiWebRtcAllowedUserIds(
  value: string | undefined,
): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => UUID_PATTERN.test(item));
}

/** Retired rollout always fails closed; no environment can re-enable starts. */
export function isTelefunOpenAiWebRtcAllowed(
  _input: TelefunOpenAiWebRtcRolloutConfig & { userId: string },
): false {
  return false;
}
