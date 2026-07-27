import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/gemini", () => ({ generateGeminiContent: vi.fn() }));
vi.mock("../lib/openrouter", () => ({ generateOpenRouterContent: vi.fn() }));
vi.mock("../lib/deepseek", () => ({ generateDeepSeekContent: vi.fn() }));
vi.mock("../lib/ai-models", () => ({
  DEFAULT_AI_MODEL_ID: "gemini-3.1-flash-lite",
  resolveModelProvider: vi.fn(),
}));
vi.mock("../lib/ai-json", () => ({ parseJsonFromModelText: vi.fn() }));
vi.mock("../services/pdkt-email-policy", async () => {
  const actual: any = await vi.importActual("../services/pdkt-email-policy");
  return { ...actual, validatePdktEmailPolicyCompliance: vi.fn() };
});

import { generateDeepSeekContent } from "../lib/deepseek";
import { generateGeminiContent } from "../lib/gemini";
import { parseJsonFromModelText } from "../lib/ai-json";
import { resolveModelProvider } from "../lib/ai-models";
import {
  PDKT_PROMPT_BUDGET,
  PDKT_PROVIDER_ADAPTER_OVERHEAD_RESERVE,
} from "../services/pdkt/prompt-contract";
import { validatePdktEmailPolicyCompliance } from "../services/pdkt-email-policy";
import {
  generateScenarioEmailTemplate,
  initializeEmailSession,
} from "../services/pdkt/session-service";
import type {
  PdktConsumerType,
  PdktIdentity,
  PdktScenario,
  PdktSessionConfig,
} from "@trainers/types";

const mockGeminiContent = vi.mocked(generateGeminiContent);
const mockDeepSeekContent = vi.mocked(generateDeepSeekContent);
const mockParseJson = vi.mocked(parseJsonFromModelText);
const mockResolveProvider = vi.mocked(resolveModelProvider);
const mockValidateCompliance = vi.mocked(validatePdktEmailPolicyCompliance);

const identity: PdktIdentity = {
  name: "Budi Santoso",
  email: "budi@mail.com",
  city: "Jakarta",
  bodyName: "Budi",
};
const scenario: PdktScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Konsumen diteror pinjol ilegal.",
  isActive: true,
};
const consumerType: PdktConsumerType = {
  id: "ramah",
  name: "Ramah & Kooperatif",
  description: "Konsumen sangat ramah.",
  difficulty: "Easy",
  tone: "Ramah",
};

function buildBody(wordCount: number): string {
  const words = Array.from({ length: wordCount }, () => "kata");
  return Array.from({ length: 5 }, (_, index) => {
    const start = Math.floor((index * wordCount) / 5);
    const end = Math.floor(((index + 1) * wordCount) / 5);
    return words.slice(start, end).join(" ");
  })
    .filter(Boolean)
    .join("\n\n");
}

function buildConfig(
  overrides: Partial<PdktSessionConfig> = {},
): PdktSessionConfig {
  return {
    scenarios: [scenario],
    consumerType,
    identity,
    enableImageGeneration: false,
    selectedModel: "gemini-3.1-flash-lite",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGeminiContent.mockReset();
  mockDeepSeekContent.mockReset();
  mockParseJson.mockReset();
  mockResolveProvider.mockReset().mockReturnValue({
    modelId: "gemini-3.1-flash-lite",
    provider: "gemini",
    isFallback: false,
    timeoutMs: 120_000,
  });
  mockValidateCompliance.mockReset().mockReturnValue([]);
});

describe("PDKT generation output contracts", () => {
  it("rejects a wrong template shape", async () => {
    mockGeminiContent.mockResolvedValue({ success: true, text: "{}" });
    mockParseJson.mockReturnValue({ subject: "Valid", body: 123 });

    const result = await generateScenarioEmailTemplate(scenario, buildConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain("format output");
  });

  it("preserves a legitimate empty template subject", async () => {
    const body = buildBody(600);
    mockGeminiContent.mockResolvedValue({ success: true, text: "{}" });
    mockParseJson.mockReturnValue({ subject: "", body });

    const result = await generateScenarioEmailTemplate(scenario, buildConfig());

    expect(result.success).toBe(true);
    expect(result.subject).toBe("");
  });

  it("rejects a wrong initial-email shape", async () => {
    mockGeminiContent.mockResolvedValue({ success: true, text: "{}" });
    mockParseJson.mockReturnValue({ subject: [], body: buildBody(600) });

    const result = await initializeEmailSession(buildConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain("format output");
  });
});

describe("PDKT generation length and budget contracts", () => {
  it("accepts a 300-word rushed template without retrying", async () => {
    const body = buildBody(300);
    mockGeminiContent.mockResolvedValue({ success: true, text: "{}" });
    mockParseJson.mockReturnValue({ subject: "Cepat", body });

    const result = await generateScenarioEmailTemplate(
      scenario,
      buildConfig({ consumerType: { ...consumerType, id: "terburu-buru" } }),
    );

    expect(result.success).toBe(true);
    expect(mockGeminiContent).toHaveBeenCalledTimes(1);
    const call = mockGeminiContent.mock.calls[0][0];
    expect(call.systemInstruction).toContain("250-500 kata");
    expect(call.contents[0]?.parts?.[0]?.text).toContain("3-5 paragraf");
  });

  it("reserves provider-adapter overhead below the hard ceiling", async () => {
    const body = buildBody(600);
    mockGeminiContent.mockResolvedValue({ success: true, text: "{}" });
    mockParseJson.mockReturnValue({ subject: "Aman", body });
    const hugeScenario: PdktScenario = {
      ...scenario,
      description: "deskripsi ".repeat(20_000),
      sampleEmailTemplate: { body: "template ".repeat(20_000) },
    };

    const result = await generateScenarioEmailTemplate(
      hugeScenario,
      buildConfig({
        scenarios: [hugeScenario],
        consumerType: {
          ...consumerType,
          description: "persona ".repeat(20_000),
        },
      }),
    );

    expect(result.success).toBe(true);
    const call = mockGeminiContent.mock.calls[0][0];
    const systemInstruction = call.systemInstruction ?? "";
    const prompt = call.contents[0]?.parts?.[0]?.text ?? "";
    expect(
      systemInstruction.length +
        prompt.length +
        PDKT_PROVIDER_ADAPTER_OVERHEAD_RESERVE,
    ).toBeLessThanOrEqual(PDKT_PROMPT_BUDGET);
    expect(systemInstruction).toContain("FORMAT OUTPUT");
    expect(prompt).toContain("HANYA JSON");
  });

  it.each(["template", "initial"] as const)(
    "fails closed for short DeepSeek %s output after retry",
    async (mode) => {
      const body = buildBody(100);
      mockResolveProvider.mockReturnValue({
        modelId: "deepseek-v4-pro",
        provider: "deepseek",
        isFallback: false,
        timeoutMs: 180_000,
      });
      mockDeepSeekContent
        .mockResolvedValueOnce({ success: true, text: "{}" })
        .mockResolvedValueOnce({ success: true, text: "{}" });
      mockParseJson
        .mockReturnValueOnce({ subject: "Pendek", body })
        .mockReturnValueOnce({ subject: "Masih Pendek", body });
      const config = buildConfig({ selectedModel: "deepseek-v4-pro" });

      const result =
        mode === "template"
          ? await generateScenarioEmailTemplate(scenario, config)
          : await initializeEmailSession(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("terlalu pendek");
      expect(mockDeepSeekContent).toHaveBeenCalledTimes(2);
    },
  );
});
