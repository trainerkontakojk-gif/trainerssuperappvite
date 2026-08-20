export const OPENAI_WEBRTC_MODEL_ID = "gpt-realtime-2.1" as const;
export const OPENAI_WEBRTC_TRANSPORT = "openai-webrtc" as const;

export interface TelefunWebRtcCapability {
  enabled: boolean;
  allowed: boolean;
  modelId: typeof OPENAI_WEBRTC_MODEL_ID;
  transport: typeof OPENAI_WEBRTC_TRANSPORT;
  modelIds?: readonly string[];
}

const RETIRED_WEBRTC_CAPABILITY: TelefunWebRtcCapability = {
  enabled: false,
  allowed: false,
  modelId: OPENAI_WEBRTC_MODEL_ID,
  transport: OPENAI_WEBRTC_TRANSPORT,
  modelIds: [],
};

/**
 * Shape compatibility only. A retired capability is static so browser startup
 * never performs a capability fetch that could become an admission seam.
 */
export async function fetchTelefunWebRtcCapability(
  _options: { signal?: AbortSignal } = {},
): Promise<TelefunWebRtcCapability> {
  return RETIRED_WEBRTC_CAPABILITY;
}

export function isTelefunWebRtcModelAllowed(
  _capability: TelefunWebRtcCapability | null | undefined,
  _modelId: string | null | undefined,
): false {
  return false;
}

export function isAllowedTelefunWebRtc(
  _capability: TelefunWebRtcCapability | null | undefined,
): false {
  return false;
}
