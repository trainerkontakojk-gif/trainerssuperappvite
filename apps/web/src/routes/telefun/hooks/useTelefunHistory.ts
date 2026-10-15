import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "../../../lib/toast";
import {
  clearTelefunHistory,
  deleteTelefunSession,
  getTelefunSessions,
  mapTelefunSessionRow,
} from "../telefunApi";
import {
  canOverwriteTelefunLocalHistory,
  parseTelefunLocalHistory,
  shouldPersistTelefunLocalHistory,
} from "../telefunLocalHistory";
import type { CallRecord } from "../types";

export type TelefunHistoryLoadState = "loading" | "ready" | "error";

const STORAGE_KEY = "telefun_history";

function newestFirst(records: CallRecord[]): CallRecord[] {
  return records.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * Riwayat Telefun: baris server digabung dengan salinan lokal yang belum
 * tersinkron (sesi offline atau rekaman yang gagal terkirim). Salinan lokal
 * yang rusak tidak pernah ditimpa, supaya tidak ada data yang hilang diam-diam.
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
      // Rekaman lokal yang sudah ada di memori (mis. panggilan barusan) ikut dipertahankan.
      const extras = [...historyRef.current, ...localRecords].filter(
        (record, index, all) =>
          !dbIds.has(record.id) &&
          all.findIndex((other) => other.id === record.id) === index,
      );
      const merged = newestFirst([...dbRecords, ...extras]);
      commit(merged, shouldPersistTelefunLocalHistory(merged, isCorrupt));
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
      await deleteTelefunSession(id);
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
