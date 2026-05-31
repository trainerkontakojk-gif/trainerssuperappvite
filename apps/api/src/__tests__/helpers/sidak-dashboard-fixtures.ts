import * as fc from "fast-check";

// Mock periods, folders, indicators, weights
export const mockPeriods = [
  { id: "period-1", month: 1, year: 2025, label: "01/2025" },
];

export const mockFolders = [{ id: "folder-1", name: "Folder A" }];

export const mockIndicators = [
  {
    id: "ind-1",
    name: "Greeting",
    category: "non_critical",
    service_type: "call",
    bobot: 1,
  },
  {
    id: "ind-2",
    name: "Critical Point",
    category: "critical",
    service_type: "call",
    bobot: 1,
  },
];

export const mockWeights = [
  {
    service_type: "call",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
  },
];

export function mockBuildQuery(tableName: string, onAwait: () => any) {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

// Types for soft-delete test data generation
export interface ProfileRecord {
  id: string;
  is_deleted: boolean | null;
  status: "active" | "inactive";
}

export interface PesertaRecord {
  id: string;
  user_id: string | null;
  nama: string;
  tim: string;
  batch_name: string;
}

// Helper: determine if a peserta should be excluded
export function shouldBeExcluded(
  peserta: PesertaRecord,
  profiles: ProfileRecord[],
): boolean {
  if (peserta.user_id === null) return false;
  const profile = profiles.find((p) => p.id === peserta.user_id);
  if (!profile) return false;
  return profile.is_deleted === true || profile.status === "inactive";
}

// Simulate the getSoftDeletedPesertaIds logic
export function simulateGetSoftDeletedPesertaIds(
  profiles: ProfileRecord[],
  pesertaRecords: PesertaRecord[],
): string[] {
  const deletedProfiles = profiles.filter(
    (p) => p.is_deleted === true || p.status === "inactive",
  );
  if (deletedProfiles.length === 0) return [];
  const deletedProfileIds = deletedProfiles.map((p) => p.id);
  const excludedPeserta = pesertaRecords.filter(
    (pp) => pp.user_id !== null && deletedProfileIds.includes(pp.user_id),
  );
  return excludedPeserta.map((pp) => pp.id);
}

// Simulate filtering (like getAgents does)
export function simulateFilteredResults(
  pesertaRecords: PesertaRecord[],
  excludedIds: string[],
  showArchived: boolean,
): PesertaRecord[] {
  if (showArchived) return pesertaRecords;
  return pesertaRecords.filter((pp) => !excludedIds.includes(pp.id));
}

// Arbitraries for soft-delete tests
export const profileArb: fc.Arbitrary<ProfileRecord> = fc.record({
  id: fc.uuid(),
  is_deleted: fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(null),
  ),
  status: fc.oneof(
    fc.constant("active" as const),
    fc.constant("inactive" as const),
  ),
});

export function pesertaArb(profileIds: string[]): fc.Arbitrary<PesertaRecord> {
  const userIdArb = fc.oneof(
    fc.constant(null),
    ...(profileIds.length > 0
      ? [fc.constantFrom(...profileIds)]
      : [fc.constant(null)]),
    fc.uuid(),
  );

  return fc.record({
    id: fc.uuid(),
    user_id: userIdArb,
    nama: fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => s.trim().length > 0),
    tim: fc.constantFrom("Tim A", "Tim B", "Tim C"),
    batch_name: fc.constantFrom("Batch 1", "Batch 2", "Batch 3"),
  });
}
