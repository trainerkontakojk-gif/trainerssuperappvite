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

vi.mock("../lib/ai-json", () => ({
  parseJsonFromModelText: vi.fn(),
}));

vi.mock("../services/pdkt-email-policy", async () => {
  const actual: any = await vi.importActual("../services/pdkt-email-policy");
  return {
    ...actual,
    validatePdktEmailPolicyCompliance: vi.fn(),
  };
});

import { generateGeminiContent } from "../lib/gemini";
import { generateOpenRouterContent } from "../lib/openrouter";
import { generateDeepSeekContent } from "../lib/deepseek";
import { resolveModelProvider } from "../lib/ai-models";
import { parseJsonFromModelText } from "../lib/ai-json";
import { validatePdktEmailPolicyCompliance } from "../services/pdkt-email-policy";
import {
  generateScenarioEmailTemplate,
  initializeEmailSession,
  resolvePdktGenerationConfig,
} from "../services/pdkt/session-service";
import { resolvePdktRecipientTargets } from "../services/pdkt/recipient-targets";
import type {
  PdktScenario,
  PdktSessionConfig,
  PdktConsumerType,
  PdktIdentity,
} from "@trainers/types";

const mockGeminiContent = vi.mocked(generateGeminiContent);
const mockOpenRouterContent = vi.mocked(generateOpenRouterContent);
const mockDeepSeekContent = vi.mocked(generateDeepSeekContent);
const mockResolveProvider = vi.mocked(resolveModelProvider);
const mockParseJson = vi.mocked(parseJsonFromModelText);
const mockValidateCompliance = vi.mocked(validatePdktEmailPolicyCompliance);

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

const mockIdentity: PdktIdentity = {
  name: "Budi Santoso",
  email: "budi@mail.com",
  city: "Jakarta",
  bodyName: "Budi",
};

const mockPinjolScenario: PdktScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Konsumen diteror pinjol ilegal.",
  isActive: true,
  isLicensed: false,
};

const mockConsumerType: PdktConsumerType = {
  id: "ramah",
  name: "Ramah & Kooperatif",
  description: "Konsumen sangat ramah.",
  difficulty: "Easy",
  tone: "Ramah",
};

function buildBody(wordCount: number): string {
  return Array.from({ length: wordCount }, () => "kata").join(" ");
}

function buildConfig(overrides: Record<string, any> = {}): PdktSessionConfig {
  return {
    scenarios: [mockPinjolScenario],
    consumerType: mockConsumerType,
    identity: mockIdentity,
    enableImageGeneration: false,
    selectedModel: "gemini-3.1-flash-lite",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
    ...overrides,
  };
}

beforeEach(() => {
  // Full reset to clear mockResolvedValueOnce queues from prior tests
  mockGeminiContent.mockReset();
  mockOpenRouterContent.mockReset();
  mockDeepSeekContent.mockReset();
  mockResolveProvider.mockReset();
  mockParseJson.mockReset();
  mockValidateCompliance.mockReset();
  mockValidateCompliance.mockReturnValue([]);
  setupGeminiProvider();
});



