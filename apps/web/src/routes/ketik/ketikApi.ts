import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
} from "@trainers/types";
import { aiClient, ketikClient, unwrapResponse } from "../../lib/api";

export const ketikApi = {
  getScenarios: async () => {
    const res = await ketikClient.scenarios.$get();
    return unwrapResponse(res) as Promise<KetikScenario[]>;
  },
  getConsumerTypes: async () => {
    const res = await ketikClient["consumer-types"].$get();
    return unwrapResponse(res) as Promise<KetikConsumerType[]>;
  },
  generate: async (body: {
    scenarioId: string;
    scenarioDraft?: KetikScenario;
    consumerTypeId: string;
    consumerTypeDraft?: KetikConsumerType;
    identity: { name: string; city: string; phone: string };
    selectedModel: string;
    simulationDuration: number;
    responsePacingMode: "realistic" | "training_fast";
    chatHistory: ChatMessage[];
    remainingSeconds?: number;
    elapsedSeconds?: number;
  }) => {
    const res = await ketikClient.generate.$post({ json: body });
    return unwrapResponse(res) as Promise<{ text: string }>;
  },
  getSettings: async () => {
    try {
      const res = await ketikClient.settings.$get();
      const settings = await unwrapResponse(res) as KetikAppSettings;
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
    const res = await ketikClient.settings.$put({ json: settings });
    await unwrapResponse(res);
  },
  getHistory: async () => {
    const res = await ketikClient.history.$get();
    return unwrapResponse(res) as Promise<KetikSessionHistoryItem[]>;
  },
  persistSession: async (data: {
    scenarioTitle: string;
    consumerName: string;
    consumerPhone: string;
    consumerCity: string;
    messages: ChatMessage[];
    simulationDuration?: number;
  }) => {
    const res = await ketikClient.history.$post({ json: data });
    return unwrapResponse(res) as Promise<KetikSessionHistoryItem>;
  },
  deleteSession: async (id: string) => {
    const res = await ketikClient.history[":id"].$delete({
      param: { id },
    });
    await unwrapResponse(res);
  },
  clearHistory: async () => {
    const res = await ketikClient.history.$delete();
    await unwrapResponse(res);
  },
  startReview: async (sessionId: string) => {
    const res = await ketikClient.review.$post({
      json: { sessionId },
    });
    return unwrapResponse(res) as Promise<{
      status: string;
      scores?: KetikReviewDetail["scores"];
      error?: string;
    }>;
  },
  getReviewStatus: async (sessionId: string) => {
    const res = await ketikClient.review.status[":sessionId"].$get({
      param: { sessionId },
    });
    return unwrapResponse(res) as Promise<{
      status: "pending" | "processing" | "completed" | "failed";
      scores: KetikReviewDetail["scores"] | null;
      errorMessage?: string;
      resultReady: boolean;
    }>;
  },
  getReviewDetail: async (sessionId: string) => {
    const res = await ketikClient.review[":sessionId"].$get({
      param: { sessionId },
    });
    return unwrapResponse(res) as Promise<KetikReviewDetail>;
  },
  getUsageSummary: async () => {
    try {
      const res = await aiClient.usage.summary.$get({
        query: { module: "ketik" },
      });
      return await unwrapResponse(res) as unknown;
    } catch {
      return null;
    }
  },
};
