import type { Client } from "pg";
import type {
  IntegrityReport,
  DuplicateReport,
  FotoReport,
  NameConsistencyReport,
  IntegrityMatch,
  NameInconsistencyGroup,
  FotoMissing,
  FotoBroken,
  FotoUnverified,
  FotoRecord,
} from "./types";
import {
  matchesTestNamePattern,
  matchesTestEmailPattern,
  matchesRepeatedCharPattern,
} from "./dummy-detector";
import {
  groupByNormalizedKey,
  buildDuplicateGroups,
} from "./duplicate-detector";
import {
  detectWhitespaceIssues,
  deriveCanonicalForm,
  levenshteinDistance,
  isSubstringMatch,
  detectAbbreviation,
} from "./name-consistency";
import {
  FOTO_BATCH_SIZE,
  checkFotoUrl,
  processBatches,
} from "./foto-checker";

/**
 * Scans profiles and profiler_peserta tables for test/dummy data patterns.
 * Read-only: uses SELECT queries only.
 */
export async function checkDummy(client: Client): Promise<IntegrityReport> {
  const matches: IntegrityMatch[] = [];
  let totalRowsScanned = 0;

  // Scan profiles table: full_name for test patterns, email for test domains
  const profilesResult = await client.query(
    "SELECT id, full_name, email FROM profiles",
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
    "SELECT id, nama, email_ojk FROM profiler_peserta",
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

/**
 * Detects duplicate records in profiler_peserta and profiles tables.
 * Read-only: uses SELECT queries only.
 *
 * profiler_peserta duplicates: case-insensitive trimmed (nama, batch_name) OR (nama, tim)
 * profiles duplicates: case-insensitive trimmed email
 *
 * Excludes is_deleted = true records and NULL field combinations.
 */
export async function checkDuplicates(client: Client): Promise<DuplicateReport> {
  const duplicateGroups: any[] = [];
  let totalRowsScanned = 0;

  // ── Scan profiler_peserta for duplicates ──
  const pesertaResult = await client.query(
    "SELECT id, nama, batch_name, tim, created_at, trainer_id, foto_url, is_deleted, status FROM profiler_peserta",
  );
  totalRowsScanned += pesertaResult.rowCount ?? 0;

  const pesertaRecords = pesertaResult.rows as Record<string, unknown>[];
  const pesertaDifferingFields = ["created_at", "trainer_id", "foto_url"];

  // Group by (nama, batch_name)
  const namaBatchGroups = groupByNormalizedKey(pesertaRecords, [
    "nama",
    "batch_name",
  ]);
  const namaBatchDuplicates = buildDuplicateGroups(
    namaBatchGroups,
    "profiler_peserta",
    ["nama", "batch_name"],
    pesertaDifferingFields,
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
    pesertaDifferingFields,
  );

  // Only add groups that contain at least one record not already reported
  for (const group of namaTimDuplicates) {
    const hasNewRecords = group.recordIds.some(
      (id) => !alreadyReportedIds.has(id),
    );
    if (hasNewRecords) {
      duplicateGroups.push(group);
      for (const id of group.recordIds) {
        alreadyReportedIds.add(id);
      }
    }
  }

  // ── Scan profiles for duplicates ──
  const profilesResult = await client.query(
    "SELECT id, email, full_name, role, status, is_deleted FROM profiles",
  );
  totalRowsScanned += profilesResult.rowCount ?? 0;

  const profileRecords = profilesResult.rows as Record<string, unknown>[];
  const profileDifferingFields = ["full_name", "role", "status"];

  const emailGroups = groupByNormalizedKey(profileRecords, ["email"]);
  const emailDuplicates = buildDuplicateGroups(
    emailGroups,
    "profiles",
    ["email"],
    profileDifferingFields,
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

/**
 * Scans profiler_peserta.nama for naming inconsistencies.
 * Detects: Levenshtein similarity, substring matches, whitespace issues,
 * capitalization inconsistencies (via qa_temuan peserta_id), and abbreviations.
 * Read-only: uses SELECT queries only.
 */
export async function checkNames(client: Client): Promise<NameConsistencyReport> {
  const matches: IntegrityMatch[] = [];
  const groups: NameInconsistencyGroup[] = [];
  let totalRowsScanned = 0;

  // 1. Fetch all profiler_peserta names
  const pesertaResult = await client.query(
    "SELECT id, nama FROM profiler_peserta WHERE nama IS NOT NULL",
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
     ORDER BY qt.peserta_id`,
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
      const distance = levenshteinDistance(
        nameA.toLowerCase(),
        nameB.toLowerCase(),
      );
      if (distance <= 3 && distance > 0) {
        const idsA = nameToIds.get(nameA)!;
        const idsB = nameToIds.get(nameB)!;
        const allIds = [...idsA, ...idsB];
        const canonical = deriveCanonicalForm(
          nameA.length >= nameB.length ? nameA : nameB,
        );

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
        const canonical = deriveCanonicalForm(
          nameA.length >= nameB.length ? nameA : nameB,
        );

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
        const canonical = deriveCanonicalForm(
          nameA.length >= nameB.length ? nameA : nameB,
        );

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

/**
 * Scans profiler_peserta.foto_url values and verifies they resolve to
 * existing objects in Supabase Storage via HEAD checks.
 * Read-only: uses SELECT queries only + HEAD requests to Storage API.
 */
export async function checkFotos(client: Client): Promise<FotoReport> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL environment variable is required for check-fotos command.",
    );
  }

  const missing: FotoMissing[] = [];
  const broken: FotoBroken[] = [];
  const unverified: FotoUnverified[] = [];
  let validCount = 0;
  const matches: IntegrityMatch[] = [];

  // Fetch all profiler_peserta records with id, nama, foto_url
  const result = await client.query(
    "SELECT id, nama, foto_url FROM profiler_peserta",
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
  const shouldAbort = () => Date.now() - startTime > 120_000; // 120s overall timeout

  const checkResults = await processBatches(
    recordsToCheck,
    FOTO_BATCH_SIZE,
    async (record) => {
      if (shouldAbort()) {
        return {
          record,
          result: {
            status: "unverified" as const,
            reason: "overall timeout exceeded",
          },
        };
      }

      const checkResult = await checkFotoUrl(supabaseUrl, record.foto_url!);
      return { record, result: checkResult };
    },
    shouldAbort,
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
