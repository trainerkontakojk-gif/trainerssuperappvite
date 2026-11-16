import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  KetikHistoryPage,
  KetikHistoryStatus,
  KetikHistorySummaryItem,
} from "@trainers/types";
import { useAuthStore } from "../../../store/authStore";
import { ketikApi } from "../ketikApi";
import { downloadKetikHistory } from "../utils/transcript";
import {
  historyExportReducer,
  type ExportEvent,
} from "./historyActionLifecycle";

const EMPTY: KetikHistoryPage = {
  items: [],
  nextCursor: null,
  total: 0,
  counts: { all: 0, completed: 0, running: 0, failed: 0, not_started: 0 },
  reviewedCount: 0,
  averageScore: null,
};
const SEARCH_DELAY_MS = 300;

export function useKetikHistoryPage() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [filter, setStatus] = useState<KetikHistoryStatus>("all");
  const [query, setSearch] = useState("");
  // The server search scans every session of the user; wait for typing to pause.
  const [searchTerm, setSearchTerm] = useState("");
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const cursor = cursors[page];
  const key = JSON.stringify([userId, filter, searchTerm, cursor]);
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
    const next = query.trim();
    const timer = setTimeout(
      () => setSearchTerm(next),
      next ? SEARCH_DELAY_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setStatus("all");
    setSearch("");
    setSearchTerm("");
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
      .getHistory({ limit: 20, q: searchTerm, status: filter, cursor })
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
  }, [key, userId, searchTerm, filter, cursor, attempt]);
  const state = result.key === key ? result.state : "loading";
  return {
    data: result.userId === userId ? result.data : EMPTY,
    state,
    filter,
    query,
    searchTerm,
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
  const [state, dispatch] = useReducer(historyExportReducer, {
    status: "idle",
  });
  const currentState = useRef(state);
  const transition = useCallback((event: ExportEvent) => {
    currentState.current = historyExportReducer(currentState.current, event);
    dispatch(event);
  }, []);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    invalidate();
    transition({ type: "reset" });
    return invalidate;
  }, [userId, status, q, transition]);
  const run = async () => {
    if (currentState.current.status === "exporting") return;
    const current = ++generation.current;
    transition({ type: "start", request: current });
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
        transition({ type: "progress", count: rows.length, request: current });
        if (!result.nextCursor) {
          downloadKetikHistory(rows);
          transition({ type: "done", request: current });
          return;
        }
        cursor = result.nextCursor;
      }
      throw new Error("Export page limit exceeded");
    } catch {
      if (generation.current === current)
        transition({ type: "failed", request: current });
    }
  };
  return {
    run,
    progress: state.status === "exporting" ? state.progress : null,
    error: state.status === "failed",
  };
}
