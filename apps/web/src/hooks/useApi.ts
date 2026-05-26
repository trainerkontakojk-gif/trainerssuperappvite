import { useState, useEffect, useCallback } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_profile");
    localStorage.removeItem("trainers_login_time");
    localStorage.removeItem("trainers_last_activity");
    window.location.href = "/";
    throw new Error("Sesi telah berakhir. Silakan login kembali.");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "API tidak tersedia. Pastikan VITE_API_URL sudah benar dan ALLOWED_ORIGINS mencakup URL aplikasi ini.",
    );
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "API Error");
  return json.data;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<T>(path);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export async function postApi<T>(path: string, body: any): Promise<T> {
  return fetchApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function putApi<T>(path: string, body: any): Promise<T> {
  return fetchApi<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function patchApi<T>(path: string, body: any): Promise<T> {
  return fetchApi<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteApi(path: string): Promise<void> {
  await fetchApi(path, { method: "DELETE" });
}

export async function getApi<T>(path: string): Promise<T> {
  return fetchApi<T>(path);
}
