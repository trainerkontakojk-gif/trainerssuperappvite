import { expect, test } from "@playwright/test";
import { expectHermetic, openHermeticShell } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { base, id, session } from "./helpers/ketikServerChatHarness";
import { PENDING_SESSION } from "./helpers/ketikFlowHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

test("response recovery retries status after a network failure without requesting a new AI response", async ({
  page,
}) => {
  const requestId = "23000000-0000-4000-8000-000000000005";
  const live = session({
    awaitingResponse: true,
    pendingResponse: {
      requestId,
      status: "processing",
      retryCount: 0,
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
        body: { success: true, data: live },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await expect(room).toBeVisible();
  let reads = 0;
  let providerRequests = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, (route) => {
    providerRequests++;
    return route.abort();
  });
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) => {
    reads++;
    if (reads === 1)
      return route.fulfill({
        status: 503,
        json: {
          success: false,
          error: { code: "SESSION_FAILED", message: "Coba lagi." },
        },
      });
    return route.fulfill({
      json: {
        success: true,
        data: {
          ...live,
          version: 1,
          awaitingResponse: false,
          pendingResponse: null,
          consumerClosed: true,
          messages: [
            {
              id: "recovered",
              sender: "consumer",
              text: "Balasan sudah tersimpan di server.",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });
  });
  await expect(room.getByRole("alert")).toContainText(
    "Status balasan belum bisa dimuat",
  );
  await expect(
    room.getByRole("status", { name: "Konsumen sedang mengetik" }),
  ).toHaveCount(0);
  expect(reads).toBe(1);
  await room.getByRole("button", { name: "Coba minta balasan lagi" }).click();
  await expect(
    room.getByText("Balasan sudah tersimpan di server.", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(room.getByRole("alert")).toHaveCount(0);
  expect(reads).toBe(2);
  expect(providerRequests).toBe(0);
  expectHermetic(audit);
});

test("an append failure stays retryable when the concurrent consumer response also fails", async ({
  page,
}) => {
  let live = session();
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  await page.route("**/api/v1/ketik/sessions", (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  const appends: Array<{
    requestId: string;
    text: string;
    expectedAgentVersion: number;
  }> = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, (route) => {
    const body = route.request().postDataJSON();
    appends.push(body);
    if (appends.length === 2)
      return route.fulfill({
        status: 503,
        json: {
          success: false,
          error: { code: "SESSION_FAILED", message: "Coba lagi." },
        },
      });
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
    return route.fulfill({ json: { success: true, data: live } });
  });
  let responses = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    responses++;
    if (responses === 1) {
      await gate;
      await route.fulfill({
        status: 503,
        json: {
          success: false,
          error: { code: "SESSION_AI_FAILED", message: "Coba lagi." },
        },
      });
    } else {
      live = {
        ...live,
        version: live.version + 1,
        awaitingResponse: false,
        messages: [
          ...live.messages,
          {
            id: "answer-both",
            sender: "consumer",
            text: "Kedua pesan sudah diterima.",
            timestamp: new Date().toISOString(),
          },
        ],
      };
      await route.fulfill({ json: { success: true, data: live } });
    }
  });
  try {
    await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Mulai|Lanjutkan/ })
      .click();
    const room = page.getByRole("region", { name: "Ruang chat" });
    const input = room.getByRole("textbox", { name: "Tulis balasan" });
    await input.fill("Pesan pertama");
    await input.press("Enter");
    await expect.poll(() => responses, { timeout: 10000 }).toBe(1);
    await input.fill("Pesan kedua");
    await input.press("Enter");
    await expect(room.getByRole("alert")).toContainText(
      "Pesan belum tersimpan",
    );
    release();
    await expect(
      room.getByRole("status", { name: "Konsumen sedang mengetik" }),
    ).toHaveCount(0);
    await room.getByRole("button", { name: "Coba simpan lagi" }).click();
    await expect.poll(() => appends.length).toBe(3);
    expect(appends[2]).toEqual(appends[1]);
    await expect(
      room.getByText("Kedua pesan sudah diterima.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(room.getByRole("alert")).toHaveCount(0);
    await expect(room.getByText("Pesan kedua", { exact: true })).toHaveCount(1);
    expectHermetic(audit);
  } finally {
    release();
  }
});

test("resume and finish failures keep the session recoverable until explicit retry succeeds", async ({
  page,
}) => {
  const live = session({
    consumerClosed: true,
    messages: [
      {
        id: "saved",
        sender: "agent",
        text: "Percakapan tetap tersimpan.",
        timestamp: new Date().toISOString(),
      },
    ],
  });
  const history = { ...PENDING_SESSION, id, messages: live.messages };
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: [
      ...base,
      {
        method: "GET",
        path: `/api/v1/ketik/sessions/${id}`,
        status: 503,
        body: {
          success: false,
          error: { code: "SESSION_FAILED", message: "Coba lagi." },
        },
      },
      {
        method: "GET",
        path: `/api/v1/ketik/history/${id}`,
        body: { success: true, data: history },
      },
    ],
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  await expect(
    page.getByRole("button", { name: "Coba muat sesi" }),
  ).toBeVisible();
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) =>
    route.fulfill({ json: { success: true, data: live } }),
  );
  await page.getByRole("button", { name: "Coba muat sesi" }).click();
  const room = page.getByRole("region", { name: "Ruang chat" });
  await expect(
    room.getByText("Percakapan tetap tersimpan.", { exact: true }),
  ).toBeVisible();
  let finishes = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/finish`, (route) => {
    finishes++;
    return finishes === 1
      ? route.fulfill({
          status: 503,
          json: {
            success: false,
            error: { code: "SESSION_FAILED", message: "Coba lagi." },
          },
        })
      : route.fulfill({ json: { success: true, data: history } });
  });
  const finish = async () => {
    await room
      .getByRole("button", { name: "Akhiri chat", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Akhiri chat sekarang?" })
      .getByRole("button", { name: "Akhiri chat", exact: true })
      .click();
  };
  await finish();
  await expect(
    page.getByText(
      "Percakapan belum tersimpan. Chat tetap terbuka, coba akhiri lagi.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    room.getByText("Percakapan tetap tersimpan.", { exact: true }),
  ).toBeVisible();
  await expect(
    room.getByRole("button", { name: "Akhiri chat", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`sesi=${id}.*tahap=chat`));
  expect(finishes).toBe(1);
  await finish();
  await expect(page).toHaveURL(new RegExp(`sesi=${id}.*tahap=telaah`));
  await expect(
    page
      .getByRole("region", { name: "Hasil telaah" })
      .getByText("Belum ditelaah", { exact: true }),
  ).toBeVisible();
  expect(finishes).toBe(2);
  await page.screenshot({
    path: test.info().outputPath("session-finish-recovered.png"),
  });
  expectHermetic(audit);
});
