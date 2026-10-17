import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import {
  clearTelefunHistory,
  deleteTelefunSession,
  getTelefunSessions,
  mapTelefunSessionRow,
} from "../telefunApi";
import {
  canOverwriteTelefunLocalHistory,
  isTelefunLocalOnlyRecord,
  parseTelefunLocalHistory,
} from "../telefunLocalHistory";
import type { CallRecord } from "../types";

export type TelefunHistoryLoadState = "loading" | "ready" | "error";

const STORAGE_KEY = "telefun_history";

/**
 * Salinan lokal hanya cadangan. Penyimpanan penuh atau diblokir tidak boleh
 * menggagalkan riwayat, simpan panggilan, atau hapus.
 */
function writeLocalHistory(records: CallRecord[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.filter(isTelefunLocalOnlyRecord)),
    );
  } catch (error) {
    console.warn("[Telefun] Local history copy not saved", error);
  }
}

function newestFirst(records: CallRecord[]): CallRecord[] {
  return records.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * Riwayat Telefun: baris server digabung dengan panggilan yang belum
 * tersinkron, yang hanya ada di perangkat ini. Salinan lokal yang rusak tidak
 * pernah ditimpa, supaya tidak ada data yang hilang diam-diam.
 */
export function useTelefunHistory() {
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [state, setState] = useState<TelefunHistoryLoadState>("loading");
  const historyRef = useRef<CallRecord[]>([]);
  const localIsCorruptRef = useRef(false);

  const commit = useCallback((next: CallRecord[], persist = true) => {
    historyRef.current = next;
    setHistory(next);
    if (persist && canOverwriteTelefunLocalHistory(localIsCorruptRef.current)) {
      writeLocalHistory(next);
    }
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    const { records: localRecords, isCorrupt } = parseTelefunLocalHistory(
      localStorage.getItem(STORAGE_KEY),
      notify.warning,
    );
    localIsCorruptRef.current = isCorrupt;
    try {
      const dbRecords = (await getTelefunSessions()).map(mapTelefunSessionRow);
      const dbIds = new Set(dbRecords.map((record) => record.id));
      // Panggilan di memori (mis. panggilan barusan) ikut dipertahankan. Dari
      // salinan lokal hanya yang belum tersinkron; salinan lama baris server
      // (sebelum aturan ini) bisa sudah dihapus dan tidak boleh muncul lagi.
      const extras = [
        ...historyRef.current,
        ...localRecords.filter(isTelefunLocalOnlyRecord),
      ].filter(
        (record, index, all) =>
          !dbIds.has(record.id) &&
          all.findIndex((other) => other.id === record.id) === index,
      );
      const merged = newestFirst([...dbRecords, ...extras]);
      // Selalu ditulis ulang (bila tidak rusak) supaya salinan lama terbersihkan.
      commit(merged);
      setState("ready");
    } catch (error) {
      console.warn("[Telefun] Failed to load history", error);
      setState("error");
    }
  }, [commit]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Sisipkan atau ganti satu sesi berdasarkan ID (skor, status, dan rekaman berubah bersama). */
  const upsert = useCallback(
    (record: CallRecord, options: { replaceId?: string } = {}) => {
      const next = newestFirst([
        record,
        ...historyRef.current.filter(
          (existing) =>
            existing.id !== record.id && existing.id !== options.replaceId,
        ),
      ]);
      commit(next);
      setState("ready");
    },
    [commit],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteTelefunSession(id);
      } catch (error) {
        // Sesi yang sudah tidak ada di server (mis. salinan lokal) cukup dihapus di sini.
        if (!(error instanceof ApiError && error.code === "NOT_FOUND")) {
          throw error;
        }
      }
      commit(historyRef.current.filter((record) => record.id !== id));
    },
    [commit],
  );

  const clear = useCallback(async () => {
    await clearTelefunHistory();
    localStorage.removeItem(STORAGE_KEY);
    localIsCorruptRef.current = false;
    commit([], false);
  }, [commit]);

  const find = useCallback(
    (id: string) => historyRef.current.find((record) => record.id === id),
    [],
  );

  return { history, state, load, upsert, remove, clear, find };
}
