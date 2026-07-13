import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn(),
}));

vi.mock("../lib/deepseek", () => ({
  generateDeepSeekContent: vi.fn(),
}));

vi.mock("../lib/ai-models", () => ({
  resolveModelProvider: vi.fn(),
}));

import {
  generateConsumerResponse,
  getScenarios,
  getConsumerTypes,
  SessionTimingContext,
} from "../services/ketik/consumer-response";
import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { generateDeepSeekContent } from "../lib/deepseek";
import { resolveModelProvider } from "../lib/ai-models";
import type { KetikScenario, ChatMessage } from "@trainers/types";

const mockGeminiContent = vi.mocked(generateGeminiContent);
const mockOpenRouterContent = vi.mocked(generateOpenRouterContent);
const mockDeepSeekContent = vi.mocked(generateDeepSeekContent);
const mockResolveProvider = vi.mocked(resolveModelProvider);

function buildConfig(overrides: Record<string, any> = {}) {
  return {
    scenarios: getScenarios(),
    consumerType: getConsumerTypes()[0],
    identity: { name: "Budi Santoso", city: "Jakarta", phone: "08123456789" },
    selectedModel: "gemini-3.1-flash-lite",
    simulationDuration: 10,
    responsePacingMode: "normal",
    ...overrides,
  };
}

const testScenario: KetikScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Konsumen diteror oleh pinjol ilegal.",
  isActive: true,
};

const testHistory: ChatMessage[] = [
  {
    id: "msg-1",
    sender: "agent",
    text: "Halo, ada yang bisa saya bantu?",
    timestamp: new Date().toISOString(),
  },
];

function mockGeminiSuccess(text: string) {
  mockGeminiContent.mockResolvedValueOnce({
    success: true,
    text,
  });
}

function mockOpenRouterSuccess(text: string) {
  mockOpenRouterContent.mockResolvedValueOnce({
    success: true,
    text,
  });
}

function mockDeepSeekSuccess(text: string) {
  mockDeepSeekContent.mockResolvedValueOnce({
    success: true,
    text,
  });
}

function setupGeminiProvider() {
  mockResolveProvider.mockReturnValue({
    modelId: "gemini-3.1-flash-lite",
    provider: "gemini",
    isFallback: false,
    timeoutMs: 120_000,
  });
}

function setupOpenRouterProvider() {
  mockResolveProvider.mockReturnValue({
    modelId: "openrouter/deepseek",
    provider: "openrouter",
    isFallback: false,
    timeoutMs: 120_000,
  });
}