describe("generateScenarioEmailTemplate", () => {
  describe("template path (alwaysUseSampleEmail)", () => {
    it("returns resolved template when scenario has alwaysUseSampleEmail", async () => {
      const scenarioWithTemplate: PdktScenario = {
        ...mockPinjolScenario,
        alwaysUseSampleEmail: true,
        sampleEmailTemplate: {
          subject: "Pengaduan [Nama Nasabah]",
          body: "Saya [Nama Pengirim] mengadu. {{company_name}} telah merugikan saya. " + buildBody(600),
        },
      };
      const result = await generateScenarioEmailTemplate(
        scenarioWithTemplate,
        buildConfig(),
      );
      expect(result.success).toBe(true);
      expect(result.subject).toBe("Pengaduan");
      expect(result.body).toContain("mengadu");
      expect(mockGeminiContent).not.toHaveBeenCalled();
    });

    it("returns error when template has leftover placeholders after resolution", async () => {
      const scenarioWithTemplate: PdktScenario = {
        ...mockPinjolScenario,
        alwaysUseSampleEmail: true,
        sampleEmailTemplate: {
          subject: "Test",
          body: "Halo [UNRESOLVED_PLACEHOLDER]",
        },
      };
      const result = await generateScenarioEmailTemplate(
        scenarioWithTemplate,
        buildConfig(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("placeholder");
    });
  });

  describe("AI generation first-attempt success", () => {
    it("returns success when AI response meets all criteria", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "Pengaduan Saya", body }),
        
      });
      mockParseJson.mockReturnValue({ subject: "Pengaduan Saya", body });
      mockValidateCompliance.mockReturnValue([]);
      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(true);
      expect(result.subject).toBe("Pengaduan Saya");
      expect(result.body?.split(/\s+/).filter(Boolean).length).toBe(600);
    });

    it("passes usageContext and userId to AI call", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "Test", body }),
        
      });
      mockParseJson.mockReturnValue({ subject: "Test", body });
      mockValidateCompliance.mockReturnValue([]);

      const usageContext = { module: "pdkt" as const, action: "generate_template" as const };
      await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
        usageContext,
        "user-789",
      );
      const callArgs = mockGeminiContent.mock.calls[0][0];
      expect(callArgs.usageContext).toEqual(usageContext);
      expect(callArgs.userId).toBe("user-789");
    });
  });

  describe("validation-triggered retry", () => {
    it("retries when word count is below 500 and succeeds on retry", async () => {
      const shortBody = buildBody(100);
      const longBody = buildBody(600);
      mockGeminiContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "S1", body: shortBody }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "S2", body: longBody }),
          
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "S1", body: shortBody })
        .mockReturnValueOnce({ subject: "S2", body: longBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);
      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(true);
      expect(mockGeminiContent).toHaveBeenCalledTimes(2);
      const retryPrompt = mockGeminiContent.mock.calls[1][0] as any;
      expect(retryPrompt.contents?.[0]?.parts?.[0]?.text).toContain("REVISI");
      expect(retryPrompt.contents?.[0]?.parts?.[0]?.text).toContain("terlalu pendek");
    });

    it("retries when violations exist and succeeds on retry", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V1", body }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V2", body }),
          
        });
      mockParseJson.mockReset()
        .mockReturnValueOnce({ subject: "V1", body })
        .mockReturnValueOnce({ subject: "V2", body });
      mockValidateCompliance.mockReset()
        .mockReturnValueOnce(["Nama bocor"])
        .mockReturnValueOnce([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(true);
      expect(mockGeminiContent).toHaveBeenCalledTimes(2);
    });

    it("retries when leftoverPlaceholders exist and succeeds on retry", async () => {
      const bodyWithUnknownVar = "Halo {{UNKNOWN_VAR}} " + buildBody(600);
      const cleanBody = buildBody(600);

      mockGeminiContent.mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "P1", body: bodyWithUnknownVar }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "P2", body: cleanBody }),
          
        });
      mockParseJson.mockReset()
        .mockReturnValueOnce({ subject: "P1", body: bodyWithUnknownVar })
        .mockReturnValueOnce({ subject: "P2", body: cleanBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(true);
      expect(mockGeminiContent).toHaveBeenCalledTimes(2);
    });
  });

  describe("retry failure fallback", () => {
    it("returns first attempt error when retry throws", async () => {
      const body = buildBody(100);
      mockGeminiContent.mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "First", body }),
          
        })
        .mockRejectedValueOnce(new Error("Retry AI error"));
      mockParseJson.mockReset().mockReturnValue({ subject: "First", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("terlalu pendek");
    });

    it("returns leftover placeholder error after retry still has them", async () => {
      const bodyWithUnknown = "Halo {{UNKNOWN_VAR}} " + buildBody(600);
      mockGeminiContent.mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "P1", body: bodyWithUnknown }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "P2", body: bodyWithUnknown }),
          
        });
      mockParseJson.mockReset()
        .mockReturnValueOnce({ subject: "P1", body: bodyWithUnknown })
        .mockReturnValueOnce({ subject: "P2", body: bodyWithUnknown });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("placeholder");
    });

    it("returns short word count error after retry still short", async () => {
      const shortBody = buildBody(100);
      mockGeminiContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "S1", body: shortBody }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "S2", body: shortBody }),
          
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "S1", body: shortBody })
        .mockReturnValueOnce({ subject: "S2", body: shortBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("terlalu pendek");
    });
  });

  describe("malformed JSON handling", () => {
    it("returns error when AI response is not valid JSON", async () => {
      mockGeminiContent.mockReset().mockResolvedValueOnce({
        success: true,
        text: "Bukan JSON sama sekali",
        
      });
      mockParseJson.mockReset().mockImplementationOnce(() => {
        throw new Error("Tidak ada data JSON valid dari model.");
      });

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Tidak ada data JSON");
    });
  });

  describe("model/provider selection", () => {
    it("uses Gemini when selectedModel is Gemini", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "Gemini Test", body }),
        
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "Gemini Test", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig({ selectedModel: "gemini-3.1-flash-lite" }),
      );
      expect(result.success).toBe(true);
      expect(mockGeminiContent).toHaveBeenCalled();
      expect(mockOpenRouterContent).not.toHaveBeenCalled();
    });

    it("uses OpenRouter when selectedModel has /", async () => {
      setupOpenRouterProvider();
      const body = buildBody(600);
      mockOpenRouterContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "OR Test", body }),
        
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "OR Test", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig({ selectedModel: "openrouter/deepseek" }),
      );
      expect(result.success).toBe(true);
      expect(mockOpenRouterContent).toHaveBeenCalled();
      expect(mockGeminiContent).not.toHaveBeenCalled();
    });

    it("uses DeepSeek when selectedModel is DeepSeek direct", async () => {
      setupDeepSeekProvider();
      const body = buildBody(600);
      mockDeepSeekContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "DeepSeek Test", body }),
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "DeepSeek Test", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
      );
      expect(result.success).toBe(true);
      expect(mockDeepSeekContent).toHaveBeenCalled();
      expect(mockGeminiContent).not.toHaveBeenCalled();
      expect(mockOpenRouterContent).not.toHaveBeenCalled();
    });

    it("allows DeepSeek direct template generation to continue even when the output is short", async () => {
      setupDeepSeekProvider();
      const shortBody = buildBody(100);
      mockDeepSeekContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "DeepSeek Template", body: shortBody }),
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "DeepSeek Template Retry", body: shortBody }),
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "DeepSeek Template", body: shortBody })
        .mockReturnValueOnce({ subject: "DeepSeek Template Retry", body: shortBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await generateScenarioEmailTemplate(
        mockPinjolScenario,
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
      );

      expect(result.success).toBe(true);
      expect(result.body?.split(/\s+/).filter(Boolean).length).toBe(100);
      expect(mockDeepSeekContent).toHaveBeenCalledTimes(2);
    });

    it("allows DeepSeek direct to continue even when the first email is still short", async () => {
      setupDeepSeekProvider();
      const shortBody = buildBody(100);
      mockDeepSeekContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "DeepSeek Short", body: shortBody }),
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "DeepSeek Short Retry", body: shortBody }),
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "DeepSeek Short", body: shortBody })
        .mockReturnValueOnce({ subject: "DeepSeek Short Retry", body: shortBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await initializeEmailSession(
        buildConfig({ selectedModel: "deepseek-v4-pro" }),
      );

      expect(result.success).toBe(true);
      expect(result.message?.body?.split(/\s+/).filter(Boolean).length).toBe(100);
      expect(mockDeepSeekContent).toHaveBeenCalledTimes(2);
    });
  });
});

