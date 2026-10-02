import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Sidebar — pemisahan "aktif" dan "flyout terbuka" (hermetic).
 *
 * Kontrak dari `Sidebar`: modul yang sedang dibuka route-nya memakai
 * `data-active`, sedangkan modul yang flyout-nya terbuka memakai `data-open`.
 * Keduanya harus terpisah — membuka flyout SIDAK saat berada di halaman lain
 * tidak boleh memindahkan status aktif.
 *
 * Halaman Profiler dipakai sebagai halaman non-SIDAK karena murah dan sudah punya
 * fixture bersama (`helpers/profilerMocks.ts`).
 */

test.describe("Sidebar — state aktif vs flyout", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("membuka flyout SIDAK tidak memindahkan modul yang aktif", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    // Nama aksesibel rail berasal dari tooltip modul ("KTP" untuk Profiler).
    const profilerItem = page.getByRole("link", { name: "KTP", exact: true });
    const sidakButton = page.getByRole("button", { name: "SIDAK" });

    await expect(profilerItem).toBeVisible({ timeout: 20000 });
    await expect(profilerItem).toHaveAttribute("data-active", "true");
    await expect(sidakButton).toHaveAttribute("data-active", "false");
    await expect(sidakButton).toHaveAttribute("data-open", "false");

    await sidakButton.click();

    // Flyout terbuka → `data-open`, TAPI bukan `data-active`.
    await expect(sidakButton).toHaveAttribute("data-open", "true");
    await expect(sidakButton).toHaveAttribute("data-active", "false");
    // Dan modul aktif sebelumnya tidak berpindah.
    await expect(profilerItem).toHaveAttribute("data-active", "true");

    expectHermetic(audit);
  });

  test("membuka flyout Management tidak memindahkan modul yang aktif", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });

    const profilerItem = page.getByRole("link", { name: "KTP", exact: true });
    const managementButton = page.getByRole("button", { name: "Management" });
    await expect(profilerItem).toBeVisible({ timeout: 20000 });

    await managementButton.click();

    await expect(managementButton).toHaveAttribute("data-open", "true");
    await expect(managementButton).toHaveAttribute("data-active", "false");
    await expect(profilerItem).toHaveAttribute("data-active", "true");

    expectHermetic(audit);
  });

  test("di halaman SIDAK, modul SIDAK aktif dan terbuka sekaligus", async ({
    page,
  }) => {
    // Landing SIDAK hanya butuh gate akses; tidak ada endpoint SIDAK lain.
    const sidakLandingMocks: readonly ApiMock[] = [
      {
        method: "GET",
        path: "/api/v1/me/access-status",
        body: { success: true, data: {} },
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: sidakLandingMocks,
    });

    const sidakButton = page.getByRole("button", { name: "SIDAK" });
    await expect(sidakButton).toHaveAttribute("data-active", "true");

    await sidakButton.click();

    await expect(sidakButton).toHaveAttribute("data-open", "true");
    await expect(sidakButton).toHaveAttribute("data-active", "true");

    expectHermetic(audit);
  });
});
