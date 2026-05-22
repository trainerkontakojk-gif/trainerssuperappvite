/**
 * Data Integrity Checker CLI Script
 *
 * Scans production database for data quality issues including dummy/test data,
 * duplicate records, naming inconsistencies, and broken foto references.
 *
 * Usage:
 *   tsx scripts/data-integrity-checker.ts check-dummy
 *   tsx scripts/data-integrity-checker.ts check-duplicates
 *   tsx scripts/data-integrity-checker.ts check-names
 *   tsx scripts/data-integrity-checker.ts check-fotos
 *
 * Environment:
 *   DATABASE_URL or SUPABASE_DB_URL - PostgreSQL connection string
 */

import { Client } from "pg";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface IntegrityMatch {
  table: string;
  rowId: string;
  column: string;
  pattern: string;
  value: string;
}

export interface IntegrityReport {
  command: string;
  timestamp: string;
  totalRowsScanned: number;
  totalMatches: number;
  matches: IntegrityMatch[];
}

// ─── Foto Validation Interfaces ──────────────────────────────────────────────

export interface FotoRecord {
  id: string;
  nama: string;
  foto_url: string | null;
}

export interface FotoMissing {
  id: string;
  nama: string;
}

export interface FotoBroken {
  id: string;
  nama: string;
  foto_url: string;
}

export interface FotoUnverified {
  id: string;
  nama: string;
  foto_url: string;
  reason: string;
}

export interface FotoReport {
  command: string;
  timestamp: string;
  totalRowsScanned: number;
  totalMatches: number;
  matches: IntegrityMatch[];
  missing: FotoMissing[];
  broken: FotoBroken[];
  unverified: FotoUnverified[];
  valid: number;
}

// ─── Duplicate Detection Interfaces ──────────────────────────────────────────

export type ResolutionStrategy = "merge" | "archive" | "flag for manual review";

export interface DuplicateGroup {
  table: string;
  matchedFields: Record<string, string>;
  recordIds: string[];
  differingValues: Record<string, Record<string, unknown>>;
  resolution: ResolutionStrategy;
}

export interface DuplicateReport {
  command: string;
  timestamp: string;
  totalRowsScanned: number;
  totalDuplicateGroups: number;
  duplicateGroups: DuplicateGroup[];
}

// ─── Pattern Detection Functions (exported for testing) ───────────────────────

/** Test name patterns to detect (case-insensitive) */
const TEST_NAME_PATTERNS = ["test", "dummy", "sample", "placeholder", "lorem"];

/** Test email domains */
const TEST_EMAIL_DOMAINS = ["@example.com", "@test.com", "@mailinator.com"];

/**
 * Checks if a name field contains any test/dummy patterns (case-insensitive).
 * Returns the matched pattern or null if no match.
 */
export function matchesTestNamePattern(name: string | null | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const pattern of TEST_NAME_PATTERNS) {
    if (lower.includes(pattern)) {
      return `contains "${pattern}"`;
    }
  }
  return null;
}

/**
 * Checks if an email contains test domain patterns or "+test" substring.
 * Returns the matched pattern or null if no match.
 */
export function matchesTestEmailPattern(email: string | null | undefined): string | null {
  if (!email) return null;
  const lower = email.toLowerCase();

  // Check test domains
  for (const domain of TEST_EMAIL_DOMAINS) {
    if (lower.endsWith(domain)) {
      return `domain "${domain}"`;
    }
  }

  // Check "+test" substring
  if (lower.includes("+test")) {
    return 'contains "+test"';
  }

  return null;
}

/**
 * Checks if a name consists solely of repeated characters or is a single character.
 * Examples: "aaa", "x", "bbb", "ZZZZ"
 * Returns the matched pattern or null if no match.
 */
export function matchesRepeatedCharPattern(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;

  // Single character name
  if (trimmed.length === 1) {
    return "single character name";
  }

  // All same character (case-insensitive)
  const firstChar = trimmed[0].toLowerCase();
  const allSame = trimmed.split("").every((ch) => ch.toLowerCase() === firstChar);
  if (allSame) {
    return "repeated character name";
  }

  return null;
}

