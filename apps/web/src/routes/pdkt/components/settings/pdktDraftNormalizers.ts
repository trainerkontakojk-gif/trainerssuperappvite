import { PdktConsumerType, PdktScenario } from "@trainers/types";

export function normalizePdktScenarioDraft(
  draft: Partial<Omit<PdktScenario, "id">>,
): Omit<PdktScenario, "id"> {
  return {
    category: draft.category || "Umum",
    title: draft.title || "",
    description: draft.description || "",
    sampleEmailTemplate: draft.sampleEmailTemplate ?? { subject: "", body: "" },
    alwaysUseSampleEmail: draft.alwaysUseSampleEmail ?? false,
    isLicensed: draft.isLicensed ?? false,
    isActive: draft.isActive ?? true,
    script: draft.script,
    attachmentImages: draft.attachmentImages ?? [],
  };
}

export function normalizePdktConsumerDraft(
  draft: Partial<Omit<PdktConsumerType, "id">>,
): Omit<PdktConsumerType, "id"> {
  return {
    name: draft.name || "",
    description: draft.description || "",
    difficulty: draft.difficulty ?? "Medium",
    tone: draft.tone ?? "",
    isCustom: true,
  };
}
