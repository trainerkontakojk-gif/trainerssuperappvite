import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_PDKT_MODEL_ID,
  coercePdktModelId,
  coerceWritingStyleMode,
  coerceConsumerNameMentionPattern,
  resolveConsumerNameMentionPattern,
  generatePdktSessionConfig,
} from "../routes/pdkt/pdktSettings";
import type { PdktScenario, PdktConsumerType, PdktIdentity } from "@trainers/types";

vi.mock("../../hooks/useApi", () => ({
  useApi: () => ({
    data: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  getApi: vi.fn(() => Promise.resolve(null)),
  postApi: vi.fn(),
  deleteApi: vi.fn(),
}));

vi.mock("../../lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: any) => children,
  useRouter: () => ({ navigate: vi.fn() }),
  useParams: () => ({}),
  createRootRoute: () => ({}),
  createRoute: () => ({}),
}));

describe("PDKT Settings Helpers", () => {
  it("configures default model correctly", () => {
    expect(DEFAULT_PDKT_MODEL_ID).toBe("gemini-3.1-flash-lite");
  });

  it("coerces invalid model to default", () => {
    expect(coercePdktModelId(null)).toBe("gemini-3.1-flash-lite");
    expect(coercePdktModelId("invalid-model")).toBe("gemini-3.1-flash-lite");
  });

  it("coerces writing style mode to default for invalid values", () => {
    expect(coerceWritingStyleMode(null)).toBe("training");
    expect(coerceWritingStyleMode("invalid")).toBe("training");
    expect(coerceWritingStyleMode("realistic")).toBe("realistic");
    expect(coerceWritingStyleMode("training")).toBe("training");
  });

  it("coerces consumer name mention pattern to default for invalid values", () => {
    expect(coerceConsumerNameMentionPattern(null)).toBe("random");
    expect(coerceConsumerNameMentionPattern("invalid")).toBe("random");
    expect(coerceConsumerNameMentionPattern("upfront")).toBe("upfront");
    expect(coerceConsumerNameMentionPattern("none")).toBe("none");
  });

  it("resolves random name mention pattern to valid values", () => {
    const validPatterns = ["upfront", "middle", "late", "none"];
    for (let i = 0; i < 20; i++) {
      const result = resolveConsumerNameMentionPattern("random");
      expect(validPatterns).toContain(result);
    }
  });

  it("keeps explicit name mention pattern unchanged", () => {
    expect(resolveConsumerNameMentionPattern("upfront")).toBe("upfront");
    expect(resolveConsumerNameMentionPattern("none")).toBe("none");
  });

  it("generates session config with model coercion", () => {
    const config = generatePdktSessionConfig(
      {
        scenarios: [],
        consumerTypes: [
          {
            id: "ramah",
            name: "Ramah",
            description: "Ramah",
            tone: "Ramah",
            isCustom: false,
            difficulty: "Easy",
          },
        ],
        enableImageGeneration: true,
        globalConsumerTypeId: "ramah",
        selectedModel: "invalid-model",
        consumerNameMentionPattern: "none",
        writingStyleMode: "training",
      },
      {
        id: "test",
        category: "Test",
        title: "Test",
        description: "Test",
        isActive: true,
        isLicensed: false,
      },
      {
        name: "Budi",
        email: "budi@test.com",
        city: "Jakarta",
        bodyName: "Budi",
      },
    );
    expect(config.selectedModel).toBe(
      coercePdktModelId("invalid-model"),
    );
    expect(config.resolvedConsumerNameMentionPattern).toBe("none");
  });
});
