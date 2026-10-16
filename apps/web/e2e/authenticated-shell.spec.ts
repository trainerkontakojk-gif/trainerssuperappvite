import { expect, test, type Locator } from "@playwright/test";
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
    path: "/api/v1/sidak/dashboard/trend",
    body: { success: true, data: EMPTY_TREND },
  },
  {
    method: "GET",
    path: "/api/v1/admin/activity-logs",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/home/attention",
    body: { success: true, data: { items: [], partial: false } },
  },
  // Beranda agent memuat riwayat latihan, bukan data SIDAK.
  {
    method: "GET",
    path: "/api/v1/ketik/history",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/pdkt/history",
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

    // Beranda: `h1` berisi salam dengan nama depan dari sesi mock.
    await expect(
      page.getByRole("heading", { level: 1, name: /Trainer\./ }),
    ).toBeVisible({ timeout: 20000 });

    // Sidebar terautentikasi: bukti yang dirender adalah shell, bukan landing.
    for (const label of ["Beranda", "KETIK", "PDKT", "TELEFUN", "KTP"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
        `tautan sidebar "${label}" tidak tampil`,
      ).toBeVisible();
    }
    // Akun, tema, dan Keluar ada di menu akun di kaki sidebar.
    await expect(
      page.getByRole("button", { name: /menu akun/i }),
    ).toBeVisible();

    // Buktikan fetch awal dashboard memang terjadi DAN semuanya dilayani mock,
    // baru simpulkan tidak ada yang bocor.
    await waitForMockedApi(audit, [
      "/home/attention",
      "/dashboard/trend",
      "/activity-logs",
    ]);
    expectHermetic(audit);
  });
});

/**
 * Satu sumber navigasi (`buildNavModel`). Sidebar, tab bar, dan drawer harus
 * memuat himpunan modul yang sama untuk tiap peran, sesuai `access.ts`:
 * TELEFUN dan TNA hanya admin/trainer; SIDAK dan KTP tidak untuk agent.
 */
const ALL_MODULE_LABELS = [
  "Beranda",
  "KETIK",
  "PDKT",
  "TELEFUN",
  "SIDAK",
  "TNA",
  "KTP",
] as const;

const NAV_MATRIX: Record<
  string,
  { modules: readonly string[]; tabs: readonly string[] }
> = {
  admin: {
    modules: ["Beranda", "KETIK", "PDKT", "TELEFUN", "SIDAK", "TNA", "KTP"],
    tabs: ["Beranda", "SIDAK", "TNA", "KETIK"],
  },
  trainer: {
    modules: ["Beranda", "KETIK", "PDKT", "TELEFUN", "SIDAK", "TNA", "KTP"],
    tabs: ["Beranda", "SIDAK", "TNA", "KETIK"],
  },
  leader: {
    modules: ["Beranda", "KETIK", "PDKT", "SIDAK", "KTP"],
    tabs: ["Beranda", "SIDAK", "KTP", "KETIK"],
  },
  agent: {
    modules: ["Beranda", "KETIK", "PDKT"],
    tabs: ["Beranda", "KETIK", "PDKT"],
  },
};

/** Item navigasi bisa berupa link atau tombol (mis. grup SIDAK di sidebar). */
function navEntry(scope: Locator, name: string | RegExp) {
  const exact = typeof name === "string";
  return scope
    .getByRole("link", { name, exact })
    .or(scope.getByRole("button", { name, exact }));
}

/**
 * Tepat modul `expected` yang tampil di `scope`; modul lain dari daftar tidak
 * ada sama sekali. Telefun juga dicek tanpa peduli kapitalisasi agar label
 * lama ("Telefun") tidak lolos diam-diam.
 */
async function expectModuleSet(
  scope: Locator,
  expected: readonly string[],
  where: string,
) {
  for (const label of ALL_MODULE_LABELS) {
    await expect(
      navEntry(scope, label),
      `${where}: "${label}" ${expected.includes(label) ? "harus tampil" : "tidak boleh tampil"}`,
    ).toHaveCount(expected.includes(label) ? 1 : 0);
  }
  if (!expected.includes("TELEFUN")) {
    await expect(
      navEntry(scope, /telefun/i),
      `${where}: Telefun tidak boleh tampil`,
    ).toHaveCount(0);
  }
}

