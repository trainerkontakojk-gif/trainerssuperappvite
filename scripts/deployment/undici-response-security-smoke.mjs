/* global process, setTimeout, console, URL, AbortSignal */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

// Approved isolated regression probe for GHSA-xjj6-f33q-929c. No app env,
// provider, database, external HTTP target, or uncaught-exception handler.
const self = fileURLToPath(import.meta.url);
const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);

function transport(owner) {
  if (owner === "node") {
    return {
      fetch: globalThis.fetch,
      version: process.versions.undici,
      module: "node:fetch",
    };
  }
  const require =
    owner === "api" ? apiRequire : createRequire(webRequire.resolve("jsdom"));
  const module = require.resolve("undici");
  return {
    fetch: require("undici").fetch,
    version: require("undici/package.json").version,
    module,
  };
}

async function worker(owner) {
  assert.ok(["api", "jsdom", "node"].includes(owner));
  const client = transport(owner);
  const requests = [];
  const sockets = new Set();
  const encoding = Array(6).fill("gzip").join(", ");
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.once("data", (data) => {
      const request = data.toString().split("\r\n")[0];
      requests.push(request);
      if (request === "GET /valid HTTP/1.1") {
        socket.end(
          "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
        );
      } else if (request === "GET /malformed HTTP/1.1") {
        // Headers promise a body, but the connection closes before any body
        // bytes. On vulnerable fetch versions an orphaned stream error can
        // crash the process even though the fetch rejection is caught.
        socket.end(
          `HTTP/1.1 200 OK\r\nContent-Length: 1024\r\nContent-Encoding: ${encoding}\r\nConnection: close\r\n\r\n`,
        );
      } else {
        socket.end(
          "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(address.address, "127.0.0.1");
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(
    JSON.stringify({
      phase: "started",
      owner,
      version: client.version,
      module: client.module,
      node: process.version,
    }),
  );
  try {
    async function valid() {
      const response = await client.fetch(`${origin}/valid`, {
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ok");
    }
    await valid();
    let rejected = false;
    try {
      const response = await client.fetch(`${origin}/malformed`, {
        signal: AbortSignal.timeout(2000),
      });
      await response.text();
    } catch (error) {
      assert.notEqual(
        error.name,
        "TimeoutError",
        "A timeout is not a security rejection",
      );
      assert.notEqual(
        error.name,
        "AbortError",
        "An aborted request is not a security rejection",
      );
      rejected = true;
    }
    assert.ok(rejected, "Malformed response must be rejected");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await valid();
    assert.deepEqual(requests, [
      "GET /valid HTTP/1.1",
      "GET /malformed HTTP/1.1",
      "GET /valid HTTP/1.1",
    ]);
    console.log(
      JSON.stringify({
        phase: "passed",
        owner,
        version: client.version,
        node: process.version,
        rejected,
        survived: true,
        requests,
        encoding,
      }),
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

if (process.argv[2] === "--worker") {
  await worker(process.argv[3]);
} else {
  const env = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const results = [];
  for (const owner of ["api", "jsdom", "node"]) {
    const child = spawnSync(process.execPath, [self, "--worker", owner], {
      env,
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 256 * 1024,
    });
    const events = (child.stdout ?? "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const passed =
      !child.error &&
      child.status === 0 &&
      events.some((event) => event.phase === "passed" && event.survived);
    results.push({
      owner,
      passed,
      exitCode: child.status,
      signal: child.signal,
      error: child.error?.message,
      events,
      stderr: child.stderr,
    });
  }
  console.log(
    JSON.stringify(
      {
        node: process.version,
        passed: results.every((result) => result.passed),
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}
