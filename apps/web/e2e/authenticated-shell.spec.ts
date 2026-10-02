import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

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