for (const [role, { modules, tabs }] of Object.entries(NAV_MATRIX)) {
  test.describe(`${role}: navigasi mengikuti matriks akses`, () => {
    test.beforeAll(async () => {
      await assertLocalDevOnlyTarget();
    });

    test("sidebar desktop memuat modul peran", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const audit = await openHermeticShell(page, {
        path: "/dashboard",
        auth: { role },
        apiMocks: DASHBOARD_MOCKS,
      });
      // Di ≥1024px tab bar `lg:hidden`, jadi navigasi ini adalah sidebar.
      const sidebar = page.getByRole("navigation", { name: "Navigasi utama" });
      await expect(navEntry(sidebar, "KETIK")).toBeVisible({ timeout: 20000 });
      await expectModuleSet(sidebar, modules, "sidebar");
      expectHermetic(audit);
    });

    test("tab bar dan drawer ponsel memuat modul yang sama", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const audit = await openHermeticShell(page, {
        path: "/dashboard",
        auth: { role },
        apiMocks: DASHBOARD_MOCKS,
      });
      const tabBar = page.getByRole("navigation", { name: "Navigasi utama" });
      await expect(tabBar.getByRole("button", { name: "Lainnya" })).toBeVisible(
        { timeout: 20000 },
      );
      await expectModuleSet(tabBar, tabs, "tab bar");

      await tabBar.getByRole("button", { name: "Lainnya" }).click();
      const drawer = page.getByRole("dialog", { name: "Menu navigasi" });
      await expect(
        drawer.getByRole("button", { name: /menu akun/i }),
      ).toBeVisible();
      await expectModuleSet(drawer, modules, "drawer");
      expectHermetic(audit);
    });
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
 * Batas teks untuk shell yang tampil di setiap halaman: sidebar berlabel
 * (termasuk sub-halaman SIDAK dan tooltip rail), menu akun, serta tab bar dan
 * drawer ponsel. Semua `/api` dimock; trainer (default sesi mock) dipakai agar
 * semua modul dan grup Administrasi tampil.
 */
test.describe(`Teks shell minimal ${MIN_TEXT_PX}px (hermetic)`, () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("sidebar desktop, grup SIDAK, dan menu akun", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await nav
      .getByRole("button", { name: "SIDAK", exact: true })
      .click({ timeout: 20000 });
    await expect(
      nav.getByRole("link", { name: "Ranking", exact: true }),
    ).toBeVisible();
    let offenders = await findTextBelowFloor(nav);
    expect(offenders, `sidebar: ${offenders.join("\n")}`).toEqual([]);

    await page.getByRole("button", { name: /menu akun/i }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    offenders = await findTextBelowFloor(menu);
    expect(offenders, `menu akun: ${offenders.join("\n")}`).toEqual([]);
    expectHermetic(audit);
  });

  test("tooltip rail saat sidebar diciutkan", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    await page
      .getByRole("button", { name: "Ciutkan sidebar" })
      .click({ timeout: 20000 });
    const items = page
      .getByRole("navigation", { name: "Navigasi utama" })
      .getByRole("link");
    const count = await items.count();
    expect(count).toBeGreaterThan(5);
    // Tooltip baru dirender saat di-hover; pindai satu per satu.
    for (let i = 0; i < count; i++) {
      await items.nth(i).hover();
      const tooltip = page.locator('[data-slot="rail-tooltip"]');
      await expect(tooltip).toBeVisible();
      const tipOffenders = await findTextBelowFloor(tooltip);
      expect(
        tipOffenders,
        `tooltip rail #${i}: ${tipOffenders.join("\n")}`,
      ).toEqual([]);
      await page.mouse.move(640, 400);
      await expect(tooltip).toBeHidden();
    }
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
    const drawer = page.getByRole("dialog", { name: "Menu navigasi" });
    await expect(
      drawer.getByRole("button", { name: /menu akun/i }),
    ).toBeVisible();
    offenders = await findTextBelowFloor(drawer);
    expect(offenders, `drawer: ${offenders.join("\n")}`).toEqual([]);
    expectHermetic(audit);
  });
});
