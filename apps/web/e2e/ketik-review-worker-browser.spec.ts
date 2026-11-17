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

test("KETIK review shows an honest elapsed clock and the same estimate as Telefun", async ({
  page,
}) => {
  await page.clock.install({ time: Date.now() });
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
    ],
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result).toContainText(
    "Biasanya 1–2 menit, paling lama sekitar 3 menit.",
  );
  await expect(result.getByTestId("ketik-wait-elapsed")).toHaveText("00:00");
  await expect(result.getByText(/\d+%/)).toHaveCount(0);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`review-estimate-${width}.png`),
    });
  }
  await page.clock.fastForward(181_000);
  await expect(result).toContainText(
    "Lebih lama dari biasanya. Tunggu sebentar lagi.",
  );
  expectHermetic(audit);
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

for (const staleResponse of ["queued", "network-error"] as const) {
  test(
    staleResponse === "queued"
      ? "late polling cannot replace completed results after an explicit status refresh"
      : "a stale polling network error cannot warn after a newer completed read",
    async ({ page }) => {
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
      const stale = Promise.withResolvers<void>();
      const fulfilled = Promise.withResolvers<void>();
      const recovery = Promise.withResolvers<void>();
      await page.route(`**/api/v1/ketik/review/status/${id}`, async (route) => {
        const order = ++polls;
        if (order === 1) {
          await route.fulfill({ status: 500, json: { success: false } });
          return;
        }
        if (order > 3) {
          // Never let an automatic recovery poll conceal a transient regression.
          await recovery.promise;
          await route.abort();
          return;
        }
        if (order === 2) await stale.promise;
        if (order === 2 && staleResponse === "network-error") {
          await route.fulfill({ status: 500, json: { success: false } });
        } else {
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
        }
        if (order === 2) fulfilled.resolve();
      });
      const observation = await page.evaluateHandle(() => {
        const seen = { armed: false, queued: false, warning: false };
        const observer = new MutationObserver(() => {
          if (!seen.armed) return;
          const text =
            document.getElementById("ketik-review-result")?.textContent ?? "";
          seen.queued ||= text.includes("Menunggu giliran telaah");
          seen.warning ||= text.includes(
            "Status telaah belum dapat diperbarui.",
          );
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        return { seen, observer };
      });
      const result = page.getByRole("region", { name: "Hasil telaah" });
      try {
        await expect(
          result.getByRole("button", { name: "Coba cek status" }),
        ).toBeVisible({ timeout: 10_000 });
        await expect.poll(() => polls, { timeout: 10_000 }).toBe(2);
        await result.getByRole("button", { name: "Coba cek status" }).click();
        await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
        await expect(
          result.getByRole("button", { name: "Coba cek status" }),
        ).toHaveCount(0);
        await observation.evaluate(({ seen }) => {
          seen.armed = true;
        });
        const late = page.waitForResponse((response) =>
          response.url().endsWith(`/review/status/${id}`),
        );
        stale.resolve();
        await fulfilled.promise;
        await (await late).finished();
        const seen = await observation.evaluate(async ({ seen }) => {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return seen;
        });
        expect(
          seen.queued,
          "An obsolete status read must never render queue progress",
        ).toBe(false);
        expect(
          seen.warning,
          "An obsolete failure must never render a polling warning",
        ).toBe(false);
        await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
        await expect(
          result.getByText("Menunggu giliran telaah", { exact: true }),
        ).toHaveCount(0);
        await expect(
          result.getByText("Status telaah belum dapat diperbarui.", {
            exact: true,
          }),
        ).toHaveCount(0);
        expectHermetic(audit);
      } finally {
        await observation.evaluate(({ observer }) => observer.disconnect());
        await observation.dispose();
        stale.resolve();
        recovery.resolve();
      }
    },
  );
}

test("a newer processing read from ready still shows a review started elsewhere", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: [
      {
        method: "GET",
        path: `/api/v1/ketik/review/status/${id}`,
        status: 500,
        body: { success: false },
      },
      ...mocks(true),
    ],
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
  await page.route(`**/api/v1/ketik/review/status/${id}`, (route) =>
    route.fulfill({
      json: {
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
  await result.getByRole("button", { name: "Coba cek status" }).click();
  await expect(
    result.getByText("Sedang ditelaah AI", { exact: true }),
  ).toBeVisible();
  await expect(result.getByTestId("ketik-final-score")).toHaveCount(0);
  expect(
    audit.mockedApi.some((r) => r.startsWith("POST /api/v1/ketik/review")),
  ).toBe(false);
  expectHermetic(audit);
});

test("a late enqueue failure cannot downgrade a result already confirmed by polling", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: `/ketik?sesi=${id}&tahap=telaah`,
    auth: { role: "agent" },
    apiMocks: mocks(),
  });
  const result = page.getByRole("region", { name: "Hasil telaah" });
  await expect(
    result.getByRole("button", { name: "Mulai telaah" }),
  ).toBeVisible({ timeout: 20000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let enqueues = 0;
  await page.route("**/api/v1/ketik/review", async (route) => {
    enqueues++;
    await gate;
    await route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { code: "REVIEW_FAILED", message: "Coba lagi." },
      },
    });
  });
  await page.route(`**/api/v1/ketik/review/status/${id}`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status: "completed",
          resultReady: true,
          previousKept: false,
          scores,
          detail,
        },
      },
    }),
  );
  try {
    await result.getByRole("button", { name: "Mulai telaah" }).click();
    await expect(result.getByTestId("ketik-final-score")).toHaveText("80", {
      timeout: 10000,
    });
    const lateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/ketik/review"),
    );
    release();
    await lateResponse;
    // Let the fetch rejection reach the hook before asserting its terminal state.
    await page.waitForTimeout(500);
    await expect(
      result.getByText("Status telaah belum dapat diperbarui.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(result.getByTestId("ketik-final-score")).toHaveText("80");
    expect(enqueues).toBe(1);
    expectHermetic(audit);
  } finally {
    release();
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
