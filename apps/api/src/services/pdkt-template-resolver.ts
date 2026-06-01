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
import {
  buildPdktEmailGenerationPolicy,
  renderPdktIdentityByMentionPattern,
} from "./pdkt-email-policy";

export interface PdktTemplateResolutionInput {
  subject: string;
  body: string;
  scenario: PdktScenario;
  identity: PdktIdentity;
  mentionPattern: ResolvedConsumerNameMentionPattern;
  pickIndex?: number;
}

const COMPANY_PLACEHOLDER_PATTERNS = [
  /\{\{\s*(?:company_name|company|institution_name|ljk_name)\s*\}\}/gi,
  /\[(?:nama\s*)?(?:perusahaan|ljk|bank|asuransi|entitas|lembaga)(?:\s+[^\]]+)?\]/gi,
] as const;

const ANY_PLACEHOLDER_PATTERN = /\{\{[^}]+\}\}|\[[^\]]+\]/g;

function replaceAllPatterns(
  text: string,
  patterns: readonly RegExp[],
  replacement: string,
): string {
  return patterns.reduce((acc, pattern) => acc.replace(pattern, replacement), text);
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
  const config = {
    scenarios: [],
    consumerType: {} as any,
    identity,
    enableImageGeneration: false,
    resolvedConsumerNameMentionPattern: pattern,
    writingStyleMode: "training" as const,
  };
  const policy = buildPdktEmailGenerationPolicy(config, {} as any, "template");
  const { body: resolvedBody } = renderPdktIdentityByMentionPattern(body, "", policy);
  return resolvedBody;
}

export function findPdktPlaceholders(value: string): string[] {
  return [...new Set(value.match(ANY_PLACEHOLDER_PATTERN) || [])];
}

export function resolvePdktTemplateBody(input: PdktTemplateResolutionInput) {
  const company = resolvePdktCompanyName(input.scenario, input.pickIndex);

  const subjectWithCompany = replaceAllPatterns(
    input.subject,
    COMPANY_PLACEHOLDER_PATTERNS,
    company.name,
  );
  const bodyWithCompany = replaceAllPatterns(
    input.body,
    COMPANY_PLACEHOLDER_PATTERNS,
    company.name,
  );

  const config = {
    scenarios: [input.scenario],
    consumerType: {} as any,
    identity: input.identity,
    enableImageGeneration: false,
    resolvedConsumerNameMentionPattern: input.mentionPattern,
    writingStyleMode: "training" as const,
  };
  const policy = buildPdktEmailGenerationPolicy(config, input.scenario, "template");

  const { subject, body } = renderPdktIdentityByMentionPattern(
    bodyWithCompany,
    subjectWithCompany,
    policy,
  );

  return {
    subject,
    body,
    company,
    leftoverPlaceholders: findPdktPlaceholders(body),
  };
}