describe("initializeEmailSession", () => {
  it("returns error when no scenario is provided", async () => {
    const result = await initializeEmailSession(buildConfig({ scenarios: [] }));
    expect(result.success).toBe(false);
    expect(result.error).toBe("Skenario tidak ditemukan.");
  });

  describe("forced template path", () => {
    it("returns resolved forced template message", async () => {
      const config = buildConfig({
        scenarios: [
          {
            ...mockPinjolScenario,
            alwaysUseSampleEmail: true,
            sampleEmailTemplate: {
              subject: "Pengaduan Saya",
              body: buildBody(600),
            },
          },
        ],
      });
      const result = await initializeEmailSession(config);
      expect(result.success).toBe(true);
      expect(result.message?.subject).toBe("Pengaduan Saya");
      expect(result.message?.attachmentSource).toBe("none");
    });

    it("returns error when forced template has leftover placeholders", async () => {
      const config = buildConfig({
        scenarios: [
          {
            ...mockPinjolScenario,
            alwaysUseSampleEmail: true,
            sampleEmailTemplate: {
              subject: "Test",
              body: "Halo [UNRESOLVED_PLACEHOLDER]",
            },
          },
        ],
      });
      const result = await initializeEmailSession(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain("placeholder");
    });
  });

  describe("AI generation flow", () => {
    it("returns AI-generated email when no forced template", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "AI Subject", body }),
        
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "AI Subject", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await initializeEmailSession(buildConfig());
      expect(result.success).toBe(true);
      expect(result.message?.subject).toBe("AI Subject");
      expect(result.message?.body?.split(/\s+/).filter(Boolean).length).toBe(600);
      expect(result.message?.attachmentSource).toBe("none");
    });

    it("passes company-directed recipient instruction into the initial email AI call", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "AI Subject", body }),
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "AI Subject", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await initializeEmailSession(
        buildConfig({
          scenarios: [
            {
              ...mockPinjolScenario,
              primaryRecipientType: "reported_company",
              recipientMode: "single",
              recipientEmails: ["company@test.com"],
            },
          ],
        }),
      );

      expect(result.success).toBe(true);
      expect(mockGeminiContent.mock.calls[0][0].systemInstruction).toContain(
        "PENERIMA UTAMA: perusahaan terlapor",
      );
      expect(mockGeminiContent.mock.calls[0][0].systemInstruction).toContain(
        "JANGAN menjadikan OJK sebagai lawan bicara utama",
      );
    });

    it("retries when violations exist and fails closed on second violation", async () => {
      const body = buildBody(600);
      mockGeminiContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V1", body }),
          
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V2", body }),
          
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "V1", body })
        .mockReturnValueOnce({ subject: "V2", body });
      mockValidateCompliance
        .mockReset()
        .mockReturnValueOnce(["Bocor"])
        .mockReturnValueOnce(["Masih bocor"]);

      const result = await initializeEmailSession(buildConfig());
      expect(result.success).toBe(false);
      expect(result.error).toContain("melanggar aturan");
    });

    it("includes recipient-direction violation in retry prompt", async () => {
      const body = buildBody(600);
      const violation =
        "Narasi email masih menjadikan OJK sebagai penerima utama, padahal penerima utama adalah perusahaan terlapor";
      mockGeminiContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V1", body }),
        })
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "V2", body }),
        });
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "V1", body })
        .mockReturnValueOnce({ subject: "V2", body });
      mockValidateCompliance
        .mockReset()
        .mockReturnValueOnce([violation])
        .mockReturnValueOnce([]);

      const result = await initializeEmailSession(
        buildConfig({
          scenarios: [
            {
              ...mockPinjolScenario,
              primaryRecipientType: "reported_company",
              recipientMode: "single",
              recipientEmails: ["company@test.com"],
            },
          ],
        }),
      );

      expect(result.success).toBe(true);
      expect(mockGeminiContent).toHaveBeenCalledTimes(2);
      expect(
        mockGeminiContent.mock.calls[1][0].contents?.[0]?.parts?.[0]?.text,
      ).toContain(violation);
    });

    it("fails closed when a short first response cannot be repaired by retry", async () => {
      const shortBody = buildBody(100);
      mockGeminiContent
        .mockReset()
        .mockResolvedValueOnce({
          success: true,
          text: JSON.stringify({ subject: "Terlalu Pendek", body: shortBody }),
        })
        .mockRejectedValueOnce(new Error("Retry AI error"));
      mockParseJson
        .mockReset()
        .mockReturnValueOnce({ subject: "Terlalu Pendek", body: shortBody });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const result = await initializeEmailSession(buildConfig());

      expect(result.success).toBe(false);
      expect(result.error).toContain("terlalu pendek");
      expect(mockGeminiContent).toHaveBeenCalledTimes(2);
    });

    it("handles AI generation failure gracefully", async () => {
      mockGeminiContent.mockReset().mockResolvedValueOnce({
        success: false,
        error: "Layanan AI tidak tersedia.",
        
      });

      const result = await initializeEmailSession(buildConfig());
      expect(result.success).toBe(false);
      expect(result.error).toBe("Layanan AI tidak tersedia.");
    });
  });

  describe("attachment resolution", () => {
    it("uses manual attachments when scenario has attachmentImages", async () => {
      const body = buildBody(600);
      mockGeminiContent.mockReset().mockResolvedValue({
        success: true,
        text: JSON.stringify({ subject: "Test", body }),
        
      });
      mockParseJson.mockReset().mockReturnValue({ subject: "Test", body });
      mockValidateCompliance.mockReset().mockReturnValue([]);

      const config = buildConfig({
        scenarios: [
          {
            ...mockPinjolScenario,
            attachmentImages: ["data:image/png;base64,manual1"],
          },
        ],
      });
      const result = await initializeEmailSession(config);
      expect(result.success).toBe(true);
      expect(result.message?.attachments).toEqual(["data:image/png;base64,manual1"]);
      expect(result.message?.attachmentSource).toBe("manual");
    });
  });
});

