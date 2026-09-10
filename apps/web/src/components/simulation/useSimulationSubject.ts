import { useCallback, useEffect, useRef, useState } from "react";
import {
  profilerSubjectClient,
  unwrapResponse,
  type SimulationSubjectOption,
} from "@/lib/api";
import type { SimulationSubjectSelection } from "@trainers/types";

export type PesertaOption = SimulationSubjectOption;

export type SubjectMode = "self" | "participant";

export function useSimulationSubject(accountKey: string | null) {
  const [mode, setMode] = useState<SubjectMode>("self");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<PesertaOption[]>([]);
  const [selected, setSelected] = useState<PesertaOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setMode("self");
    setSearch("");
    setOptions([]);
    setSelected(null);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
  }, [accountKey, reset]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    const generation = ++generationRef.current;

    // Mengedit search membatalkan selected participant lama and any older
    // request before its response can win the render race.
    setSelected(null);
    abortRef.current?.abort();
    abortRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 2) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await profilerSubjectClient.peserta.options.$get({
          query: { search: trimmed },
          signal: controller.signal,
        });
        const data = await unwrapResponse(response);
        if (generation !== generationRef.current) return;
        setOptions(Array.isArray(data) ? data : []);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (generation !== generationRef.current) return;
        setError(
          error instanceof Error ? error.message : "Gagal mencari peserta.",
        );
        setOptions([]);
      } finally {
        if (generation === generationRef.current) setLoading(false);
      }
    }, 300);
  }, []);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      runSearch(value);
    },
    [runSearch],
  );

  const changeMode = useCallback((nextMode: SubjectMode) => {
    setMode(nextMode);
    if (nextMode === "self") {
      setSelected(null);
      setSearch("");
      setOptions([]);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, []);

  const selection: SimulationSubjectSelection =
    mode === "participant" && selected
      ? { type: "participant", participantId: selected.id }
      : { type: "self" };

  const canConfirm =
    mode === "self" || (mode === "participant" && selected !== null);

  return {
    mode,
    setMode: changeMode,
    search,
    onSearchChange,
    options,
    selected,
    setSelected,
    loading,
    error,
    retry: () => runSearch(search),
    selection,
    canConfirm,
    reset,
  };
}
