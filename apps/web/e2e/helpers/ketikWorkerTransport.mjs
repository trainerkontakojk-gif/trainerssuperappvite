/* global process, URL, Request */
// Test-only HTTP transport, loaded before the real worker entrypoint. No product service is stubbed.
if (process.env.NODE_ENV !== "test")
  throw new Error("Worker transport requires test mode");
const provider = new URL(process.env.KETIK_E2E_PROVIDER_ORIGIN ?? "");
const db = new URL(process.env.VITE_SUPABASE_URL ?? "");
const local = (host) =>
  ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
if (!local(provider.hostname) || !local(db.hostname))
  throw new Error("Worker transport requires loopback targets");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (
    ["generativelanguage.googleapis.com", "api.openai.com"].includes(
      url.hostname,
    )
  ) {
    return original(new Request(provider.origin + url.pathname, request));
  }
  if (!local(url.hostname)) throw new Error("Worker egress denied");
  return original(request);
};
// A task-owned signal advances only this child process clock for the lease-age health boundary.
const realNow = Date.now;
process.once("SIGUSR2", () => {
  Date.now = () => realNow() + 3_600_000;
});
