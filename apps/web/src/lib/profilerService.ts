import { postApi, putApi, deleteApi } from "../hooks/useApi";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerTim,
} from "@trainers/types";

const BASE = "/profiler";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "API Error");
  return json.data;
}

export const profilerApi = {
  // Years
  getYears: () => fetchApi<ProfilerYear[]>(`${BASE}/years`),
  createYear: (year: number) =>
    postApi<ProfilerYear>(`${BASE}/years`, { year }),
  deleteYear: (id: string) => deleteApi(`${BASE}/years/${id}`),

  // Folders
  getFolders: () => fetchApi<ProfilerFolder[]>(`${BASE}/folders`),
  createFolder: (data: {
    name: string;
    year_id?: string;
    parent_id?: string;
  }) => postApi<ProfilerFolder>(`${BASE}/folders`, data),
  renameFolder: (id: string, name: string) =>
    putApi<ProfilerFolder>(`${BASE}/folders/${id}`, { name }),
  deleteFolder: (id: string) => deleteApi(`${BASE}/folders/${id}`),
  duplicateFolder: (folder_id: string, target_year_id: string) =>
    postApi<ProfilerFolder>(`${BASE}/folders/duplicate`, {
      folder_id,
      target_year_id,
    }),

  // Counts
  getFolderCounts: () => fetchApi<Record<string, number>>(`${BASE}/counts`),

  // Peserta
  getPeserta: (params?: {
    batch_name?: string;
    tim?: string;
    search?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.batch_name) q.set("batch_name", params.batch_name);
    if (params?.tim) q.set("tim", params.tim);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return fetchApi<{ items: ProfilerPeserta[]; total: number }>(
      `${BASE}/peserta${qs ? `?${qs}` : ""}`,
    );
  },
  getPesertaById: (id: string) =>
    fetchApi<ProfilerPeserta>(`${BASE}/peserta/${id}`),
  getPesertaByBatch: (batchName: string) =>
    fetchApi<ProfilerPeserta[]>(
      `${BASE}/peserta/batch/${encodeURIComponent(batchName)}`,
    ),
  createPeserta: (data: Partial<ProfilerPeserta>) =>
    postApi<ProfilerPeserta>(`${BASE}/peserta`, data),
  updatePeserta: (id: string, data: Partial<ProfilerPeserta>) =>
    putApi<ProfilerPeserta>(`${BASE}/peserta/${id}`, data),
  deletePeserta: (id: string) => deleteApi(`${BASE}/peserta/${id}`),
  bulkCreatePeserta: (items: Partial<ProfilerPeserta>[]) =>
    postApi<ProfilerPeserta[]>(`${BASE}/peserta/bulk`, { items }),
  copyPeserta: (peserta_ids: string[], target_batch_name: string) =>
    postApi<{ copied: number }>(`${BASE}/peserta/copy`, {
      peserta_ids,
      target_batch_name,
    }),
  reorderPeserta: (peserta_ids: string[]) =>
    putApi<void>(`${BASE}/peserta/reorder`, { peserta_ids }),
  bulkReorderPeserta: (updates: { id: string; nomor_urut: number }[]) =>
    postApi<void>(`${BASE}/peserta/bulk-reorder`, { updates }),
  getGlobalPool: (excludeBatch?: string) => {
    const q = excludeBatch
      ? `?exclude_batch=${encodeURIComponent(excludeBatch)}`
      : "";
    return fetchApi<ProfilerPeserta[]>(`${BASE}/peserta/global-pool${q}`);
  },

  // Teams
  getTeams: () => fetchApi<ProfilerTim[]>(`${BASE}/teams`),
  createTeam: (nama: string) => postApi<ProfilerTim>(`${BASE}/teams`, { nama }),
  deleteTeam: (id: string) => deleteApi(`${BASE}/teams/${id}`),
};
