import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createKetikReviewWorker,
  parseKetikWorkerConfig,
} from "./ketik-review-worker-runtime";

export function main() {
  const config = parseKetikWorkerConfig(process.env);
  const runtime = createKetikReviewWorker(config);
  // Internal health only; no prompts, IDs, lease tokens, credentials or raw errors.
  const health = createServer((req, res) => {
    if (req.url !== "/health" || req.method !== "GET") {
      res.writeHead(404);
      res.end();
      return;
    }
    const snapshot = runtime.health();
    res.writeHead(snapshot.healthy ? 200 : 503, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify(snapshot));
  });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    let code = 0;
    try {
      await runtime.shutdown();
    } catch {
      console.error(
        JSON.stringify({
          event: "ketik_review_worker.shutdown_recovery_deferred",
        }),
      );
      code = 1;
    }
    health.close();
    process.exit(code);
  };
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
  health.on("error", () => {
    console.error(
      JSON.stringify({ event: "ketik_review_worker.health_failed" }),
    );
    process.exit(1);
  });
  health.listen(config.healthPort, "127.0.0.1", () => {
    runtime.start();
    const address = health.address();
    console.log(
      JSON.stringify({
        event: "ketik_review_worker.started",
        healthPort:
          address && typeof address !== "string" ? address.port : null,
      }),
    );
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch {
    console.error(
      JSON.stringify({ event: "ketik_review_worker.config_rejected" }),
    );
    process.exit(1);
  }
}
