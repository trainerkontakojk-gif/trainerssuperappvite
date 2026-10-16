import { useCallback, useRef, useState } from "react";

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
}

/**
 * Pengganti `window.confirm` yang dirender lewat `ConfirmDialog`. Hook bisnis
 * menunggu `confirm(...)` seperti biasa; komponen merender `request` dan
 * memanggil `resolve(true|false)` dari tombol dialog.
 */
export function useConfirmRequest() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    // Permintaan lama yang belum dijawab dianggap batal.
    resolverRef.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const resolve = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  return { request, confirm, resolve };
}

export type ConfirmFn = ReturnType<typeof useConfirmRequest>["confirm"];
