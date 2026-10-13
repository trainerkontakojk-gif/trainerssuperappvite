/**
 * Proyeksi tren di Beranda (`/dashboard`, kartu "Tren temuan QA").
 *
 * Hermetic: semua `/api` di-mock lewat `helpers/hermeticShell` (fail-closed).
 * Beranda hanya membaca proyeksi yang sudah tersimpan (`cacheOnly`); membuat
 * atau memperbarui prediksi ada di `/sidak/forecast`. Tiap test memasang
 * `page.route` untuk POST forecast lalu me-reload halaman: route yang
 * didaftarkan belakangan dijalankan lebih dulu. Dev server memakai React
 * StrictMode, jadi lookup saat load bisa terkirim dua kali; test menghitung
 * jenis request, bukan urutannya.
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./helpers/hermeticShell";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { findTextBelowFloor } from "./helpers/typographyFloor";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const YEAR = new Date().getFullYear();
const FORECAST_PATH = "/api/v1/sidak/dashboard/forecast";

const trend = (labels: string[], totals: number[]) => ({
  labels,
  totalData: totals,
  serviceData: { call: totals },
  activeServices: ["call"],
  serviceSummary: {
    call: { totalDefects: totals.reduce((a, b) => a + b, 0), auditedAgents: 5 },
  },
  totalSummary: {
    totalDefects: totals.reduce((a, b) => a + b, 0),
    auditedAgents: 5,
    activeServiceCount: 1,
  },
});

const TWO_MONTHS = trend(["Jan 26", "Feb 26"], [10, 15]);
const ONE_MONTH = trend(["Jan 26"], [10]);

const FORECAST_SNAPSHOT = {
  series: {
    total: {
      scope: { type: "total", label: "Total Temuan" },
      historical: [
        { label: "Jan 26", value: 10 },
        { label: "Feb 26", value: 15 },
      ],
      forecast: [{ label: "Mar 26", value: 20 }],
      summary: {
        direction: "up",
        projectedChange: 5,
        projectedChangePercent: 33.3,
        confidence: "high",
      },
      status: "ready",
    },
    parameters: {},
  },
  insight: { text: "Tren meningkat.", status: "generated" },
  cache: { status: "refreshed", filterKey: "filter", dataFingerprint: "data" },
  generatedAt: `${YEAR}-03-01T00:00:00.000Z`,
};

type ForecastReply = { status: number; data?: unknown };
type ForecastBody = {
  filters: { year: number; serviceType?: string };
  horizonMonths: number;
  forceRefresh: boolean;
  cacheOnly: boolean;
};

const dashboardMocks = (trendData: unknown): ApiMock[] => [
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard/trend",
    body: { success: true, data: trendData },
  },
  {
    method: "GET",
    path: "/api/v1/admin/activity-logs",
    body: { success: true, data: [] },
  },
  // Only serves the first, pre-reload load; each test overrides it below.
  {
    method: "GET",
    path: "/api/v1/home/attention",
    body: { success: true, data: { items: [], partial: false } },
  },
  {
    method: "POST",
    path: FORECAST_PATH,
    body: { success: true, data: { status: "missing", snapshot: null } },
  },
];

/**
 * Buka `/dashboard`, lalu reload dengan POST forecast yang dijawab sesuai
 * jenisnya. Mengembalikan body setiap POST forecast setelah reload.
 */
async function openDashboard(
  page: Page,
  trendData: unknown,
  lookup: ForecastReply,
): Promise<{ audit: ShellAudit; bodies: ForecastBody[] }> {
  const audit = await openHermeticShell(page, {
    path: "/dashboard",
    apiMocks: dashboardMocks(trendData),
  });
  await waitForMockedApi(audit, ["/sidak/dashboard/trend"]);

  const bodies: ForecastBody[] = [];
  await page.route(`**${FORECAST_PATH}`, async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as ForecastBody;
    bodies.push(body);
    const reply = lookup;
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      body: JSON.stringify(
        reply.status < 400
          ? { success: true, data: reply.data }
          : { success: false, error: { message: "Forecast unavailable" } },
      ),
    });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tren temuan QA" }),
  ).toBeVisible({ timeout: 20000 });
  return { audit, bodies };
}

const card = (page: Page) =>
  page.getByRole("region", { name: "Tren temuan QA" });

