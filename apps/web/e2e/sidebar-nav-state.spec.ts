import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  SIDAK_HOME_LEADER_MOCKS,
  SIDAK_HOME_MOCKS,
} from "./helpers/sidakHomeFixture";

/**
 * Sidebar berlabel (≥1024px) — hermetic.
 *
 * Kontrak dari `Sidebar`/`NavList`/`UserMenu` (rencana
 * `plans/markdown/shell-beranda-redesign.md`, hasil B):
 * - item aktif memakai `aria-current="page"`; grup SIDAK memakai
 *   `aria-expanded` dan terbuka otomatis di `/sidak/*`;
 * - sidebar bisa diciutkan menjadi rail, nama aksesibel item tetap ada, dan
 *   pilihan itu bertahan setelah reload;
 * - item Administrasi terakhir tetap bisa dijangkau di layar pendek;
 * - menu pengguna bisa dipakai dengan keyboard dan Esc mengembalikan fokus.
 *
 * Halaman Profiler dipakai sebagai halaman non-SIDAK karena murah dan sudah punya
 * fixture bersama (`helpers/profilerMocks.ts`).
 */

function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Navigasi utama" });
}

test.describe("Sidebar berlabel", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("item aktif memakai aria-current dan membawa label + fungsi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));
    const nav = sidebar(page);

    const ktp = nav.getByRole("link", { name: "KTP", exact: true });
    await expect(ktp).toBeVisible({ timeout: 20000 });
    await expect(ktp).toHaveAttribute("aria-current", "page");
    // Fungsi singkat tampil sebagai teks dan menjadi deskripsi aksesibel.
    await expect(ktp).toContainText("Profil agen & peserta");
    await expect(ktp).toHaveAccessibleDescription("Profil agen & peserta");
    await expect(
      nav.getByRole("link", { name: "Beranda", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // Grup tampil sebagai label teks, bukan flyout.
    for (const group of ["Latihan", "Kualitas", "Data", "Administrasi"]) {
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    }
    expectHermetic(audit);
  });

  test("grup SIDAK tertutup di luar /sidak dan bisa dibuka tanpa memindahkan item aktif", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    const nav = sidebar(page);
    const sidak = nav.getByRole("button", { name: "SIDAK", exact: true });
    await expect(sidak).toHaveAttribute("aria-expanded", "false", {
      timeout: 20000,
    });
    await expect(
      nav.getByRole("link", { name: "Ranking", exact: true }),
    ).toHaveCount(0);

    await sidak.click();
    await expect(sidak).toHaveAttribute("aria-expanded", "true");
    await expect(
      nav.getByRole("link", { name: "Ranking", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "KTP", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expectHermetic(audit);
  });

  test("/sidak membuka Dashboard; grup SIDAK terbuka dan tanpa Ringkasan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: SIDAK_HOME_MOCKS,
    });
    const nav = sidebar(page);
    await expect(page).toHaveURL(/\/sidak\/dashboard/, { timeout: 20000 });
    await expect(
      nav.getByRole("button", { name: "SIDAK", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Ringkasan", exact: true }),
    ).toHaveCount(0);
    // Trainer boleh mengelola konfigurasi SIDAK.
    await expect(
      nav.getByRole("link", { name: "Input temuan", exact: true }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("leader: sub-halaman SIDAK yang dilarang capability tidak tampil", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      auth: { role: "leader" },
      apiMocks: SIDAK_HOME_LEADER_MOCKS,
    });
    const nav = sidebar(page);
    await expect(
      nav.getByRole("link", { name: "Ranking", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    for (const forbidden of [
      "Input temuan",
      "Periode QA",
      "Parameter QA",
      "Laporan data",
      "Jadwal shifting",
    ]) {
      await expect(
        nav.getByRole("link", { name: forbidden, exact: true }),
        `leader tidak boleh melihat "${forbidden}"`,
      ).toHaveCount(0);
    }
    expectHermetic(audit);
  });

  test("rail ciut tetap punya nama aksesibel, tooltip, dan bertahan setelah reload", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    const nav = sidebar(page);
    const collapse = page.getByRole("button", { name: "Ciutkan sidebar" });
    await expect(collapse).toBeVisible({ timeout: 20000 });
    await collapse.click();

    const expand = page.getByRole("button", { name: "Lebarkan sidebar" });
    await expect(expand).toBeVisible();
    const box = await nav.boundingBox();
    expect(box?.width ?? 999).toBeLessThanOrEqual(72);

    for (const name of ["Beranda", "KETIK", "PDKT", "KTP", "TNA"]) {
      await expect(
        nav.getByRole("link", { name, exact: true }),
        `rail: nama aksesibel "${name}"`,
      ).toBeVisible();
    }
    // Teks fungsi tidak tampil di rail, tapi nama muncul sebagai tooltip.
    await expect(nav.getByText("Profil agen & peserta")).not.toBeVisible();
    await nav.getByRole("link", { name: "KETIK", exact: true }).hover();
    // Base UI Tooltip sengaja tanpa role (nama sudah dari label sr-only).
    await expect(
      page.locator('[data-slot="rail-tooltip"]', { hasText: "KETIK" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Lebarkan sidebar" }),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Lebarkan sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Ciutkan sidebar" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("di bawah 1024px sidebar tersembunyi dan hanya tab bar yang menjadi navigasi", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    const nav = sidebar(page);
    await expect(nav.getByRole("button", { name: "Lainnya" })).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole("button", { name: "Ciutkan sidebar" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: /menu akun/i })).toBeHidden();
    expectHermetic(audit);
  });

  for (const collapsed of [false, true]) {
    test(`1280x640${collapsed ? " (rail)" : ""}: item Administrasi terakhir bisa dijangkau`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      const audit = await openHermeticShell(page, {
        path: "/profiler",
        apiMocks: PROFILER_MOCKS,
      });
      const nav = sidebar(page);
      if (collapsed) {
        await page
          .getByRole("button", { name: "Ciutkan sidebar" })
          .click({ timeout: 20000 });
      }
      const last = nav.getByRole("link", {
        name: "Log Aktivitas",
        exact: true,
      });
      await last.scrollIntoViewIfNeeded({ timeout: 20000 });
      await expect(last).toBeInViewport();
      // Sidebar menggulir sendiri; dokumen tidak ikut memanjang.
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      expectHermetic(audit);
    });
  }

  test("menu pengguna: keyboard, ganti tema tanpa menutup, Esc mengembalikan fokus", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    const trigger = page.getByRole("button", { name: /menu akun/i });
    await expect(trigger).toBeVisible({ timeout: 20000 });
    // Akun, tema, dan keluar tidak lagi memakan slot navigasi.
    await expect(
      sidebar(page).getByRole("button", { name: "Keluar" }),
    ).toHaveCount(0);

    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Pengaturan akun" }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Keluar" })).toBeVisible();

    const themeItem = menu.getByRole("menuitem", { name: /^Ganti ke tema/ });
    const wasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    await themeItem.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      )
      .toBe(!wasDark);
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expectHermetic(audit);
  });
});