describe("resolvePdktGenerationConfig", () => {
  it("resolves scenario and consumer type from drafts", () => {
    const result = resolvePdktGenerationConfig({
      scenarioDraft: { ...mockPinjolScenario, title: "Draft Pinjol" } as PdktScenario,
      consumerTypeDraft: { ...mockConsumerType, name: "Draft Ramah" } as PdktConsumerType,
      consumerTypeId: "ramah",
      identity: mockIdentity,
    });
    expect(result.scenario.title).toBe("Draft Pinjol");
    expect(result.consumerType.name).toBe("Draft Ramah");
    expect(result.config.identity.email).toBe("budi@mail.com");
  });

  it("resolves scenario and consumer type from IDs", () => {
    const result = resolvePdktGenerationConfig({
      scenarioId: "pinjol",
      consumerTypeId: "ramah",
      identity: mockIdentity,
    });
    expect(result.scenario.id).toBe("pinjol");
    expect(result.consumerType.id).toBe("ramah");
  });

  it("throws when scenario not found", () => {
    expect(() =>
      resolvePdktGenerationConfig({
        scenarioId: "nonexistent",
        consumerTypeId: "ramah",
        identity: mockIdentity,
      }),
    ).toThrow("Scenario atau consumer type tidak ditemukan.");
  });

  it("throws when consumer type not found", () => {
    expect(() =>
      resolvePdktGenerationConfig({
        scenarioId: "pinjol",
        consumerTypeId: "nonexistent",
        identity: mockIdentity,
      }),
    ).toThrow("Scenario atau consumer type tidak ditemukan.");
  });
});

