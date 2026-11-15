import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  YEAR,
  PREVIOUS_LABEL,
  LATEST_LABEL,
  DASHBOARD_DATA,
  ZERO_BASELINE_DATA,
  DASHBOARD_MOCKS,
  DASHBOARD_READY_MOCKS,
  SCOPE_LINE,
} from "./helpers/sidakDashboardInsightsHarness";

test.describe("Dashboard SIDAK insights (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("menjelaskan kondisi dari data aktif dan memuat ulang dashboard", async ({
    page,
  }, testInfo) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_READY_MOCKS,
    });

    await waitForMockedApi(audit, [
      "/sidak/dashboard?",
      "/dashboard/forecast",
      "folder_ids=team-call",
    ]);

    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      page.locator("header nav").getByText("Dashboard", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(SCOPE_LINE, { exact: true })).toBeVisible();

    // Default filters: Call, current year, January through the current month.
    const currentMonth = new Date().toLocaleString("id-ID", { month: "long" });
    await expect(page.getByRole("combobox", { name: "Layanan" })).toContainText(
      "Call",
    );
    await expect(page.getByRole("combobox", { name: "Tahun" })).toContainText(
      String(YEAR),
    );
    // Satu kontrol rentang bulan: "Januari – <bulan ini>".
    const range = page.getByRole("button", { name: /^Rentang bulan/ });
    await expect(range).toContainText(
      currentMonth === "Januari" ? "Januari" : `Januari – ${currentMonth}`,
    );
    const dashboardRequest = audit.mockedApi.find((entry) =>
      entry.includes("/sidak/dashboard?"),
    );
    expect(dashboardRequest).toContain(`year=${YEAR}`);
    expect(dashboardRequest).toContain("service_type=call");
    expect(dashboardRequest).toContain("startMonth=1");
    expect(dashboardRequest).toContain(`endMonth=${new Date().getMonth() + 1}`);

    // KPI strip: one region, four indicators, values preserved. Findings are
    // counted per parameter and per ticket; the per-agent average is gone.
    const kpis = page.getByRole("region", { name: "Indikator utama" });
    await expect(kpis.locator("article")).toHaveCount(4);
    for (const value of ["108", "41", "92.4%", "65.0%"]) {
      await expect(kpis.getByText(value, { exact: true })).toBeVisible();
    }
    await expect(
      kpis.getByText("Total Temuan QA per Parameter", { exact: true }),
    ).toBeVisible();
    await expect(
      kpis.getByText("Total Temuan QA per Tiket", { exact: true }),
    ).toBeVisible();
    await expect(kpis.getByText("Rata-rata Temuan per Agen")).toHaveCount(0);
    await expect(kpis.getByText(`vs ${PREVIOUS_LABEL}`)).toBeVisible();

    // Highlights: latest period, critical share, forecast side by side.
    const summary = page.getByRole("region", { name: "Ringkasan temuan" });
    await expect(
      summary.getByRole("heading", { name: "Periode terbaru" }),
    ).toBeVisible();
    await expect(
      summary.getByText(LATEST_LABEL, { exact: true }),
    ).toBeVisible();
    await expect(
      summary.getByText(`20.0% lebih sedikit dari ${PREVIOUS_LABEL}.`),
    ).toBeVisible();
    await expect(
      summary.getByText("Perubahan jumlah, bukan tingkat temuan."),
    ).toBeVisible();
    await expect(
      summary.getByRole("heading", { name: "Temuan kritikal" }),
    ).toBeVisible();
    await expect(summary.getByText("62.5%", { exact: true })).toBeVisible();
    await expect(
      summary.getByText("35 dari 56 temuan berkategori"),
    ).toBeVisible();
    await expect(
      summary.getByRole("img", { name: "35 kritikal, 21 non-kritikal" }),
    ).toBeVisible();

    const forecast = page.getByRole("region", { name: "Perkiraan temuan" });
    await expect(
      forecast.getByText("Meningkat", { exact: true }),
    ).toBeVisible();
    await expect(
      forecast.getByText("+12 temuan (+25%) dalam 3 bulan"),
    ).toBeVisible();
    await expect(forecast.getByText("Kepercayaan sedang")).toBeVisible();
    await expect(forecast.locator("details")).toHaveCount(0);
    await expect(
      forecast.getByRole("link", { name: "Analisis lengkap" }),
    ).toHaveAttribute("href", "/sidak/forecast");
    await expect(
      forecast.getByRole("button", { name: "Perbarui Prediksi" }),
    ).toBeEnabled();

    // Reading order: KPI → summary → trend.
    const top = (locator: typeof summary) =>
      locator.evaluate((element) => element.getBoundingClientRect().top);
    const kpiTop = await top(kpis);
    const summaryTop = await top(summary);
    const trend = page.getByRole("region", { name: "Tren temuan" });
    await expect(trend).toBeVisible();
    expect(kpiTop).toBeLessThan(summaryTop);
    expect(summaryTop).toBeLessThan(await top(trend));

    const totalToggle = trend.getByRole("button", {
      name: "Total Temuan",
      exact: true,
    });
    await totalToggle.click();
    await expect(totalToggle).toHaveAttribute("aria-pressed", "false");
    await totalToggle.click();
    await expect(totalToggle).toHaveAttribute("aria-pressed", "true");
    const forecastLine = trend.getByRole("button", { name: "Garis proyeksi" });
    await expect(forecastLine).toHaveAttribute("aria-pressed", "true");
    await forecastLine.click();
    await expect(forecastLine).toHaveAttribute("aria-pressed", "false");
    await forecastLine.click();

    // Top agents: link, score, defects, critical label.
    const agents = page.getByRole("region", {
      name: "Agen dengan temuan terbanyak",
    });
    const priorityAgent = agents.getByRole("link", { name: /Ayu Larasati/ });
    await expect(priorityAgent).toHaveAttribute(
      "href",
      "/sidak/agents/agent-priority",
    );
    await expect(priorityAgent).toContainText("Skor 84.5%");
    await expect(priorityAgent).toContainText("12");
    await expect(priorityAgent).toContainText("Ada temuan kritikal");
    // Ranking page reads `service_type`, so the link must carry it verbatim.
    await expect(
      agents.getByRole("link", { name: "Lihat semua ranking" }),
    ).toHaveAttribute("href", `/sidak/ranking?service_type=call&year=${YEAR}`);

    // Parameter ranking replaces the dual-axis Pareto chart.
    const parameters = page.getByRole("region", { name: "Parameter teratas" });
    await expect(parameters.locator(".recharts-surface")).toHaveCount(0);
    const firstParameter = parameters.getByRole("listitem").first();
    await expect(firstParameter).toContainText("Akurasi Informasi");
    await expect(firstParameter).toContainText("24");
    await expect(firstParameter).toContainText("Kritikal");
    await expect(
      parameters.getByText("1 parameter menyumbang 100% dari 24 temuan."),
    ).toBeVisible();

    await waitForMockedApi(audit, ["/sidak/heatmap?mode=agent"]);
    const heatmapRequest = audit.mockedApi.find((entry) =>
      entry.includes("/sidak/heatmap?mode=agent"),
    );
    expect(heatmapRequest).toContain(`year=${YEAR}`);
    expect(heatmapRequest).toContain("service_type=call");
    // Tim bawaan sudah dipilih sebelum data pertama dimuat, jadi heatmap
    // memakai tim yang sama dengan dashboard.
    expect(heatmapRequest).toContain("folder_ids=team-call");
    expect(heatmapRequest).toContain("start_month=1");
    expect(heatmapRequest).toContain(`end_month=${new Date().getMonth() + 1}`);
    const heatmap = page.getByRole("region", { name: "Pola temuan mingguan" });
    await expect(
      heatmap.getByText(`Puncak: 2 Mei ${YEAR} · 8 temuan`),
    ).toBeVisible();
    await expect(
      heatmap.getByText(/volume temuan, bukan rate.*akses akun/i),
    ).toBeVisible();
    // Weekday distribution, not a second monthly chart next to Tren temuan.
    await expect(
      heatmap.getByRole("img", {
        name: `Temuan per hari dalam minggu ${YEAR}: Senin: 0 temuan, Selasa: 0 temuan, Rabu: 3 temuan, Kamis: 0 temuan, Jumat: 0 temuan, Sabtu: 8 temuan, Minggu: 4 temuan`,
      }),
    ).toBeVisible();
    await expect(heatmap.getByRole("img", { name: /Mei:/ })).toHaveCount(0);
    const heatmapStats = heatmap.getByRole("list", {
      name: "Statistik pola harian",
    });
    await expect(heatmapStats.getByText("Hari dengan temuan")).toBeVisible();
    await expect(
      heatmapStats.getByText("3 hari", { exact: true }),
    ).toBeVisible();
    await expect(
      heatmapStats.getByText("Rata-rata per hari aktif"),
    ).toBeVisible();
    await expect(
      heatmapStats.getByText("5 temuan", { exact: true }),
    ).toBeVisible();
    await expect(heatmapStats.getByText("Porsi akhir pekan")).toBeVisible();
    await expect(heatmapStats.getByText("80%", { exact: true })).toBeVisible();
    await expect(
      heatmapStats.getByText("12 dari 15 temuan", { exact: true }),
    ).toBeVisible();
    await expect(heatmap.locator("details")).toHaveCount(0);
    await expect(
      heatmap.getByRole("link", { name: "Lihat kalender lengkap" }),
    ).toHaveAttribute("href", "/sidak/heatmap");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .getByRole("heading", { level: 1, name: "Dashboard" })
      .scrollIntoViewIfNeeded();
    // Recharts animates on resize: settle it before recording visual evidence.
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: testInfo.outputPath("sidak-dashboard-desktop.png"),
      fullPage: false,
    });

    await trend.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("sidak-dashboard-analysis.png"),
    });
    await heatmap.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("sidak-dashboard-outlook.png"),
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page
      .getByRole("heading", { level: 1, name: "Dashboard" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("sidak-dashboard-dark.png"),
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );

    const updateRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/sidak/dashboard/forecast") &&
        request.method() === "POST" &&
        request.postDataJSON()?.forceRefresh === true,
    );
    await forecast.getByRole("button", { name: "Perbarui Prediksi" }).click();
    expect((await updateRequest).postDataJSON().filters.folderIds).toEqual([
      "team-call",
    ]);
    await expect(
      forecast.getByRole("button", { name: "Perbarui Prediksi" }),
    ).toBeEnabled();

    const refreshButton = page.getByRole("button", { name: "Perbarui data" });
    await expect(refreshButton).toBeEnabled();
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const section = document
          .getElementById("sidak-condition-summary-title")
          ?.closest("section");
        const button = document.querySelector(
          "button[aria-busy]",
        ) as HTMLButtonElement | null;
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          summaryWidth: section?.scrollWidth ?? 0,
          summaryClientWidth: section?.clientWidth ?? 0,
          refreshButtonHeight: button?.getBoundingClientRect().height ?? 0,
        };
      });
      const reviewLinkHeight = await priorityAgent.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.summaryWidth).toBeLessThanOrEqual(
        layout.summaryClientWidth,
      );
      expect(layout.refreshButtonHeight).toBeGreaterThanOrEqual(44);
      expect(reviewLinkHeight).toBeGreaterThanOrEqual(44);
      await expect(refreshButton).toBeVisible();
      if (width === 320) {
        await page
          .getByRole("heading", { level: 1, name: "Dashboard" })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath("sidak-dashboard-mobile.png"),
          fullPage: false,
        });
        await page.waitForTimeout(1800);
        await summary.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath("sidak-dashboard-mobile-summary.png"),
          fullPage: false,
        });
        await heatmap.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath("sidak-dashboard-mobile-outlook.png"),
        });
      }
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    let signalRefreshStarted: () => void = () => {};
    let finishRefresh: () => void = () => {};
    const refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    await page.route(/\/api\/v1\/sidak\/dashboard\?/, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const requestUrl = new URL(route.request().url());
      audit.mockedApi.push(`GET ${requestUrl.pathname}${requestUrl.search}`);
      signalRefreshStarted();
      await new Promise<void>((resolve) => {
        finishRefresh = resolve;
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: DASHBOARD_DATA }),
      });
    });

    await refreshButton.click();
    await refreshStarted;
    await expect(
      page.getByRole("button", { name: "Memperbarui data…" }),
    ).toBeDisabled();
    finishRefresh();
    await expect(
      page.getByRole("button", { name: "Perbarui data" }),
    ).toBeEnabled();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("tidak menyarankan agen prioritas saat daftar agen kosong", async ({
    page,
  }) => {
    const noPriorityMocks = DASHBOARD_MOCKS.map((mock) =>
      mock.method === "GET" && mock.path === "/api/v1/sidak/dashboard"
        ? {
            ...mock,
            body: {
              success: true,
              data: { ...DASHBOARD_DATA, topAgents: [] },
            },
          }
        : mock,
    );
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: noPriorityMocks,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);

    const agents = page.getByRole("region", {
      name: "Agen dengan temuan terbanyak",
    });
    await expect(
      agents.getByText("Belum ada agen dengan temuan"),
    ).toBeVisible();
    await expect(
      agents.getByRole("link", { name: /\/sidak\/agents/ }),
    ).toHaveCount(0);
    await expect(agents.locator('a[href^="/sidak/agents/"]')).toHaveCount(0);
    expectHermetic(audit);
  });

  test("tidak membuat persentase saat periode pembanding bernilai nol", async ({
    page,
  }) => {
    const zeroBaselineMocks = DASHBOARD_MOCKS.map((mock) =>
      mock.method === "GET" && mock.path === "/api/v1/sidak/dashboard"
        ? {
            ...mock,
            body: { success: true, data: ZERO_BASELINE_DATA },
          }
        : mock,
    );
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: zeroBaselineMocks,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);

    const summary = page.getByRole("region", { name: "Ringkasan temuan" });
    await expect(
      summary.getByText(
        `Periode sebelumnya ${PREVIOUS_LABEL}: 0 temuan; persentase tidak dihitung.`,
      ),
    ).toBeVisible();
    const forecast = page.getByRole("region", { name: "Perkiraan temuan" });
    await expect(
      forecast.getByText("Belum ada forecast untuk filter ini."),
    ).toBeVisible();
    await expect(summary.getByText(/Turun|Naik \d+\.\d+%/)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("mempertahankan data terakhir jika refresh gagal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);
    await expect(
      page.getByRole("heading", { name: "Ringkasan temuan" }),
    ).toBeVisible();

    let failedRefreshes = 0;
    // Override only this local dashboard GET after the first hermetic load.
    await page.route(/\/api\/v1\/sidak\/dashboard\?/, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      failedRefreshes += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { message: "Database unavailable" },
        }),
      });
    });

    await page.getByRole("button", { name: "Perbarui data" }).click();
    const updateError = page.getByRole("alert");
    await expect(updateError).toContainText("Pembaruan data gagal.");
    await expect(updateError).toContainText(
      "Data terakhir yang berhasil dimuat tetap ditampilkan.",
    );
    await expect(page.getByText("108", { exact: true })).toBeVisible();
    await expect(page.getByText("Database unavailable")).toHaveCount(0);
    expect(failedRefreshes).toBe(1);
    expectHermetic(audit);
  });
});
