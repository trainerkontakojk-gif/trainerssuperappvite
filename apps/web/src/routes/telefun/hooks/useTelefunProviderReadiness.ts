export type TelefunProviderReadinessState =
  | { status: "loading"; openai: null }
  | { status: "ready"; openai: { enabled: boolean; configured: boolean; ready: boolean } }
  | { status: "unavailable"; openai: { enabled: boolean; configured: boolean; ready: boolean } | null };

const RETIRED_STATE: TelefunProviderReadinessState = {
  status: "unavailable",
  openai: { enabled: false, configured: false, ready: false },
};

/** Compatibility hook: Telefun no longer performs provider readiness probes. */
export function useTelefunProviderReadiness(
  _active: boolean,
  _options: unknown = {},
): TelefunProviderReadinessState {
  return RETIRED_STATE;
}
