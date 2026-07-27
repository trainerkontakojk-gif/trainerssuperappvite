type JsonRecord = Record<string, unknown>;

const LEGACY_PDKT_KEYS = [
  "enableImageGeneration",
  "globalConsumerTypeId",
  "consumerNameMentionPattern",
  "writingStyleMode",
  "customIdentity",
] as const;

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLegacyPdktShape(value: JsonRecord): boolean {
  return LEGACY_PDKT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
}

export function readPdktSettings(settings: unknown): JsonRecord | null {
  if (!isPlainObject(settings)) return null;

  let pdkt: JsonRecord | null = null;

  if (Object.prototype.hasOwnProperty.call(settings, "pdkt")) {
    pdkt = isPlainObject(settings.pdkt) ? settings.pdkt : null;
  } else if (hasLegacyPdktShape(settings)) {
    pdkt = settings;
  }

  if (!pdkt) return null;

  return migratePdktSettings(pdkt);
}

function sanitizeScenario(value: unknown): JsonRecord | null {
  if (!isPlainObject(value)) return null;

  const { isLicensed: _ignored, ...scenario } = value;
  if (
    typeof scenario.script === "string" &&
    (!isPlainObject(scenario.sampleEmailTemplate) ||
      typeof scenario.sampleEmailTemplate.body !== "string" ||
      !scenario.sampleEmailTemplate.body)
  ) {
    scenario.sampleEmailTemplate = {
      ...(isPlainObject(scenario.sampleEmailTemplate)
        ? scenario.sampleEmailTemplate
        : {}),
      body: scenario.script,
    };
    scenario.alwaysUseSampleEmail = false;
  }
  return scenario;
}

function sanitizePdktSettings(pdkt: JsonRecord): JsonRecord {
  const result = { ...pdkt };
  if (Array.isArray(result.scenarios)) {
    result.scenarios = result.scenarios
      .map(sanitizeScenario)
      .filter((scenario): scenario is JsonRecord => scenario !== null);
  }
  return result;
}

function migratePdktSettings(pdkt: JsonRecord): JsonRecord {
  return sanitizePdktSettings(pdkt);
}

export function writePdktSettings(
  existingSettings: unknown,
  nextSettings: JsonRecord,
): JsonRecord {
  return {
    ...(isPlainObject(existingSettings) ? existingSettings : {}),
    pdkt: sanitizePdktSettings(nextSettings),
  };
}
