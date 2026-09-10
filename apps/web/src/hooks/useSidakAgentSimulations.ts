import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SidakSimulationDetail,
  SidakSimulationModule,
  SidakSimulationSummary,
} from "../lib/api";
import {
  getErrorMessage,
  sidakClient,
  unwrapResponse,
} from "../lib/api";

export type SidakSimulationModuleFilter = "all" | SidakSimulationModule;

export function useSidakAgentSimulations(
  agentId: string,
  module: SidakSimulationModuleFilter,
) {
  const [items, setItems] = useState<SidakSimulationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SidakSimulationSummary | null>(null);
  const [detail, setDetail] = useState<SidakSimulationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const listAbortControllerRef = useRef<AbortController | null>(null);
  const detailAbortControllerRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, generation: number) => {
      listAbortControllerRef.current?.abort();
      const controller = new AbortController();
      listAbortControllerRef.current = controller;

      try {
        const page = await unwrapResponse(
          await sidakClient["agents/:id/simulations"].$get({
            param: { id: agentId },
            query: cursor ? { module, cursor } : { module },
            signal: controller.signal,
          }),
        );
        if (generation !== generationRef.current) return;
        setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (requestError: unknown) {
        if (controller.signal.aborted) return;
        if (generation !== generationRef.current) return;
        setError(getErrorMessage(requestError, "Gagal memuat riwayat simulasi."));
      } finally {
        if (listAbortControllerRef.current === controller) {
          listAbortControllerRef.current = null;
        }
        if (generation === generationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [agentId, module],
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    detailGenerationRef.current += 1;
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(true);
    setLoadingMore(false);
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    void fetchPage(null, generation);

    return () => {
      generationRef.current += 1;
      detailGenerationRef.current += 1;
      listAbortControllerRef.current?.abort();
      detailAbortControllerRef.current?.abort();
    };
  }, [fetchPage]);

  const retry = useCallback(() => {
    const generation = ++generationRef.current;
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(true);
    setLoadingMore(false);
    void fetchPage(null, generation);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore || loading) return;
    const generation = generationRef.current;
    setLoadingMore(true);
    void fetchPage(nextCursor, generation);
  }, [fetchPage, loading, loadingMore, nextCursor]);

  const openDetail = useCallback(
    async (item: SidakSimulationSummary) => {
      const generation = ++detailGenerationRef.current;
      detailAbortControllerRef.current?.abort();
      const controller = new AbortController();
      detailAbortControllerRef.current = controller;
      setSelected(item);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const result = await unwrapResponse(
          await sidakClient["agents/:id/simulations/:module/:historyId"].$get({
            param: {
              id: agentId,
              module: item.module,
              historyId: item.id,
            },
            signal: controller.signal,
          }),
        );
        if (generation !== detailGenerationRef.current) return;
        setDetail(result);
      } catch (requestError: unknown) {
        if (controller.signal.aborted) return;
        if (generation !== detailGenerationRef.current) return;
        setDetailError(getErrorMessage(requestError, "Gagal memuat detail simulasi."));
      } finally {
        if (detailAbortControllerRef.current === controller) {
          detailAbortControllerRef.current = null;
        }
        if (generation === detailGenerationRef.current) setDetailLoading(false);
      }
    },
    [agentId],
  );

  const closeDetail = useCallback(() => {
    detailGenerationRef.current += 1;
    detailAbortControllerRef.current?.abort();
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const retryDetail = useCallback(() => {
    if (!selected) return;
    void openDetail(selected);
  }, [openDetail, selected]);

  return {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    retry,
    loadMore,
    selected,
    detail,
    detailLoading,
    detailError,
    openDetail,
    closeDetail,
    retryDetail,
  };
}
