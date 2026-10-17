import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { emptyUsageBreakdown } from "../src/lib/usage-snapshot";
import { summarizeKetikLanding } from "../src/routes/ketik/utils/landingSummary";

/**
 * Popover Pemakaian AI — rincian simulasi vs penilaian AI (hermetic).
 *
 * Popover dipakai bersama KETIK dan PDKT; spec ini membukanya dari landing
 * KETIK dan membuktikan rincian biaya per kategori dirender.
 *
 * Bentuk respons mengikuti `fetchUsageSummary` di `src/lib/usage-summary.ts`, dan
 * `breakdown` dibangun lewat `emptyUsageBreakdown()` dari `src/lib/usage-snapshot.ts`
 * supaya tidak ada salinan bentuk yang bisa menyimpang.
 */

const breakdown = emptyUsageBreakdown();
breakdown.simulation = {
  calls: 6,
  inputTokens: 3000,
  outputTokens: 2000,
  totalTokens: 5000,
  costIdr: 30000,
  costUsd: 2,
};
breakdown.review = {
  calls: 4,
  inputTokens: 2000,
  outputTokens: 1000,
  totalTokens: 3000,
  costIdr: 20000,
  costUsd: 1.3,
};

const USAGE_SUMMARY_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/ai/usage/summary",
  body: {
    success: true,
    data: {
      totalCalls: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalTokens: 8000,
      totalCostIdr: 50000,
      simulationCostIdr: 30000,
      reviewCostIdr: 20000,
      periodLabel: "Mei 2026",
      breakdown,
      breakdownItems: [],
    },
  },
};

const USAGE_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/ketik/settings",
    body: { success: true, data: DEFAULT_KETIK_SETTINGS },
    headers: {
      "x-settings-version": "v1",
      "x-ketik-templates-version": "t1",
    },
  },
  {
    method: "GET",
    path: "/api/v1/ketik/history",
    body: { success: true, data: [] },
  },
  {
    // Landing KETIK memuat ringkasan riwayat; dibangun dari riwayat kosong yang sama.
    method: "GET",
    path: "/api/v1/ketik/history/summary",
    body: { success: true, data: summarizeKetikLanding([]) },
  },
  USAGE_SUMMARY_MOCK,
];

test.describe("Pemakaian AI KETIK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("membuka rincian pemakaian dari landing KETIK menampilkan simulasi dan penilaian", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: USAGE_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    await page
      .getByRole("navigation", { name: "Menu KETIK" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click({ timeout: 20000 });

    const usage = page.getByRole("dialog").filter({ hasText: "Penilaian AI" });
    await expect(usage).toBeVisible({ timeout: 20000 });
    await expect(usage).toContainText("Mei 2026");

    // Baris per kategori, bukan hanya angka total.
    await expect(usage.getByText("Simulasi chat")).toBeVisible();
    await expect(usage.getByText("Penilaian AI")).toBeVisible();
    // Biaya per kategori berasal dari `breakdown`, bukan dari total.
    await expect(usage.getByText(/Rp\s?30\.000/).first()).toBeVisible();
    await expect(usage.getByText(/Rp\s?20\.000/).first()).toBeVisible();
    // Kategori bernilai nol disembunyikan: `uncategorized` kosong di fixture.
    await expect(usage.getByText("Lainnya", { exact: true })).toHaveCount(0);

    await waitForMockedApi(audit, ["/ai/usage/summary"]);
    expectHermetic(audit);
  });

  test("popover yang sama di landing Telefun memakai nama kegiatan Telefun", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/telefun/settings",
          body: { success: true, data: {} },
        },
        {
          method: "GET",
          path: "/api/v1/telefun/sessions",
          body: { success: true, data: [] },
        },
        USAGE_SUMMARY_MOCK,
      ],
    });

    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click({ timeout: 20000 });

    const usage = page
      .getByRole("dialog")
      .filter({ hasText: "Penilaian suara" });
    await expect(usage).toBeVisible({ timeout: 20000 });
    await expect(usage.getByText("Panggilan suara")).toBeVisible();
    await expect(usage.getByText(/Rp\s?30\.000/).first()).toBeVisible();

    await waitForMockedApi(audit, ["/ai/usage/summary"]);
    expectHermetic(audit);
  });
});
