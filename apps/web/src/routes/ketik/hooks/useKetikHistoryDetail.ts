import { useCallback, useEffect, useRef, useState } from "react";
import type { KetikHistoryDetail, KetikLandingSummary } from "@trainers/types";
import { ketikApi } from "../ketikApi";

export const EMPTY_KETIK_SUMMARY: KetikLandingSummary = {
  sessionsThisMonth: 0,
  reviewing: 0,
  average: null,
  focus: null,
  followUps: [],
  recent: [],
};
export function useKetikLandingSummary(userId: string | undefined) {
  const [result, setResult] = useState<{
    userId: string | undefined;
    data: KetikLandingSummary;
    state: "loading" | "ready" | "error";
  }>({ userId, data: EMPTY_KETIK_SUMMARY, state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    let cancelled = false;
    setResult({ userId, data: EMPTY_KETIK_SUMMARY, state: "loading" });
    void ketikApi
      .getHistorySummary()
      .then((data) => {
        if (!cancelled) setResult({ userId, data, state: "ready" });
      })
      .catch(() => {
        if (!cancelled)
          setResult({ userId, data: EMPTY_KETIK_SUMMARY, state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);
  return {
    summary: result.userId === userId ? result.data : EMPTY_KETIK_SUMMARY,
    historyState:
      result.userId === userId ? result.state : ("loading" as const),
    loadHistory: reload,
  };
}
export function useKetikHistoryDetail(
  userId: string | undefined,
  id: string | undefined,
) {
  const [result, setResult] = useState<{
    key: string;
    data: KetikHistoryDetail | null;
    state: "loading" | "ready" | "error";
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${id}`;
  const currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
  }, [key]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setResult({ key, data: null, state: "loading" });
    void ketikApi
      .getHistoryDetail(id)
      .then((data) => {
        if (!cancelled) setResult({ key, data, state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, data: null, state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [id, key, attempt]);
  const update = useCallback(
    (data: KetikHistoryDetail) => {
      if (currentKey.current === key) setResult({ key, data, state: "ready" });
    },
    [key],
  );
  return {
    reviewSession: result?.key === key ? result.data : null,
    detailState: result?.key === key ? result.state : ("loading" as const),
    retryDetail: () => setAttempt((v) => v + 1),
    updateDetail: update,
  };
}
