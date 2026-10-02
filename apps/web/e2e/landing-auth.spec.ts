import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Landing publik — CTA mengikuti status auth (hermetic).
 *
 * Kontrak dari `LandingAuthClient` (`HeroAuthActions`): tamu melihat ajakan
 * masuk, sesi aktif melihat ajakan dashboard. Sebelum spec ini, seluruh suite
 * hanya menguji jalur terautentikasi, jadi jalur tamu tidak punya bukti E2E.
 */

test.describe("Landing publik — CTA mengikuti status auth", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("tamu melihat ajakan masuk, bukan ajakan dashboard", async ({
    page,
  }) => {
    // `auth: false` = sengaja tanpa sesi; setiap panggilan auth Supabase akan
    // tercatat di `blockedAuth` dan menggagalkan `expectHermetic`.
    const audit = await openHermeticShell(page, { path: "/", auth: false });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("button", { name: /Masuk ke Platform/ }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Buka Dashboard")).toHaveCount(0);

    expectHermetic(audit);
  });

  test("sesi aktif melihat ajakan dashboard, bukan ajakan masuk", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, { path: "/" });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("link", { name: /Buka Dashboard/ }).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /Masuk ke Platform/ }),
    ).toHaveCount(0);

    expectHermetic(audit);
  });
});
