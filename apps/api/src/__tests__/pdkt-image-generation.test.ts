import { describe, it, expect, vi, beforeEach } from "vitest";
import { initializeEmailSession } from "../services/pdkt-service";
import * as pdktImageGen from "../services/pdkt/image-generation";
import { PdktSessionConfig, PdktScenario } from "@trainers/types";

// Mock AI libraries
vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn().mockResolvedValue({ success: true, text: JSON.stringify({ subject: "Test Subject", body: "word ".repeat(600) }) }),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn().mockResolvedValue({ success: true, text: JSON.stringify({ subject: "Test Subject", body: "word ".repeat(600) }) }),
}));

vi.mock("../services/pdkt/image-generation", () => ({
  generatePdktScenarioImages: vi.fn().mockResolvedValue({ success: true, images: ["data:image/png;base64,ai-generated-image"] }),
}));

describe("PDKT Image Generation Integration", () => {
  const mockScenario: PdktScenario = {
    id: "test",
    category: "Test",
    title: "Test Issue",
    description: "Test description",
    isActive: true,
  };

  const mockConfig: PdktSessionConfig = {
    scenarios: [mockScenario],
    consumerType: { id: "ramah", name: "Ramah", description: "Sopan" },
    identity: { name: "Budi", email: "budi@mail.com", city: "Jakarta", bodyName: "Budi" },
    enableImageGeneration: true,
    selectedModel: "gemini-3.1-flash-lite",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate AI images when enableImageGeneration is true and no manual attachments", async () => {
    const result = await initializeEmailSession(mockConfig);

    expect(result.success).toBe(true);
    expect(pdktImageGen.generatePdktScenarioImages).toHaveBeenCalled();
    expect(result.message?.attachments).toContain("data:image/png;base64,ai-generated-image");
    expect(result.message?.attachmentSource).toBe("ai");
  });

  it("should prioritize manual attachments over AI generation", async () => {
    const scenarioWithManual: PdktScenario = {
      ...mockScenario,
      attachmentImages: ["data:image/png;base64,manual-image"],
    };
    const configWithManual = { ...mockConfig, scenarios: [scenarioWithManual] };

    const result = await initializeEmailSession(configWithManual);

    expect(result.success).toBe(true);
    expect(pdktImageGen.generatePdktScenarioImages).not.toHaveBeenCalled();
    expect(result.message?.attachments).toContain("data:image/png;base64,manual-image");
    expect(result.message?.attachments).not.toContain("data:image/png;base64,ai-generated-image");
    expect(result.message?.attachmentSource).toBe("manual");
  });

  it("should skip AI image generation when enableImageGeneration is false", async () => {
    const configDisabled = { ...mockConfig, enableImageGeneration: false };

    const result = await initializeEmailSession(configDisabled);

    expect(result.success).toBe(true);
    expect(pdktImageGen.generatePdktScenarioImages).not.toHaveBeenCalled();
    expect(result.message?.attachments).toHaveLength(0);
    expect(result.message?.attachmentSource).toBe("none");
    expect((result.message as any)?.attachmentDiagnostics).toEqual(
      expect.objectContaining({
        source: "none",
        status: "skipped",
        reason: "disabled",
      }),
    );
  });

  it("should continue with no attachments if AI image generation fails", async () => {
    vi.mocked(pdktImageGen.generatePdktScenarioImages).mockResolvedValueOnce({
      success: false,
      images: [],
      warning: "AI error",
      diagnostics: {
        attemptedModel: "gemini-3.1-flash-image",
        provider: "gemini",
        imageGenerationMode: "native",
        reason: "provider-error",
        error: "AI error",
      },
    });

    const result = await initializeEmailSession(mockConfig);

    expect(result.success).toBe(true); // Should NOT fail the session
    expect(result.message?.attachments).toHaveLength(0);
    expect(result.message?.attachmentSource).toBe("none");
  });

  it("should capture and forward attachmentWarning if AI generation returns success: false with warning", async () => {
    vi.mocked(pdktImageGen.generatePdktScenarioImages).mockResolvedValueOnce({
      success: false,
      images: [],
      warning: "Model tidak mengembalikan gambar valid.",
      diagnostics: {
        attemptedModel: "gemini-3.1-flash-image",
        provider: "gemini",
        imageGenerationMode: "native",
        reason: "empty-output",
      },
    });

    const result = await initializeEmailSession(mockConfig);

    expect(result.success).toBe(true);
    expect(result.message?.attachments).toHaveLength(0);
    expect(result.message?.attachmentSource).toBe("none");
    expect(result.message?.attachmentWarning).toBeUndefined();
    expect((result.message as any)?.attachmentDiagnostics).toEqual(
      expect.objectContaining({
        source: "none",
        status: "failed",
        reason: "empty-output",
        message: "Model tidak mengembalikan gambar valid.",
      }),
    );
  });

  describe("generatePdktScenarioImages unit tests", () => {
    it("returns correct diagnostics for disabled image generation", async () => {
      const { generatePdktScenarioImages } = await vi.importActual<typeof import("../services/pdkt/image-generation")>(
        "../services/pdkt/image-generation"
      );
      const configDisabled = { ...mockConfig, enableImageGeneration: false };
      const result = await generatePdktScenarioImages(
        mockScenario,
        { subject: "Subjek", body: "Body email" },
        configDisabled
      );

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(0);
      expect(result.diagnostics.reason).toBe("disabled");
    });

    it("returns correct diagnostics and fallback when model has no image capability", async () => {
      const { generatePdktScenarioImages } = await vi.importActual<typeof import("../services/pdkt/image-generation")>(
        "../services/pdkt/image-generation"
      );
      const configNoImageCapability = { ...mockConfig, selectedModel: "deepseek-v4-flash" };
      
      const { generateGeminiContent } = await import("../lib/gemini");
      vi.mocked(generateGeminiContent).mockResolvedValueOnce({
        success: true,
        images: ["data:image/png;base64,fallback-image"],
      } as any);

      const result = await generatePdktScenarioImages(
        mockScenario,
        { subject: "Subjek", body: "Body email" },
        configNoImageCapability
      );

      expect(result.success).toBe(true);
      expect(result.images).toContain("data:image/png;base64,fallback-image");
      expect(result.diagnostics.attemptedModel).toBe("gemini-3.1-flash-image");
      expect(result.diagnostics.imageGenerationMode).toBe("native");
    });
  });
});
