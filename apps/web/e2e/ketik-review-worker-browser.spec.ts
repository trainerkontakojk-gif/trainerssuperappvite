import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  openHermeticShell,
  expectHermetic,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const id = "33000000-0000-4000-8000-000000000001";
const session = {
  id,
  date: new Date().toISOString(),
  scenarioTitle: "Tagihan ganda",
  consumerName: "Bu Rina",
  transcriptProvenance: "legacy",
  reviewStatus: "pending",
  messages: [
    {
      id: "m1",
      sender: "agent",
      text: "Saya bantu cek tagihan Ibu.",
      timestamp: new Date().toISOString(),
    },
  ],
  previousFinalScore: null,
};
const scores = {
  final: 80,
  empathy: 80,
  probing: 80,
  resolution: 80,
  typo: 80,
  compliance: 80,
};
const detail = {
  sessionId: id,
  scores,
  typos: [],
  review: {
    id: "r1",
    sessionId: id,
    aiSummary: "Hasil sebelumnya",
    strengths: ["Jelas"],
    weaknesses: ["Probing"],
    coachingFocus: ["Verifikasi"],
    createdAt: new Date().toISOString(),
  },
};
function mocks(completed = false): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: DEFAULT_KETIK_SETTINGS },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/assignments/self",
      body: {
        success: true,
        data: { assignment: null, recipientSettingsVersion: "absent" },
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history/summary",
      body: {
        success: true,
        data: {
          sessionsThisMonth: 1,
          reviewing: 0,
          average: null,
          focus: null,
          recent: [],
          followUps: [],
        },
      },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/history/${id}`,
      body: {
        success: true,
        data: {
          ...session,
          reviewStatus: completed ? "completed" : "pending",
          ...(completed ? { finalScore: 80 } : {}),
        },
      },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/review/${id}`,
      body: { success: true, data: detail },
    },
    {
      method: "GET",
      path: `/api/v1/ketik/review/status/${id}`,
      body: {
        success: true,
        data: {
          status: completed ? "completed" : "pending",
          resultReady: completed,
          scores: completed ? scores : null,
          previousKept: false,
        },
      },
    },
  ];
}
test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test("agent manually enqueues legacy review, sees real queue and poll failure without a fabricated timeout", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: [
      {
        method: "GET",
        path: `/api/v1/ketik/review/status/${id}`,
        body: {
          success: true,
          data: {
            status: "queued",
            resultReady: false,
            previousKept: false,
            scores: null,
          },
        },
      },
      ...mocks(),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        status: 202,
        body: { success: true, data: { status: "queued" } },
      },
    ],
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(
    page.getByText("Transkrip lama belum terverifikasi server."),
  ).toBeVisible({ timeout: 20_000 });
  expect(
    audit.mockedApi.some((r) => r.startsWith("POST /api/v1/ketik/review")),
  ).toBe(false);
  await page.route("**/api/v1/ketik/history/summary", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          sessionsThisMonth: 1,
          reviewing: 1,
          average: null,
          focus: null,
          recent: [],
          followUps: [],
        },
      },
    }),
  );
  await result.getByRole("button", { name: "Mulai telaah" }).click();
  await expect(result.getByText("Menunggu giliran telaah")).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`queue-${width}.png`),
    });
  }
  let failPoll = true;
  await page.route(`**/api/v1/ketik/review/status/${id}`, (route) =>
    route.fulfill({
      status: failPoll ? 500 : 200,
      json: failPoll
        ? { success: false, error: { message: "private-poll-sentinel" } }
        : {
            success: true,
            data: {
              status: "processing",
              resultReady: false,
              previousKept: false,
              scores: null,
            },
          },
    }),
  );
  await expect(
    result.getByText("Status telaah belum dapat diperbarui."),
  ).toBeVisible({ timeout: 10_000 });
  await expect(result).not.toContainText("private-poll-sentinel");
  failPoll = false;
  const retryStatus = result.getByRole("button", { name: "Coba cek status" });
  expect((await retryStatus.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await retryStatus.focus();
  await page.keyboard.press("Enter");
  await expect(result.getByText("Sedang ditelaah AI")).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(125_000);
  await expect(result.getByRole("alert")).toHaveCount(0);
  await expect(
    result.getByRole("button", { name: "Coba telaah lagi" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "KETIK", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Progres latihan" }),
  ).toContainText(/1\s+sedang ditelaah AI/);
  expectHermetic(audit);
});

test("failed async rerun keeps previous result after reload and does not trigger another review", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: [
      ...mocks(true).filter(
        (mock) => mock.path !== `/api/v1/ketik/review/status/${id}`,
      ),
      {
        method: "GET",
        path: `/api/v1/ketik/review/status/${id}`,
        body: {
          success: true,
          data: {
            status: "failed",
            resultReady: true,
            previousKept: true,
            scores,
            errorMessage: "Pesan aman",
          },
        },
      },
    ],
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result.getByTestId("ketik-final-score")).toHaveText("80", {
    timeout: 20_000,
  });
  await expect(result.getByRole("alert")).toContainText(
    "Hasil sebelumnya tetap ditampilkan",
  );
  await expect(
    result.getByRole("button", { name: "Telaah ulang" }),
  ).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`previous-kept-${width}.png`),
    });
  }
  expect(
    audit.mockedApi.some((r) => r.startsWith("POST /api/v1/ketik/review")),
  ).toBe(false);
  expectHermetic(audit);
});

