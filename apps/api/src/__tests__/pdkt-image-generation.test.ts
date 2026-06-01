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
  });

  it("should continue with no attachments if AI image generation fails", async () => {
    vi.mocked(pdktImageGen.generatePdktScenarioImages).mockResolvedValueOnce({
      success: false,
      images: [],
      error: "AI error",
    });

    const result = await initializeEmailSession(mockConfig);

    expect(result.success).toBe(true); // Should NOT fail the session
    expect(result.message?.attachments).toHaveLength(0);
    expect(result.message?.attachmentSource).toBe("none");
  });
});
