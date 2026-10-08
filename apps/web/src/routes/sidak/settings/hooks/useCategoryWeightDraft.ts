import { useCallback, useEffect, useRef, useState } from "react";

export type WeightSaveStatus = "idle" | "saving" | "saved" | "error";

/** Jeda tanpa perubahan sebelum bobot dikirim otomatis (keyboard/ketik). */
export const WEIGHT_COMMIT_DEBOUNCE_MS = 500;

interface Options {
  versionId: string;
  /** Bobot Non-critical dari server, persen bulat 0-100. */
  serverPercent: number;
  save: (versionId: string, nonCriticalPercent: number) => Promise<void>;
}

/**
 * Bobot kategori sebagai draft lokal: perubahan selama drag/ketik tidak
 * mengirim request. Hanya satu `save` per commit (pointer up, blur, Enter,
 * atau jeda `WEIGHT_COMMIT_DEBOUNCE_MS`). Hasil request lama diabaikan, dan bila
 * gagal nilai kembali ke nilai server terakhir yang diketahui.
 */
export function useCategoryWeightDraft({
  versionId,
  serverPercent,
  save,
}: Options) {
  const [value, setValue] = useState(serverPercent);
  const [status, setStatus] = useState<WeightSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const valueRef = useRef(serverPercent);
  const savedRef = useRef(serverPercent);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const versionRef = useRef(versionId);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current) return;
    const percent = valueRef.current;
    if (percent === savedRef.current) {
      dirtyRef.current = false;
      setStatus("idle");
      return;
    }
    const request = ++requestRef.current;
    const targetVersion = versionRef.current;
    setStatus("saving");
    setError(null);
    saveRef
      .current(targetVersion, percent)
      .then(() => {
        if (request !== requestRef.current || targetVersion !== versionRef.current) return;
        savedRef.current = percent;
        dirtyRef.current = valueRef.current !== percent;
        setStatus("saved");
      })
      .catch((e: unknown) => {
        if (request !== requestRef.current || targetVersion !== versionRef.current) return;
        dirtyRef.current = false;
        valueRef.current = savedRef.current;
        setValue(savedRef.current);
        setStatus("error");
        setError(e instanceof Error && e.message ? e.message : "Terjadi kesalahan");
      });
  }, []);

  const change = useCallback(
    (next: number) => {
      const percent = Math.min(100, Math.max(0, Math.round(next)));
      valueRef.current = percent;
      dirtyRef.current = true;
      setValue(percent);
      clearTimer();
      timerRef.current = setTimeout(commit, WEIGHT_COMMIT_DEBOUNCE_MS);
    },
    [commit],
  );

  // Pindah versi: kirim dulu perubahan yang tertunda (ke versi lamanya), lalu reset.
  useEffect(() => {
    if (versionRef.current !== versionId) {
      commit();
      versionRef.current = versionId;
      dirtyRef.current = false;
      savedRef.current = serverPercent;
      valueRef.current = serverPercent;
      setValue(serverPercent);
      setStatus("idle");
      setError(null);
    }
  }, [versionId, serverPercent, commit]);

  // Nilai server berubah (refetch) saat tidak ada suntingan lokal: ikuti server.
  useEffect(() => {
    if (versionRef.current !== versionId || dirtyRef.current) return;
    savedRef.current = serverPercent;
    valueRef.current = serverPercent;
    setValue(serverPercent);
  }, [serverPercent, versionId]);

  useEffect(() => () => clearTimer(), []);

  return { value, status, error, change, commit };
}
