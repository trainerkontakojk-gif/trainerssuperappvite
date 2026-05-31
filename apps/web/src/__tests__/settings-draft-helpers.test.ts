import { describe, expect, it } from "vitest";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { buildKetikSettingsForSave } from "../routes/ketik/components/settings/useKetikSettingsDraft";
import { buildPdktSettingsForSave } from "../routes/pdkt/components/settings/usePdktSettingsDraft";
import { buildTelefunSettingsForSave } from "../routes/telefun/components/settings/useTelefunSettingsDraft";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";
import type { PdktAppSettings } from "../routes/pdkt/pdktSettings";
import { applyCollectionDraft } from "../hooks/useCollectionDraft";

describe("settings draft commit helpers", () => {
  it("buildKetikSettingsForSave returns a new object and does not mutate localSettings", () => {
    const original = {
      ...DEFAULT_KETIK_SETTINGS,
      scenarios: [{ ...DEFAULT_KETIK_SETTINGS.scenarios[0], title: "Original" }],
    };
    const nextScenarios = [{ ...original.scenarios[0], title: "Changed" }];

    const result = buildKetikSettingsForSave({
      localSettings: original,
      scenarios: nextScenarios,
      consumerTypes: original.consumerTypes,
      quickTemplates: original.quickTemplates ?? [],
    });

    expect(result).not.toBe(original);
    expect(result.scenarios[0].title).toBe("Changed");
    expect(original.scenarios[0].title).toBe("Original");
  });

  it("buildPdktSettingsForSave preserves system fields while replacing collections immutably", () => {
    const original: PdktAppSettings = {
      scenarios: [{ id: "s1", category: "A", title: "Old", description: "D", isActive: true }],
      consumerTypes: [{ id: "c1", name: "Old", description: "D", difficulty: "Medium", tone: "", isCustom: true }],
      enableImageGeneration: true,
      globalConsumerTypeId: "random",
      selectedModel: "gemini-3.1-flash-lite-preview",
      consumerNameMentionPattern: "random",
      writingStyleMode: "training",
      customIdentity: { senderName: "", bodyName: "", email: "", city: "" },
    };

    const result = buildPdktSettingsForSave({
      localSettings: original,
      scenarios: [{ ...original.scenarios[0], title: "New" }],
      consumerTypes: original.consumerTypes,
      system: {
        enableImageGeneration: false,
        globalConsumerTypeId: "c1",
        selectedModel: "gemini-3.1-flash-lite-preview",
        consumerNameMentionPattern: "upfront",
        writingStyleMode: "realistic",
        customIdentity: { senderName: "Agent", bodyName: "Agent", email: "a@b.test", city: "Jakarta" },
      },
    });

    expect(result).not.toBe(original);
    expect(result.scenarios[0].title).toBe("New");
    expect(result.enableImageGeneration).toBe(false);
    expect(original.scenarios[0].title).toBe("Old");
    expect(original.enableImageGeneration).toBe(true);
  });

  it("buildTelefunSettingsForSave derives transport from selected model without mutating localSettings", () => {
    const original = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gemini-3.1-flash-live-preview",
      telefunTransport: "gemini-live" as const,
    };

    const result = buildTelefunSettingsForSave({
      localSettings: original,
      scenarios: original.scenarios,
      consumerTypes: original.consumerTypes,
      selectedTelefunModel: "gemini-3.1-flash-live-preview",
    });

    expect(result).not.toBe(original);
    expect(result.telefunModelId).toBe("gemini-3.1-flash-live-preview");
    expect(result.telefunTransport).toBe("gemini-live");
    expect(original.telefunTransport).toBe("gemini-live");
  });
});

describe("applyCollectionDraft", () => {
  interface TestItem {
    id: string;
    name: string;
    isCustom?: boolean;
  }

  it("adds a new item with prefix and default values when editingId is null", () => {
    const items: TestItem[] = [
      { id: "c-1", name: "Item 1" },
    ];
    const draft = { name: "New Item" };

    const result = applyCollectionDraft<TestItem>({
      items,
      draft,
      editingId: null,
      create: (nextDraft) => ({
        id: "c-123",
        name: nextDraft.name ?? "",
        isCustom: true,
      }),
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(items[0]);
    expect(result[1].id).toBe("c-123");
    expect(result[1].name).toBe("New Item");
    expect(result[1].isCustom).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("updates an existing item with editingId", () => {
    const items: TestItem[] = [
      { id: "c-1", name: "Item 1" },
      { id: "c-2", name: "Item 2", isCustom: true },
    ];
    const draft = { name: "Updated Item 2" };

    const result = applyCollectionDraft<TestItem>({
      items,
      draft,
      editingId: "c-2",
      create: (nextDraft) => ({
        id: "c-new",
        name: nextDraft.name ?? "",
      }),
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(items[0]);
    expect(result[1]).not.toBe(items[1]);
    expect(result[1].id).toBe("c-2");
    expect(result[1].name).toBe("Updated Item 2");
    expect(result[1].isCustom).toBe(true);
    expect(items[1].name).toBe("Item 2");
  });
});
