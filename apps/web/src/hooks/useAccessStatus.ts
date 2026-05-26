import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "./useApi";
import { supabase } from "../lib/supabase";

type AccessStatus = "none" | "pending" | "approved" | "rejected" | "revoked";

interface AccessStatusItem {
  status: AccessStatus;
  module: string;
  created_at: string | null;
}

interface AccessStatusMap {
  ktp: AccessStatusItem;
  sidak: AccessStatusItem;
}

export function useAccessStatus(module: "ktp" | "sidak") {
  const [statusItem, setStatusItem] = useState<AccessStatusItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<AccessStatusMap>("/me/access-status");
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
