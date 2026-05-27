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

function migratePdktSettings(pdkt: JsonRecord): JsonRecord {
  const result = { ...pdkt };

  const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
  if (scenarios.length > 0) {
    result.scenarios = (scenarios as any[]).map((s) => {
      const migrated = { ...s };
      if (s.script && (!s.sampleEmailTemplate || !s.sampleEmailTemplate.body)) {
        migrated.sampleEmailTemplate = {
          ...migrated.sampleEmailTemplate,
          body: s.script,
        };
        migrated.alwaysUseSampleEmail = false;
      }
      return migrated;
    });
  }

  return result;
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