/** Baris tabel alternatif grafik: `[label, nilai]`, proyeksi ditandai. */
const chartTable = (page: Page) =>
  card(page)
    .locator("table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector("th")?.textContent?.trim() ?? "",
        row.querySelector("td")?.textContent?.trim() ?? "",
      ]),
    );

const FRESH = {
  status: 200,
  data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
};
const MISSING = { status: 200, data: { status: "missing", snapshot: null } };

test.describe("Proyeksi tren di Beranda (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("proyeksi tersimpan tampil putus-putus; Beranda tidak memaksa refresh", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, FRESH);

    await expect(
      card(page).getByText("Proyeksi", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => chartTable(page))
      .toEqual([
        ["Jan 26", "10"],
        ["Feb 26", "15"],
        ["Mar 26 (proyeksi)", "20"],
      ]);
    await expect(card(page)).toContainText("garis putus-putus = proyeksi");
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).toMatchObject({
        filters: { year: YEAR },
        horizonMonths: 3,
        cacheOnly: true,
        forceRefresh: false,
      });
    }
    await expect(
      card(page).getByRole("button", { name: /Prediksi/ }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("rentang yang tidak sampai bulan ini: proyeksi tidak disambung", async ({
    page,
  }) => {
    // Oktober, supaya ada bulan akhir sebelum bulan ini. Jam sengaja di masa
    // lalu agar sesi mock tetap sah.
    await page.clock.setFixedTime(new Date("2026-10-05T05:00:00Z"));
    const { audit } = await openDashboard(page, TWO_MONTHS, FRESH);
    await expect(
      card(page).getByText("Proyeksi", { exact: true }),
    ).toBeVisible();

    await card(page)
      .getByRole("combobox", { name: "Bulan akhir" })
      .selectOption({ label: "Feb" });
    await expect(card(page).getByText("Proyeksi", { exact: true })).toHaveCount(
      0,
    );
    await expect(card(page).locator("tr[data-projection]")).toHaveCount(0);
    await expect(card(page)).not.toContainText("putus-putus");
    expectHermetic(audit);
  });

  test("tanpa proyeksi tersimpan: hanya data aktual", async ({ page }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, MISSING);

    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    await expect
      .poll(() => chartTable(page))
      .toEqual([
        ["Jan 26", "10"],
        ["Feb 26", "15"],
      ]);
    await expect(card(page).getByText("Proyeksi", { exact: true })).toHaveCount(
      0,
    );
    await expect(card(page)).not.toContainText("putus-putus");
    expectHermetic(audit);
  });

  test("ganti layanan: lookup ulang untuk layanan itu", async ({ page }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, MISSING);
    await expect.poll(() => bodies.length).toBeGreaterThan(0);

    await card(page)
      .getByRole("combobox", { name: "Layanan" })
      .selectOption({ label: "Layanan Call" });
    await expect
      .poll(() => bodies.some((b) => b.filters.serviceType === "call"))
      .toBe(true);
    expectHermetic(audit);
  });

  test("data kurang dari dua bulan: tanpa lookup proyeksi", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, ONE_MONTH, MISSING);

    await expect.poll(() => chartTable(page)).toEqual([["Jan 26", "10"]]);
    expect(bodies).toHaveLength(0);
    expectHermetic(audit);
  });

  test("Teks grafik tren memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, FRESH);
    await expect(
      card(page).getByText("Proyeksi", { exact: true }),
    ).toBeVisible();

    const offenders: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      offenders.push(
        ...(await findLowContrastText(card(page))).map(
          (o) => `[${theme}] ${o}`,
        ),
      );
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("Teks Beranda minimal 11px, termasuk tooltip grafik", async ({
    page,
  }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, FRESH);
    await expect(
      card(page).getByText("Proyeksi", { exact: true }),
    ).toBeVisible();

    const main = page.getByRole("region", { name: "Konten halaman" });
    expect(await findTextBelowFloor(main)).toEqual([]);

    // Arahkan ke titik terakhir (proyeksi) agar tooltip tampil.
    const chart = card(page).locator("figure svg");
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error("Trend chart has no bounding box");
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    const tooltip = card(page).getByRole("tooltip");
    await expect(tooltip).toHaveText("Mar 26 (proyeksi) · 20 temuan");
    expect(await findTextBelowFloor(main)).toEqual([]);
    expectHermetic(audit);
  });

  test("Dashboard hanya punya satu landmark main", async ({ page }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, MISSING);

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main main")).toHaveCount(0);
    expectHermetic(audit);
  });
});
