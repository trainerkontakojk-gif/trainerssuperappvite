/**
 * Browser E2E must never reach production.
 *
 * Proves that the dev server Playwright talks to was started with the E2E env
 * (Supabase and Telefun on loopback), not the root `.env` that points at the
 * production project, that loading the app sends nothing off-machine, and
 * that the dev server's `/api` proxy never reaches a process on `:3001`.
 * See `plans/markdown/e2e-webserver-isolation.md`.
 */
import { createServer, type RequestListener, type Server } from "node:http";
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
  // Any other URL-shaped key (a future `VITE_*_URL` in the root `.env`) would
  // be inherited from production, so every one must be loopback too.
  const remote = Object.entries(env).filter(
    ([, value]) =>
      typeof value === "string" &&
      /^(https?|wss?):\/\//.test(value) &&
      !isLoopback(value),
  );
  expect(remote, "served env has non-loopback URLs").toEqual([]);
});

/** Listens on `host:port`; rejects (for example EADDRINUSE) instead of skipping. */
function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
}

test("the /api proxy never reaches a process listening on :3001", async ({
  baseURL,
}) => {
  // Stand in for a developer API on :3001 (whose env is production). Bind both
  // loopback families: the proxy's `localhost` may resolve to either.
  const hits: string[] = [];
  const handler: RequestListener = (req, res) => {
    hits.push(req.url ?? "");
    res.end("sentinel");
  };
  const v4 = createServer(handler);
  const v6 = createServer(handler);
  await listen(v4, "127.0.0.1", 3001);
  const v6Bound = await listen(v6, "::1", 3001).then(
    () => true,
    () => false,
  );
  try {
    const response = await fetch(`${baseURL}/api/v1/__e2e_proxy_probe`);
    const body = await response.text();
    expect(body, "the proxy forwarded to the :3001 sentinel").not.toBe(
      "sentinel",
    );
    expect(hits, "requests that reached :3001").toEqual([]);
  } finally {
    await new Promise((r) => v4.close(r));
    if (v6Bound) await new Promise((r) => v6.close(r));
  }
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
