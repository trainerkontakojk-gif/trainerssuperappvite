import type {
  KetikReviewAccepted,
  KetikReviewStatus,
  KetikHistoryQuery,
  KetikHistoryPage,
  KetikHistoryDetail,
  KetikLandingSummary,
  KetikAppSettings,
  KetikQuickTemplate,
  KetikSessionHistoryItem,
  KetikReviewDetail,
  KetikScenario,
  KetikConsumerType,
  AppendKetikSessionMessageRequest,
  KetikServerSession,
  KetikSessionTurnRequest,
  RequestKetikSessionResponse,
  KetikAssignmentSnapshot,
  AssignKetikConfiguration,
  ManagedUser,
} from "@trainers/types";
import {
  aiClient,
  adminClient,
  ketikClient,
  unwrapResponse,
} from "../../lib/api";
import type { hc } from "hono/client";
import type { KetikRouteType } from "@trainers/api/types";
import {
  createSettingsVersionStore,
  safeWriteKetikSettingsBackup,
} from "../../lib/settings-contract";

const serverClient = ketikClient as ReturnType<typeof hc<KetikRouteType>>;
const settingsVersion = createSettingsVersionStore();
const templatesVersion = createSettingsVersionStore(
  "x-ketik-templates-version",
);
let settingsVersionUserId: string | undefined;

function prepareSettingsVersion(userId: string | undefined): void {
  settingsVersion.clear();
  templatesVersion.clear();
  settingsVersionUserId = userId;
}

export const ketikApi = {
  startSession: async (
    requestId: string,
    simulationSubject:
      { type: "self" } | { type: "participant"; participantId: string },
  ) =>
    unwrapResponse(
      await serverClient.sessions.$post({
        json: { requestId, simulationSubject },
      }),
    ) as Promise<KetikServerSession>,
  getSession: async (id: string) =>
    unwrapResponse(
      await serverClient.sessions[":id"].$get({ param: { id } }),
    ) as Promise<KetikServerSession>,
  appendMessage: async (id: string, body: AppendKetikSessionMessageRequest) =>
    unwrapResponse(
      await serverClient.sessions[":id"].messages.$post({
        param: { id },
        json: body,
      }),
    ) as Promise<KetikServerSession>,
  requestResponse: async (id: string, body: RequestKetikSessionResponse) =>
    unwrapResponse(
      await serverClient.sessions[":id"].respond.$post({
        param: { id },
        json: body,
      }),
    ) as Promise<KetikServerSession>,
  sendTurn: async (id: string, body: KetikSessionTurnRequest) =>
    unwrapResponse(
      await serverClient.sessions[":id"].turns.$post({
        param: { id },
        json: body,
      }),
    ) as Promise<KetikServerSession>,
  finishSession: async (id: string) =>
    unwrapResponse(
      await serverClient.sessions[":id"].finish.$post({
        param: { id },
        json: {},
      }),
    ) as Promise<KetikSessionHistoryItem | null>,
  getAssignment: async (id = "self") =>
    unwrapResponse(
      await (id === "self"
        ? serverClient.assignments.self.$get()
        : serverClient.assignments[":recipientId"].$get({
            param: { recipientId: id },
          })),
    ) as Promise<KetikAssignmentSnapshot>,
  assignConfiguration: async (
    recipientId: string,
    body: AssignKetikConfiguration,
  ) =>
    unwrapResponse(
      await serverClient.assignments[":recipientId"].$put({
        param: { recipientId },
        json: body,
      }),
    ) as Promise<KetikAssignmentSnapshot>,
  getAssignmentRecipients: async () =>
    unwrapResponse(await adminClient.users.$get()) as Promise<ManagedUser[]>,
  getAssignmentSource: async () => {
    const response = await ketikClient.settings.$get();
    const settings = (await unwrapResponse(response)) as KetikAppSettings;
    const version = response.headers.get("x-settings-version");
    if (!version)
      throw new Error("Versi sumber belum tersedia. Muat ulang pengaturan.");
    return { settings, version };
  },
  getScenarios: async () => {
    const res = await ketikClient.scenarios.$get();
    return unwrapResponse(res) as Promise<KetikScenario[]>;
  },
  getConsumerTypes: async () => {
    const res = await ketikClient["consumer-types"].$get();
    return unwrapResponse(res) as Promise<KetikConsumerType[]>;
  },
  getSettings: async (userId?: string) => {
    prepareSettingsVersion(userId);
    const res = await ketikClient.settings.$get();
    const settings = (await unwrapResponse(res)) as KetikAppSettings;
    if (settingsVersionUserId === userId) {
      settingsVersion.capture(res);
      templatesVersion.capture(res);
      safeWriteKetikSettingsBackup(
        undefined,
        userId,
        settingsVersion.current(),
        settings,
      );
    }
    // A local backup is not proof that the current server settings loaded.
    return settings;
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
  saveTemplates: async (templates: KetikQuickTemplate[]) => {
    const res = await ketikClient.templates.$put(
      { json: { templates } },
      templatesVersion.requiredRequestOptions(),
    );
    await unwrapResponse(res);
    templatesVersion.capture(res);
  },
  getHistory: async (query: Partial<KetikHistoryQuery> = {}) => {
    const res = await serverClient.history.$get({
      query: {
        limit: String(query.limit ?? 20),
        q: query.q ?? "",
        status: query.status ?? "all",
        ...(query.cursor ? { cursor: query.cursor } : {}),
      },
    });
    return unwrapResponse(res) as Promise<KetikHistoryPage>;
  },
  getHistorySummary: async () =>
    unwrapResponse(
      await serverClient.history.summary.$get(),
    ) as Promise<KetikLandingSummary>,
  getHistoryDetail: async (id: string) =>
    unwrapResponse(
      await serverClient.history[":id"].$get({ param: { id } }),
    ) as Promise<KetikHistoryDetail>,
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
  startReview: async (
    sessionId: string,
    options: { rerun?: boolean; requestId?: string } = {},
  ) => {
    const res = await serverClient.review.$post({
      json: { sessionId, ...options },
    });
    return unwrapResponse(res) as Promise<KetikReviewAccepted>;
  },
  getReviewStatus: async (sessionId: string) =>
    unwrapResponse(
      await serverClient.review.status[":sessionId"].$get({
        param: { sessionId },
      }),
    ) as Promise<KetikReviewStatus>,
  getReviewDetail: async (sessionId: string) =>
    unwrapResponse(
      await serverClient.review[":sessionId"].$get({ param: { sessionId } }),
    ) as Promise<KetikReviewDetail>,
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
