import type { SidakAgentQuickviewResponse } from "@trainers/types";
import { useState } from "react";
import { useApi } from "./useApi";

interface RequestPathState {
  path: string | null;
  awaitingCurrentRequest: boolean;
  requestStarted: boolean;
}

export function useAgentQuickview(
  agentId: string,
  year: number,
  serviceType: string,
) {
  const path = serviceType
    ? `/sidak/agents/${encodeURIComponent(agentId)}/quickview?${new URLSearchParams(
        {
          year: String(year),
          service_type: serviceType,
        },
      ).toString()}`
    : null;

  const { data, loading, error, refetch } =
    useApi<SidakAgentQuickviewResponse>(path);
  const [requestPathState, setRequestPathState] = useState<RequestPathState>({
    path,
    awaitingCurrentRequest: false,
    requestStarted: false,
  });

  const matchesContext =
    data?.context.agentId === agentId &&
    data.context.year === year &&
    data.context.serviceType === serviceType;

  let suppressRetainedState = false;
  if (requestPathState.path !== path) {
    suppressRetainedState = Boolean(path);
    setRequestPathState({
      path,
      awaitingCurrentRequest: Boolean(path),
      requestStarted: false,
    });
  } else if (requestPathState.awaitingCurrentRequest) {
    suppressRetainedState = true;

    if (matchesContext) {
      suppressRetainedState = false;
      setRequestPathState({
        path,
        awaitingCurrentRequest: false,
        requestStarted: false,
      });
    } else if (!requestPathState.requestStarted && loading && !error) {
      setRequestPathState({
        path,
        awaitingCurrentRequest: true,
        requestStarted: true,
      });
    } else if (requestPathState.requestStarted && !loading) {
      setRequestPathState({
        path,
        awaitingCurrentRequest: false,
        requestStarted: false,
      });
    }
  }

  const currentError = !path || suppressRetainedState ? null : error;

  return {
    data: matchesContext ? data : null,
    loading:
      Boolean(path) &&
      !currentError &&
      (suppressRetainedState || loading || !matchesContext),
    error: currentError,
    refetch,
  };
}
