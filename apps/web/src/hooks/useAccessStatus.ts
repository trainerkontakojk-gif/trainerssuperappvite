import { useReducer, useRef, useEffect, useCallback } from "react";
import type { LeaderAccessStatusItem } from "@trainers/types";
import { rpcClient, unwrapResponse } from "../lib/api";
import { supabase } from "../lib/supabase";

type AccessState =
  | { phase: "loading"; item: LeaderAccessStatusItem | null; error: null }
  | { phase: "ready"; item: LeaderAccessStatusItem; error: string | null }
  | { phase: "failed"; item: LeaderAccessStatusItem; error: string };

type AccessAction =
  | { type: "load" }
  | { type: "success"; item: LeaderAccessStatusItem }
  | { type: "failure"; item: LeaderAccessStatusItem; error: string }
  | { type: "clear-error" }
  | { type: "submit-error"; item: LeaderAccessStatusItem; error: string };

function accessReducer(state: AccessState, action: AccessAction): AccessState {
  switch (action.type) {
    case "load":
      return { phase: "loading", item: state.item, error: null };
    case "success":
      return { phase: "ready", item: action.item, error: null };
    case "failure":
      return { phase: "failed", item: action.item, error: action.error };
    case "clear-error":
      return state.phase === "loading"
        ? state
        : { phase: "ready", item: state.item, error: null };
    case "submit-error":
      return state.phase === "loading"
        ? state
        : {
            phase: "ready",
            item: state.item ?? action.item,
            error: action.error,
          };
  }
}

export function useAccessStatus(module: "ktp" | "sidak") {
  const [state, dispatch] = useReducer(accessReducer, {
    phase: "loading",
    item: null,
    error: null,
  });
  const generation = useRef(0);

  const fetchStatus = useCallback(async () => {
    const request = ++generation.current;
    const empty: LeaderAccessStatusItem = {
      status: "none",
      module,
      created_at: null,
    };
    dispatch({ type: "load" });
    try {
      const res = await rpcClient.v1.me["access-status"].$get();
      const data = await unwrapResponse(res);
      if (request === generation.current) {
        dispatch({ type: "success", item: data[module] || empty });
      }
    } catch (e: any) {
      if (request === generation.current) {
        dispatch({ type: "failure", item: empty, error: e.message });
      }
    }
  }, [module]);

  useEffect(() => {
    void fetchStatus();
    return () => {
      generation.current += 1;
    };
  }, [fetchStatus]);

  useEffect(() => {
    const onFocus = () => {
      fetchStatus();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchStatus();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchStatus]);

  const submitRequest = useCallback(async () => {
    const request = generation.current;
    try {
      dispatch({ type: "clear-error" });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired");

      const { error: insertError } = await supabase
        .from("leader_access_requests")
        .insert({
          leader_user_id: user.id,
          module,
          status: "pending",
        });

      if (insertError) {
        if (insertError.code === "23505") {
          throw new Error(
            "Anda sudah memiliki request akses yang sedang diproses untuk modul ini",
          );
        }
        throw new Error(insertError.message);
      }

      await fetchStatus();
      return true;
    } catch (e: any) {
      if (request === generation.current) {
        dispatch({
          type: "submit-error",
          item: { status: "none", module, created_at: null },
          error: e.message,
        });
      }
      return false;
    }
  }, [module, fetchStatus]);

  return {
    status: state.item?.module === module ? state.item.status : "none",
    createdAt: state.item?.module === module ? state.item.created_at : null,
    loading: state.phase === "loading" || state.item?.module !== module,
    error: state.error,
    submitRequest,
    refetch: fetchStatus,
  };
}
