import type { ResolutionStrategy, DuplicateGroup } from "./types";

/**
 * Normalizes a string for duplicate comparison: trims whitespace and lowercases.
 * Returns null if the input is null/undefined/empty after trimming.
 */
export function normalizeForComparison(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toLowerCase();
}

/**
 * Counts the number of null/undefined fields in a record.
 * Used to determine which record is "more complete" (fewer nulls).
 */
export function countNullFields(record: Record<string, unknown>): number {
  return Object.values(record).filter((v) => v == null || v === "").length;
}

/**
 * Determines the resolution strategy for a duplicate group.
 *
 * - "merge": one record has more complete data (fewer null fields)
 * - "archive": one record has status = 'inactive'
 * - "flag for manual review": records have conflicting non-null values
 */
export function determineResolution(
  records: Record<string, unknown>[],
  differingFields: string[],
): ResolutionStrategy {
  // Check for inactive status → "archive"
  const hasInactive = records.some(
    (r) =>
      typeof r.status === "string" && r.status.toLowerCase() === "inactive",
  );
  if (hasInactive) {
    return "archive";
  }

  // Check for conflicting non-null values in differing fields → "flag for manual review"
  const hasConflict = differingFields.some((field) => {
    const nonNullValues = records
      .map((r) => r[field])
      .filter((v) => v != null && v !== "");
    if (nonNullValues.length <= 1) return false;
    // Check if all non-null values are the same
    const first = JSON.stringify(nonNullValues[0]);
    return nonNullValues.some((v) => JSON.stringify(v) !== first);
  });
  if (hasConflict) {
    return "flag for manual review";
  }

  // Default: one record has more complete data → "merge"
  return "merge";
}

/**
 * Groups records by a normalized key derived from specified fields.
 * Excludes records where any of the key fields is null after normalization.
 * Excludes records where is_deleted = true.
 */
export function groupByNormalizedKey<T extends Record<string, unknown>>(
  records: T[],
  keyFields: string[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const record of records) {
    // Exclude soft-deleted records
    if (record.is_deleted === true) continue;

    // Normalize key fields; skip if any key field is null
    const keyParts: string[] = [];
    let skipRecord = false;
    for (const field of keyFields) {
      const normalized = normalizeForComparison(
        record[field] as string | null | undefined,
      );
      if (normalized === null) {
        skipRecord = true;
        break;
      }
      keyParts.push(normalized);
    }
    if (skipRecord) continue;

    const key = keyParts.join("||");
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  return groups;
}

/**
 * Builds duplicate groups from grouped records, computing differing values
 * and resolution strategies.
 */
export function buildDuplicateGroups(
  groups: Map<string, Record<string, unknown>[]>,
  table: string,
  matchedFieldNames: string[],
  differingFieldNames: string[],
): DuplicateGroup[] {
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [, records] of groups) {
    // Only groups with 2+ records are duplicates
    if (records.length < 2) continue;

    const matchedFields: Record<string, string> = {};
    for (const field of matchedFieldNames) {
      matchedFields[field] = String(records[0][field] ?? "");
    }

    const differingValues: Record<string, Record<string, unknown>> = {};
    for (const record of records) {
      const id = String(record.id);
      const diffs: Record<string, unknown> = {};
      for (const field of differingFieldNames) {
        diffs[field] = record[field] ?? null;
      }
      differingValues[id] = diffs;
    }

    const resolution = determineResolution(records, differingFieldNames);

    duplicateGroups.push({
      table,
      matchedFields,
      recordIds: records.map((r) => String(r.id)),
      differingValues,
      resolution,
    });
  }

  return duplicateGroups;
}
