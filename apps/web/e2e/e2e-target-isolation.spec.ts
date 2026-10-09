/**
 * Browser E2E must never reach production.
 *
 * Proves that the dev server Playwright talks to was started with the E2E env
 * (Supabase and Telefun on loopback), not the root `.env` that points at the
 * production project, and that loading the app sends nothing off-machine.
 * See `plans/markdown/e2e-webserver-isolation.md`.
 */
import { expect, test } from "@playwright/test";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLoopback(raw: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/** Reads the `import.meta.env` object Vite inlines into a transformed module. */
async function readServedEnv(baseURL: string): Promise<Record<string, string>> {
  const response = await fetch(`${baseURL}/src/lib/supabase.ts`);
  expect(response.ok, "Vite must serve src/lib/supabase.ts").toBe(true);
  const code = await response.text();
  const literal = code.match(/import\.meta\.env\s*=\s*(\{.*?\});/s)?.[1];
  expect(
    literal,
    "transformed module must inline import.meta.env",
  ).toBeTruthy();
  return JSON.parse(literal!) as Record<string, string>;
}

test("dev server env points Supabase and Telefun at loopback", async ({
  baseURL,
}) => {
  const env = await readServedEnv(baseURL!);
  expect(isLoopback(env.VITE_SUPABASE_URL ?? ""), env.VITE_SUPABASE_URL).toBe(
    true,
  );
  expect(
    isLoopback(env.VITE_TELEFUN_WS_URL ?? ""),
    env.VITE_TELEFUN_WS_URL,
  ).toBe(true);
  const remoteApi = env.VITE_API_URL && !isLoopback(env.VITE_API_URL);
  expect(remoteApi, `VITE_API_URL=${env.VITE_API_URL}`).toBeFalsy();
});

test("a session refresh at boot stays on-machine", async ({
  baseURL,
  page,
}) => {
  // An expired stored session makes supabase-js refresh the token at boot, so
  // the app is forced to call whichever Supabase host the bundle was built with.
  const env = await readServedEnv(baseURL!);
  const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      storageKey,
      JSON.stringify({
        access_token: "expired",
        refresh_token: "e2e-refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 1,
        user: { id: "00000000-0000-0000-0000-000000000000" },
      }),
    ] as const,
  );
  const refreshes: string[] = [];
  const offMachine: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/token")) refreshes.push(request.url());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/^(https?|wss?):/.test(url) && !isLoopback(url)) offMachine.push(url);
  });
  // Abort anything off-machine so a failing run cannot reach a real service.
  await page.route(
    (url) => /^(https?|wss?):/.test(url.href) && !isLoopback(url.href),
    (route) => route.abort(),
  );

  await page.goto("/");
  await expect
    .poll(() => refreshes.length, { timeout: 15000 })
    .toBeGreaterThan(0);

  expect(refreshes.every(isLoopback), refreshes.join(", ")).toBe(true);
  const services = offMachine.filter((url) =>
    /supabase\.co|railway\.app/.test(new URL(url).hostname),
  );
  expect(services).toEqual([]);
});
