import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import { DEFAULT_AI_MODEL_ID } from "@trainers/types";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { findTargetsBelow } from "./helpers/touchTarget";

async function verifyRecoveryNotice(
  page: Page,
  notice: Locator,
  info: TestInfo,
  name: string,
) {
  for (const theme of ["light", "dark"] as const) {
    await setDocumentTheme(page, theme);
    expect(await findTargetsBelow(page, notice)).toEqual([]);
    expect(
      await findLowContrastText(notice, {
        selector: "p,div,button",
        leafOnly: true,
      }),
    ).toEqual([]);
    await notice.screenshot({ path: info.outputPath(`${name}-${theme}.png`) });
  }
  const retry = notice.getByRole("button", { name: "Coba lagi" });
  await retry.focus();
  await expect(retry).toBeFocused();
}

const scenario = {
  id: "resilience",
  title: "Tagihan setelah lunas",
  description: "Tagihan masih masuk.",
  category: "Pinjaman",
  isActive: true,
};
const consumer = { id: "calm", name: "Tenang", description: "Tenang" };
const settings = {
  scenarios: [scenario],
  consumerTypes: [consumer],
  enableImageGeneration: false,
  globalConsumerTypeId: "calm",
  selectedModel: DEFAULT_AI_MODEL_ID,
  consumerNameMentionPattern: "none",
  writingStyleMode: "training",
};
function mail(status: "open" | "replied", historyId: string | null = null) {
  const inbound = {
    id: "inbound",
    from: "budi@mail.test",
    to: "",
    subject: scenario.title,
    body: "Mohon periksa tagihan saya.",
    timestamp: "2026-10-16T01:00:00Z",
    isAgent: false,
  };
  return {
    id: "resilience-mail",
    user_id: "user-1",
    status,
    history_id: historyId,
    created_at: inbound.timestamp,
    last_activity_at: inbound.timestamp,
    sender_name: "Budi",
    sender_email: inbound.from,
    subject: inbound.subject,
    snippet: inbound.body,
    inbound_email: inbound,
    emails_thread:
      status === "replied"
        ? [
            inbound,
            {
              ...inbound,
              id: "reply",
              body: "Kami memeriksa tagihan Anda.",
              isAgent: true,
            },
          ]
        : [],
    permissions: { can_delete: true },
    simulationSubject: { type: "self" },
  };
}
const completed = {
  id: "resilience-history",
  timestamp: "2026-10-16T01:00:00Z",
  config: null,
  emails: [],
  evaluation_status: "completed",
  evaluation: {
    score: 85,
    feedback: "Balasan jelas.",
    typos: [],
    clarityIssues: [],
    contentGaps: [],
    scoreBreakdown: {
      recipientDirectionScore: 90,
      normativeResponseScore: 80,
      clarityScore: 85,
      typoScore: 88,
      templateComplianceScore: 82,
    },
  },
};
function mocks(
  item: ReturnType<typeof mail> | null,
  history: unknown[] = [],
): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/pdkt/settings",
      headers: { "x-settings-version": "absent" },
      body: { success: true, data: settings },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/scenarios",
      body: { success: true, data: [scenario] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/consumer-types",
      body: { success: true, data: [consumer] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/mailbox",
      body: { success: true, data: item ? [item] : [] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/mailbox/resilience-mail",
      body: { success: true, data: item },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/history",
      body: { success: true, data: history },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/history/eval/resilience-history",
      body: {
        success: true,
        data: {
          evaluation_status: "completed",
          evaluation: completed.evaluation,
          evaluation_error: null,
        },
      },
    },
    {
      method: "GET",
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
    {
      method: "POST",
      path: "/api/v1/pdkt/generate-identity",
      body: {
        success: true,
        data: {
          name: "Budi",
          email: "budi@mail.test",
          city: "Bandung",
          bodyName: "Budi",
        },
      },
    },
    {
      method: "POST",
      path: "/api/v1/pdkt/session/create",
      body: {
        success: true,
        data: { id: "resilience-mail", message: mail("open").inbound_email },
      },
    },
  ];
}
test.beforeAll(() => assertLocalDevOnlyTargetAt(APP_ORIGIN));
for (const width of [390, 1280]) {
  test(`detail failure is recoverable with retry and Back at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const item = mail("open");
    const audit = await openHermeticShell(page, {
      path: "/pdkt?ruang=1&email=resilience-mail",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/mailbox/resilience-mail",
          status: 500,
          body: {
            success: false,
            error: { message: "private database detail" },
          },
        },
        ...mocks(item),
      ],
    });
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/mailbox/resilience-mail"]);
    const failure = page
      .getByRole("alert")
      .filter({ hasText: "Email belum bisa dimuat" });
    await expect(failure).toBeVisible();
    await expect(failure).not.toContainText("private database detail");
    await expect(
      failure.getByRole("button", { name: "Kembali ke daftar email" }),
    ).toBeVisible();
    await verifyRecoveryNotice(page, failure, info, `detail-error-${width}`);
    await failure
      .getByRole("button", { name: "Kembali ke daftar email" })
      .click();
    await expect(page).not.toHaveURL(/email=/);
    await expect(failure).toHaveCount(0);
    await page
      .getByRole("button", { name: new RegExp(scenario.title) })
      .click();
    await expect(failure).toBeVisible();
    await page.route("**/api/v1/pdkt/mailbox/resilience-mail", (route) =>
      route.fulfill({ json: { success: true, data: item } }),
    );
    await failure.getByRole("button", { name: "Coba lagi" }).click();
    await expect(
      page.getByRole("region", { name: "Detail email" }),
    ).toContainText(item.inbound_email.body);
    expect(errors).toEqual([]);
    expectHermetic(audit);
  });

  test(`failed settings block defaults and recover without auto-creation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    let creates = 0;
    page.on("request", (request) => {
      if (request.url().includes("/pdkt/session/create")) creates++;
    });
    const audit = await openHermeticShell(page, {
      path: "/pdkt?ruang=1",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/settings",
          status: 500,
          body: {
            success: false,
            error: { message: "private settings detail" },
          },
        },
        ...mocks(null),
      ],
    });
    const failure = page
      .getByRole("alert")
      .filter({ hasText: "Pengaturan belum bisa dimuat" });
    await expect(failure).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Email baru", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Semua", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Buat email pertama", exact: true }),
    ).toBeDisabled();
    await verifyRecoveryNotice(page, failure, info, `settings-error-${width}`);
    const attempts = audit.mockedApi.filter(
      (request) => request === "GET /api/v1/pdkt/settings",
    ).length;
    await failure.getByRole("button", { name: "Coba lagi" }).click();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter(
            (request) => request === "GET /api/v1/pdkt/settings",
          ).length,
      )
      .toBeGreaterThan(attempts);
    await expect(failure).toBeVisible();
    expect(creates).toBe(0);
    await page.route("**/api/v1/pdkt/settings", (route) =>
      route.fulfill({
        headers: { "x-settings-version": "absent" },
        json: { success: true, data: settings },
      }),
    );
    await failure.getByRole("button", { name: "Coba lagi" }).click();
    await expect(failure).toHaveCount(0);
    expect(creates).toBe(0);
    await page.getByRole("button", { name: "Email baru", exact: true }).click();
    const request = page.waitForRequest(
      (request) =>
        request.url().includes("/pdkt/session/create") &&
        request.method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(scenario.title) })
      .click();
    expect((await request).postDataJSON().enableImageGeneration).toBe(false);
    await waitForMockedApi(audit, ["POST /api/v1/pdkt/session/create"]);
    expectHermetic(audit);
  });
}

