import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KetikHistoryPage,
  KetikHistoryStatus,
  KetikHistorySummaryItem,
} from "@trainers/types";
import { useAuthStore } from "../../../store/authStore";
import { ketikApi } from "../ketikApi";
import { downloadKetikHistory } from "../utils/transcript";

const EMPTY: KetikHistoryPage = {
  items: [],
  nextCursor: null,
  total: 0,
  counts: { all: 0, completed: 0, running: 0, failed: 0, not_started: 0 },
  reviewedCount: 0,
  averageScore: null,
};
export function useKetikHistoryPage() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [filter, setStatus] = useState<KetikHistoryStatus>("all");
  const [query, setSearch] = useState("");
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors[page];
  const key = JSON.stringify([userId, filter, query.trim(), cursor]);
  const [result, setResult] = useState<{
    key: string;
    userId: string | undefined;
    data: KetikHistoryPage;
    state: "loading" | "ready" | "error";
  }>({ key, userId, data: EMPTY, state: "loading" });
  const reload = useCallback(() => {
    setPage(0);
    setCursors([undefined]);
    setAttempt((n) => n + 1);
  }, []);
  const setFilter = (next: KetikHistoryStatus) => {
    setStatus(next);
    setPage(0);
    setCursors([undefined]);
  };
  const setQuery = (next: string) => {
    setSearch(next);
    setPage(0);
    setCursors([undefined]);
  };
  useEffect(() => {
    setStatus("all");
    setSearch("");
    setPage(0);
    setCursors([undefined]);
  }, [userId]);
  useEffect(() => {
    let cancelled = false;
    setResult((prev) => ({
      key,
      userId,
      data: prev.userId === userId ? prev.data : EMPTY,
      state: "loading",
    }));
    void ketikApi
      .getHistory({ limit: 20, q: query.trim(), status: filter, cursor })
      .then((data) => {
        if (!cancelled) setResult({ key, userId, data, state: "ready" });
      })
      .catch(() => {
        if (!cancelled)
          setResult((prev) => ({
            key,
            userId,
            data: prev.userId === userId ? prev.data : EMPTY,
            state: "error",
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, userId, query, filter, cursor, attempt]);
  const state = result.key === key ? result.state : "loading";
  return {
    data: result.userId === userId ? result.data : EMPTY,
    state,
    filter,
    query,
    setFilter,
    setQuery,
    page: page + 1,
    reload,
    resetFilters: () => {
      setFilter("all");
      setQuery("");
    },
    previous: () => setPage((n) => Math.max(0, n - 1)),
    next: () => {
      if (!result.data.nextCursor || state !== "ready") return;
      setCursors((prev) => [
        ...prev.slice(0, page + 1),
        result.data.nextCursor!,
      ]);
      setPage((n) => n + 1);
    },
  };
}

export function useKetikHistoryExport(status: KetikHistoryStatus, q: string) {
  const userId = useAuthStore((s) => s.session?.user.id);
  const generation = useRef(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    invalidate();
    setProgress(null);
    setError(false);
    return invalidate;
  }, [userId, status, q]);
  const run = async () => {
    if (progress !== null) return;
    const current = ++generation.current;
    setProgress(0);
    setError(false);
    try {
      const rows: KetikHistorySummaryItem[] = [];
      const ids = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < 100; page++) {
        const result = await ketikApi.getHistory({
          status,
          q: q.trim(),
          limit: 100,
          cursor,
        });
        if (generation.current !== current) return;
        if (result.total > 10_000) throw new Error("Export limit exceeded");
        for (const item of result.items) {
          if (ids.has(item.id))
            throw new Error("History changed during export");
          ids.add(item.id);
          rows.push(item);
        }
        setProgress(rows.length);
        if (!result.nextCursor) {
          downloadKetikHistory(rows);
          return;
        }
        cursor = result.nextCursor;
      }
      throw new Error("Export page limit exceeded");
    } catch {
      if (generation.current === current) setError(true);
    } finally {
      if (generation.current === current) setProgress(null);
    }
  };
  return { run, progress, error };
}
