import type { PdktRecipientContext } from "@trainers/types";

type DirectedParty = "ojk" | "reported_company" | "unknown";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectDirectedParty(value: string): DirectedParty {
  const text = normalizeText(value);
  if (!text) return "unknown";

  if (
    /\bojk\b/.test(text) ||
    /konsumen@ojk\.go\.id/.test(text) ||
    /kontak 157/.test(text)
  ) {
    return "ojk";
  }

  if (
    /\bperusahaan\b/.test(text) ||
    /\bterlapor\b/.test(text) ||
    /\bpt\b/.test(text) ||
    /\btbk\b/.test(text) ||
    /\bbank\b/.test(text) ||
    /\basuransi\b/.test(text) ||
    /\bleasing\b/.test(text) ||
    /\bpinjol\b/.test(text)
  ) {
    return "reported_company";
  }

  return "unknown";
}

function getOpeningSegment(value: string): string {
  return value.slice(0, 320);
}

function getClosingSegment(value: string): string {
  return value.slice(Math.max(0, value.length - 320));
}

/** Pihak yang seharusnya menjadi lawan bicara utama balasan, menurut replyIntent. */
export function getExpectedReplyParty(
  recipientContext?: PdktRecipientContext,
): Exclude<DirectedParty, "unknown"> | null {
  if (!recipientContext) return null;
  return recipientContext.replyIntent === "reply_to_company_with_ojk_cc"
    ? "reported_company"
    : "ojk";
}

export function buildPdktRecipientConflictHints(input: {
  agentReplyBody: string;
  recipientContext?: PdktRecipientContext;
}): {
  openingTarget: DirectedParty;
  closingTarget: DirectedParty;
  conflictHints: string[];
} {
  const openingTarget = detectDirectedParty(getOpeningSegment(input.agentReplyBody));
  const closingTarget = detectDirectedParty(getClosingSegment(input.agentReplyBody));
  const conflictHints: string[] = [];
  const expectedParty = getExpectedReplyParty(input.recipientContext);

  if (!expectedParty) {
    return { openingTarget, closingTarget, conflictHints };
  }

  if (expectedParty === "reported_company") {
    if (openingTarget === "ojk") {
      conflictHints.push("pembuka membuat lawan bicara utama bergeser ke OJK");
    }
    if (closingTarget === "ojk") {
      conflictHints.push("penutup membuat lawan bicara utama bergeser ke OJK");
    }
  }

  if (expectedParty === "ojk") {
    if (openingTarget === "reported_company") {
      conflictHints.push("pembuka membuat lawan bicara utama bergeser ke perusahaan");
    }
    if (closingTarget === "reported_company") {
      conflictHints.push("penutup membuat lawan bicara utama bergeser ke perusahaan");
    }
  }

  return { openingTarget, closingTarget, conflictHints };
}