function setupDeepSeekProvider() {
  mockResolveProvider.mockReturnValue({
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    isFallback: false,
    timeoutMs: 180_000,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateConsumerResponse", () => {
  describe("provider routing", () => {
    it("calls Gemini when provider is gemini", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Saya mau lapor pinjol ilegal.");
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("Saya mau lapor pinjol ilegal.");
      expect(mockGeminiContent).toHaveBeenCalledTimes(1);
      expect(mockOpenRouterContent).not.toHaveBeenCalled();
    });

    it("calls OpenRouter when provider is openrouter", async () => {
      setupOpenRouterProvider();
      mockOpenRouterSuccess("Saya mau lapor penipuan.");
      const result = await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("Saya mau lapor penipuan.");
      expect(mockOpenRouterContent).toHaveBeenCalledTimes(1);
      expect(mockGeminiContent).not.toHaveBeenCalled();
    });

    it("calls DeepSeek when provider is deepseek", async () => {
      setupDeepSeekProvider();
      mockDeepSeekSuccess("Saya mau lapor masalah saya.");
      const result = await generateConsumerResponse(
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("Saya mau lapor masalah saya.");
      expect(mockDeepSeekContent).toHaveBeenCalledTimes(1);
      expect(mockGeminiContent).not.toHaveBeenCalled();
      expect(mockOpenRouterContent).not.toHaveBeenCalled();
    });
  });

  describe("timing context", () => {
    it("generates near-end instruction when remaining is below nearEndThreshold", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Baik, terima kasih atas infonya.");
      const timing: SessionTimingContext = {
        remainingSeconds: 15,
        totalDurationSeconds: 600,
        elapsedSeconds: 585,
      };
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 10 }),
        testScenario,
        testHistory,
        undefined,
        undefined,
        timing,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("fase akhir");
      expect(callArgs.systemInstruction).toContain("BOLEH");
    });

    it("generates wrap-up instruction when remaining is below wrapUpThreshold", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Baik, saya tunggu.");
      const timing: SessionTimingContext = {
        remainingSeconds: 60,
        totalDurationSeconds: 600,
        elapsedSeconds: 540,
      };
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 10 }),
        testScenario,
        testHistory,
        undefined,
        undefined,
        timing,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("mendekati akhir");
      expect(callArgs.systemInstruction).not.toContain("fase akhir");
    });

    it("generates still-long instruction when remaining is above thresholds", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Halo, saya mau mengadu.");
      const timing: SessionTimingContext = {
        remainingSeconds: 300,
        totalDurationSeconds: 600,
        elapsedSeconds: 300,
      };
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 10 }),
        testScenario,
        testHistory,
        undefined,
        undefined,
        timing,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("masih panjang");
    });

    it("generates default timing when remainingSeconds is NaN", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Halo, saya mau mengadu.");
      const timing: SessionTimingContext = {
        remainingSeconds: NaN,
        totalDurationSeconds: 600,
      };
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 10 }),
        testScenario,
        testHistory,
        undefined,
        undefined,
        timing,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain("fase akhir");
      expect(callArgs.systemInstruction).toContain("dibatasi maksimal");
    });

    it("generates default timing when no timing context provided", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Halo, saya mau mengadu.");
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 15 }),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("dibatasi maksimal 15");
    });

    it("returns empty timing instruction when simulationDuration is 0", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Halo.");
      const result = await generateConsumerResponse(
        buildConfig({ simulationDuration: 0 }),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain("STATUS WAKTU");
    });
  });

  describe("strict script mode (OpenRouter + hasScript)", () => {
    it("applies stricter system instruction for OpenRouter with script", async () => {
      setupOpenRouterProvider();
      mockOpenRouterSuccess("Saya mengikuti skrip yang diberikan.");
      const scenarioWithScript: KetikScenario = {
        ...testScenario,
        script: "Agent: Halo\nConsumer: Saya mau lapor",
      };
      const result = await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        scenarioWithScript,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockOpenRouterContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("MODEL SCRIPT MODE");
      expect(callArgs.systemInstruction).toContain("WAJIB PATUH");
    });

    it("uses lower temperature for OpenRouter with strictScriptMode", async () => {
      setupOpenRouterProvider();
      mockOpenRouterSuccess("OK.");
      const scenarioWithScript: KetikScenario = {
        ...testScenario,
        script: "A: Halo\nC: Halo juga",
      };
      const result = await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        scenarioWithScript,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockOpenRouterContent.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.55);
    });

    it("uses 0.55 for OpenRouter without a script", async () => {
      setupOpenRouterProvider();
      mockOpenRouterSuccess("OK tanpa script.");
      await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        testScenario,
        testHistory,
      );
      expect(mockOpenRouterContent.mock.calls[0][0].temperature).toBe(0.55);
      expect(mockOpenRouterContent.mock.calls[0][0].systemInstruction).not.toContain(
        "MODEL SCRIPT MODE",
      );
    });

    it("uses 0.55 for DeepSeek with and without a script", async () => {
      setupDeepSeekProvider();
      mockDeepSeekSuccess("OK tanpa script.");
      await generateConsumerResponse(
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
        testScenario,
        testHistory,
      );
      expect(mockDeepSeekContent.mock.calls[0][0].temperature).toBe(0.55);
      expect(mockDeepSeekContent.mock.calls[0][0].systemInstruction).not.toContain(
        "MODEL SCRIPT MODE",
      );

      vi.clearAllMocks();
      setupDeepSeekProvider();
      mockDeepSeekSuccess("OK dengan script.");
      await generateConsumerResponse(
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
        { ...testScenario, script: "Consumer: Saya ingin melapor." },
        testHistory,
      );
      expect(mockDeepSeekContent.mock.calls[0][0].temperature).toBe(0.55);
      expect(mockDeepSeekContent.mock.calls[0][0].systemInstruction).toContain(
        "MODEL SCRIPT MODE",
      );
    });

    it("does not apply strict mode for Gemini even with script", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Saya mau lapor.");
      const scenarioWithScript: KetikScenario = {
        ...testScenario,
        script: "Agent: Halo\nConsumer: Saya mau lapor",
      };
      const result = await generateConsumerResponse(
        buildConfig(),
        scenarioWithScript,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).not.toContain(
        "MODEL SCRIPT MODE",
      );
      expect(callArgs.temperature).toBe(0.82);
    });
  });

  describe("NO_RESPONSE behavior", () => {
    it("returns [NO_RESPONSE] when AI returns empty string", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("");
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("[NO_RESPONSE]");
    });

    it("returns [NO_RESPONSE] when AI returns only whitespace", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("   ");
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("[NO_RESPONSE]");
    });

    it("strips [NO_RESPONSE] tag but returns content when there is other text", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Terima kasih [NO_RESPONSE]");
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("Terima kasih");
    });

    it("returns non-empty consumer text as-is when valid", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Baik, saya tunggu konfirmasinya.");
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("Baik, saya tunggu konfirmasinya.");
    });
  });

  describe("malformed provider response", () => {
    it("handles provider returning non-string response text", async () => {
      setupGeminiProvider();
      (mockGeminiContent as any).mockResolvedValueOnce({
        success: true,
        text: 12345,
      });
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("[NO_RESPONSE]");
    });

    it("handles provider returning undefined text", async () => {
      setupGeminiProvider();
      (mockGeminiContent as any).mockResolvedValueOnce({
        success: true,
        text: undefined,
      });
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe("[NO_RESPONSE]");
    });
  });

  describe("provider failure", () => {
    it("returns error when provider returns success: false", async () => {
      setupGeminiProvider();
      mockGeminiContent.mockResolvedValueOnce({
        success: false,
        error: "Model overloaded.",
      });
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Model overloaded.");
    });

    it("returns generic error when provider returns success: false without message", async () => {
      setupOpenRouterProvider();
      mockOpenRouterContent.mockResolvedValueOnce({
        success: false,
      });
      const result = await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("AI tidak tersedia.");
    });

    it("catches exceptions and returns error", async () => {
      setupGeminiProvider();
      mockGeminiContent.mockRejectedValueOnce(new Error("Network error"));
      const result = await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Gangguan AI. Coba lagi.");
    });
  });

  describe("AI usage context passthrough", () => {
    it("passes usageContext and userId to Gemini call", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("OK.");
      const usageContext = {
        module: "ketik" as const,
        action: "simulasi" as const,
      };
      await generateConsumerResponse(
        buildConfig(),
        testScenario,
        testHistory,
        usageContext,
        "user-123",
      );
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.usageContext).toEqual(usageContext);
      expect(callArgs.userId).toBe("user-123");
    });

    it("passes usageContext and userId to OpenRouter call", async () => {
      setupOpenRouterProvider();
      mockOpenRouterSuccess("OK.");
      const usageContext = {
        module: "ketik" as const,
        action: "simulasi" as const,
      };
      await generateConsumerResponse(
        buildConfig({ selectedModel: "openrouter/deepseek" }),
        testScenario,
        testHistory,
        usageContext,
        "user-456",
      );
      const callArgs = mockOpenRouterContent.mock.calls[0][0];
      expect(callArgs.usageContext).toEqual(usageContext);
      expect(callArgs.userId).toBe("user-456");
    });
  });

  describe("script and image instructions", () => {
    it("includes script instruction in system prompt when scenario has script", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Saya ikuti skrip.");
      const scenarioWithScript: KetikScenario = {
        ...testScenario,
        script: "Konsumen: Saya diteror pinjol.",
      };
      const result = await generateConsumerResponse(
        buildConfig(),
        scenarioWithScript,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("SKRIP PERCAKAPAN");
      expect(callArgs.systemInstruction).toContain(scenarioWithScript.script!);
    });

    it("includes image count instruction when scenario has images", async () => {
      setupGeminiProvider();
      mockGeminiSuccess("Ini buktinya.");
      const scenarioWithImages: KetikScenario = {
        ...testScenario,
        images: ["data:image/png;base64,a"],
      };
      const result = await generateConsumerResponse(
        buildConfig(),
        scenarioWithImages,
        testHistory,
      );
      expect(result.success).toBe(true);
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toContain("lampiran gambar");
      expect(callArgs.systemInstruction).toContain("indeks 0 sampai 0");
    });
  });
});
