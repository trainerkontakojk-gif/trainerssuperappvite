import { expect, test, type Page } from "@playwright/test";
import { openHermeticShell, expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { session } from "./helpers/ketikServerChatHarness";
import { ketikMocks, PENDING_SESSION } from "./helpers/ketikFlowHarness";
import { emptyUsageBreakdown } from "../src/lib/usage-snapshot";

const firstId = "23000000-0000-4000-8000-000000000001";
const secondId = "23000000-0000-4000-8000-000000000002";
const histories = [firstId, secondId].map((id, index) => ({
  ...PENDING_SESSION,
  id,
  scenarioTitle: `Sesi pemakaian ${index + 1}`,
}));
function snapshot(totalCalls: number, totalCostIdr: number) {
  const breakdown = emptyUsageBreakdown();
  breakdown.simulation = {
    calls: totalCalls,
    inputTokens: totalCalls * 10,
    outputTokens: totalCalls * 10,
    totalTokens: totalCalls * 20,
    costIdr: totalCostIdr,
    costUsd: 0,
  };
  return {
    totalCalls,
    totalCostIdr,
    totalTokens: totalCalls * 20,
    totalInputTokens: totalCalls * 10,
    totalOutputTokens: totalCalls * 10,
    simulationCostIdr: totalCostIdr,
    reviewCostIdr: 0,
    breakdown,
  };
}
async function start(page: Page) {
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Mulai|Lanjutkan/ })
    .click();
  await expect(page.getByRole("region", { name: "Ruang chat" })).toBeVisible();
}
async function finish(page: Page) {
  await page
    .getByRole("region", { name: "Ruang chat" })
    .getByRole("button", { name: "Akhiri chat", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Akhiri chat sekarang?" })
    .getByRole("button", { name: "Akhiri chat", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Hasil telaah" })
      .getByText("Belum ditelaah", { exact: true }),
  ).toBeVisible();
}

test.beforeAll(() => assertLocalDevOnlyTarget());
test("late usage from the previous session cannot replace the latest session delta", async ({
  page,
}) => {
  test.setTimeout(60000);
  const audit = await openHermeticShell(page, {
    path: "/ketik",
    apiMocks: ketikMocks(histories),
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  let starts = 0;
  await page.route("**/api/v1/ketik/sessions", (route) => {
    const item = histories[starts++];
    return route.fulfill({
      json: {
        success: true,
        data: session({
          id: item.id,
          consumerClosed: true,
          messages: item.messages,
        }),
      },
    });
  });
  for (const item of histories)
    await page.route(`**/api/v1/ketik/sessions/${item.id}/finish`, (route) =>
      route.fulfill({ json: { success: true, data: item } }),
    );
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/ai/usage/summary**", async (route) => {
    const read = ++reads;
    if (read === 2) await gate;
    const data =
      read === 1
        ? snapshot(10, 100)
        : read === 2
          ? snapshot(100, 999)
          : read === 3
            ? snapshot(20, 200)
            : snapshot(25, 225);
    await route.fulfill({ json: { success: true, data } });
  });
  try {
    await start(page);
    await finish(page);
    await expect.poll(() => reads, { timeout: 10000 }).toBe(2);
    await page.getByRole("button", { name: "KETIK", exact: true }).click();
    await start(page);
    await expect.poll(() => reads).toBe(3);
    await finish(page);
    await expect.poll(() => reads, { timeout: 10000 }).toBe(4);
    await page.getByRole("button", { name: "KETIK", exact: true }).click();
    const usage = page.getByRole("button", { name: /^Pemakaian AI/ });
    await expect(usage).toContainText("+Rp25");
    const late = page.waitForResponse((response) =>
      response.url().includes("/ai/usage/summary"),
    );
    release();
    await (await late).finished();
    await page.waitForTimeout(300);
    await expect(usage).toContainText("+Rp25");
    await expect(usage).not.toContainText("+Rp899");
    // A refused start is not a new session and must keep the last known result.
    await page.route("**/api/v1/ketik/sessions", (route) =>
      route.fulfill({
        status: 503,
        json: {
          success: false,
          error: { code: "SESSION_FAILED", message: "Coba lagi." },
        },
      }),
    );
    await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Mulai|Lanjutkan/ })
      .click();
    await expect(
      page.getByText(
        "Sesi belum bisa dimulai. Periksa penugasan dan pengaturan, lalu coba lagi.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(usage).toContainText("+Rp25");
    await page.screenshot({
      path: test.info().outputPath("latest-session-usage.png"),
    });
    expectHermetic(audit);
  } finally {
    release();
  }
});
