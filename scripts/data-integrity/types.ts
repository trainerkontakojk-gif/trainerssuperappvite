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

export interface NameInconsistencyGroup {
  recordIds: string[];
  nameVariants: string[];
  inconsistencyType:
    | "levenshtein"
    | "substring"
    | "whitespace"
    | "capitalization"
    | "abbreviation";
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
