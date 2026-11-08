/* global process, URL, Request, Response */
// Test-only real API bootstrap: local database, fixture provider, no remote
// sockets or inherited .env. This intentionally holds one evaluation so its
// owning child process can be killed after the database claim is committed.
import "./geminiProxyBoot.mjs";

if (process.env.NODE_ENV !== "test") throw new Error("E2E bootstrap only");
const database = new URL(process.env.VITE_SUPABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(database.hostname))
  throw new Error("E2E database must be loopback");
const mode = process.env.E2E_PDKT_CRASH_MODE;
if (mode !== "hold" && mode !== "complete")
  throw new Error("Invalid fixture mode");
const evaluation = JSON.parse(
  process.env.E2E_PDKT_EVALUATION_FIXTURE_JSON ?? "null",
);
if (!evaluation || typeof evaluation.feedback !== "string")
  throw new Error("Missing declared evaluation fixture");

const guardedFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (new URL(request.url).hostname === "generativelanguage.googleapis.com") {
    process.stdout.write("[e2e-pdkt-provider]\n");
    if (mode === "hold") return new Promise(() => {});
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: JSON.stringify(evaluation) }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });
  }
  return guardedFetch(request);
};

await import("../../../../apps/api/src/index.ts");
