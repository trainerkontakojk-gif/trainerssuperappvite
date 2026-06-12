import { useState, useEffect, useCallback } from "react";
import type { LeaderAccessStatusItem } from "@trainers/types";
import { rpcClient, unwrapResponse } from "../lib/api";
import { supabase } from "../lib/supabase";

export function useAccessStatus(module: "ktp" | "sidak") {
  const [statusItem, setStatusItem] =
    useState<LeaderAccessStatusItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await rpcClient.v1.me["access-status"].$get();
      const data = await unwrapResponse(res);
      setStatusItem(data[module] || { status: "none", module, created_at: null });
    } catch (e: any) {
      setError(e.message);
      setStatusItem({ status: "none", module, created_at: null });
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    fetchStatus();
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
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
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
      setError(e.message);
      return false;
    }
  }, [module, fetchStatus]);

  return {
    status: statusItem?.status ?? "none",
    createdAt: statusItem?.created_at ?? null,
    loading,
    error,
    submitRequest,
    refetch: fetchStatus,
  };
}
