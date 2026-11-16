import { expect, test } from "@playwright/test";
import { openHermeticShell, expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { id, session, base } from "./helpers/ketikServerChatHarness";

test.beforeAll(() => assertLocalDevOnlyTarget());

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
  await room.getByRole("button", { name: "Coba minta balasan lagi" }).click();
  await expect(room.getByText("Sudah dibantu", { exact: true })).toBeVisible();
  await expect(room.getByText(request.text, { exact: true })).toHaveCount(1);
  expect(calls).toBe(1);
  expectHermetic(audit);
});

test("failed response resumes without automatic generation and retries the same request explicitly", async ({
  page,
}) => {
  const requestId = "23000000-0000-4000-8000-000000000004";
  const live = session({
    version: 1,
    agentVersion: 1,
    awaitingResponse: true,
    messages: [
      {
        id: "saved-agent",
        sender: "agent",
        text: "Pesan sudah tersimpan",
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
    ],
    pendingResponse: {
      requestId,
      status: "failed",
      retryCount: 0,
      leaseExpiresAt: null,
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
  const calls: unknown[] = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1) {
      await route.fulfill({
        status: 503,
        json: {
          success: false,
          error: {
            code: "SESSION_AI_FAILED",
            message: "Balasan belum tersedia.",
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          ...live,
          version: 2,
          pendingResponse: null,
          awaitingResponse: false,
          messages: [
            ...live.messages,
            {
              id: "retried-response",
              sender: "consumer",
              text: "Balasan setelah retry eksplisit",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await expect(room).toBeVisible({ timeout: 20000 });
  await expect(room.getByRole("alert")).toContainText(
    "Balasan konsumen belum tersedia",
  );
  // Covers both the immediate scheduler and the old pending-response recovery timer.
  await page.waitForTimeout(3000);
  expect(calls).toEqual([]);
  const retry = room.getByRole("button", { name: "Coba minta balasan lagi" });
  await retry.click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(room.getByRole("alert")).toContainText(
    "Balasan konsumen belum tersedia",
  );
  await retry.click();
  await expect(
    room.getByText("Balasan setelah retry eksplisit", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(calls).toEqual([{ requestId }, { requestId }]);
  await expect(
    room.getByText("Pesan sudah tersimpan", { exact: true }),
  ).toHaveCount(1);
  await expect(
    room.getByRole("status", { name: "Konsumen sedang mengetik" }),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("response-retry.png") });
  expectHermetic(audit);
});

test("text queued while a legacy turn resumes is saved as an agent message after the consumer closes", async ({
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
  const appends: string[] = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      text: string;
    };
    appends.push(body.text);
    return route.fulfill({
      json: {
        success: true,
        data: {
          ...pending,
          version: 3,
          agentVersion: 1,
          pendingTurn: null,
          consumerClosed: true,
          messages: [
            ...pending.messages,
            {
              id: body.requestId,
              sender: "agent",
              text: body.text,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });
  });
  let responseCalls = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, (route) => {
    responseCalls++;
    return route.abort();
  });
  const room = page.getByRole("region", { name: "Ruang chat" });
  await room
    .getByRole("textbox", { name: "Tulis balasan" })
    .fill("Pesan antrean rahasia");
  await room.getByRole("textbox", { name: "Tulis balasan" }).press("Enter");
  await expect(room.getByText("1 pesan sedang disimpan.")).toBeVisible();
  closed = true;
  await expect(room.getByText(/Konsumen telah mengakhiri chat/)).toBeVisible();
  await expect.poll(() => appends).toEqual(["Pesan antrean rahasia"]);
  await expect(
    room.getByText("Pesan antrean rahasia", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  expect(responseCalls).toBe(0);
  await expect(room.getByRole("alert")).toHaveCount(0);
  await expect(
    room.getByRole("textbox", { name: "Tulis balasan" }),
  ).toBeEnabled();
  expectHermetic(audit);
});

test("at expiry the consumer says goodbye once and the agent can still send closing messages", async ({
  page,
}) => {
  const now = Date.now();
  let live = session({
    version: 2,
    agentVersion: 1,
    messages: [
      {
        id: "agent-1",
        sender: "agent",
        text: "Ada yang bisa dibantu?",
        timestamp: new Date(now).toISOString(),
      },
      {
        id: "consumer-1",
        sender: "consumer",
        text: "Tagihan saya ganda.",
        timestamp: new Date(now).toISOString(),
      },
    ],
  });
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=chat`,
    apiMocks: base,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  let deadline: string | undefined;
  await page.route(`**/api/v1/ketik/sessions/${id}`, (route) => {
    // Start the six-second window when the browser receives the session, not
    // before cold Vite/auth startup. Keep real time: page.clock stalls animation.
    deadline ??= new Date(Date.now() + 6000).toISOString();
    live = { ...live, expiresAt: deadline };
    return route.fulfill({ json: { success: true, data: live } });
  });
  let responseCalls = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    responseCalls++;
    live = {
      ...live,
      version: live.version + 1,
      consumerClosed: true,
      awaitingResponse: false,
      messages: [
        ...live.messages,
        {
          id: "consumer-goodbye",
          sender: "consumer",
          text: "Ya sudah kak, saya ada urusan dulu.",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await route.fulfill({ json: { success: true, data: live } });
  });
  const appends: string[] = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, async (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      text: string;
    };
    appends.push(body.text);
    live = {
      ...live,
      version: live.version + 1,
      agentVersion: live.agentVersion + 1,
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

  const room = page.getByRole("region", { name: "Ruang chat" });
  const input = room.getByRole("textbox", { name: "Tulis balasan" });
  await expect(
    room.getByText("Tagihan saya ganda.", { exact: true }),
  ).toBeVisible();
  expect(responseCalls).toBe(0);
  await expect(
    room.getByText("Ya sudah kak, saya ada urusan dulu.", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  expect(responseCalls).toBe(1);
  await expect(room.getByText(/Konsumen telah mengakhiri chat/)).toBeVisible();
  await expect(input).toBeEnabled();

  await input.fill("Baik, terima kasih sudah menghubungi kami.");
  await input.press("Enter");
  await expect(
    room.getByText("Baik, terima kasih sudah menghubungi kami.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() => appends)
    .toEqual(["Baik, terima kasih sudah menghubungi kami."]);
  // Nothing answers the agent's closing message.
  await page.waitForTimeout(4000);
  expect(responseCalls).toBe(1);
  await expect(
    room.getByRole("status", { name: "Konsumen sedang mengetik" }),
  ).toHaveCount(0);
  await expect(room.getByRole("button", { name: "Akhiri chat" })).toBeEnabled();
  expectHermetic(audit);
});

test("agent messages persist immediately and remain sendable while one contextual response is processing", async ({
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

  const appends: Array<{
    requestId: string;
    expectedAgentVersion: number;
    text: string;
  }> = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, async (route) => {
    const body = route.request().postDataJSON() as (typeof appends)[number];
    appends.push(body);
    expect(body.expectedAgentVersion).toBe(live.agentVersion);
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

  let responseCalls = 0;
  let responseStarted!: () => void;
  let releaseResponse!: () => void;
  const started = new Promise<void>((resolve) => {
    responseStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    responseCalls++;
    expect(Object.keys(route.request().postDataJSON())).toEqual(["requestId"]);
    responseStarted();
    await gate;
    live = {
      ...live,
      version: live.version + 1,
      awaitingResponse: false,
      messages: [
        ...live.messages,
        {
          id: "reply-contextual",
          sender: "consumer",
          text: "Saya sudah baca kedua pesannya, kak.",
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

  try {
    await input.fill("Pesan pertama");
    await input.press("Enter");
    await expect(room.getByText("Pesan pertama", { exact: true })).toBeVisible({
      timeout: 1000,
    });
    await expect.poll(() => appends.length).toBe(1);
    expect(responseCalls).toBe(0);
    await expect(room.getByRole("img", { name: "Diterima" })).toHaveCount(1);

    await started;
    await expect(input).toBeEnabled();
    await input.fill("Pesan kedua saat konsumen berpikir");
    await input.press("Enter");
    await expect(
      room.getByText("Pesan kedua saat konsumen berpikir", { exact: true }),
    ).toBeVisible({ timeout: 1000 });
    await expect.poll(() => appends.length).toBe(2);
    expect(appends.map((request) => request.text)).toEqual([
      "Pesan pertama",
      "Pesan kedua saat konsumen berpikir",
    ]);
    await expect(input).toBeEnabled();
    releaseResponse();

    await expect(
      room.getByText("Saya sudah baca kedua pesannya, kak.", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(room.getByRole("img", { name: "Dibaca" })).toHaveCount(2);
    expect(responseCalls).toBe(1);

    await page.reload();
    await expect(
      room.getByText("Pesan pertama", { exact: true }),
    ).toBeVisible();
    await expect(
      room.getByText("Pesan kedua saat konsumen berpikir", { exact: true }),
    ).toBeVisible();
    expectHermetic(audit);
  } finally {
    releaseResponse?.();
  }
});

test("two quick agent messages are stored separately and answered by one response request", async ({
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
  const appends: Array<{ text: string; expectedAgentVersion: number }> = [];
  await page.route(`**/api/v1/ketik/sessions/${id}/messages`, async (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      expectedAgentVersion: number;
      text: string;
    };
    appends.push(body);
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
  let responseCalls = 0;
  await page.route(`**/api/v1/ketik/sessions/${id}/respond`, async (route) => {
    responseCalls++;
    // The single request reads the whole durable context, not just the last bubble.
    expect(
      live.messages.filter((message) => message.sender === "agent").length,
    ).toBe(2);
    live = {
      ...live,
      version: live.version + 1,
      awaitingResponse: false,
      messages: [
        ...live.messages,
        {
          id: "reply-merged",
          sender: "consumer",
          text: "Sudah saya baca dua-duanya.",
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
  await input.fill("Poin pertama");
  await input.press("Enter");
  await input.fill("Poin kedua");
  await input.press("Enter");

  await expect(room.getByText("Poin pertama", { exact: true })).toBeVisible({
    timeout: 1000,
  });
  await expect(room.getByText("Poin kedua", { exact: true })).toBeVisible({
    timeout: 1000,
  });
  await expect.poll(() => appends.length, { timeout: 10000 }).toBe(2);
  expect(appends.map((request) => request.expectedAgentVersion)).toEqual([
    0, 1,
  ]);
  expect(responseCalls).toBe(0);
  await expect(
    room.getByText("Sudah saya baca dua-duanya.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(responseCalls).toBe(1);
  expect(appends).toHaveLength(2);
  expectHermetic(audit);
});
