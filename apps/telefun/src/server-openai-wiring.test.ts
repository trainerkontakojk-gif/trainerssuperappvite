import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(sourceDir, "server.ts"), "utf8");

describe("Telefun Gemini-only server wiring", () => {
  it("wires the HTTP broker to a cleanup-only facade rather than a creation manager", () => {
    expect(serverSource).toContain("createOpenAIWebRtcHttpHandler({");
    expect(serverSource).toContain("createWebRtcCleanupManager({");
    expect(serverSource).toContain("createOpenAiCallCleanupClient({");
    expect(serverSource).toContain("manager: openAIWebRtcManager");
    expect(serverSource).toContain("isOpenAIWebRtcRequest(req)");
    expect(serverSource).not.toContain("createWebRtcCallManager({");
    expect(serverSource).not.toContain("createOpenAiCallsClient({");
    expect(serverSource).not.toContain("TELEFUN_OPENAI_WEBRTC_POC_ENABLED");
    expect(serverSource).not.toContain(
      "TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS",
    );
    expect(serverSource).not.toContain(
      "TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS",
    );
  });

  it("contains no active OpenAI WebSocket adapter, sideband, or usage wiring", () => {
    expect(serverSource).not.toContain("OpenAIRealtimeAdapter");
    expect(serverSource).not.toContain("createOpenAIAdapter");
    expect(serverSource).not.toContain("createOpenAIUsageAccumulator");
    expect(serverSource).not.toContain("flushOpenAIRealtimeUsage");
    expect(serverSource).not.toContain("createSidebandClient");
    expect(serverSource).not.toContain("TELEFUN_OPENAI_ENABLED");
  });

  it("keeps health Gemini-derived and preserves the authenticated internal compatibility endpoint ordering", () => {
    const healthBranch = serverSource.slice(
      serverSource.indexOf('if (req.url === "/health")'),
      serverSource.indexOf("const wss = new WebSocketServer"),
    );
    expect(healthBranch).toContain("buildTelefunHealthPayload(");
    expect(healthBranch).not.toContain("openAIEnabled");
    expect(healthBranch).not.toContain("openAIConfigured");
    expect(
      serverSource.indexOf(
        "runHttpHandler(handleInternalScoringRequest, req, res)",
      ),
    ).toBeLessThan(serverSource.indexOf('if (req.url === "/health")'));
  });
});