describe("resolvePdktRecipientTargets", () => {
  it("normalizes recipient emails and keeps the fallback address in single mode", () => {
    expect(
      resolvePdktRecipientTargets({
        recipientMode: "single",
        recipientEmails: [" FIRST@test.com ", "first@test.com", "", "bad-email"],
      }),
    ).toEqual({
      mode: "single",
      recipients: ["konsumen@ojk.go.id", "first@test.com"],
      to: "konsumen@ojk.go.id, first@test.com",
    });
  });
});

describe("initializeEmailSession recipient targets", () => {
  it("persists fallback and custom recipients in single mode", async () => {
    const config = buildConfig({
      scenarios: [
        {
          ...mockPinjolScenario,
          recipientMode: "single",
          recipientEmails: ["alpha@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Subjek",
            body: "Isi template " + buildBody(600),
          },
        },
      ],
    });

    const result = await initializeEmailSession(config);
    expect(result.success).toBe(true);
    expect(result.message?.to).toBe("konsumen@ojk.go.id, alpha@test.com");
  });

  it("joins fallback and custom recipients in multiple mode", async () => {
    const config = buildConfig({
      scenarios: [
        {
          ...mockPinjolScenario,
          recipientMode: "multiple",
          recipientEmails: ["alpha@test.com", "beta@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Subjek",
            body: "Isi template " + buildBody(600),
          },
        },
      ],
    });

    const result = await initializeEmailSession(config);
    expect(result.success).toBe(true);
    expect(result.message?.to).toBe(
      "konsumen@ojk.go.id, alpha@test.com, beta@test.com",
    );
  });

  it("attaches explicit recipient metadata for company-plus-CC sessions", async () => {
    const config = buildConfig({
      scenarios: [
        {
          ...mockPinjolScenario,
          recipientMode: "multiple",
          recipientEmails: ["company@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Subjek",
            body: "Isi template " + buildBody(600),
          },
        },
      ],
    });

    const result = await initializeEmailSession(config);

    expect(result.success).toBe(true);
    expect(result.message?.recipientContext).toEqual({
      primaryRecipientType: "reported_company",
      primaryRecipientAddress: "company@test.com",
      ccRecipients: ["konsumen@ojk.go.id"],
      replyIntent: "reply_to_company_with_ojk_cc",
    });
  });

  it("keeps OJK as primary recipient when scenario explicitly sets OJK primary with company CC", async () => {
    const config = buildConfig({
      scenarios: [
        {
          ...mockPinjolScenario,
          primaryRecipientType: "ojk",
          recipientMode: "multiple",
          recipientEmails: ["company@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Subjek",
            body: "Isi template " + buildBody(600),
          },
        },
      ],
    });

    const result = await initializeEmailSession(config);

    expect(result.success).toBe(true);
    expect(result.message?.recipientContext).toEqual({
      primaryRecipientType: "ojk",
      primaryRecipientAddress: "konsumen@ojk.go.id",
      ccRecipients: ["company@test.com"],
      replyIntent: "reply_to_ojk",
    });
  });

  it("falls back to OJK intent when no company recipient exists", async () => {
    const config = buildConfig({
      scenarios: [
        {
          ...mockPinjolScenario,
          recipientMode: "single",
          recipientEmails: [],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Subjek",
            body: "Isi template " + buildBody(600),
          },
        },
      ],
    });

    const result = await initializeEmailSession(config);

    expect(result.success).toBe(true);
    expect(result.message?.recipientContext?.primaryRecipientType).toBe("ojk");
    expect(result.message?.recipientContext?.replyIntent).toBe("reply_to_ojk");
  });
});
