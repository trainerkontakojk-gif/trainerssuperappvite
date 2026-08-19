import { fetchApi } from "../../../hooks/useApi";
import {
  DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  type TelefunWebRtcModelId,
} from "@trainers/types";

export const OPENAI_WEBRTC_MODEL_ID = "gpt-realtime-2.1" as const;
export const OPENAI_WEBRTC_TRANSPORT = "openai-webrtc" as const;

export interface TelefunWebRtcCapability {
  enabled: boolean;
  allowed: boolean;
  modelId: typeof OPENAI_WEBRTC_MODEL_ID;
  transport: typeof OPENAI_WEBRTC_TRANSPORT;
  // Additive: absent (pre-rollout server or legacy callers) means the
  // Full-only default; the client never opens Mini by itself.
  modelIds?: readonly TelefunWebRtcModelId[];
}

export async function fetchTelefunWebRtcCapability(
  options: { signal?: AbortSignal } = {},
): Promise<TelefunWebRtcCapability> {
  const capability = await fetchApi<{
    openaiWebRtc?: Partial<TelefunWebRtcCapability>;
  }>("/telefun/capabilities", {
    signal: options.signal,
  });

  return {
    enabled: capability.openaiWebRtc?.enabled === true,
    allowed: capability.openaiWebRtc?.allowed === true,
    modelId: OPENAI_WEBRTC_MODEL_ID,
    transport: OPENAI_WEBRTC_TRANSPORT,
    modelIds:
      capability.openaiWebRtc?.modelIds ??
      DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  };
}

export function isTelefunWebRtcModelAllowed(
  capability: TelefunWebRtcCapability | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (!modelId || !capability) return false;
  const modelIds =
    capability.modelIds ?? DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS;
  return modelIds.includes(modelId as TelefunWebRtcModelId);
}

export function isAllowedTelefunWebRtc(
  capability: TelefunWebRtcCapability | null | undefined,
): boolean {
  return (
    capability?.enabled === true &&
    capability.allowed === true &&
    capability.transport === OPENAI_WEBRTC_TRANSPORT &&
    isTelefunWebRtcModelAllowed(capability, OPENAI_WEBRTC_MODEL_ID)
  );
}
