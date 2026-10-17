import type { CallRecord } from "./types";

export interface TelefunLocalHistoryParseResult {
  records: CallRecord[];
  isCorrupt: boolean;
}

function isCallRecord(value: unknown): value is CallRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.date === "string" &&
    !Number.isNaN(Date.parse(record.date)) &&
    typeof record.url === "string" &&
    typeof record.consumerName === "string" &&
    typeof record.scenarioTitle === "string" &&
    typeof record.duration === "number" &&
    Number.isFinite(record.duration) &&
    record.duration >= 0
  );
}

export function parseTelefunLocalHistory(
  savedHistory: string | null,
  warn: (message: string, description?: string) => void,
): TelefunLocalHistoryParseResult {
  if (!savedHistory) return { records: [], isCorrupt: false };

  try {
    const parsedHistory: unknown = JSON.parse(savedHistory);
    if (
      !Array.isArray(parsedHistory) ||
      !parsedHistory.every((record) => isCallRecord(record))
    ) {
      throw new Error("Telefun local history has an invalid shape");
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

/**
 * Hanya panggilan yang belum ada di server disimpan di perangkat. Baris server
 * selalu dimuat ulang dari server; salinannya bisa basi (mis. dihapus dari
 * perangkat lain) dan akan muncul lagi bila ikut disimpan.
 */
export function isTelefunLocalOnlyRecord(record: CallRecord): boolean {
  return record.syncStatus === "unsynced" || record.syncStatus === "offline";
}

export function canOverwriteTelefunLocalHistory(isCorrupt: boolean): boolean {
  return !isCorrupt;
}
