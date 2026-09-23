import type { PdktScenario } from "@trainers/types";
import {
  findInvalidPdktRecipientEmails,
  isValidPdktRecipientEmail,
} from "../pdktDraftNormalizers";
import type { ScenarioCreationMode } from "./ScenarioCreationModePicker";

export type ScenarioValidationErrorKey =
  | "category"
  | "title"
  | "description"
  | "manualEmail"
  | "email";

export interface ScenarioCreationValidation {
  errors: Record<ScenarioValidationErrorKey, string>;
  validationKeys: ScenarioValidationErrorKey[];
  validationIds: string[];
  scenarioValid: boolean;
  profileValid: boolean;
  emailValid: boolean;
  manualEmailBody: string;
}

export function getScenarioCreationValidation({
  draft,
  category,
  creationMode,
  newCategoryMode,
}: {
  draft: Partial<PdktScenario>;
  category: string;
  creationMode: ScenarioCreationMode | null;
  newCategoryMode: boolean;
}): ScenarioCreationValidation {
  const manualEmailBody = draft.sampleEmailTemplate?.body?.trim() || "";
  const errors: Record<ScenarioValidationErrorKey, string> = {
    category: category ? "" : "Kategori wajib diisi.",
    title: draft.title?.trim() ? "" : "Judul skenario wajib diisi.",
    description:
      creationMode === "manual" || draft.description?.trim()
        ? ""
        : "Deskripsi masalah wajib diisi.",
    manualEmail:
      creationMode === "manual" && !manualEmailBody
        ? "Isi email buatan sendiri wajib diisi."
        : "",
    email:
      draft.identity?.email?.trim() &&
      !isValidPdktRecipientEmail(draft.identity.email.trim())
        ? "Format email tidak valid."
        : "",
  };
  const validationKeys: ScenarioValidationErrorKey[] =
    creationMode === "manual"
      ? ["category", "title", "manualEmail"]
      : ["category", "title", "description"];
  const validationIds =
    creationMode === "manual"
      ? [
          newCategoryMode ? "scenario-category-new" : "scenario-category",
          "scenario-title",
          "scenario-template-body",
        ]
      : [
          newCategoryMode ? "scenario-category-new" : "scenario-category",
          "scenario-title",
          "scenario-description",
        ];

  return {
    errors,
    validationKeys,
    validationIds,
    scenarioValid: validationKeys.every((key) => !errors[key]),
    profileValid: !errors.email,
    emailValid:
      findInvalidPdktRecipientEmails(draft.recipientEmails).length === 0 &&
      (creationMode !== "manual" || Boolean(manualEmailBody)),
    manualEmailBody,
  };
}
