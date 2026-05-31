import {
  ConsumerDifficulty,
  TelefunConsumerType,
  TelefunScenario,
} from "../../telefunSettings";

export function normalizeTelefunScenarioDraft(
  draft: Partial<Omit<TelefunScenario, "id">>,
): Omit<TelefunScenario, "id"> {
  return {
    category: draft.category || "Umum",
    title: draft.title || "",
    instruction: draft.instruction || "",
    script: draft.script ?? "",
    isActive: draft.isActive ?? true,
  };
}

export function normalizeTelefunConsumerDraft(
  draft: Partial<Omit<TelefunConsumerType, "id">>,
): Omit<TelefunConsumerType, "id"> {
  return {
    name: draft.name || "",
    description: draft.description || "",
    difficulty: draft.difficulty ?? ConsumerDifficulty.Medium,
    gender: draft.gender ?? "random",
  };
}
