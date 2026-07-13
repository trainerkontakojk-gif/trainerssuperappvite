import type { CallRecord } from "./types";

export interface TelefunLocalHistoryParseResult {
  records: CallRecord[];
  isCorrupt: boolean;
}

export function parseTelefunLocalHistory(
  savedHistory: string | null,
  warn: (message: string, description?: string) => void,
): TelefunLocalHistoryParseResult {
  if (!savedHistory) return { records: [], isCorrupt: false };

  try {
    const parsedHistory: unknown = JSON.parse(savedHistory);
    if (!Array.isArray(parsedHistory)) {
      throw new Error("Telefun local history is not an array");
    }
    return {
      records: parsedHistory as CallRecord[],
      isCorrupt: false,
    };
  } catch {
    warn(
      "Riwayat lokal Telefun tidak dapat dibaca.",
      "Riwayat yang tersimpan di server tetap dimuat.",
    );
    return { records: [], isCorrupt: true };
  }
}

export function shouldPersistTelefunLocalHistory(
  records: CallRecord[],
  isCorrupt: boolean,
): boolean {
  return records.length > 0 && !isCorrupt;
}