// ─── Duplicate Detection Functions (exported for testing) ─────────────────────

/**
 * Normalizes a string for duplicate comparison: trims whitespace and lowercases.
 * Returns null if the input is null/undefined/empty after trimming.
 */
export function normalizeForComparison(value: string | null | undefined): string | null {
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
  differingFields: string[]
): ResolutionStrategy {
  // Check for inactive status → "archive"
  const hasInactive = records.some(
    (r) => typeof r.status === "string" && r.status.toLowerCase() === "inactive"
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
  keyFields: string[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const record of records) {
    // Exclude soft-deleted records
    if (record.is_deleted === true) continue;

    // Normalize key fields; skip if any key field is null
    const keyParts: string[] = [];
    let skipRecord = false;
    for (const field of keyFields) {
      const normalized = normalizeForComparison(record[field] as string | null | undefined);
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
  differingFieldNames: string[]
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

// ─── Name Consistency Interfaces ──────────────────────────────────────────────

export interface NameInconsistencyGroup {
  recordIds: string[];
  nameVariants: string[];
  inconsistencyType: "levenshtein" | "substring" | "whitespace" | "capitalization" | "abbreviation";
  suggestedCanonical: string;
}

export interface NameConsistencyReport {
  command: string;
  timestamp: string;
  totalRowsScanned: number;
  totalMatches: number;
  matches: IntegrityMatch[];
  groups: NameInconsistencyGroup[];
}

// ─── Name Consistency Detection Functions (exported for testing) ──────────────

/**
 * Compute Levenshtein (edit) distance between two strings.
 * Capped at first 100 characters to avoid O(n²) on very long strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const strA = a.slice(0, 100);
  const strB = b.slice(0, 100);

  const lenA = strA.length;
  const lenB = strB.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Single-row DP for space efficiency
  let prevRow: number[] = Array.from({ length: lenB + 1 }, (_, i) => i);
  let currRow: number[] = new Array(lenB + 1);

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i;
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,        // deletion
        currRow[j - 1] + 1,    // insertion
        prevRow[j - 1] + cost  // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[lenB];
}

/**
 * Check if one string is a substring of the other (case-insensitive).
 * Both strings must be at least `minLength` characters.
 * Returns false for exact matches (not a "substring" inconsistency).
 */
export function isSubstringMatch(a: string, b: string, minLength: number = 4): boolean {
  const lowerA = a.toLowerCase().trim();
  const lowerB = b.toLowerCase().trim();

  if (lowerA.length < minLength || lowerB.length < minLength) return false;
  if (lowerA === lowerB) return false;

  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

/**
 * Detect whitespace issues in a name string.
 * Returns an array of issue descriptions, or empty array if clean.
 * Issues: leading/trailing whitespace, consecutive internal spaces.
 */
export function detectWhitespaceIssues(name: string): string[] {
  const issues: string[] = [];

  if (name !== name.trimStart()) {
    issues.push("leading whitespace");
  }
  if (name !== name.trimEnd()) {
    issues.push("trailing whitespace");
  }
  if (/\s{2,}/.test(name.trim())) {
    issues.push("consecutive internal spaces");
  }

  return issues;
}

/**
 * Detect if one name is an abbreviated form of another.
 * An abbreviation is when one variant has a single initial followed by a period
 * while the other has the full word for the same name segment.
 * Example: "J. Smith" vs "John Smith", "A. B. Charlie" vs "Alice Beatrice Charlie"
 */
export function detectAbbreviation(name1: string, name2: string): boolean {
  const parts1 = name1.trim().split(/\s+/);
  const parts2 = name2.trim().split(/\s+/);

  for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
    const p1 = parts1[i];
    const p2 = parts2[i];

    // Pattern: single letter + period (e.g., "J." or "A.")
    const isAbbrev1 = /^[A-Za-z]\.$/.test(p1);
    const isAbbrev2 = /^[A-Za-z]\.$/.test(p2);

    if (isAbbrev1 && !isAbbrev2 && p2.length > 1) {
      if (p1[0].toLowerCase() === p2[0].toLowerCase()) {
        return true;
      }
    }
    if (isAbbrev2 && !isAbbrev1 && p1.length > 1) {
      if (p2[0].toLowerCase() === p1[0].toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Derive canonical form of a name: trim whitespace, collapse consecutive spaces,
 * and apply title-case capitalization.
 */
export function deriveCanonicalForm(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ─── Sub-command: check-names ─────────────────────────────────────────────────

/**
 * Scans profiler_peserta.nama for naming inconsistencies.
 * Detects: Levenshtein similarity, substring matches, whitespace issues,
 * capitalization inconsistencies (via qa_temuan peserta_id), and abbreviations.
 * Read-only: uses SELECT queries only.
 */
async function checkNames(client: Client): Promise<NameConsistencyReport> {
  const matches: IntegrityMatch[] = [];
  const groups: NameInconsistencyGroup[] = [];
  let totalRowsScanned = 0;

  // 1. Fetch all profiler_peserta names
  const pesertaResult = await client.query(
    "SELECT id, nama FROM profiler_peserta WHERE nama IS NOT NULL"
  );
  totalRowsScanned += pesertaResult.rowCount ?? 0;

  const records = pesertaResult.rows as Array<{ id: string; nama: string }>;

  // 2. Detect whitespace issues per record
  for (const record of records) {
    const issues = detectWhitespaceIssues(record.nama);
    if (issues.length > 0) {
      const canonical = deriveCanonicalForm(record.nama);
      matches.push({
        table: "profiler_peserta",
        rowId: record.id,
        column: "nama",
        pattern: `whitespace: ${issues.join(", ")}`,
        value: record.nama,
      });
      groups.push({
        recordIds: [record.id],
        nameVariants: [record.nama],
        inconsistencyType: "whitespace",
        suggestedCanonical: canonical,
      });
    }
  }

  // 3. Detect capitalization inconsistencies between records sharing peserta_id in qa_temuan
  const temuanResult = await client.query(
    `SELECT DISTINCT qt.peserta_id, pp.id AS peserta_record_id, pp.nama
     FROM qa_temuan qt
     JOIN profiler_peserta pp ON pp.id = qt.peserta_id
     WHERE pp.nama IS NOT NULL
     ORDER BY qt.peserta_id`
  );
  totalRowsScanned += temuanResult.rowCount ?? 0;

  // Group by peserta_id to find capitalization differences
  const pesertaGroups = new Map<string, Array<{ id: string; nama: string }>>();
  for (const row of temuanResult.rows) {
    const key = row.peserta_id;
    if (!pesertaGroups.has(key)) {
      pesertaGroups.set(key, []);
    }
    const group = pesertaGroups.get(key)!;
    if (!group.some((g) => g.id === row.peserta_record_id)) {
      group.push({ id: row.peserta_record_id, nama: row.nama });
    }
  }

  for (const [, groupRecords] of pesertaGroups) {
    if (groupRecords.length < 2) continue;
    const uniqueNames = [...new Set(groupRecords.map((r) => r.nama))];
    if (uniqueNames.length < 2) continue;

    // Check if differences are only in capitalization
    const normalized = uniqueNames.map((n) => n.toLowerCase().trim());
    const uniqueNormalized = [...new Set(normalized)];
    if (uniqueNormalized.length === 1) {
      const canonical = deriveCanonicalForm(uniqueNames[0]);
      const ids = groupRecords.map((r) => r.id);
      groups.push({
        recordIds: ids,
        nameVariants: uniqueNames,
        inconsistencyType: "capitalization",
        suggestedCanonical: canonical,
      });
      for (const record of groupRecords) {
        matches.push({
          table: "profiler_peserta",
          rowId: record.id,
          column: "nama",
          pattern: "capitalization inconsistency",
          value: record.nama,
        });
      }
    }
  }

  // 4. Detect Levenshtein similarity, substring matches, and abbreviations
  // Build unique name -> record IDs mapping
  const nameToIds = new Map<string, string[]>();
  for (const record of records) {
    const trimmedName = record.nama.trim();
    if (!nameToIds.has(trimmedName)) {
      nameToIds.set(trimmedName, []);
    }
    nameToIds.get(trimmedName)!.push(record.id);
  }

  const uniqueNames = Array.from(nameToIds.keys());
  const processedPairs = new Set<string>();

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const nameA = uniqueNames[i];
      const nameB = uniqueNames[j];
      const pairKey = [nameA, nameB].sort().join("|||");
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      // Skip if names are identical (case-insensitive)
      if (nameA.toLowerCase() === nameB.toLowerCase()) continue;

      // Check Levenshtein distance
      const distance = levenshteinDistance(nameA.toLowerCase(), nameB.toLowerCase());
      if (distance <= 3 && distance > 0) {
        const idsA = nameToIds.get(nameA)!;
        const idsB = nameToIds.get(nameB)!;
        const allIds = [...idsA, ...idsB];
        const canonical = deriveCanonicalForm(nameA.length >= nameB.length ? nameA : nameB);

        groups.push({
          recordIds: allIds,
          nameVariants: [nameA, nameB],
          inconsistencyType: "levenshtein",
          suggestedCanonical: canonical,
        });
        for (const id of allIds) {
          matches.push({
            table: "profiler_peserta",
            rowId: id,
            column: "nama",
            pattern: `levenshtein distance ${distance}`,
            value: records.find((r) => r.id === id)?.nama ?? "",
          });
        }
        continue; // Don't double-report
      }

      // Check substring relationship
      if (isSubstringMatch(nameA, nameB)) {
        const idsA = nameToIds.get(nameA)!;
        const idsB = nameToIds.get(nameB)!;
        const allIds = [...idsA, ...idsB];
        const canonical = deriveCanonicalForm(nameA.length >= nameB.length ? nameA : nameB);

        groups.push({
          recordIds: allIds,
          nameVariants: [nameA, nameB],
          inconsistencyType: "substring",
          suggestedCanonical: canonical,
        });
        for (const id of allIds) {
          matches.push({
            table: "profiler_peserta",
            rowId: id,
            column: "nama",
            pattern: "substring match",
            value: records.find((r) => r.id === id)?.nama ?? "",
          });
        }
        continue; // Don't double-report
      }

      // Check abbreviation
      if (detectAbbreviation(nameA, nameB)) {
        const idsA = nameToIds.get(nameA)!;
        const idsB = nameToIds.get(nameB)!;
        const allIds = [...idsA, ...idsB];
        const canonical = deriveCanonicalForm(nameA.length >= nameB.length ? nameA : nameB);

        groups.push({
          recordIds: allIds,
          nameVariants: [nameA, nameB],
          inconsistencyType: "abbreviation",
          suggestedCanonical: canonical,
        });
        for (const id of allIds) {
          matches.push({
            table: "profiler_peserta",
            rowId: id,
            column: "nama",
            pattern: "abbreviated name",
            value: records.find((r) => r.id === id)?.nama ?? "",
          });
        }
      }
    }
  }

  // 5. Sort groups by frequency (number of records involved) descending, limit to 500
  groups.sort((a, b) => b.recordIds.length - a.recordIds.length);
  const limitedGroups = groups.slice(0, 500);

  // Collect match IDs from limited groups for the final matches list
  const limitedIds = new Set(limitedGroups.flatMap((g) => g.recordIds));
  const limitedMatches = matches.filter((m) => limitedIds.has(m.rowId));

  return {
    command: "check-names",
    timestamp: new Date().toISOString(),
    totalRowsScanned,
    totalMatches: limitedMatches.length,
    matches: limitedMatches,
    groups: limitedGroups,
  };
}

// ─── Sub-command: check-dummy ─────────────────────────────────────────────────

/**
 * Scans profiles and profiler_peserta tables for test/dummy data patterns.
 * Read-only: uses SELECT queries only.
 */
async function checkDummy(client: Client): Promise<IntegrityReport> {
  const matches: IntegrityMatch[] = [];
  let totalRowsScanned = 0;

  // Scan profiles table: full_name for test patterns, email for test domains
  const profilesResult = await client.query(
    "SELECT id, full_name, email FROM profiles"
  );
  totalRowsScanned += profilesResult.rowCount ?? 0;

  for (const row of profilesResult.rows) {
    const nameMatch = matchesTestNamePattern(row.full_name);
    if (nameMatch) {
      matches.push({
        table: "profiles",
        rowId: row.id,
        column: "full_name",
        pattern: nameMatch,
        value: row.full_name,
      });
    }

    const emailMatch = matchesTestEmailPattern(row.email);
    if (emailMatch) {
      matches.push({
        table: "profiles",
        rowId: row.id,
        column: "email",
        pattern: emailMatch,
        value: row.email,
      });
    }
  }

  // Scan profiler_peserta table: nama for test patterns + repeated chars, email_ojk for test domains
  const pesertaResult = await client.query(
    "SELECT id, nama, email_ojk FROM profiler_peserta"
  );
  totalRowsScanned += pesertaResult.rowCount ?? 0;

  for (const row of pesertaResult.rows) {
    const nameMatch = matchesTestNamePattern(row.nama);
    if (nameMatch) {
      matches.push({
        table: "profiler_peserta",
        rowId: row.id,
        column: "nama",
        pattern: nameMatch,
        value: row.nama,
      });
    }

    const repeatedMatch = matchesRepeatedCharPattern(row.nama);
    if (repeatedMatch) {
      matches.push({
        table: "profiler_peserta",
        rowId: row.id,
        column: "nama",
        pattern: repeatedMatch,
        value: row.nama,
      });
    }

    const emailMatch = matchesTestEmailPattern(row.email_ojk);
    if (emailMatch) {
      matches.push({
        table: "profiler_peserta",
        rowId: row.id,
        column: "email_ojk",
        pattern: emailMatch,
        value: row.email_ojk,
      });
    }
  }

  return {
    command: "check-dummy",
    timestamp: new Date().toISOString(),
    totalRowsScanned,
    totalMatches: matches.length,
    matches,
  };
}

// ─── Sub-command: check-duplicates ────────────────────────────────────────────

/**
 * Detects duplicate records in profiler_peserta and profiles tables.
 * Read-only: uses SELECT queries only.
 *
 * profiler_peserta duplicates: case-insensitive trimmed (nama, batch_name) OR (nama, tim)
 * profiles duplicates: case-insensitive trimmed email
 *
 * Excludes is_deleted = true records and NULL field combinations.
 */
async function checkDuplicates(client: Client): Promise<DuplicateReport> {
  const duplicateGroups: DuplicateGroup[] = [];
  let totalRowsScanned = 0;

  // ── Scan profiler_peserta for duplicates ──
  const pesertaResult = await client.query(
    "SELECT id, nama, batch_name, tim, created_at, trainer_id, foto_url, is_deleted, status FROM profiler_peserta"
  );
  totalRowsScanned += pesertaResult.rowCount ?? 0;

  const pesertaRecords = pesertaResult.rows as Record<string, unknown>[];
  const pesertaDifferingFields = ["created_at", "trainer_id", "foto_url"];

  // Group by (nama, batch_name)
  const namaBatchGroups = groupByNormalizedKey(pesertaRecords, ["nama", "batch_name"]);
  const namaBatchDuplicates = buildDuplicateGroups(
    namaBatchGroups,
    "profiler_peserta",
    ["nama", "batch_name"],
    pesertaDifferingFields
  );
  duplicateGroups.push(...namaBatchDuplicates);

  // Group by (nama, tim) — collect IDs already found to avoid double-reporting
  const alreadyReportedIds = new Set<string>();
  for (const group of namaBatchDuplicates) {
    for (const id of group.recordIds) {
      alreadyReportedIds.add(id);
    }
  }

  const namaTimGroups = groupByNormalizedKey(pesertaRecords, ["nama", "tim"]);
  const namaTimDuplicates = buildDuplicateGroups(
    namaTimGroups,
    "profiler_peserta",
    ["nama", "tim"],
    pesertaDifferingFields
  );

  // Only add groups that contain at least one record not already reported
  for (const group of namaTimDuplicates) {
    const hasNewRecords = group.recordIds.some((id) => !alreadyReportedIds.has(id));
    if (hasNewRecords) {
      duplicateGroups.push(group);
      for (const id of group.recordIds) {
        alreadyReportedIds.add(id);
      }
    }
  }

  // ── Scan profiles for duplicates ──
  const profilesResult = await client.query(
    "SELECT id, email, full_name, role, status, is_deleted FROM profiles"
  );
  totalRowsScanned += profilesResult.rowCount ?? 0;

  const profileRecords = profilesResult.rows as Record<string, unknown>[];
  const profileDifferingFields = ["full_name", "role", "status"];

  const emailGroups = groupByNormalizedKey(profileRecords, ["email"]);
  const emailDuplicates = buildDuplicateGroups(
    emailGroups,
    "profiles",
    ["email"],
    profileDifferingFields
  );
  duplicateGroups.push(...emailDuplicates);

  return {
    command: "check-duplicates",
    timestamp: new Date().toISOString(),
    totalRowsScanned,
    totalDuplicateGroups: duplicateGroups.length,
    duplicateGroups,
  };
}

// ─── Sub-command: check-fotos ─────────────────────────────────────────────────

/** Concurrency limit for HEAD requests to avoid overwhelming the Storage API */
const FOTO_BATCH_SIZE = 10;

/** Overall timeout for the check-fotos command (120 seconds) */
const FOTO_OVERALL_TIMEOUT_MS = 120_000;

/** Per-request timeout for HEAD checks (5 seconds) */
const FOTO_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Checks if a foto_url resolves to an existing Storage object via HEAD request.
 * Returns: 'valid' | 'broken' | 'unverified' with optional reason.
 */
export async function checkFotoUrl(
  supabaseUrl: string,
  fotoUrl: string
): Promise<{ status: "valid" | "broken" | "unverified"; reason?: string }> {
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/foto-avatar/${fotoUrl}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FOTO_REQUEST_TIMEOUT_MS);

    const response = await fetch(storageUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: "valid" };
    } else if (response.status === 404) {
      return { status: "broken" };
    } else if (response.status >= 500) {
      return { status: "unverified", reason: `HTTP ${response.status}` };
    } else {
      // 4xx other than 404 treated as broken
      return { status: "broken" };
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "AbortError") {
      return { status: "unverified", reason: "timeout" };
    }
    return { status: "unverified", reason: error.message || "network error" };
  }
}

/**
 * Processes an array of items in batches with a given concurrency limit.
 * Stops processing new batches if shouldAbort() returns true.
 */
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  shouldAbort: () => boolean
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    if (shouldAbort()) break;

    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Scans profiler_peserta.foto_url values and verifies they resolve to
 * existing objects in Supabase Storage via HEAD checks.
 * Read-only: uses SELECT queries only + HEAD requests to Storage API.
 */
export async function checkFotos(client: Client): Promise<FotoReport> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL environment variable is required for check-fotos command."
    );
  }

  const missing: FotoMissing[] = [];
  const broken: FotoBroken[] = [];
  const unverified: FotoUnverified[] = [];
  let validCount = 0;
  const matches: IntegrityMatch[] = [];

  // Fetch all profiler_peserta records with id, nama, foto_url
  const result = await client.query(
    "SELECT id, nama, foto_url FROM profiler_peserta"
  );
  const totalRowsScanned = result.rowCount ?? 0;

  // Separate records into null/empty vs non-null foto_url
  const recordsToCheck: FotoRecord[] = [];

  for (const row of result.rows) {
    if (!row.foto_url || row.foto_url.trim() === "") {
      missing.push({ id: row.id, nama: row.nama ?? "" });
      matches.push({
        table: "profiler_peserta",
        rowId: row.id,
        column: "foto_url",
        pattern: "missing avatar (null/empty)",
        value: row.foto_url ?? "null",
      });
    } else {
      recordsToCheck.push({
        id: row.id,
        nama: row.nama ?? "",
        foto_url: row.foto_url,
      });
    }
  }

  // Process non-null foto_url records in batches with overall timeout
  const startTime = Date.now();
  const shouldAbort = () => Date.now() - startTime > FOTO_OVERALL_TIMEOUT_MS;

  const checkResults = await processBatches(
    recordsToCheck,
    FOTO_BATCH_SIZE,
    async (record) => {
      if (shouldAbort()) {
        return {
          record,
          result: { status: "unverified" as const, reason: "overall timeout exceeded" },
        };
      }

      const checkResult = await checkFotoUrl(supabaseUrl, record.foto_url!);
      return { record, result: checkResult };
    },
    shouldAbort
  );

  // Categorize results
  for (const { record, result: checkResult } of checkResults) {
    switch (checkResult.status) {
      case "valid":
        validCount++;
        break;
      case "broken":
        broken.push({
          id: record.id,
          nama: record.nama,
          foto_url: record.foto_url!,
        });
        matches.push({
          table: "profiler_peserta",
          rowId: record.id,
          column: "foto_url",
          pattern: "broken reference (storage object not found)",
          value: record.foto_url!,
        });
        break;
      case "unverified":
        unverified.push({
          id: record.id,
          nama: record.nama,
          foto_url: record.foto_url!,
          reason: checkResult.reason ?? "unknown",
        });
        break;
    }
  }

  return {
    command: "check-fotos",
    timestamp: new Date().toISOString(),
    totalRowsScanned,
    totalMatches: missing.length + broken.length,
    matches,
    missing,
    broken,
    unverified,
    valid: validCount,
  };
}

// ─── Sub-command Registry ─────────────────────────────────────────────────────

type SubCommand = (client: Client) => Promise<IntegrityReport | DuplicateReport | FotoReport | NameConsistencyReport>;

const SUB_COMMANDS: Record<string, SubCommand> = {
  "check-dummy": checkDummy,
  "check-duplicates": checkDuplicates,
  "check-names": checkNames,
  "check-fotos": checkFotos,
};

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const subCommand = process.argv[2];

  if (!subCommand) {
    console.error(
      "Usage: tsx scripts/data-integrity-checker.ts <sub-command>\n\n" +
        "Available sub-commands:\n" +
        "  check-dummy       Scan for test/dummy data patterns\n" +
        "  check-duplicates  Find duplicate agent/profiler records\n" +
        "  check-names       Detect naming inconsistencies\n" +
        "  check-fotos       Validate foto/avatar references"
    );
    process.exit(1);
  }

  const handler = SUB_COMMANDS[subCommand];
  if (!handler) {
    console.error(
      `Unknown sub-command: "${subCommand}"\n\n` +
        "Available sub-commands: " +
        Object.keys(SUB_COMMANDS).join(", ")
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      "Error: DATABASE_URL or SUPABASE_DB_URL environment variable is required."
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();

    // Set statement timeout to 60 seconds for performance constraint
    await client.query("SET statement_timeout = '60000ms'");

    const report = await handler(client);
    console.log(JSON.stringify(report, null, 2));

    const totalMatches = "totalMatches" in report
      ? report.totalMatches
      : report.totalDuplicateGroups;

    if (totalMatches === 0) {
      console.error(
        `\n✓ No matches found. ${report.totalRowsScanned} rows scanned across all tables.`
      );
    } else {
      console.error(
        `\n⚠ Found ${totalMatches} match(es) in ${report.totalRowsScanned} rows scanned.`
      );
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error(
      JSON.stringify(
        {
          error: "Data integrity check failed",
          message: error.message,
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("data-integrity-checker.ts") ||
    process.argv[1].endsWith("data-integrity-checker"));

if (isMainModule) {
  main();
}
