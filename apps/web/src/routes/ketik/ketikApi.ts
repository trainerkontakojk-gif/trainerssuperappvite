import type {
  KetikAppSettings,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikScenario,
  KetikConsumerType,
  ChatMessage,
} from "@trainers/types";
import { aiClient, ketikClient, unwrapResponse } from "../../lib/api";
import {
  createSettingsVersionStore,
  safeReadKetikSettingsBackup,
  safeWriteKetikSettingsBackup,
} from "../../lib/settings-contract";

const settingsVersion = createSettingsVersionStore();
let settingsVersionUserId: string | undefined;

function prepareSettingsVersion(userId: string | undefined): void {
  settingsVersion.clear();
  settingsVersionUserId = userId;
}

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
  getSettings: async (userId?: string) => {
    prepareSettingsVersion(userId);
    try {
      const res = await ketikClient.settings.$get();
      const settings = (await unwrapResponse(res)) as KetikAppSettings;
      settingsVersion.capture(res);
      const version = settingsVersion.current();
      if (version) {
        safeWriteKetikSettingsBackup(undefined, userId, version, settings);
      }
      return settings;
    } catch (error) {
      const backup = safeReadKetikSettingsBackup<KetikAppSettings>(
        undefined,
        userId,
      );
      if (backup) {
        settingsVersion.restore(backup.version);
        console.warn(
          "API error fetching settings, using localStorage backup",
          error,
        );
        return backup.settings;
      }
      throw error;
    }
  },
  saveSettings: async (settings: KetikAppSettings, userId?: string) => {
    if (settingsVersionUserId !== userId) {
      prepareSettingsVersion(userId);
    }
    const res = await ketikClient.settings.$put(
      { json: settings },
      settingsVersion.requiredRequestOptions(),
    );
    await unwrapResponse(res);
    settingsVersion.capture(res);
    const version = settingsVersion.current();
    if (version) {
      safeWriteKetikSettingsBackup(undefined, userId, version, settings);
    }
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
      return (await unwrapResponse(res)) as unknown;
    } catch {
      return null;
    }
  },
};
