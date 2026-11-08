/* global process, URL */
// Test-only preload for boot specs: the process under test may not reach any
// non-loopback host. Each denied request is logged so a spec can assert none
// happened.
const local = (host) =>
  ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  // Inspect without transferring a Request body before the transport uses it.
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!local(url.hostname)) {
    process.stderr.write(`[egress-denied] ${url.hostname}\n`);
    throw new Error("Egress denied");
  }
  return original(input, init);
};
