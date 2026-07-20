import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "server.ts"),
  "utf8",
);

describe("Telefun OpenAI server wiring", () => {
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
    expect(serverSource).toContain("handleInternalScoringRequest(req, res)");
    expect(
      serverSource.indexOf("handleInternalScoringRequest(req, res)"),
    ).toBeLessThan(serverSource.indexOf('if (req.url === "/health")'));
  });
});
