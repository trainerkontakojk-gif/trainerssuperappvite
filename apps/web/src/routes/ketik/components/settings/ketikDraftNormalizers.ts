import {
  KetikConsumerType,
  KetikQuickTemplate,
  KetikScenario,
} from "@trainers/types";

export function normalizeKetikScenarioDraft(
  draft: Partial<Omit<KetikScenario, "id">>,
): Omit<KetikScenario, "id"> {
  return {
    category: draft.category || "Umum",
    title: draft.title || "",
    description: draft.description || "",
    script: draft.script ?? "",
    isActive: draft.isActive ?? true,
    images: draft.images ?? [],
    imageAlts: draft.imageAlts ?? [],
  };
}

export function normalizeKetikConsumerDraft(
  draft: Partial<Omit<KetikConsumerType, "id">>,
): Omit<KetikConsumerType, "id"> {
  return {
    name: draft.name || "",
    description: draft.description || "",
    difficulty: draft.difficulty ?? "Sedang",
    isCustom: true,
  };
}

export function normalizeKetikQuickTemplateDraft(
  draft: Partial<Omit<KetikQuickTemplate, "id">>,
): Omit<KetikQuickTemplate, "id"> {
  return {
    keyword: (draft.keyword || "").trim().toLowerCase().replace(/\s+/g, "-"),
    content: (draft.content || "").trim(),
  };
}
