import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(sourceDir, "server.ts"), "utf8");
const dbSource = readFileSync(join(sourceDir, "db.ts"), "utf8");

describe("Telefun OpenAI server wiring", () => {
  it("registers the additive, default-off WebRTC broker without replacing the WS adapter", () => {
    expect(serverSource).toContain("createOpenAIWebRtcHttpHandler({");
    expect(serverSource).toContain("TELEFUN_OPENAI_WEBRTC_POC_ENABLED");
    expect(serverSource).toContain("TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS");
    expect(serverSource).toContain("nodeEnv: env.NODE_ENV");
    expect(serverSource).toContain("isOpenAIWebRtcRequest(req)");
    expect(serverSource).toContain("createWebRtcCallManager({");
    expect(serverSource).toContain("createTelefunWebRtcDb()");
    expect(serverSource).toContain("db: openAIWebRtcDb");
    expect(serverSource).toContain("createOpenAiCallsClient({");
    expect(serverSource).toContain("createSidebandClient({");
    expect(serverSource).toContain("openAIWebRtcManager.shutdown()");
    expect(serverSource).not.toContain("webRtcShutdown.finally");
    expect(serverSource).toContain("onDiagnostic: callbacks.onDiagnostic");
    expect(serverSource).toContain("onSidebandDiagnostic: (diagnostic)");
    expect(serverSource).toContain("new OpenAIRealtimeAdapter({");
    expect(serverSource).toContain("runHttpHandler(openAIWebRtcHandler, req, res)");
    expect(serverSource).toContain('"Internal server error"');
  });

  it("wires strict WebRTC persistence with the authenticated owner", () => {
    expect(serverSource).not.toContain("updateSession: updateWebRtcSession");
    expect(dbSource).toContain("createTelefunWebRtcDb");
    expect(dbSource).toContain("updateWebRtcSessionWithClient");
    expect(dbSource).toContain('eq("id", sessionId)');
    expect(dbSource).toContain('eq("user_id", userId)');
    expect(dbSource).toContain('eq("status", "active")');
    expect(dbSource).toContain('select("id, status")');
    expect(dbSource).toContain('if (data?.id === sessionId) return;');
    expect(dbSource).toContain('current.data?.id === sessionId');
    expect(dbSource).toContain(
      '(current.data.status === "completed" || current.data.status === "failed")',
    );
    expect(dbSource).not.toContain('updateSession(sessionId, userId');
  });

  it("routes OpenAI only through its adapter using authenticated user context", () => {
    expect(serverSource).toContain("new OpenAIRealtimeAdapter({");
    expect(serverSource).toContain("apiKey: openAIKey");
    expect(serverSource).toContain("userId");
    expect(serverSource).toContain("createOpenAIAdapter");
    expect(serverSource).toContain("openAIEnabled: env.TELEFUN_OPENAI_ENABLED");
    expect(serverSource).toContain(
      "openAIConfigured: Boolean(env.OPENAI_API_KEY)",
    );
    expect(serverSource).not.toContain("OPENAI_API_KEY.slice");
    expect(serverSource).not.toContain("authResult.userEmail");
    expect(serverSource).toContain("buildSafeOpenAIDiagnosticLogMetadata(");
  });

  it("creates native ws sockets from adapter-supplied URL and headers", () => {
    expect(serverSource).toContain("new WebSocket(url, { headers })");
    expect(serverSource).not.toContain("api.openai.com/v1/realtime?model=${");
  });

  it("serves non-billable provider readiness without opening a health socket", () => {
    expect(serverSource).toContain("buildTelefunHealthPayload(");
    const healthBranch = serverSource.slice(
      serverSource.indexOf('if (req.url === "/health")'),
      serverSource.indexOf("const wss = new WebSocketServer"),
    );
    expect(healthBranch).not.toContain("new WebSocket");
    expect(healthBranch).not.toContain("OPENAI_API_KEY}");
    expect(healthBranch).not.toContain("GEMINI_API_KEY}");
  });

  it("routes OpenAI response usage into the dedicated accumulator and persistence path", () => {
    expect(serverSource).toContain("createOpenAIUsageAccumulator()");
    expect(serverSource).toContain(
      "observeOpenAIUsage(openAIUsageAccumulator, observation, observedAtMs)",
    );
    expect(serverSource).toContain("summarizeOpenAIUsageAccumulator(");
    expect(serverSource).toContain("flushOpenAIRealtimeUsage(");
    expect(serverSource).toContain('activeProvider !== "openai"');
    expect(serverSource).not.toContain("OpenAI usage observed");
  });

  it("wires the authenticated internal assessment route before public health handling", () => {
    expect(serverSource).toContain(
      "runHttpHandler(handleInternalScoringRequest, req, res)",
    );
    expect(
      serverSource.indexOf("runHttpHandler(handleInternalScoringRequest, req, res)"),
    ).toBeLessThan(serverSource.indexOf('if (req.url === "/health")'));
  });
});
