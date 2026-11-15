// Shared by the ketik-server-chat-*.spec.ts files.
import { type Page } from "@playwright/test";
import type { KetikServerSession } from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { openHermeticShell, type ApiMock } from "./hermeticShell";

export const id = "23000000-0000-4000-8000-000000000001";

export function session(
  overrides: Partial<KetikServerSession> = {},
): KetikServerSession {
  const settings = DEFAULT_KETIK_SETTINGS;
  return {
    id,
    state: "active",
    version: 0,
    agentVersion: 0,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    scenario: settings.scenarios[0],
    config: {
      scenarios: settings.scenarios,
      consumerType: settings.consumerTypes[0],
      identity: { name: "Bu Rina", city: "Bandung", phone: "0800000000" },
      selectedModel: settings.selectedModel,
      simulationDuration: 5,
      responsePacingMode: "training_fast",
    },
    simulationSubject: {
      type: "self",
      participantId: null,
      displayName: "Trainer",
      batchName: null,
      team: null,
    },
    messages: [],
    consumerClosed: false,
    provenance: "server_v1",
    awaitingResponse: false,
    pendingResponse: null,
    pendingTurn: null,
    ...overrides,
  };
}

export const base: ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/ai/usage/summary",
    body: { success: true, data: null },
  },
  {
    method: "GET",
    path: "/api/v1/ketik/settings",
    headers: { "x-settings-version": "2026-10-14T05:00:00.000Z" },
    body: { success: true, data: DEFAULT_KETIK_SETTINGS },
  },
  {
    method: "GET",
    path: "/api/v1/ketik/history/summary",
    body: {
      success: true,
      data: {
        sessionsThisMonth: 0,
        reviewing: 0,
        average: null,
        focus: null,
        recent: [],
        followUps: [],
      },
    },
  },
];

export async function openTypingChat(
  page: Page,
  options: {
    initial?: KetikServerSession;
    responseMessages?: Array<{ id: string; text: string }>;
  } = {},
) {
  let live = options.initial ?? session();
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  const sessionPath = "**/api/v1/ketik/sessions/" + id;
  await page.route(sessionPath, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route("**/api/v1/ketik/sessions", (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route(sessionPath + "/messages", async (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      text: string;
    };
    live = {
      ...live,
      version: live.version + 1,
      agentVersion: live.agentVersion + 1,
      awaitingResponse: true,
      messages: [
        ...live.messages,
        {
          id: body.requestId,
          sender: "agent",
          text: body.text,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
  });
  let responseAt: number | null = null;
  let responseCalls = 0;
  let resolveResponseStarted!: () => void;
  const responseStarted = new Promise<void>((resolve) => {
    resolveResponseStarted = resolve;
  });
  await page.route(sessionPath + "/respond", async (route) => {
    responseAt = Date.now();
    responseCalls++;
    resolveResponseStarted();
    const replies = options.responseMessages ?? [
      { id: "reply-default", text: "Saya sudah membaca penjelasanmu." },
    ];
    live = {
      ...live,
      version: live.version + replies.length,
      awaitingResponse: false,
      messages: [
        ...live.messages,
        ...replies.map((reply) => ({
          id: reply.id,
          sender: "consumer" as const,
          text: reply.text,
          timestamp: new Date().toISOString(),
        })),
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
  });

  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Mulai|Lanjutkan/ })
    .click();
  const room = page.getByRole("region", { name: "Ruang chat" });
  const input = room.getByRole("textbox", { name: "Tulis balasan" });
  return {
    audit,
    input,
    responseAt: () => responseAt,
    responseCalls: () => responseCalls,
    responseStarted,
    room,
  };
}
