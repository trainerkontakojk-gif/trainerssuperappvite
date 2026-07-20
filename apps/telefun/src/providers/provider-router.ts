import type { ValidatedTelefunSessionConfigure } from "../server-protocol.js";
import type { RealtimeProviderAdapter } from "./RealtimeProviderAdapter.js";

export interface RealtimeProviderRouterDependencies {
  createGeminiAdapter: (
    configuration: ValidatedTelefunSessionConfigure,
  ) => RealtimeProviderAdapter;
  createOpenAIAdapter?: (
    configuration: ValidatedTelefunSessionConfigure,
  ) => RealtimeProviderAdapter;
  openAIEnabled?: boolean;
  openAIConfigured?: boolean;
}

export type RealtimeProviderRouterResult =
  | { ok: true; adapter: RealtimeProviderAdapter }
  | {
      ok: false;
      reason: "openai_disabled" | "openai_not_configured";
    };

export function createRealtimeProviderAdapter(
  configuration: ValidatedTelefunSessionConfigure,
  dependencies: RealtimeProviderRouterDependencies,
): RealtimeProviderRouterResult {
  if (configuration.model.provider === "openai") {
    if (!dependencies.openAIEnabled) {
      return { ok: false, reason: "openai_disabled" };
    }
    if (!dependencies.openAIConfigured || !dependencies.createOpenAIAdapter) {
      return { ok: false, reason: "openai_not_configured" };
    }
    return {
      ok: true,
      adapter: dependencies.createOpenAIAdapter(configuration),
    };
  }

  return {
    ok: true,
    adapter: dependencies.createGeminiAdapter(configuration),
  };
}
