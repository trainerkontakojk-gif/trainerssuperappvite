/**
 * Prediksi tren di dashboard utama (`/dashboard`, `DashboardTrendPanel`).
 *
 * Hermetic: semua `/api` di-mock lewat `helpers/hermeticShell` (fail-closed).
 * Respons forecast berbeda untuk lookup cache dan refresh paksa, sedangkan mock
 * shell statis, jadi tiap test memasang `page.route` untuk POST forecast lalu
 * me-reload halaman: route yang didaftarkan belakangan dijalankan lebih dulu.
 * Dev server memakai React StrictMode, jadi lookup saat load bisa terkirim dua
 * kali; test menghitung jenis request, bukan urutannya.
 *
 * Menggantikan kontrak panel di `sidak-trend-forecast.test.tsx` dan
 * `dashboard-trend-picker-buttons.test.tsx` (jsdom).
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
type ForecastReplies = { lookup: ForecastReply; refresh?: ForecastReply };
type ForecastBody = {
  filters: { year: number };
  horizonMonths: number;
  forceRefresh: boolean;
  cacheOnly: boolean;
};

const dashboardMocks = (trendData: unknown): ApiMock[] => [
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard/available-years",
    body: { success: true, data: [YEAR] },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard/trend",
    body: {
      success: true,
      data: { trendMap: { "3m": trendData, "6m": trendData, all: trendData } },
    },
  },
  {
    method: "GET",
    path: "/api/v1/admin/activity-logs",
    body: { success: true, data: [] },
  },
  // Only serves the first, pre-reload load; each test overrides it below.
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
  replies: ForecastReplies,
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
    const reply = body.forceRefresh ? replies.refresh : replies.lookup;
    if (!reply) throw new Error("Unexpected forced forecast refresh");
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
    page.getByRole("heading", { name: "Tren Temuan QA" }),
  ).toBeVisible({ timeout: 20000 });
  return { audit, bodies };
}

const insight = (page: Page) =>
  page.getByRole("region", { name: "Penjelasan proyeksi" });

// Recharts 3 renders x-axis tick text in its own `recharts-xAxis-tick-labels` layer.
const xAxisLabels = (page: Page) =>
  page.locator(
    ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
  );

const lookups = (bodies: ForecastBody[]) =>
  bodies.filter((body) => body.cacheOnly && !body.forceRefresh);
const refreshes = (bodies: ForecastBody[]) =>
  bodies.filter((body) => body.forceRefresh && !body.cacheOnly);

test.describe("Prediksi tren dashboard (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("memuat cache prediksi saat dibuka, lalu Update Prediksi memaksa refresh", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, {
      lookup: { status: 200, data: { status: "missing", snapshot: null } },
      refresh: {
        status: 200,
        data: { status: "ready", snapshot: FORECAST_SNAPSHOT },
      },
    });

    // Filter panel: service tabs, year and month range are real controls.
    await expect(page.getByRole("tab", { name: "Semua" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "Layanan Call" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Tahun tren" }),
    ).toContainText(String(YEAR));

    // Opening the page only looks the cache up; it never forces a refresh.
    await expect.poll(() => lookups(bodies).length).toBeGreaterThan(0);
    expect(bodies).toEqual(lookups(bodies));
    expect(bodies[0]).toMatchObject({
      filters: { year: YEAR },
      horizonMonths: 3,
    });
    await expect(insight(page)).toHaveCount(0);
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26"]);

    await page.getByRole("button", { name: "Update Prediksi" }).click();

    await expect.poll(() => refreshes(bodies).length).toBe(1);
    expect(refreshes(bodies)[0]).toMatchObject({ filters: { year: YEAR } });
    await expect(insight(page)).toBeVisible();
    await expect(insight(page)).toContainText("Tren meningkat.");
    // The forecast month continues after the last actual month.
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26", "Mar 26"]);
    await expect(
      page.getByRole("button", { name: "Sembunyikan Prediksi" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("prediksi tersimpan bisa disembunyikan dan ditampilkan tanpa request baru", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, {
      lookup: {
        status: 200,
        data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
      },
    });

    await expect(insight(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Perbarui Prediksi" }),
    ).toBeEnabled();
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26", "Mar 26"]);
    const requestsBeforeToggle = bodies.length;

    await page.getByRole("button", { name: "Sembunyikan Prediksi" }).click();
    await expect(insight(page)).toHaveCount(0);
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26"]);

    await page.getByRole("button", { name: "Tampilkan Prediksi" }).click();
    await expect(insight(page)).toBeVisible();
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26", "Mar 26"]);

    expect(bodies).toHaveLength(requestsBeforeToggle);
    expect(refreshes(bodies)).toHaveLength(0);
    expectHermetic(audit);
  });

  test("data baru tetap ditandai saat refresh prediksi gagal", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, TWO_MONTHS, {
      lookup: { status: 200, data: { status: "stale", snapshot: null } },
      refresh: { status: 503 },
    });

    const stale = page.getByRole("button", {
      name: "Data baru — Perbarui Prediksi",
    });
    await expect(stale).toBeEnabled();
    await stale.click();

    await expect.poll(() => refreshes(bodies).length).toBe(1);
    await expect(stale).toBeEnabled();
    await expect(insight(page)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("data kurang dari dua bulan: tombol prediksi nonaktif dan tidak ada lookup", async ({
    page,
  }) => {
    const { audit, bodies } = await openDashboard(page, ONE_MONTH, {
      lookup: { status: 200, data: { status: "missing", snapshot: null } },
    });

    await expect(xAxisLabels(page)).toHaveText(["Jan 26"]);
    await expect(
      page.getByRole("button", { name: "Update Prediksi" }),
    ).toBeDisabled();
    expect(bodies).toHaveLength(0);
    expectHermetic(audit);
  });
  test("Teks sumbu grafik tren memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, {
      lookup: {
        status: 200,
        data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
      },
    });
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26", "Mar 26"]);
    await expect(page.getByText("PREDIKSI", { exact: true })).toBeVisible();

    const chart = page.locator(".recharts-wrapper").first();
    const offenders: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      offenders.push(
        ...(await findLowContrastText(chart)).map((o) => `[${theme}] ${o}`),
      );
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("Teks dashboard minimal 11px", async ({ page }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, {
      lookup: {
        status: 200,
        data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
      },
    });

    // Forecast visible: "PREDIKSI" reference label and the delta badge render.
    await expect(xAxisLabels(page)).toHaveText(["Jan 26", "Feb 26", "Mar 26"]);
    await expect(page.getByText("PREDIKSI", { exact: true })).toBeVisible();

    const main = page.getByRole("region", { name: "Konten halaman" });
    expect(await findTextBelowFloor(main)).toEqual([]);

    // Hover the last (forecast) point so the tooltip "Prediksi" badge renders.
    const chart = page.locator(".recharts-wrapper").first();
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) throw new Error("Trend chart has no bounding box");
    await page.mouse.move(box.x + box.width - 60, box.y + box.height / 2);
    const tooltip = page.locator(".recharts-tooltip-wrapper");
    await expect(
      tooltip.getByText("Prediksi", { exact: true }).first(),
    ).toBeVisible();
    expect(await findTextBelowFloor(main)).toEqual([]);
    expectHermetic(audit);
  });

  test("Dashboard hanya punya satu landmark main", async ({ page }) => {
    const { audit } = await openDashboard(page, TWO_MONTHS, {
      lookup: { status: 200, data: { status: "missing", snapshot: null } },
    });

    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main main")).toHaveCount(0);
    expectHermetic(audit);
  });
});
