import { describe, it, expect } from "vitest";
import { readPdktSettings, writePdktSettings } from "../lib/pdkt-settings";

describe("pdkt-settings", () => {
  it("preserves existing module keys when saving PDKT settings", () => {
    const existing = {
      ketik: { selectedModel: "gemini-3.1-flash-lite" },
      telefun: { voiceName: "Andi" },
    };

    const result = writePdktSettings(existing, {
      selectedModel: "openai/gpt-4o-mini",
      scenarios: [],
    });

    expect(result).toEqual({
      ketik: { selectedModel: "gemini-3.1-flash-lite" },
      telefun: { voiceName: "Andi" },
      pdkt: {
        selectedModel: "openai/gpt-4o-mini",
        scenarios: [],
      },
    });
  });

  it("prefers namespaced PDKT settings when present", () => {
    const result = readPdktSettings({
      ketik: { selectedModel: "gemini-3.1-flash-lite" },
      pdkt: {
        selectedModel: "openai/gpt-4o-mini",
        globalConsumerTypeId: "random",
      },
    });

    expect(result).toEqual({
      selectedModel: "openai/gpt-4o-mini",
      globalConsumerTypeId: "random",
    });
  });

  it("falls back to legacy top-level PDKT settings", () => {
    const legacy = {
      scenarios: [{ id: "1" }],
      consumerTypes: [{ id: "c1" }],
      enableImageGeneration: true,
      globalConsumerTypeId: "random",
      selectedModel: "gemini-3.1-flash-lite",
      consumerNameMentionPattern: "random",
      writingStyleMode: "training",
    };

    expect(readPdktSettings(legacy)).toEqual(legacy);
  });

  it("ignores legacy top-level KETIK settings", () => {
    const ketikLegacy = {
      scenarios: [{ id: "k1" }],
      consumerTypes: [{ id: "k2" }],
      selectedModel: "gemini-3.1-flash-lite",
      quickTemplates: [],
      activeConsumerTypeId: "random",
    };

    expect(readPdktSettings(ketikLegacy)).toBeNull();
  });

  it("returns null for an empty settings row", () => {
    expect(readPdktSettings(null)).toBeNull();
    expect(readPdktSettings({})).toBeNull();
  });
});
