import { useEffect, useRef, useState } from "react";
import {
  fetchTelefunWebRtcCapability,
  type TelefunWebRtcCapability,
} from "../services/telefunWebRtcCapability";

export type TelefunWebRtcCapabilityState =
  | { status: "loading"; capability: null }
  | { status: "ready"; capability: TelefunWebRtcCapability }
  | { status: "unavailable"; capability: null };

export function useTelefunWebRtcCapability(
  active: boolean,
): TelefunWebRtcCapabilityState {
  const [state, setState] = useState<TelefunWebRtcCapabilityState>({
    status: "unavailable",
    capability: null,
  });
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const controller = new AbortController();
    if (!active) {
      setState({ status: "unavailable", capability: null });
      return () => controller.abort();
    }

    setState({ status: "loading", capability: null });
    void fetchTelefunWebRtcCapability({ signal: controller.signal })
      .then((capability) => {
        if (
          !controller.signal.aborted &&
          requestId.current === currentRequest
        ) {
          setState({ status: "ready", capability });
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          requestId.current === currentRequest
        ) {
          setState({ status: "unavailable", capability: null });
        }
      });

    return () => controller.abort();
  }, [active]);

  return state;
}
