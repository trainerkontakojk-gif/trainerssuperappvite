import { expect, test } from "@playwright/test";
import type {
  KetikServerSession,
  KetikSessionTurnRequest,
} from "@trainers/types";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  practiceQuotaMock,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const id = "23000000-0000-4000-8000-000000000001";
function session(
  overrides: Partial<KetikServerSession> = {},
): KetikServerSession {
  const settings = DEFAULT_KETIK_SETTINGS;
  return {
    id,
    state: "active",
    version: 0,
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
    pendingTurn: null,
    ...overrides,
  };
}
const base: ApiMock[] = [
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
    body: { success: true, data: { sessionsThisMonth: 0, reviewing: 0, average: null, focus: null, recent: [], followUps: [] } },
  },
];
test.beforeAll(() => assertLocalDevOnlyTarget());
test("serial queue keeps typing and Enter available, preserves both turns and resumes the canonical transcript", async ({
  page,
}) => {
  let live = session();
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route("**/api/v1/ketik/sessions", (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: KetikSessionTurnRequest[] = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/turns`, async (route) => {
    const body = route.request().postDataJSON() as KetikSessionTurnRequest;
    calls.push(body);
    expect(body.expectedVersion).toBe((calls.length - 1) * 2);
    expect(Object.keys(body).sort()).toEqual([
      "expectedVersion",
      "requestId",
      "text",
    ]);
    if (calls.length === 1) await gate;
    live = {
      ...live,
      version: live.version + 2,
      messages: [
        ...live.messages,
        {
          id: body.requestId,
          sender: "agent",
          text: body.text,
          timestamp: new Date().toISOString(),
        },
        {
          id: `reply-${calls.length}`,
          sender: "consumer",
          text: `Balasan ${calls.length}`,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
  });
  // Trainer chooses self using the existing subject dialog.
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  const subject = page.getByRole("dialog");
  await subject.getByRole("button", { name: /Mulai|Lanjutkan/ }).click();
  const room = page.getByRole("region", { name: "Ruang chat" });
  const input = room.getByRole("textbox", { name: "Tulis balasan" });
  try {
    await input.fill("Pesan pertama");
    await input.press("Enter");
    await expect.poll(() => calls.length).toBe(1);
    await expect(input).toBeEnabled();
    await input.fill("Pesan kedua");
    await expect(
      room.getByRole("button", { name: "Kirim pesan" }),
    ).toBeEnabled();
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(room.getByText("1 pesan menunggu dikirim.")).toBeVisible();
  } finally {
    release();
  }
  await expect(room.getByText("Balasan 2", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  expect(calls.map((call) => call.text)).toEqual([
    "Pesan pertama",
    "Pesan kedua",
  ]);
  await expect(room.getByText("Balasan 1", { exact: true })).toBeVisible();
  const size = await input.evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe(
    await room
      .getByText("Pesan pertama", { exact: true })
      .evaluate((el) => getComputedStyle(el).fontSize),
  );
  await expect(
    room.getByRole("button", { name: /salam|greeting/i }),
  ).toHaveCount(0);
  await page.reload();
  await expect(room.getByText("Balasan 1", { exact: true })).toBeVisible();
  await expect(room.getByText("Balasan 2", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(2);
  expectHermetic(audit);
});

test("failed turn resumes without automatic generation; retry uses the same ID and no duplicate agent message", async ({
  page,
}) => {
  const request = {
    requestId: "23000000-0000-4000-8000-000000000002",
    expectedVersion: 0,
    text: "Mohon bantuan",
  };
  const live = session({
    version: 1,
    messages: [
      {
        id: request.requestId,
        sender: "agent",
        text: request.text,
        timestamp: new Date().toISOString(),
      },
    ],
    pendingTurn: { ...request, status: "failed", leaseExpiresAt: null },
  });
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: `/api/v1/ketik/sessions/${id}`,
        body: { success: true, data: live },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  let calls = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/turns`, async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toEqual(request);
    await route.fulfill({
      json: {
        success: true,
        data: {
          ...live,
          version: 2,
          pendingTurn: null,
          messages: [
            ...live.messages,
            {
              id: "answer",
              sender: "consumer",
              text: "Sudah dibantu",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await expect(room.getByRole("alert")).toContainText(
    "Balasan konsumen belum tersedia",
  );
  expect(calls).toBe(0);
  await room.getByRole("button", { name: "Coba kirim lagi" }).click();
  await expect(room.getByText("Sudah dibantu", { exact: true })).toBeVisible();
  await expect(room.getByText(request.text, { exact: true })).toHaveCount(1);
  expect(calls).toBe(1);
  expectHermetic(audit);
});

test("resume completion never sends queued text after the consumer closes", async ({
  page,
}) => {
  const request = {
    requestId: "23000000-0000-4000-8000-000000000003",
    expectedVersion: 0,
    text: "Pesan sudah diproses",
  };
  const pending = session({
    version: 1,
    messages: [
      {
        id: request.requestId,
        sender: "agent",
        text: request.text,
        timestamp: new Date().toISOString(),
      },
    ],
    pendingTurn: {
      ...request,
      status: "processing",
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  });
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: `/api/v1/ketik/sessions/${id}`,
        body: { success: true, data: pending },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  let closed = false;
  let calls = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: closed
          ? { ...pending, version: 2, pendingTurn: null, consumerClosed: true }
          : pending,
      },
    }),
  );
  await page.route(`**/api/v1/ketik/sessions/${id}/turns`, (route) => {
    calls++;
    return route.fulfill({
      status: 409,
      json: {
        success: false,
        error: { code: "SESSION_CONFLICT", message: "Chat sudah ditutup" },
      },
    });
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await room
    .getByRole("textbox", { name: "Tulis balasan" })
    .fill("Pesan antrean rahasia");
  await room.getByRole("textbox", { name: "Tulis balasan" }).press("Enter");
  await expect(room.getByText("1 pesan menunggu dikirim.")).toBeVisible();
  closed = true;
  await expect(
    room.getByText("Chat telah berakhir", { exact: true }),
  ).toBeVisible();
  await expect(
    room.getByText("Pesan antrean rahasia", { exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(0);
  await expect(room.getByRole("alert")).toContainText(
    "Pesan antrean belum terkirim",
  );
  expectHermetic(audit);
});

test("server expiry closes the composer without inventing a consumer message", async ({
  page,
}) => {
  await page.clock.install();
  const live = session({
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: `/api/v1/ketik/sessions/${id}`,
        body: { success: true, data: live },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await expect(
    room.getByRole("textbox", { name: "Tulis balasan" }),
  ).toBeVisible();
  await page.clock.fastForward(120000);
  await expect(
    room.getByText(
      "Waktu sesi berakhir. Akhiri chat untuk menyimpan percakapan.",
    ),
  ).toBeVisible();
  await expect(room.getByRole("textbox")).toHaveCount(0);
  await expect(room.getByRole("button", { name: "Akhiri chat" })).toBeEnabled();
  expectHermetic(audit);
});

test("assignment lookup failure stays blocked; explicit retry enables start without starting a chat", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    auth: { role: "agent" },
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: "/api/v1/ketik/assignments/self",
        status: 500,
        body: {
          success: false,
          error: {
            code: "ASSIGNMENT_LOAD_FAILED",
            message: "Penugasan belum bisa dimuat. Coba lagi.",
          },
        },
      },
    ],
  });
  const start = page.getByRole("button", { name: /^Mulai simulasi/ });
  await expect(page.getByRole("alert")).toContainText(
    "Penugasan belum bisa dimuat",
  );
  await expect(start).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pengaturan", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/v1/ketik/assignments/self", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          assignment: {
            recipientId: "user-1",
            assignedBy: "trainer",
            version: id,
            sourceSettingsVersion: "absent",
            sourceConfiguration: DEFAULT_KETIK_SETTINGS,
            assignedAt: new Date().toISOString(),
          },
          recipientSettingsVersion: "absent",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Coba muat penugasan" }).click();
  await expect(start).toBeEnabled();
  await expect(page.getByRole("region", { name: "Ruang chat" })).toHaveCount(0);
  expect(audit.mockedApi.some((path) => path.startsWith("POST"))).toBe(false);
  expectHermetic(audit);
});

for (const width of [390, 1280])
  test(`assignment dialog requires explicit retry on conflict and fits ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const version = "2026-10-14T05:00:00.000Z";
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: [
        ...base,
        {
          method: "GET",
          path: "/api/v1/admin/users",
          body: {
            success: true,
            data: [
              {
                id: "agent-1",
                full_name: "Agen Aktif",
                email: "agent@test.local",
                role: "agent",
                status: "approved",
                is_deleted: false,
              },
              {
                id: "inactive",
                full_name: "Agen Nonaktif",
                email: "inactive@test.local",
                role: "agent",
                status: "inactive",
                is_deleted: false,
              },
            ],
          },
        },
        {
          method: "GET",
          path: "/api/v1/ketik/assignments/agent-1",
          body: {
            success: true,
            data: { assignment: null, recipientSettingsVersion: "absent" },
          },
        },
      ],
    });
    let puts = 0;
    await page.route("**/api/v1/ketik/assignments/agent-1", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.fallback();
        return;
      }
      puts++;
      expect(route.request().postDataJSON()).toEqual({
        sourceSettingsVersion: version,
        recipientSettingsVersion: "absent",
        expectedAssignmentVersion: null,
      });
      await route.fulfill(
        puts === 1
          ? {
              status: 409,
              json: {
                success: false,
                error: {
                  code: "ASSIGNMENT_CONFLICT",
                  message:
                    "Pengaturan atau penugasan sudah berubah. Muat ulang sebelum mencoba lagi.",
                },
              },
            }
          : {
              json: {
                success: true,
                data: {
                  assignment: { version: id },
                  recipientSettingsVersion: version,
                },
              },
            },
      );
    });
    await page.getByRole("button", { name: "Penugasan", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Penugasan KETIK" });
    await dialog
      .getByRole("combobox", { name: "Penerima", exact: true })
      .click();
    await expect(
      page.getByRole("option", { name: "Agen Nonaktif" }),
    ).toHaveCount(0);
    await page.getByRole("option", { name: "Agen Aktif", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Tugaskan skenario", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Muat ulang sebelum mencoba lagi",
    );
    await expect(
      dialog.getByRole("button", { name: "Tugaskan skenario", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: info.outputPath(`assignment-conflict-${width}.png`),
    });
    await dialog
      .getByRole("button", { name: "Muat ulang data penugasan" })
      .press("Enter");
    await expect(
      dialog.getByRole("button", { name: "Tugaskan skenario", exact: true }),
    ).toBeEnabled();
    expect(puts).toBe(1);
    await dialog
      .getByRole("button", { name: "Tugaskan skenario", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Penugasan tersimpan",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`assignment-success-${width}.png`),
    });
    expect(puts).toBe(2);
    const smallTargets = await dialog
      .locator(
        'button:visible:not([aria-hidden="true"]),input:visible:not([aria-hidden="true"])',
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              name: element.getAttribute("aria-label") ?? element.textContent,
              width: rect.width,
              height: rect.height,
              hidden: element.getAttribute("aria-hidden"),
            };
          })
          .filter((rect) => rect.width < 44 || rect.height < 44),
      );
    expect(smallTargets).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Penugasan", exact: true }),
    ).toBeFocused();
    expectHermetic(audit);
  });

test("simulation timer counts up from the server start and stops once the chat closes", async ({
  page,
}) => {
  const startedAt = Date.now() - 65000;
  await page.clock.install({ time: startedAt + 65000 });
  const live = session({
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: new Date(startedAt + 300000).toISOString(),
  });
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: `/api/v1/ketik/sessions/${id}`,
        body: { success: true, data: live },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  const timer = room.getByRole("timer", { name: "Durasi simulasi" });
  await expect(timer).toHaveText(/^01:(0[5-9]|1\d)$/);
  await page.clock.fastForward(60000);
  await expect(timer).toHaveText(/^02:(0[5-9]|1\d)$/);
  // Past the server expiry the measured simulation time stops at its limit.
  await page.clock.fastForward(600000);
  await expect(timer).toHaveText("05:00");
  await page.clock.fastForward(30000);
  await expect(timer).toHaveText("05:00");
  expectHermetic(audit);
});

for (const { label, identity, portrait } of [
  {
    label: "explicit male gender",
    identity: { name: "Andi Tenri", gender: "male" as const },
    portrait: "/portraits/men/",
  },
  {
    label: "explicit female gender",
    identity: { name: "Bambang Pamungkas", gender: "female" as const },
    portrait: "/portraits/women/",
  },
  {
    label: "legacy male name without gender",
    identity: { name: "La Ode Haris" },
    portrait: "/portraits/men/",
  },
  {
    label: "unknown name without gender",
    identity: { name: "Konsumen server" },
    portrait: null,
  },
]) {
  test(`consumer portrait never guesses the wrong gender: ${label}`, async ({
    page,
  }) => {
    const portraits: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("randomuser.me")) portraits.push(request.url());
    });
    const live = session();
    live.config.identity = {
      ...identity,
      city: "Bandung",
      phone: "0800000000",
    };
    const audit = await openHermeticShell(page, {
      path: `/ketik?sesi=${id}&tahap=chat`,
      apiMocks: [
        ...base,
        {
          method: "GET",
          path: `/api/v1/ketik/sessions/${id}`,
          body: { success: true, data: live },
        },
      ],
      expectedThirdPartyHosts: ["randomuser.me"],
    });
    const room = page.getByRole("region", { name: "Ruang chat" });
    await expect(
      room.getByRole("heading", { name: identity.name }),
    ).toBeVisible();
    if (portrait) {
      await expect.poll(() => portraits.length).toBeGreaterThan(0);
      expect(portraits.every((url) => url.includes(portrait))).toBe(true);
    } else {
      await page.waitForTimeout(500);
      expect(portraits).toEqual([]);
      await expect(room.getByText("K", { exact: true })).toBeVisible();
    }
    expectHermetic(audit);
  });
}

test("agent messages sent back to back are read first and answered once", async ({
  page,
}) => {
  let live = session();
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route("**/api/v1/ketik/sessions", (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  const calls: KetikSessionTurnRequest[] = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/turns`, async (route) => {
    const body = route.request().postDataJSON() as KetikSessionTurnRequest;
    calls.push(body);
    expect(body.expectedVersion).toBe(live.version);
    const agent = {
      id: body.requestId,
      sender: "agent" as const,
      text: body.text,
      timestamp: new Date().toISOString(),
    };
    live = body.awaitMore
      ? { ...live, version: live.version + 2, messages: [...live.messages, agent] }
      : {
          ...live,
          version: live.version + 2,
          messages: [
            ...live.messages,
            agent,
            {
              id: `reply-${calls.length}`,
              sender: "consumer",
              text: "Bentar kak, saya baca dulu",
              timestamp: new Date().toISOString(),
            },
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
  const typing = room.getByLabel("Konsumen sedang mengetik");
  const explanation =
    "Baik Bapak, untuk laporan pinjol ilegal silakan simpan semua bukti ancaman, tangkapan layar pesan, dan nomor penagih. Jangan transfer dana apa pun, lalu laporkan melalui kanal resmi agar dapat ditindaklanjuti oleh satgas terkait. Kami juga sarankan Bapak memblokir nomor penagih tersebut.";
  await input.fill(explanation);
  await input.press("Enter");
  await input.fill("Apakah informasinya sudah cukup jelas, Bapak?");
  await input.press("Enter");
  await expect.poll(() => calls.length).toBe(2);
  // Konsumen masih membaca: belum ada tanda mengetik.
  await expect(typing).toHaveCount(0);
  expect(calls[0]).toMatchObject({ text: explanation, awaitMore: true });
  expect(Object.keys(calls[1]).sort()).toEqual([
    "expectedVersion",
    "requestId",
    "text",
  ]);
  await expect(typing).toBeVisible({ timeout: 15000 });
  await expect(
    room.getByText("Bentar kak, saya baca dulu", { exact: true }),
  ).toHaveCount(1, { timeout: 15000 });
  expect(calls).toHaveLength(2);
  expectHermetic(audit);
});

test("a start refused by the daily limit shows the server's reason", async ({
  page,
}) => {
  const message =
    "Batas latihan KETIK hari ini sudah habis (3 dari 3). Jatah baru mulai pukul 00.00 WIB.";
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    auth: { role: "agent" },
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: "/api/v1/ketik/assignments/self",
        body: {
          success: true,
          data: {
            assignment: {
              recipientId: "user-1",
              assignedBy: "trainer",
              version: id,
              sourceSettingsVersion: "absent",
              sourceConfiguration: DEFAULT_KETIK_SETTINGS,
              assignedAt: new Date().toISOString(),
            },
            recipientSettingsVersion: "absent",
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/ketik/sessions",
        status: 429,
        body: {
          success: false,
          error: { code: "PRACTICE_LIMIT_REACHED", message },
        },
      },
    ],
  });
  const start = page.getByRole("button", { name: /^Mulai simulasi/ });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("region", { name: "Ruang chat" })).toHaveCount(0);
  expectHermetic(audit);
});

test("the start button shows today's remaining KETIK quota and turns off when it is used up", async ({
  page,
}) => {
  const assignment: ApiMock = {
    method: "GET",
    path: "/api/v1/ketik/assignments/self",
    body: {
      success: true,
      data: {
        assignment: {
          recipientId: "user-1",
          assignedBy: "trainer",
          version: id,
          sourceSettingsVersion: "absent",
          sourceConfiguration: DEFAULT_KETIK_SETTINGS,
          assignedAt: new Date().toISOString(),
        },
        recipientSettingsVersion: "absent",
      },
    },
  };
  const left = await openHermeticShell(page, {
    path: "/ketik",
    auth: { role: "agent" },
    apiMocks: [practiceQuotaMock({ ketik: { limit: 3, used: 1 } }), assignment, ...base],
  });
  const start = page.getByRole("button", { name: /^Mulai simulasi/ });
  await expect(
    page.getByText(
      "Sisa hari ini 2 dari 3 simulasi. Dihitung lagi besok pukul 00.00 WIB.",
    ),
  ).toBeVisible();
  await expect(start).toBeEnabled();
  expectHermetic(left);

  const out = await openHermeticShell(page, {
    path: "/ketik",
    auth: { role: "agent" },
    apiMocks: [practiceQuotaMock({ ketik: { limit: 3, used: 3 } }), assignment, ...base],
  });
  const reason =
    "Jatah KETIK hari ini sudah habis (3 dari 3). Bisa mulai lagi besok pukul 00.00 WIB.";
  await expect(page.getByText(reason)).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toHaveAccessibleDescription(reason);
  expectHermetic(out);
});
