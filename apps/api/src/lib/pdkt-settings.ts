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

  if (Object.prototype.hasOwnProperty.call(settings, "pdkt")) {
    return isPlainObject(settings.pdkt) ? settings.pdkt : null;
  }

  return hasLegacyPdktShape(settings) ? settings : null;
}

export function writePdktSettings(
  existingSettings: unknown,
  nextSettings: JsonRecord,
): JsonRecord {
  return {
    ...(isPlainObject(existingSettings) ? existingSettings : {}),
    pdkt: nextSettings,
  };
}
