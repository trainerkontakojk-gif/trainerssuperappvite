import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Bentuk respons dashboard diambil dari handler aslinya
 * (`apps/api/src/routes/sidak/dashboard.ts` dan `.../admin.ts`), yang selalu
 * membalas `{ success: true, data }` dan dibuka `unwrapResponse` di klien.
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

/**
 * Shell terautentikasi — smoke HERMETIC.
 *
 * Menggantikan `e2e-p0-p1.spec.ts`, yang mencampur `mockSupabaseAuth` (token
 * palsu) dengan pemanggilan `/api` SUNGGUHAN sehingga tidak mungkin lulus
 * (`401 INVALID_TOKEN`). Lihat `plans/markdown/e2e-mocked-auth-contract.md`.
 *
 * Yang dibuktikan: sesi mock lolos penjaga route, shell dirender, dan tidak ada
 * `/api` maupun host luar yang tersentuh. Yang TIDAK dibuktikan (dan bukan klaim
 * spec ini): mutasi data nyata — itu milik spec backend loopback.
 */

test.describe("Shell terautentikasi (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("sesi mock mencapai dashboard dan shell-nya dirender", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    // Dashboard tidak punya `h1`; judulnya `h2` dengan nama pengguna dari sesi
    // mock. Assertion lama (`h1 "Pusat Kendali"`) sudah usang sejak redesign
    // dashboard — itu sebab kedua spec lama selalu gagal selain soal auth.
    await expect(
      page.getByRole("heading", { name: /Halo, Trainer Visual\./ }),
    ).toBeVisible({ timeout: 20000 });

    // Sidebar terautentikasi: bukti yang dirender adalah shell, bukan landing.
    for (const label of [
      "Dashboard",
      "Ketik",
      "PDKT",
      "Telefun",
      "KTP",
      "Akun",
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
        `tautan sidebar "${label}" tidak tampil`,
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();

    // Buktikan fetch awal dashboard memang terjadi DAN semuanya dilayani mock,
    // baru simpulkan tidak ada yang bocor.
    await waitForMockedApi(audit, [
      "available-years",
      "/dashboard/trend",
      "/activity-logs",
    ]);
    expectHermetic(audit);
  });
});

for (const role of ["admin", "trainer", "leader", "agent"]) {
  test(`${role}: shell shows modules according to the approved access matrix`, async ({
    page,
  }) => {
    await assertLocalDevOnlyTarget();
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role },
      apiMocks: DASHBOARD_MOCKS,
    });
    await expect(
      page.getByRole("link", { name: "Ketik", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: "PDKT", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Telefun", exact: true }),
    ).toHaveCount(role === "admin" || role === "trainer" ? 1 : 0);
    await expect(
      page.getByRole("link", { name: "KTP", exact: true }),
    ).toHaveCount(role === "agent" ? 0 : 1);
    expectHermetic(audit);
  });
}

test("agent: protected management route redirects to unauthorized", async ({
  page,
}) => {
  await assertLocalDevOnlyTarget();
  const audit = await openHermeticShell(page, {
    path: "/dashboard/users",
    auth: { role: "agent" },
  });
  await expect(page).toHaveURL(/\/unauthorized$/);
  expectHermetic(audit);
});

for (const [module, path, landing] of [
  ["ktp", "/profiler/table", "/profiler"],
  ["sidak", "/sidak/dashboard", "/sidak"],
] as const) {
  test(`leader: ${module} view requires approval`, async ({ page }) => {
    await assertLocalDevOnlyTarget();
    const audit = await openHermeticShell(page, {
      path,
      auth: { role: "leader" },
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/me/access-status",
          body: { success: true, data: { [module!]: { status: "pending" } } },
        },
      ],
    });
    await expect(page).toHaveURL(new RegExp(`${landing}$`));
    expectHermetic(audit);
  });
}

/**
 * Batas teks 11px untuk shell yang tampil di setiap halaman: rail sidebar
 * (termasuk tooltip yang hanya muncul saat hover), flyout SIDAK/Management, serta
 * tab bar dan drawer ponsel. Semua `/api` dimock; admin dipakai agar semua
 * modul dan menu Management tampil.
 */
test.describe(`Teks shell minimal ${MIN_TEXT_PX}px (hermetic)`, () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("rail sidebar desktop beserta tooltip hover", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    const rail = page.locator(".sidebar-rail");
    await expect(rail.getByRole("link", { name: "KTP", exact: true })).toBeVisible({
      timeout: 20000,
    });

    const offenders = await findTextBelowFloor(rail);
    expect(offenders, `rail: ${offenders.join("\n")}`).toEqual([]);

    // Tooltip rail berukuran nol (scale-0) sampai di-hover, sehingga pemindaian
    // biasa melewatinya. Hover tiap item, tunggu tooltip terlihat, lalu pindai.
    const items = rail.locator(".sidebar-rail-item");
    const count = await items.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await item.hover();
      const tooltip = item.locator("div.absolute");
      await expect(tooltip).toBeVisible();
      const tipOffenders = await findTextBelowFloor(item);
      expect(tipOffenders, `tooltip rail #${i}: ${tipOffenders.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test("flyout SIDAK dan Management terbuka", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    const flyout = page.locator(".sidebar-flyout");

    await page.getByRole("button", { name: "SIDAK" }).click({ timeout: 20000 });
    await expect(flyout.getByRole("heading", { name: "SIDAK" })).toBeVisible();
    let offenders = await findTextBelowFloor(flyout);
    expect(offenders, `flyout SIDAK: ${offenders.join("\n")}`).toEqual([]);

    await page.getByRole("button", { name: "Management" }).click();
    await expect(flyout.getByRole("heading", { name: "Management" })).toBeVisible();
    offenders = await findTextBelowFloor(flyout);
    expect(offenders, `flyout Management: ${offenders.join("\n")}`).toEqual([]);
    expectHermetic(audit);
  });

  test("tab bar dan drawer ponsel (390x844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    const tabBar = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(tabBar.getByRole("button", { name: "Lainnya" })).toBeVisible({
      timeout: 20000,
    });
    let offenders = await findTextBelowFloor(tabBar);
    expect(offenders, `tab bar: ${offenders.join("\n")}`).toEqual([]);

    await tabBar.getByRole("button", { name: "Lainnya" }).click();
    const drawer = page.locator("div.fixed.inset-0.z-\\[80\\]");
    await expect(drawer.getByRole("link", { name: "Akun" })).toBeVisible();
    offenders = await findTextBelowFloor(drawer);
    expect(offenders, `drawer: ${offenders.join("\n")}`).toEqual([]);
    expectHermetic(audit);
  });
});
