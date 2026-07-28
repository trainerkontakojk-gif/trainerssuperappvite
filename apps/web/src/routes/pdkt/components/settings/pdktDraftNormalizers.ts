import { PdktConsumerType, PdktScenario } from "@trainers/types";

const PDKT_FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

export function normalizePdktRecipientEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPdktRecipientEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizePdktRecipientEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const emails: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizePdktRecipientEmail(item);
    if (!normalized || normalized === PDKT_FALLBACK_RECIPIENT) continue;
    if (!isValidPdktRecipientEmail(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    emails.push(normalized);
  }

  return emails;
}

export function findInvalidPdktRecipientEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const invalidEmails: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizePdktRecipientEmail(item);
    if (!normalized || normalized === PDKT_FALLBACK_RECIPIENT) continue;
    if (!isValidPdktRecipientEmail(normalized)) {
      invalidEmails.push(normalized);
    }
  }

  return invalidEmails;
}

function normalizePdktScenarioIdentity(
  identity: PdktScenario["identity"],
): PdktScenario["identity"] {
  if (!identity) return undefined;

  const normalized = Object.fromEntries(
    Object.entries(identity)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, (value as string).trim()]),
  ) as NonNullable<PdktScenario["identity"]>;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizePdktScenarioDraft(
  draft: Partial<Omit<PdktScenario, "id">>,
): Omit<PdktScenario, "id"> {
  return {
    category: draft.category || "Umum",
    title: draft.title || "",
    description: draft.description || "",
    primaryRecipientType: draft.primaryRecipientType,
    recipientMode: draft.recipientMode ?? "single",
    recipientEmails: normalizePdktRecipientEmails(draft.recipientEmails),
    sampleEmailTemplate: draft.sampleEmailTemplate ?? { subject: "", body: "" },
    alwaysUseSampleEmail: draft.alwaysUseSampleEmail ?? false,
    isActive: draft.isActive ?? true,
    script: draft.script,
    attachmentImages: draft.attachmentImages ?? [],
    identity: normalizePdktScenarioIdentity(draft.identity),
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
