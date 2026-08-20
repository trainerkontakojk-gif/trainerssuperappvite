import type { TelefunWebRtcCapability } from "../services/telefunWebRtcCapability";

export type TelefunWebRtcCapabilityState =
  | { status: "loading"; capability: null }
  | { status: "ready"; capability: TelefunWebRtcCapability }
  | { status: "unavailable"; capability: null };

/** Compatibility hook: retired WebRTC capability is never requested. */
export function useTelefunWebRtcCapability(
  _active: boolean,
): TelefunWebRtcCapabilityState {
  return { status: "unavailable", capability: null };
}
