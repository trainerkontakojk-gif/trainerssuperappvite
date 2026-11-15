import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import { pickSelect } from "./helpers/pickSelect";
import {
  YEAR,
  PREVIOUS_LABEL,
  LATEST_LABEL,
  DASHBOARD_DATA,
  LONG_PARAMETERS,
  DENSE_DATA,
  HEATMAP_DATA,
  DASHBOARD_MOCKS,
  withHeatmapResponse,
  DASHBOARD_READY_MOCKS,
  FUTURE_MONTHS,
  TWO_PARAMETER_MOCKS,
  measureLayout,
} from "./helpers/sidakDashboardInsightsHarness";

test.describe("Dashboard SIDAK insights (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("filter tim/bulan heatmap dan badge KPI memakai periode terbaru", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const teamId = "11111111-1111-4111-8111-111111111111";
    const apiMocks = DASHBOARD_MOCKS.map((mock) =>
      mock.path === "/api/v1/sidak/dashboard"
        ? {
            ...mock,
            body: {
              success: true,
              data: {
                ...DASHBOARD_DATA,
                folders: [{ id: teamId, name: "Tim Call" }],
                periodMetrics: [
                  {
                    periodId: "period-apr",
                    label: PREVIOUS_LABEL,
                    total: 60,
                    totalAudited: 10,
                  },
                  {
                    periodId: "period-may",
                    label: LATEST_LABEL,
                    total: 48,
                    totalAudited: 20,
                  },
                ],
                sparklines: {
                  ...DASHBOARD_DATA.sparklines,
                  compliance: [
                    {
                      label: PREVIOUS_LABEL,
                      value: 50,
                      count: 5,
                      totalAudited: 10,
                    },
                    {
                      label: LATEST_LABEL,
                      value: 65,
                      count: 13,
                      totalAudited: 20,
                    },
                  ],
                },
              },
            },
          }
        : mock,
    );
    const audit = await openHermeticShell(page, {
      path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&dari=4&sampai=5&tim=ALL`,
      apiMocks,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
    await pickSelect(page, "Tim", "Tim Call");
    await expect
      .poll(() =>
        audit.mockedApi.filter((r) => r.includes("/sidak/heatmap?")).at(-1),
      )
      .toContain(`folder_ids=${teamId}`);
    const request = audit.mockedApi
      .filter((r) => r.includes("/sidak/heatmap?"))
      .at(-1)!;
    expect(request).toContain("start_month=4");
    expect(request).toContain("end_month=5");
    const kpis = page.getByRole("region", { name: "Indikator utama" });
    await expect(
      kpis.getByText("2,6 di bawah target 95", { exact: true }),
    ).toBeVisible();
    await expect(
      kpis.getByText(`7 agen belum ≥ 95 di ${LATEST_LABEL}`, { exact: true }),
    ).toBeVisible();
    await expect(
      kpis.getByText("2,4 per agen diaudit · turun", { exact: true }),
    ).toBeVisible();
    const heatmap = page.getByRole("region", { name: "Pola temuan mingguan" });
    await expect(heatmap).toContainText(
      `Call · Tim Call · Apr–Mei ${YEAR} · per tanggal layanan`,
    );
    await expect(heatmap).toContainText("temuan pada rentang ini");
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await setDocumentTheme(page, theme);
        await kpis.scrollIntoViewIfNeeded();
        expect(
          await findLowContrastText(kpis, {
            selector: "p, span",
            leafOnly: true,
          }),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`kpi-${width}-${theme}.png`),
        });
      }
    }
    await pickSelect(page, "Tim", "Semua Tim");
    await expect
      .poll(() =>
        audit.mockedApi.filter((r) => r.includes("/sidak/heatmap?")).at(-1),
      )
      .not.toContain("folder_ids");
    expectHermetic(audit);
  });

  test("badge KPI: target tercapai, laju naik/tetap, dan data tanpa pembanding", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    for (const scenario of [
      {
        total: 140,
        audited: 20,
        points: 2,
        expected: "7 per agen diaudit · naik",
      },
      {
        total: 120,
        audited: 20,
        points: 2,
        expected: "6 per agen diaudit · tetap",
      },
      { total: 0, audited: 0, points: 2, expected: null },
      { total: 40, audited: 10, points: 1, expected: null },
    ]) {
      const apiMocks = DASHBOARD_MOCKS.map((mock) =>
        mock.path === "/api/v1/sidak/dashboard"
          ? {
              ...mock,
              body: {
                success: true,
                data: {
                  ...DASHBOARD_DATA,
                  summary: { ...DASHBOARD_DATA.summary, avgAgentScore: 96 },
                  periodMetrics: [
                    {
                      periodId: "period-apr",
                      label: PREVIOUS_LABEL,
                      total: 60,
                      totalAudited: 10,
                    },
                    {
                      periodId: "period-may",
                      label: LATEST_LABEL,
                      total: scenario.total,
                      totalAudited: scenario.audited,
                    },
                  ].slice(-scenario.points),
                },
              },
            }
          : mock,
      );
      const audit = await openHermeticShell(page, {
        path: `/sidak/dashboard?layanan=call&tahun=${YEAR}&dari=4&sampai=5&tim=ALL`,
        apiMocks,
      });
      await waitForMockedApi(audit, ["/sidak/dashboard?", "/sidak/heatmap?"]);
      const kpis = page.getByRole("region", { name: "Indikator utama" });
      await expect(
        kpis.getByText("Mencapai target 95", { exact: true }),
      ).toBeVisible();
      if (scenario.expected)
        await expect(
          kpis.getByText(scenario.expected, { exact: true }),
        ).toBeVisible();
      else await expect(kpis.getByText(/per agen diaudit/)).toHaveCount(0);
      await expect(kpis.getByText(/agen belum ≥/)).toHaveCount(0);
      expectHermetic(audit);
    }
  });

  test("geometri kontinu dan kembali ke atas memakai scroller workspace", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const evidence = path.resolve(
      "../../.pi/orchestrator/sidak-dashboard-order",
      process.env.SIDAK_LAYOUT_PHASE || "final",
    );
    mkdirSync(evidence, { recursive: true });
    const records: unknown[] = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const density of ["sparse", "dense"] as const) {
      const apiMocks = DASHBOARD_READY_MOCKS.map((mock) =>
        mock.path === "/api/v1/sidak/dashboard"
          ? {
              ...mock,
              body: {
                success: true,
                data: density === "dense" ? DENSE_DATA : DASHBOARD_DATA,
              },
            }
          : mock,
      );
      const audit = await openHermeticShell(page, {
        path: "/sidak/dashboard",
        apiMocks,
      });
      await waitForMockedApi(audit, [
        "/sidak/dashboard?",
        "/dashboard/forecast",
        "/sidak/heatmap?",
      ]);
      await expect(
        page.getByRole("heading", { name: "Parameter teratas" }),
      ).toBeVisible();
      const workspace = page.getByRole("region", { name: "Konten halaman" });
      for (const width of [320, 390, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const expanded of width >= 1024 ? [false, true] : [false]) {
          if (width >= 1024) {
            // Lebar sidebar (248px) vs rail ciut (64px).
            const sidebar = page.locator(".app-sidebar");
            if (
              (await sidebar.getAttribute("data-collapsed")) !==
              String(!expanded)
            ) {
              await page
                .getByRole("button", {
                  name: expanded ? "Lebarkan sidebar" : "Ciutkan sidebar",
                })
                .click();
            }
            await expect(sidebar).toHaveAttribute(
              "data-collapsed",
              String(!expanded),
            );
          }
          await page.waitForTimeout(350);
          await workspace.evaluate((element) => {
            element.scrollTop = 0;
          });
          const geometry = await measureLayout(page);
          const key = `${density}-${width}-${expanded ? "expanded" : "collapsed"}`;
          records.push({ key, ...geometry });
          writeFileSync(
            path.join(evidence, "geometry.json"),
            JSON.stringify(records, null, 2),
          );
          for (const gap of geometry.gaps) {
            expect
              .soft(gap.pixels, `${key}: ${gap.from} → ${gap.to}`)
              .toBeGreaterThanOrEqual(16);
            expect
              .soft(gap.pixels, `${key}: ${gap.from} → ${gap.to}`)
              .toBeLessThanOrEqual(32);
          }
          expect.soft(geometry.workspaceOverflow, key).toBeLessThanOrEqual(1);
          for (const panel of geometry.panels) {
            expect
              .soft(panel.overflow, `${key}: ${panel.title} overflow`)
              .toBeLessThanOrEqual(1);
            for (const child of panel.children) {
              expect
                .soft(child.x, `${key}: ${child.label} left`)
                .toBeGreaterThanOrEqual(panel.x - 1);
              expect
                .soft(child.right, `${key}: ${child.label} right`)
                .toBeLessThanOrEqual(panel.right + 1);
            }
          }
          if (density === "dense" && width >= 1024) {
            // The weekday chart grows with its panel instead of leaving a gap.
            const heatmapGap = await page
              .getByRole("region", { name: "Pola temuan mingguan" })
              .evaluate((panel) => {
                const stats = panel.querySelector(
                  "[aria-label='Statistik pola harian']",
                );
                const note = [...panel.querySelectorAll("p")].find((item) =>
                  item.textContent?.startsWith("Volume temuan, bukan rate"),
                );
                if (!stats || !note) return Number.POSITIVE_INFINITY;
                return (
                  note.getBoundingClientRect().top -
                  stats.getBoundingClientRect().bottom
                );
              });
            expect
              .soft(heatmapGap, `${key}: heatmap gap`)
              .toBeLessThanOrEqual(24);
          }
          const trend = geometry.panels[1];
          const agents = geometry.panels[2];
          if (Math.abs(trend.y - agents.y) < 2) {
            expect.soft(trend.width, key).toBeGreaterThanOrEqual(560);
            expect.soft(agents.width, key).toBeGreaterThanOrEqual(320);
          }
          // Capture the actual scroller in tiles, not a synthetic expanded layout.
          if (
            process.env.SIDAK_LAYOUT_CAPTURE === "1" &&
            ((density === "dense" && [320, 768, 1280, 1440].includes(width)) ||
              (density === "sparse" && width === 1280))
          ) {
            for (const dark of [false, true]) {
              await page.evaluate(
                (value) =>
                  document.documentElement.classList.toggle("dark", value),
                dark,
              );
              const max = await workspace.evaluate(
                (element) => element.scrollHeight - element.clientHeight,
              );
              for (
                let top = 0, tile = 0;
                ;
                top = Math.min(top + 740, max), tile++
              ) {
                await workspace.evaluate((element, y) => {
                  element.scrollTop = y;
                }, top);
                await page.screenshot({
                  path: path.join(
                    evidence,
                    `${key}-${dark ? "dark" : "light"}-${tile}.png`,
                  ),
                });
                if (top === max) break;
              }
            }
          }
        }
      }
      await page.setViewportSize({ width: 390, height: 900 });
      const topButton = page.getByRole("button", { name: "Kembali ke atas" });
      await topButton.scrollIntoViewIfNeeded();
      await workspace.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const before = await workspace.evaluate((element) => element.scrollTop);
      await topButton.click();
      const after = await workspace.evaluate((element) => element.scrollTop);
      const position = await topButton.evaluate(
        (element) => getComputedStyle(element).position,
      );
      records.push({
        density,
        scrollBefore: before,
        scrollAfter: after,
        backToTopPosition: position,
      });
      writeFileSync(
        path.join(evidence, "geometry.json"),
        JSON.stringify(records, null, 2),
      );
      expect.soft(before).toBeGreaterThan(500);
      expect.soft(after).toBe(0);
      expect.soft(position).not.toBe("fixed");
      if (density === "dense") {
        const trend = page.getByRole("region", { name: "Tren temuan" });
        // Sparklines are a wide-layout enhancement; narrow strips show values only.
        await page.setViewportSize({ width: 1280, height: 900 });
        await expect(page.locator("article .recharts-surface")).toHaveCount(4);
        const series = trend.getByRole("button", {
          name: LONG_PARAMETERS[0],
          exact: true,
        });
        await series.click();
        await expect(series).toHaveAttribute("aria-pressed", "true");
        await expect(
          trend.getByRole("button", { name: LONG_PARAMETERS[1], exact: true }),
        ).toBeDisabled();
        await trend
          .getByRole("button", { name: "Total Temuan", exact: true })
          .click();
        await trend
          .getByRole("button", { name: LONG_PARAMETERS[1], exact: true })
          .click();
        await expect(
          trend.getByRole("button", { name: "Total Temuan", exact: true }),
        ).toBeDisabled();
        await trend
          .getByRole("button", { name: "Sembunyikan Semua", exact: true })
          .click();
        await trend
          .getByRole("button", { name: "Tampilkan 2 Parameter", exact: true })
          .click();
        await expect(
          trend
            .locator("button[aria-pressed=true]")
            .filter({ hasText: /Akurasi|Verifikasi/ }),
        ).toHaveCount(2);
      }
      console.log("[geometry audit]", density, formatAudit(audit));
      expectHermetic(audit);
    }
  });

  test("rentang bulan dipilih lewat satu kontrol: klik awal lalu akhir", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_READY_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?"]);

    const range = page.getByRole("button", { name: /^Rentang bulan/ });
    await expect(range).toBeVisible();
    expect((await range.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    // Kontrol lama Dari/Sampai sudah tidak ada.
    await expect(
      page.getByRole("combobox", { name: "Bulan awal" }),
    ).toHaveCount(0);

    await range.click();
    const picker = page.getByRole("dialog", { name: "Pilih rentang bulan" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Juni", exact: true }).click();
    await picker.getByRole("button", { name: "Maret", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(range).toContainText("Maret – Juni");
    await expect
      .poll(() =>
        audit.mockedApi.some(
          (e) =>
            e.includes("/sidak/dashboard?") &&
            e.includes("startMonth=3") &&
            e.includes("endMonth=6"),
        ),
      )
      .toBe(true);

    await range.click();
    await picker.getByRole("button", { name: "Semua bulan" }).click();
    await expect(range).toContainText("Semua bulan");
    expectHermetic(audit);
  });

  test("proyeksi parameter ditempatkan di bulan mendatang yang sama", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: TWO_PARAMETER_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);

    // Two parameters, no total: the chart allows at most two series.
    const trend = page.getByRole("region", { name: "Tren temuan" });
    await trend.getByRole("button", { name: "Akurasi Informasi" }).click();
    await trend
      .getByRole("button", { name: "Total Temuan", exact: true })
      .click();
    await trend.getByRole("button", { name: "Salam Pembuka" }).click();
    for (const name of ["Akurasi Informasi", "Salam Pembuka"]) {
      await expect(trend.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }

    // Forecast months follow the history once, shared by both parameters.
    const ticks = trend.locator(
      ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
    );
    await expect(ticks).toHaveText([
      PREVIOUS_LABEL,
      LATEST_LABEL,
      ...FUTURE_MONTHS,
    ]);

    const tooltipAt = async (label: string) => {
      const tick = ticks.filter({ hasText: label });
      // Mouse coordinates are viewport-relative; bring the chart on screen.
      await trend.locator(".recharts-wrapper").scrollIntoViewIfNeeded();
      const tickBox = await tick.boundingBox();
      // `.recharts-surface` also matches legend icons; the wrapper is the plot.
      const plot = await trend.locator(".recharts-wrapper").boundingBox();
      if (!tickBox || !plot) throw new Error(`No geometry for tick ${label}`);
      await page.mouse.move(
        tickBox.x + tickBox.width / 2,
        plot.y + plot.height / 2,
      );
      const tooltip = trend.locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toContainText(label);
      return tooltip;
    };

    const june = await tooltipAt("Jun");
    await expect(june).toContainText(/Prediksi Akurasi Informasi\s*:\s*20/);
    await expect(june).toContainText(/Prediksi Salam Pembuka\s*:\s*6/);

    // The last actual month keeps its real values, not forecast values.
    const latest = await tooltipAt(LATEST_LABEL);
    await expect(latest).toContainText(/Akurasi Informasi\s*:\s*24/);
    await expect(latest).toContainText(/Salam Pembuka\s*:\s*8/);

    expectHermetic(audit);
  });

  test("menampilkan skeleton, bukan teks loading, saat dashboard pertama dimuat", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?"]);

    // Hold the dashboard GET on reload so the initial-load state stays visible.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/api\/v1\/sidak\/dashboard\?/, async (route) => {
      if (route.request().method() === "GET") await held;
      await route.fallback();
    });
    await page.reload();

    const skeleton = page.getByTestId("sidak-dashboard-skeleton");
    await expect(skeleton).toBeVisible();
    await expect(page.getByText("Memuat data dashboard...")).toHaveCount(0);

    release();
    await expect(
      page.getByRole("region", { name: "Indikator utama" }),
    ).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    expectHermetic(audit);
  });

  test(`teks dashboard minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_READY_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);
    await expect(
      page.getByRole("heading", { name: "Parameter teratas" }),
    ).toBeVisible();

    const offenders = await findTextBelowFloor(page.locator("main").first());
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("teks sumbu grafik tren parameter memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: DASHBOARD_READY_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?", "/dashboard/forecast"]);

    const trend = page.getByRole("region", { name: "Tren temuan" });
    const ticks = trend.locator(
      ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
    );
    await expect(ticks.first()).toBeVisible();
    const chart = trend.locator(".recharts-wrapper");
    await chart.scrollIntoViewIfNeeded();

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

  test("menjaga dashboard tetap berguna saat heatmap gagal dan bisa dicoba ulang", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: withHeatmapResponse(
        {
          success: false,
          error: {
            code: "HEATMAP_ERROR",
            message: "Gagal memuat data heatmap. Coba lagi sebentar.",
          },
        },
        500,
      ),
    });
    await waitForMockedApi(audit, ["/sidak/heatmap?mode=agent"]);

    const heatmap = page.getByRole("region", { name: "Pola temuan mingguan" });
    await expect(heatmap.getByRole("alert")).toContainText(
      "Heatmap tidak dapat dimuat.",
    );
    await expect(
      page.getByRole("heading", { name: "Periode terbaru" }),
    ).toBeVisible();
    const retry = heatmap.getByRole("button", {
      name: "Coba muat ulang heatmap",
    });
    let retryCalls = 0;
    await page.route(/\/api\/v1\/sidak\/heatmap\?/, async (route) => {
      retryCalls += 1;
      const requestUrl = new URL(route.request().url());
      audit.mockedApi.push(`GET ${requestUrl.pathname}${requestUrl.search}`);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: HEATMAP_DATA }),
      });
    });
    await retry.click();
    await expect(
      heatmap.getByText(`Puncak: 2 Mei ${YEAR} · 8 temuan`),
    ).toBeVisible();
    expect(retryCalls).toBe(1);
    expectHermetic(audit);
  });

  test("menjelaskan jika tidak ada temuan pada rentang heatmap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: withHeatmapResponse({
        success: true,
        data: { ...HEATMAP_DATA, days: [], totalFindings: 0 },
      }),
    });
    await waitForMockedApi(audit, ["/sidak/heatmap?mode=agent"]);

    const heatmap = page.getByRole("region", { name: "Pola temuan mingguan" });
    await expect(
      heatmap.getByText("Belum ada temuan pada rentang ini."),
    ).toBeVisible();
    await expect(heatmap.getByText(/Puncak:/)).toHaveCount(0);
    expectHermetic(audit);
  });
});
