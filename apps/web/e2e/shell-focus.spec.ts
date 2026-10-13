import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Header, drawer, dan fokus shell — hermetic.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil C dan F):
 * - breadcrumb memakai label "Beranda" untuk `/dashboard`;
 * - skip link membawa fokus ke konten halaman;
 * - setelah navigasi lewat menu, fokus pindah ke `h1` halaman baru (atau ke
 *   region konten bila halaman tidak punya `h1`) dan `document.title` ikut
 *   berubah;
 * - drawer ponsel adalah dialog berlabel, memakai daftar navigasi yang sama,
 *   dan tidak menggandakan id dengan sidebar.
 */

const EMPTY_TREND = {
  labels: [],
  totalData: [],
  serviceData: {},
  activeServices: [],
  serviceSummary: {},
  totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
};

const DASHBOARD_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard/available-years",
    body: { success: true, data: [2026] },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard/trend",
    body: {
      success: true,
      data: {
        trendMap: { "3m": EMPTY_TREND, "6m": EMPTY_TREND, all: EMPTY_TREND },
      },
    },
  },
  {
    method: "GET",
    path: "/api/v1/admin/activity-logs",
    body: { success: true, data: [] },
  },
];

const SHELL_MOCKS: readonly ApiMock[] = [...DASHBOARD_MOCKS, ...PROFILER_MOCKS];

test.describe("Header, drawer, dan fokus shell", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("breadcrumb Beranda dan judul dokumen di /dashboard", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: SHELL_MOCKS,
    });
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(
      breadcrumb.getByText("Beranda", { exact: true }),
    ).toHaveAttribute("aria-current", "page", { timeout: 20000 });
    await expect(
      breadcrumb.getByText("Dashboard", { exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveTitle("Beranda · Trainers SuperApp");
    expectHermetic(audit);
  });

  test("skip link adalah tab stop pertama dan membawa fokus ke konten", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: SHELL_MOCKS,
    });
    await expect(
      page
        .getByRole("navigation", { name: "Navigasi utama" })
        .getByRole("link", { name: "Beranda", exact: true }),
    ).toBeVisible({ timeout: 20000 });

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Lewati ke konten" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("region", { name: "Konten halaman" }),
    ).toBeFocused();
    expectHermetic(audit);
  });

  test("navigasi lewat sidebar memindahkan fokus ke h1 dan mengubah judul", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: SHELL_MOCKS,
    });
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await nav
      .getByRole("link", { name: "KTP", exact: true })
      .click({ timeout: 20000 });
    await expect(page).toHaveURL(/\/profiler$/);
    await expect(page.locator("h1").first()).toBeFocused();
    await expect(page).toHaveTitle("KTP · Trainers SuperApp");

    // Landing SIDAK (route lazy) tidak punya h1. Selama dimuat, h1 KTP masih
    // tampil; fokus tidak boleh jatuh ke h1 lama itu, tapi ke region konten.
    await nav.getByRole("button", { name: "SIDAK", exact: true }).click();
    await nav.getByRole("link", { name: "Beranda SIDAK", exact: true }).click();
    await expect(page).toHaveURL(/\/sidak$/);
    await expect(
      page.getByRole("region", { name: "Konten halaman" }),
    ).toBeFocused();
    await expect(page).toHaveTitle("SIDAK · Trainers SuperApp");

    // Beranda belum punya h1: fokus jatuh ke region konten.
    await nav.getByRole("link", { name: "Beranda", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("region", { name: "Konten halaman" }),
    ).toBeFocused();
    await expect(page).toHaveTitle("Beranda · Trainers SuperApp");
    expectHermetic(audit);
  });

  test("drawer ponsel: dialog berlabel, navigasi bersama, tanpa id ganda, Esc menutup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: SHELL_MOCKS,
    });
    const opener = page.getByRole("button", { name: "Buka menu navigasi" });
    await opener.click({ timeout: 20000 });

    const drawer = page.getByRole("dialog", { name: "Menu navigasi" });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: "KETIK", exact: true }),
    ).toHaveAccessibleDescription("Simulasi chat");
    await expect(drawer.getByText("Latihan", { exact: true })).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: /menu akun/i }),
    ).toBeVisible();

    const duplicateIds = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const el of document.querySelectorAll("[id]")) {
        seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      }
      return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(duplicateIds).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    expectHermetic(audit);
  });

  test("menu akun di drawer tampil di atas drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: SHELL_MOCKS,
    });
    await page
      .getByRole("button", { name: "Buka menu navigasi" })
      .click({ timeout: 20000 });
    const drawer = page.getByRole("dialog", { name: "Menu navigasi" });
    await drawer.getByRole("button", { name: /menu akun/i }).click();
    // Klik sungguhan gagal bila menu tertutup lapisan drawer.
    await page.getByRole("menuitem", { name: "Pengaturan akun" }).click();
    await expect(page).toHaveURL(/\/account$/);
    expectHermetic(audit);
  });
});
