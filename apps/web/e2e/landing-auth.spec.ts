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

  test("dialog Masuk di layar pendek dapat digulir dan mengembalikan fokus saat Escape", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const audit = await openHermeticShell(page, { path: "/", auth: false });
    const trigger = page
      .getByRole("banner")
      .getByRole("button", { name: "Masuk", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(568);
    await expect(dialog).toHaveAccessibleName("Masuk");
    const close = dialog.getByRole("button", { name: "Tutup" });
    await expect(close).toBeFocused();
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    if (process.env.E2E_SCREENSHOT === "on") {
      await page.screenshot({ path: testInfo.outputPath("dialog-mobile.png") });
    }

    // Native modal focus may leave for browser controls when tabbing backward.
    // The page behind the modal must remain inert.
    await page
      .locator("header button")
      .filter({ hasText: /^Masuk$/ })
      .evaluate((element) => element.focus());
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Lanjutkan dengan Google" }),
    ).toBeFocused();
    const register = dialog.getByRole("button", {
      name: "Belum punya akun? Ajukan akses",
    });
    await register.scrollIntoViewIfNeeded();
    await expect(register).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expectHermetic(audit);
  });

  test("beralih mode masuk ke ajukan akses mengosongkan formulir dan menjaga fokus", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, { path: "/", auth: false });
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill("fixture@example.invalid");
    await dialog.getByLabel("Password").fill("password-fixture");
    await dialog
      .getByRole("button", { name: "Belum punya akun? Ajukan akses" })
      .click();
    await expect(dialog).toHaveAccessibleName("Minta Akses Baru");
    await expect(dialog.getByLabel("Email")).toHaveValue("");
    await expect(dialog.getByLabel("Password")).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "Tutup" })).toBeFocused();
    expectHermetic(audit);
  });
});
