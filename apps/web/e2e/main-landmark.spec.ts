/**
 * Landmark `main` tunggal di setiap halaman yang dirender di dalam shell.
 *
 * `DashboardLayout` (`components/Layout.tsx`) sudah membungkus konten halaman
 * dengan `<main>`, jadi halaman di dalam shell tidak boleh membuat `<main>`
 * sendiri. Halaman publik dan standalone (`/auth/callback`, `/pdkt/simulation`)
 * dirender tanpa shell dan memang memiliki `<main>` sendiri; tidak diuji di sini.
 *
 * Hermetic tanpa mock data: `/api` yang dipanggil halaman sengaja di-abort.
 * Kontrak landmark tidak bergantung pada data, jadi spec ini hanya menuntut
 * tidak ada egress luar dan tidak ada jalur auth yang lolos, bukan `expectHermetic`.
 */

import { expect, test } from "@playwright/test";
import { openHermeticShell, type ApiMock } from "./helpers/hermeticShell";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

type ShellRoute =
  | string
  | {
      path: string;
      apiMocks?: readonly ApiMock[];
      readyText?: string;
      expectedThirdPartyHosts?: readonly string[];
    };

const SHELL_ROUTES: readonly ShellRoute[] = [
  "/account",
  "/dashboard/users",
  // Halaman Ketik merujuk logo OJK; host itu tetap di-abort.
  { path: "/ketik", expectedThirdPartyHosts: ["ojk.go.id"] },
  "/monitoring",
  "/pdkt/history",
  "/profiler",
  // Tanpa batch dan data, tabel hanya merender state kosong/loading.
  {
    path: "/profiler/table?batch=Batch%20Pagi",
    apiMocks: [
      ...PROFILER_MOCKS,
      {
        method: "GET",
        path: "/api/v1/profiler/teams",
        body: { success: true, data: [{ id: TEAM_ID, nama: "Tim Call" }] },
      },
    ],
    readyText: "Rina Kartika",
  },
  "/profiler/add",
  "/profiler/import",
  "/profiler/teams",
  "/sidak/forecast",
  "/sidak/heatmap",
  "/sidak/input",
  "/sidak/periods",
  "/sidak/ranking",
  "/sidak/reports-data",
  "/sidak/settings",
  "/telefun",
];

test.describe("Landmark main tunggal (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  for (const route of SHELL_ROUTES) {
    const { path, apiMocks, readyText, expectedThirdPartyHosts } =
      typeof route === "string" ? { path: route } : route;
    const pathname = path.split("?")[0];

    test(`${pathname} hanya punya satu landmark main`, async ({ page }) => {
      const audit = await openHermeticShell(page, {
        path,
        apiMocks,
        expectedThirdPartyHosts,
        auth: { role: "admin" },
        waitForUrl: new RegExp(`${pathname}(\\?|$)`),
      });

      const content = page.getByRole("region", { name: "Konten halaman" });
      await expect(content).toBeVisible({ timeout: 20000 });
      await expect(page.getByText("Memuat halaman...")).toHaveCount(0, {
        timeout: 20000,
      });
      await page.waitForLoadState("networkidle");
      if (readyText) {
        await expect(page.getByText(readyText).first()).toBeVisible();
      }

      expect(new URL(page.url()).pathname).toBe(pathname);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("main main")).toHaveCount(0);
      expect(audit.blockedExternal).toEqual([]);
      expect(audit.blockedAuth).toEqual([]);
    });
  }
});
