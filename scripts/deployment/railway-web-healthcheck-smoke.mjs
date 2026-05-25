import { spawn } from "node:child_process";
import http from "node:http";

const TEST_PORT = 9876;
const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

function poll(url, timeoutMs, intervalMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        reject(new Error(`Healthcheck poll timed out after ${timeoutMs}ms on ${url}`));
        return;
      }
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve(res);
          } else if (elapsed > timeoutMs) {
            reject(new Error(`Unexpected status ${res.statusCode} after ${elapsed}ms`));
          } else {
            setTimeout(check, intervalMs);
          }
        })
        .on("error", () => {
          if (elapsed > timeoutMs) {
            reject(new Error(`Server not ready after ${timeoutMs}ms`));
          } else {
            setTimeout(check, intervalMs);
          }
        });
    };
    check();
  });
}

async function main() {
  console.log(`[smoke] Starting web server on PORT=${TEST_PORT}...`);

  const child = spawn("pnpm", ["--filter", "@trainers/web", "start"], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let cleanupDone = false;
  const cleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* best-effort */
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* best-effort */
      }
    }, 3000);
  };

  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  child.on("error", (err) => {
    console.error(`[smoke] Failed to start child process: ${err.message}`);
    process.exit(1);
  });

  try {
    console.log(`[smoke] Polling http://localhost:${TEST_PORT}/ ...`);
    await poll(`http://localhost:${TEST_PORT}/`, MAX_WAIT_MS, POLL_INTERVAL_MS);
    console.log(`[smoke] PASS: / returned HTTP 200 on PORT=${TEST_PORT}`);
  } catch (err) {
    console.error(`[smoke] FAIL: ${err.message}`);
    cleanup();
    process.exit(1);
  }

  cleanup();
  process.exit(0);
}

main();
