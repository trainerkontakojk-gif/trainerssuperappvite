import { useCallback, useEffect, useState } from "react";
import type {
  PdktMailboxDetailItem,
  PdktMailboxListItem,
} from "@trainers/types";
import { pdktClient, unwrapResponse } from "../../../lib/api";

/** Cache selected details; failures stay explicit until the user retries. */
export function usePdktMailboxDetail(
  selectedId: string | null,
  items: PdktMailboxListItem[] | null,
) {
  const [cache, setCache] = useState<Record<string, PdktMailboxDetailItem>>({});
  const [errorId, setErrorId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const detail = selectedId ? cache[selectedId] : undefined;
  const visible = Boolean(
    selectedId && items?.some((item) => item.id === selectedId),
  );
  useEffect(() => {
    if (!selectedId || !visible || detail) return;
    let cancelled = false;
    setErrorId(null);
    void (async () => {
      try {
        const data = (await unwrapResponse(
          await pdktClient.mailbox[":id"].$get({ param: { id: selectedId } }),
        )) as PdktMailboxDetailItem | null;
        if (!data || data.id !== selectedId)
          throw new Error("Email tidak tersedia.");
        if (!cancelled)
          setCache((previous) => ({ ...previous, [data.id]: data }));
      } catch (error) {
        if (!cancelled) {
          console.error("[PDKT] Failed to load mailbox detail:", error);
          setErrorId(selectedId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, visible, detail, attempt]);
  const invalidate = useCallback((id: string | null) => {
    if (!id) return;
    setCache((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);
  const retry = useCallback(() => {
    setErrorId(null);
    setAttempt((previous) => previous + 1);
  }, []);
  return {
    detail,
    failed: Boolean(selectedId && errorId === selectedId),
    retry,
    invalidate,
  };
}
