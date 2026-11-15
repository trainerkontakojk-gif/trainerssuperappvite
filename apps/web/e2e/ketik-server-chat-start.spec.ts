import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  practiceQuotaMock,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { id, session, base } from "./helpers/ketikServerChatHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

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
      {
        // At expiry the consumer's goodbye closes the chat.
        method: "POST",
        path: `/api/v1/ketik/sessions/${id}/respond`,
        body: { success: true, data: { ...live, consumerClosed: true } },
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
      if (request.url().includes("randomuser.me"))
        portraits.push(request.url());
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
    apiMocks: [
      practiceQuotaMock({ ketik: { limit: 3, used: 1 } }),
      assignment,
      ...base,
    ],
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
    apiMocks: [
      practiceQuotaMock({ ketik: { limit: 3, used: 3 } }),
      assignment,
      ...base,
    ],
  });
  const reason =
    "Jatah KETIK hari ini sudah habis (3 dari 3). Bisa mulai lagi besok pukul 00.00 WIB.";
  await expect(page.getByText(reason)).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(start).toHaveAccessibleDescription(reason);
  expectHermetic(out);
});