test("rejected re-review preserves the completed score and retry action", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: "/pdkt?ruang=1&email=resilience-mail&tahap=telaah",
    apiMocks: [
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        status: 500,
        body: { success: false, error: { message: "private retry error" } },
      },
      ...mocks(mail("replied", completed.id), [completed]),
    ],
  });
  const score = page.getByTestId("pdkt-review-score");
  await expect(score).toHaveText("85");
  await page.getByRole("button", { name: "Telaah ulang", exact: true }).click();
  await waitForMockedApi(audit, ["POST /api/v1/pdkt/history/retry-eval"]);
  await expect(
    page.getByText(
      "Telaah belum bisa diulang. Coba lagi dalam beberapa saat.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(score).toHaveText("85");
  await expect(
    page.getByRole("button", { name: "Telaah ulang", exact: true }),
  ).toBeVisible();
  expectHermetic(audit);
});

test("deleted history is an honest terminal state rather than ongoing evaluation", async ({
  page,
}, info) => {
  const audit = await openHermeticShell(page, {
    path: "/pdkt?ruang=1&email=resilience-mail&tahap=telaah",
    apiMocks: mocks(mail("replied")),
  });
  await waitForMockedApi(audit, ["GET /api/v1/pdkt/mailbox/resilience-mail"]);
  await expect(
    page.getByText("Telaah sudah dihapus", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sedang ditelaah AI…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Coba lagi", exact: true }),
  ).toHaveCount(0);
  expect(
    audit.mockedApi.filter((request) => request.includes("/history/eval/")),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("deleted-history.png"),
    fullPage: true,
  });
  expectHermetic(audit);
});
