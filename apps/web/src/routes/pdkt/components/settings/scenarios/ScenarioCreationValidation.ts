import type { PdktScenario } from "@trainers/types";
import { isValidPdktRecipientEmail } from "../pdktDraftNormalizers";

/** Cara email konsumen dibuat: AI dari ringkasan, atau ditulis sendiri. */
export type ScenarioCreationMode = "ai" | "manual";

export type ScenarioValidationErrorKey =
  "category" | "title" | "description" | "manualEmail" | "email";

export interface ScenarioCreationValidation {
  errors: Record<ScenarioValidationErrorKey, string>;
  manualEmailBody: string;
}

/** Pesan galat editor skenario; kosong berarti isian itu sudah benar. */
export function getScenarioCreationValidation({
  draft,
  category,
  creationMode,
}: {
  draft: Partial<PdktScenario>;
  category: string;
  creationMode: ScenarioCreationMode;
}): ScenarioCreationValidation {
  const manualEmailBody = draft.sampleEmailTemplate?.body?.trim() || "";
  return {
    errors: {
      category: category ? "" : "Kategori wajib diisi.",
      title: draft.title?.trim() ? "" : "Judul skenario wajib diisi.",
      description:
        creationMode === "manual" || draft.description?.trim()
          ? ""
          : "Ringkasan masalah wajib diisi.",
      manualEmail:
        creationMode === "manual" && !manualEmailBody
          ? "Isi email wajib diisi."
          : "",
      email:
        draft.identity?.email?.trim() &&
        !isValidPdktRecipientEmail(draft.identity.email.trim())
          ? "Alamat email tidak valid. Contoh: nama@perusahaan.co.id"
          : "",
    },
    manualEmailBody,
  };
}
