/* global process, URL, Request */
// Test-only preload for boot specs: the process under test may not reach any
// non-loopback host. Each denied request is logged so a spec can assert none
// happened.
const local = (host) =>
  ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(new Request(input, init).url);
  if (!local(url.hostname)) {
    process.stderr.write(`[egress-denied] ${url.hostname}\n`);
    throw new Error("Egress denied");
  }
  return original(input, init);
};
