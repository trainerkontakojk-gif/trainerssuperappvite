import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
} from "@trainers/types";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api/v1";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "API Error");
  return json.data;
}

export const ketikApi = {
  getScenarios: () => apiFetch<KetikScenario[]>("/ketik/scenarios"),
  getConsumerTypes: () =>
    apiFetch<KetikConsumerType[]>("/ketik/consumer-types"),
  generate: (body: any) =>
    apiFetch<{ text: string }>("/ketik/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSettings: async () => {
    try {
      const settings = await apiFetch<KetikAppSettings>("/ketik/settings");
      localStorage.setItem("ketik_settings_backup", JSON.stringify(settings));
      return settings;
    } catch (error) {
      const backup = localStorage.getItem("ketik_settings_backup");
      if (backup) {
        console.warn(
          "API error fetching settings, using localStorage backup",
          error,
        );
        return JSON.parse(backup) as KetikAppSettings;
      }
      throw error;
    }
  },
  saveSettings: async (settings: KetikAppSettings) => {
    localStorage.setItem("ketik_settings_backup", JSON.stringify(settings));
    return apiFetch<void>("/ketik/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },
  getHistory: () => apiFetch<KetikSessionHistoryItem[]>("/ketik/history"),
  persistSession: (data: {
    scenarioTitle: string;
    consumerName: string;
    consumerPhone: string;
    consumerCity: string;
    messages: ChatMessage[];
    simulationDuration?: number;
  }) =>
    apiFetch<KetikSessionHistoryItem>("/ketik/history", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteSession: (id: string) =>
    apiFetch<void>(`/ketik/history/${id}`, { method: "DELETE" }),
  clearHistory: () => apiFetch<void>("/ketik/history", { method: "DELETE" }),
  startReview: (sessionId: string) =>
    apiFetch<any>("/ketik/review", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  getReviewStatus: (sessionId: string) =>
    apiFetch<any>(`/ketik/review/status/${sessionId}`),
  getReviewDetail: (sessionId: string) =>
    apiFetch<KetikReviewDetail>(`/ketik/review/${sessionId}`),
  getUsageSummary: () => {
    const token = localStorage.getItem("auth_token");
    return fetch(`${API_BASE}/ai/usage/summary?module=ketik`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((r) => r.json())
      .then((j) => (j.success ? j.data : null));
  },
};
