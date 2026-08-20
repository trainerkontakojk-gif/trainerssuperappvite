import type { ValidatedTelefunSessionConfigure } from "../server-protocol.js";
import type { RealtimeProviderAdapter } from "./RealtimeProviderAdapter.js";

export interface RealtimeProviderRouterDependencies {
  createGeminiAdapter: (
    configuration: ValidatedTelefunSessionConfigure,
  ) => RealtimeProviderAdapter;
}

export type RealtimeProviderRouterResult =
  | { ok: true; adapter: RealtimeProviderAdapter }
  | { ok: false; reason: "unsupported_provider" };

/** Resolves only the active Gemini Live provider for new WebSocket sessions. */
export function createRealtimeProviderAdapter(
  configuration: ValidatedTelefunSessionConfigure,
  dependencies: RealtimeProviderRouterDependencies,
): RealtimeProviderRouterResult {
  if (
    configuration.model.provider !== "gemini" ||
    configuration.model.realtime.transport !== "gemini-live"
  ) {
    return { ok: false, reason: "unsupported_provider" };
  }

  return {
    ok: true,
    adapter: dependencies.createGeminiAdapter(configuration),
  };
}
