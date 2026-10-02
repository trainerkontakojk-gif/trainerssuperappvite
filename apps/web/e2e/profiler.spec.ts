import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Profiler — flow browser-level HERMETIC (plan 025 spec #5).
 *
 * Menggantikan browser-level Profiler yang hilang bersama `e2e-p0-p1.spec.ts`.
 * Semua `/api` yang dipakai halaman ini dimock lewat `helpers/profilerMocks.ts`,
 * sehingga spec bisa lulus tanpa backend; mutasi data nyata (termasuk error
 * duplikat dari server) tetap milik spec backend loopback.
 */

test.describe("Profiler (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("workspace Profiler dirender tanpa menyentuh backend", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(page.getByText(/Kotak Tool Profil/i).first()).toBeVisible({
      timeout: 20000,
    });

    // Buktikan fetch awal benar-benar terjadi DAN semuanya dilayani mock.
    await waitForMockedApi(audit, [
      "/profiler/years",
      "/profiler/folders",
      "/profiler/counts",
      "/profiler/peserta/upcoming-birthdays",
      "/me/access-status",
    ]);
    expectHermetic(audit);
  });

  test("navigasi tim → batch dirender dari fixture lokal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });

    // Tim muncul di navigator; batch baru muncul setelah tim dibuka.
    await page
      .getByRole("button", { name: /Tim Call/i })
      .first()
      .click();
    await expect(page.getByText("Batch Pagi").first()).toBeVisible({
      timeout: 20000,
    });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
