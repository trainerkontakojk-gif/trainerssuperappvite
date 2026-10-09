/**
 * The only service targets browser E2E may use. Playwright starts the web dev
 * server with `E2E_WEB_SERVER_ENV`; Vite gives these process env values
 * priority over the root `.env`, which points at production.
 *
 * Port 9 (TCP discard) has no listener, so a request a spec forgot to mock
 * fails fast on this machine instead of reaching a real service.
 * See `plans/markdown/e2e-webserver-isolation.md`.
 */
export const E2E_SUPABASE_URL = "http://127.0.0.1:9";

/** supabase-js stores the session under `sb-<first host label>-auth-token`. */
export const E2E_SUPABASE_STORAGE_KEY = `sb-${new URL(E2E_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export const E2E_TELEFUN_WS_URL = "ws://127.0.0.1:9";

export const E2E_WEB_SERVER_ENV: Record<string, string> = {
  VITE_SUPABASE_URL: E2E_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: "e2e-anon-key",
  VITE_TELEFUN_WS_URL: E2E_TELEFUN_WS_URL,
  VITE_APP_URL: "http://localhost:3005",
  // Empty means the app uses the `/api/v1` path behind the Vite proxy.
  VITE_API_URL: "",
};
