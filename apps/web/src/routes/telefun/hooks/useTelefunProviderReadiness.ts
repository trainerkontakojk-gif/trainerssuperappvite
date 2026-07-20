import { useEffect, useRef, useState } from "react";
import {
  fetchTelefunOpenAIReadiness,
  type TelefunOpenAIReadiness,
} from "../services/telefunProviderReadiness";

export type TelefunProviderReadinessState =
  | { status: "loading"; openai: null }
  | { status: "ready"; openai: TelefunOpenAIReadiness }
  | { status: "unavailable"; openai: TelefunOpenAIReadiness | null };

interface UseTelefunProviderReadinessOptions {
  websocketUrl?: unknown;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const LOADING_STATE: TelefunProviderReadinessState = {
  status: "loading",
  openai: null,
};

export function useTelefunProviderReadiness(
  active: boolean,
  options: UseTelefunProviderReadinessOptions = {},
): TelefunProviderReadinessState {
  const [state, setState] =
    useState<TelefunProviderReadinessState>(LOADING_STATE);
  const requestGeneration = useRef(0);
  const { websocketUrl, fetchImpl, timeoutMs } = options;

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();

    if (!active) {
      setState(LOADING_STATE);
      return () => controller.abort();
    }

    setState(LOADING_STATE);
    void fetchTelefunOpenAIReadiness({
      websocketUrl,
      fetchImpl,
      timeoutMs,
      signal: controller.signal,
    })
      .then((openai) => {
        if (
          controller.signal.aborted ||
          requestGeneration.current !== generation
        ) {
          return;
        }
        setState(
          openai.enabled && openai.configured && openai.ready
            ? { status: "ready", openai }
            : { status: "unavailable", openai },
        );
      })
      .catch(() => {
        if (
          controller.signal.aborted ||
          requestGeneration.current !== generation
        ) {
          return;
        }
        setState({ status: "unavailable", openai: null });
      });

    return () => controller.abort();
  }, [active, fetchImpl, timeoutMs, websocketUrl]);

  return state;
}
