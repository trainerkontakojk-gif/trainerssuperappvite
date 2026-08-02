import { fetchApi } from "../../../hooks/useApi";

export const OPENAI_WEBRTC_MODEL_ID = "gpt-realtime-2.1" as const;
export const OPENAI_WEBRTC_TRANSPORT = "openai-webrtc" as const;

export interface TelefunWebRtcCapability {
  enabled: boolean;
  allowed: boolean;
  modelId: typeof OPENAI_WEBRTC_MODEL_ID;
  transport: typeof OPENAI_WEBRTC_TRANSPORT;
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
  };
}

export function isAllowedTelefunWebRtc(
  capability: TelefunWebRtcCapability | null | undefined,
): boolean {
  return (
    capability?.enabled === true &&
    capability.allowed === true &&
    capability.modelId === OPENAI_WEBRTC_MODEL_ID &&
    capability.transport === OPENAI_WEBRTC_TRANSPORT
  );
}
