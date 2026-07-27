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

  it("strips isLicensed without losing legacy scenario settings on read and write", () => {
    const legacy = {
      scenarios: [
        {
          id: "ojk-complaint",
          isLicensed: true,
          script: "Legacy script must remain alongside the template.",
          title: "OJK Complaint",
          description: "Supported scenario description",
          isActive: true,
          primaryRecipientType: "ojk",
          recipientMode: "multiple",
          recipientEmails: ["company@example.com", "support@example.com"],
          attachmentImages: ["data:image/png;base64,attachment"],
          sampleEmailTemplate: {
            subject: "Existing subject",
            body: "Existing body takes precedence over script.",
          },
        },
      ],
      enableImageGeneration: true,
    };
    const expectedScenario = {
      id: "ojk-complaint",
      script: "Legacy script must remain alongside the template.",
      title: "OJK Complaint",
      description: "Supported scenario description",
      isActive: true,
      primaryRecipientType: "ojk",
      recipientMode: "multiple",
      recipientEmails: ["company@example.com", "support@example.com"],
      attachmentImages: ["data:image/png;base64,attachment"],
      sampleEmailTemplate: {
        subject: "Existing subject",
        body: "Existing body takes precedence over script.",
      },
    };

    expect(readPdktSettings(legacy)).toEqual({
      ...legacy,
      scenarios: [expectedScenario],
    });
    expect(
      writePdktSettings(
        { ketik: { preserve: true }, telefun: { enabled: false } },
        readPdktSettings(legacy)!,
      ),
    ).toEqual({
      ketik: { preserve: true },
      telefun: { enabled: false },
      pdkt: { ...legacy, scenarios: [expectedScenario] },
    });
  });

  it("migrates script into a template body when no body exists", () => {
    const legacy = {
      enableImageGeneration: false,
      scenarios: [
        {
          id: "script-only",
          isLicensed: false,
          script: "Migrated script body",
          sampleEmailTemplate: { subject: "Migrated subject" },
        },
      ],
    };

    expect(readPdktSettings(legacy)).toEqual({
      ...legacy,
      scenarios: [
        {
          id: "script-only",
          script: "Migrated script body",
          sampleEmailTemplate: {
            subject: "Migrated subject",
            body: "Migrated script body",
          },
          alwaysUseSampleEmail: false,
        },
      ],
    });
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