test("late polling cannot replace completed results after an explicit status refresh", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: [
      {
        method: "GET",
        path: `/api/v1/ketik/history/${id}`,
        body: {
          success: true,
          data: { ...session, reviewStatus: "processing" },
        },
      },
      ...mocks(),
    ],
  });
  let polls = 0;
  let release: (() => void) | undefined;
  await page.route(`**/api/v1/ketik/review/status/${id}`, async (route) => {
    const order = ++polls;
    if (order === 1) {
      await route.fulfill({ status: 500, json: { success: false } });
      return;
    }
    if (order === 2)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      json: {
        success: true,
        data: {
          status: order === 2 ? "queued" : "completed",
          resultReady: order !== 2,
          previousKept: false,
          scores,
        },
      },
    });
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  try {
    await expect(
      result.getByRole("button", { name: "Coba cek status" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => polls, { timeout: 10_000 }).toBe(2);
    await result.getByRole("button", { name: "Coba cek status" }).click();
    await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
    const late = page.waitForResponse((response) =>
      response.url().endsWith(`/review/status/${id}`),
    );
    release?.();
    await (await late).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
    expectHermetic(audit);
  } finally {
    release?.();
  }
});

test("a lost enqueue response recovers from server polling and refreshes the landing summary without a second trigger", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: [
      {
        method: "GET",
        path: `/api/v1/ketik/review/status/${id}`,
        body: {
          success: true,
          data: {
            status: "queued",
            resultReady: false,
            previousKept: false,
            scores: null,
          },
        },
      },
      ...mocks(),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        status: 500,
        body: {
          success: false,
          error: { message: "private-acceptance-sentinel" },
        },
      },
    ],
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(
    result.getByRole("button", { name: "Mulai telaah" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => audit.mockedApi.includes("GET /api/v1/ketik/history/summary"))
    .toBe(true);
  await page.route("**/api/v1/ketik/history/summary", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          sessionsThisMonth: 1,
          reviewing: 1,
          average: null,
          focus: null,
          recent: [],
          followUps: [],
        },
      },
    }),
  );
  await result.getByRole("button", { name: "Mulai telaah" }).click();
  await expect(result).not.toContainText("private-acceptance-sentinel");
  await expect(result.getByText("Menunggu giliran telaah")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "KETIK", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Progres latihan" }),
  ).toContainText(/1\s+sedang ditelaah AI/);
  expect(
    audit.mockedApi.filter(
      (request) => request === "POST /api/v1/ketik/review",
    ),
  ).toHaveLength(1);
  expectHermetic(audit);
});
