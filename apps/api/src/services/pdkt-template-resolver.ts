import type {
  PdktIdentity,
  PdktScenario,
  ResolvedConsumerNameMentionPattern,
} from "@trainers/types";
import {
  LICENSED_COMPANY_NAMES,
  SCENARIO_COMPANY_CATEGORY_MAP,
  UNLICENSED_COMPANY_NAMES,
} from "./pdkt-company-names";

export interface PdktTemplateResolutionInput {
  subject: string;
  body: string;
  scenario: PdktScenario;
  identity: PdktIdentity;
  mentionPattern: ResolvedConsumerNameMentionPattern;
  pickIndex?: number;
}

export function resolvePdktCompanyName(scenario: PdktScenario, pickIndex = Date.now()) {
  const category = SCENARIO_COMPANY_CATEGORY_MAP[scenario.title] || scenario.category || "default";
  const pool = scenario.isLicensed
    ? LICENSED_COMPANY_NAMES[category] || LICENSED_COMPANY_NAMES.Perbankan
    : UNLICENSED_COMPANY_NAMES[category] || UNLICENSED_COMPANY_NAMES.default;
  const name = pool[Math.abs(pickIndex) % pool.length];

  return {
    kind: scenario.isLicensed ? ("licensed" as const) : ("unlicensed" as const),
    name,
    category,
  };
}

export function renderPdktConsumerName(
  body: string,
  identity: PdktIdentity,
  pattern: ResolvedConsumerNameMentionPattern,
): string {
  const text = body.replace(/\{\{\s*consumer_name\s*\}\}/gi, "").trim();
  if (pattern === "none") return text;
  if (pattern === "upfront") return `Halo, saya ${identity.name}.\n\n${text}`;
  if (pattern === "late") return `${text}\n\nSalam,\n${identity.name}`;

  const paragraphs = text.split("\n\n");
  if (paragraphs.length >= 2) {
    paragraphs.splice(
      Math.floor(paragraphs.length / 2),
      0,
      `Oya, saya ${identity.name} mau menambahkan sedikit detail lagi.`,
    );
    return paragraphs.join("\n\n");
  }
  return `${text}\n\n(Saya ${identity.name})`;
}

const PLACEHOLDER_PATTERNS = [
  /\{\{\s*consumer_name\s*\}\}/gi,
  /\{\{\s*(?:company_name|company|institution_name|ljk_name)\s*\}\}/gi,
  /\[(?:nama\s*)?(?:konsumen|nasabah|pengirim|perusahaan|ljk|bank|asuransi|entitas|lembaga)(?:\s+[^\]]+)?\]/gi,
];

export function findPdktPlaceholders(value: string): string[] {
  return [...new Set(PLACEHOLDER_PATTERNS.flatMap((pattern) => value.match(pattern) || []))];
}

export function resolvePdktTemplateBody(input: PdktTemplateResolutionInput) {
  const company = resolvePdktCompanyName(input.scenario, input.pickIndex);
  let body = input.body;

  body = body.replace(
    /\{\{\s*(?:company_name|company|institution_name|ljk_name)\s*\}\}/gi,
    company.name,
  );
  body = body.replace(
    /\[(?:nama\s*)?(?:perusahaan|ljk|bank|asuransi|entitas|lembaga)(?:\s+[^\]]+)?\]/gi,
    company.name,
  );
  body = renderPdktConsumerName(body, input.identity, input.mentionPattern);

  return {
    subject: input.subject,
    body,
    company,
    leftoverPlaceholders: findPdktPlaceholders(body),
  };
}
