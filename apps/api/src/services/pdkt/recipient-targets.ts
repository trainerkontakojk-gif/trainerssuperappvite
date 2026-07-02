export const PDKT_FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

export type PdktRecipientMode = "single" | "multiple";

export interface PdktRecipientTargetInput {
  primaryRecipientType?: "ojk" | "reported_company" | null;
  recipientMode?: PdktRecipientMode | null;
  recipientEmails?: unknown;
}

export interface PdktRecipientContext {
  primaryRecipientType: "ojk" | "reported_company";
  primaryRecipientAddress: string;
  ccRecipients: string[];
  replyIntent: "reply_to_company_with_ojk_cc" | "reply_to_ojk";
}

function normalizePdktRecipientEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidPdktRecipientEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePdktRecipientEmails(value: unknown): string[] {
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

export function resolvePdktRecipientTargets(
  input: PdktRecipientTargetInput,
): {
  mode: PdktRecipientMode;
  recipients: string[];
  to: string;
} {
  const mode: PdktRecipientMode =
    input.recipientMode === "multiple" ? "multiple" : "single";
  const recipientEmails = normalizePdktRecipientEmails(input.recipientEmails);
  const recipients = [PDKT_FALLBACK_RECIPIENT, ...recipientEmails];

  return {
    mode,
    recipients,
    to: recipients.join(", "),
  };
}

function dedupeRecipients(recipients: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient)) continue;
    seen.add(recipient);
    result.push(recipient);
  }
  return result;
}

export function resolvePdktRecipientContext(input: {
  recipients: string[];
  primaryRecipientType?: "ojk" | "reported_company" | null;
}): PdktRecipientContext {
  const nonFallbackRecipients = input.recipients.filter(
    (recipient) => recipient !== PDKT_FALLBACK_RECIPIENT,
  );

  const requestedPrimaryType = input.primaryRecipientType;
  const primaryRecipientType =
    requestedPrimaryType === "ojk"
      ? "ojk"
      : nonFallbackRecipients.length > 0
        ? "reported_company"
        : "ojk";
  const primaryRecipientAddress =
    primaryRecipientType === "ojk"
      ? PDKT_FALLBACK_RECIPIENT
      : nonFallbackRecipients[0] || PDKT_FALLBACK_RECIPIENT;

  const ccRecipients =
    primaryRecipientType === "ojk"
      ? dedupeRecipients(nonFallbackRecipients)
      : dedupeRecipients([
          PDKT_FALLBACK_RECIPIENT,
          ...nonFallbackRecipients.slice(1),
        ]);

  return {
    primaryRecipientType,
    primaryRecipientAddress,
    ccRecipients,
    replyIntent:
      primaryRecipientType === "ojk"
        ? "reply_to_ojk"
        : "reply_to_company_with_ojk_cc",
  };
}
