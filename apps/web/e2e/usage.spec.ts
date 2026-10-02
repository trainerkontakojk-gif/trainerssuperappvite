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

/**
 * UsageModal — rincian simulasi vs penilaian AI (hermetic).
 *
 * Modal dipakai bersama KETIK/PDKT/Telefun; spec ini membukanya dari landing
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
  },
];

test.describe("UsageModal (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("membuka rincian pemakaian dari landing KETIK menampilkan simulasi dan penilaian", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: USAGE_MOCKS,
      expectedThirdPartyHosts: ["ojk.go.id"],
    });
    console.log("[audit]", formatAudit(audit));

    await page
      .getByRole("button", { name: /^Pemakaian bulan ini/ })
      .first()
      .click();

    // Scope ke dialog usage: modal pengaturan juga ada di DOM dan memuat teks
    // "+ Tambah Kategori Lainnya", yang akan cocok dengan `getByText("Lainnya")`
    // karena `getByText` dengan string mencocokkan SUBSTRING.
    const usageDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Penilaian AI" });
    await expect(usageDialog).toBeVisible({ timeout: 20000 });

    // Baris per kategori, bukan hanya angka total.
    await expect(usageDialog.getByText("Simulasi").first()).toBeVisible();
    await expect(usageDialog.getByText("Penilaian AI").first()).toBeVisible();
    // Biaya per kategori berasal dari `breakdown`, bukan dari total.
    await expect(usageDialog.getByText(/Rp\s?30\.000/).first()).toBeVisible();
    await expect(usageDialog.getByText(/Rp\s?20\.000/).first()).toBeVisible();
    // Kategori bernilai nol disembunyikan: `uncategorized` kosong di fixture.
    await expect(usageDialog.getByText("Lainnya", { exact: true })).toHaveCount(
      0,
    );

    await waitForMockedApi(audit, ["/ai/usage/summary"]);
    expectHermetic(audit);
  });
});
