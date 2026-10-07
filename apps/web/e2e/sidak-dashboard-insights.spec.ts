import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const YEAR = new Date().getFullYear();
const PREVIOUS_LABEL = `Apr ${String(YEAR).slice(-2)}`;
const LATEST_LABEL = `Mei ${String(YEAR).slice(-2)}`;

const DASHBOARD_DATA = {
  periods: [
    { id: "period-apr", year: YEAR, month: 4 },
    { id: "period-may", year: YEAR, month: 5 },
  ],
  folders: [{ id: "team-call", name: "Tim Call" }],
  summary: {
    totalDefects: 108,
    avgDefectsPerAudit: 5.4,
    zeroErrorRate: 12.5,
    avgAgentScore: 92.4,
    complianceRate: 65,
    complianceCount: 13,
    totalAgents: 20,
  },
  serviceData: [
    { name: "Call", serviceType: "call", total: 108, severity: "High" },
  ],
  topAgents: [
    {
      agentId: "agent-priority",
      nama: "Ayu Larasati",
      batch: "Tim Call",
      tim: "Tim Call",
      jabatan: "Agent",
      defects: 12,
      score: 84.5,
      hasCritical: true,
    },
  ],
  paretoData: [
    {
      name: "Akurasi Informasi",
      fullName: "Akurasi Informasi",
      count: 24,
      cumulative: 50,
      category: "critical",
    },
  ],
  donutData: { critical: 35, nonCritical: 21, total: 56 },
  paramTrend: {
    labels: [PREVIOUS_LABEL, LATEST_LABEL],
    datasets: [
      { label: "Total Temuan", data: [60, 48], isTotal: true },
      { label: "Akurasi Informasi", data: [30, 24], isTotal: false },
    ],
  },
  periodMetrics: [],
  sparklines: {
    "total-defects": [
      { label: PREVIOUS_LABEL, value: 60 },
      { label: LATEST_LABEL, value: 48 },
    ],
  },
  availableYears: [YEAR],
  currentYear: YEAR,
  availableServices: ["call"],
};

const LONG_PARAMETERS = [
  "Akurasi informasi produk dan ketentuan layanan pelanggan",
  "Verifikasi identitas dan perlindungan data pelanggan",
  "Ketepatan solusi dan dokumentasi tindak lanjut",
  "Empati dan kejelasan komunikasi selama interaksi",
];
const DENSE_DATA = {
  ...DASHBOARD_DATA,
  topAgents: [
    "Ayu Larasati",
    "Muhammad Rizky Pratama",
    "Dewi Anggraini Putri",
    "Christina Natalia Wijaya",
    "Ahmad Fauzan Ramadhan",
  ].map((nama, index) => ({
    ...DASHBOARD_DATA.topAgents[0],
    agentId: index === 0 ? "agent-priority" : `agent-${index}`,
    nama,
    tim: "Tim Call Layanan Pelanggan dan Penyelesaian Keluhan",
    defects: 12 - index,
    score: 84.5 + index,
  })),
  paretoData: LONG_PARAMETERS.map((name, index) => ({
    name,
    fullName: name,
    count: 24 - index * 4,
    cumulative: 0,
    category: index < 2 ? "critical" : "non_critical",
  })),
  paramTrend: {
    ...DASHBOARD_DATA.paramTrend,
    datasets: [
      DASHBOARD_DATA.paramTrend.datasets[0],
      ...LONG_PARAMETERS.map((label, index) => ({
        label,
        data: [30 - index * 4, 24 - index * 3],
        isTotal: false,
      })),
    ],
  },
  sparklines: Object.fromEntries(
    ["total-defects", "avg-defects", "avg-score", "compliance"].map(
      (key, index) => [
        key,
        [
          { label: PREVIOUS_LABEL, value: [60, 6, 90, 60][index] },
          { label: LATEST_LABEL, value: [48, 5.4, 92.4, 65][index] },
        ],
      ],
    ),
  ),
};

const HEATMAP_DATA = {
  mode: "agent" as const,
  year: YEAR,
  serviceType: "call" as const,
  dateBasis: "tanggal_layanan" as const,
  countBy: "parameter" as const,
  agentId: null,
  days: [
    { date: `${YEAR}-05-02`, count: 8 },
    { date: `${YEAR}-05-03`, count: 4 },
    { date: `${YEAR}-05-06`, count: 3 },
  ],
  totalFindings: 15,
  missingDateFindingsAllPeriods: 2,
};

const FORECAST_SNAPSHOT = {
  series: {
    total: {
      scope: { type: "total" as const, label: "Total Temuan" },
      historical: [
        {
          periodId: "period-apr",
          label: PREVIOUS_LABEL,
          date: `${YEAR}-04-30`,
          value: 60,
        },
        {
          periodId: "period-may",
          label: LATEST_LABEL,
          date: `${YEAR}-05-31`,
          value: 48,
        },
      ],
      forecast: [
        { label: "Jun", date: `${YEAR}-06-30`, value: 52 },
        { label: "Jul", date: `${YEAR}-07-31`, value: 56 },
        { label: "Agu", date: `${YEAR}-08-31`, value: 60 },
      ],
      summary: {
        direction: "up" as const,
        projectedChange: 12,
        projectedChangePercent: 25,
        confidence: "medium" as const,
        method: "linear-regression" as const,
        sourcePointCount: 2,
      },
      status: "ready" as const,
    },
    parameters: {},
  },
  insight: {
    status: "generated" as const,
    text: "### Ringkasan Eksekutif\nProyeksi total temuan mengarah meningkat.\n\n### Tindakan dan Rekomendasi\n1. **Validasi temuan kritikal**: Periksa bukti dan pola temuan sebelum coaching.",
  },
  cache: {
    status: "hit" as const,
    filterKey: "fixture",
    dataFingerprint: "fixture",
  },
  generatedAt: `${YEAR}-06-01T00:00:00.000Z`,
};

const ZERO_BASELINE_DATA = {
  ...DASHBOARD_DATA,
  summary: { ...DASHBOARD_DATA.summary, totalDefects: 48 },
  paramTrend: {
    ...DASHBOARD_DATA.paramTrend,
    datasets: DASHBOARD_DATA.paramTrend.datasets.map((dataset) =>
      dataset.isTotal ? { ...dataset, data: [0, 48] } : dataset,
    ),
  },
  sparklines: {
    "total-defects": [
      { label: PREVIOUS_LABEL, value: 0 },
      { label: LATEST_LABEL, value: 48 },
    ],
  },
};

const DASHBOARD_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard",
    body: { success: true, data: DASHBOARD_DATA },
  },
  {
    method: "POST",
    path: "/api/v1/sidak/dashboard/forecast",
    body: {
      success: true,
      data: { status: "missing", snapshot: null },
    },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/heatmap",
    body: { success: true, data: HEATMAP_DATA },
  },
];

const withHeatmapResponse = (body: unknown, status = 200): ApiMock[] =>
  DASHBOARD_MOCKS.map((mock) =>
    mock.method === "GET" && mock.path === "/api/v1/sidak/heatmap"
      ? { ...mock, status, body }
      : mock,
  );

const DASHBOARD_READY_MOCKS = DASHBOARD_MOCKS.map((mock) =>
  mock.method === "POST" && mock.path === "/api/v1/sidak/dashboard/forecast"
    ? {
        ...mock,
        body: {
          success: true,
          data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
        },
      }
    : mock,
);

const PANEL_TITLES = [
  "Ringkasan temuan",
  "Tren temuan",
  "Agen dengan temuan terbanyak",
  "Parameter teratas",
  "Pola temuan mingguan",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const SCOPE_LINE = `Call · Tim Call · Jan–${MONTH_SHORT[new Date().getMonth()]} ${YEAR}`;

async function measureLayout(page: Page) {
  return page
    .getByRole("region", { name: "Konten halaman" })
    .evaluate((workspace, titles) => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y + workspace.scrollTop,
          width: box.width,
          height: box.height,
          bottom: box.bottom + workspace.scrollTop,
          right: box.right,
        };
      };
      const panels = titles.map((title) => {
        const heading = [...workspace.querySelectorAll("h2,h3")].find(
          (item) => item.textContent?.trim() === title,
        )!;
        const panel = heading.closest("[data-dashboard-panel]")!;
        const bounds = rect(panel);
        const children = [
          ...panel.querySelectorAll("button,a,svg.recharts-surface"),
        ]
          .filter((item) => item.getBoundingClientRect().width > 0)
          .map((item) => ({
            label:
              item.getAttribute("aria-label") ||
              item.textContent?.trim().slice(0, 90) ||
              item.tagName,
            ...rect(item),
          }));
        return {
          title,
          ...bounds,
          overflow: panel.scrollWidth - panel.clientWidth,
          children,
        };
      });
      const gaps = panels.flatMap((panel) => {
        const next = panels
          .filter(
            (other) =>
              other.y >= panel.bottom - 1 &&
              Math.abs(other.right - panel.right) < 2,
          )
          .sort((a, b) => a.y - b.y)[0];
        return next
          ? [
              {
                from: panel.title,
                to: next.title,
                pixels: next.y - panel.bottom,
              },
            ]
          : [];
      });
      return {
        workspaceWidth: workspace.clientWidth,
        workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
        panels,
        gaps,
        headingOrder: [...workspace.querySelectorAll("h2,h3")].map((item) =>
          item.textContent?.trim(),
        ),
      };
    }, PANEL_TITLES);
}

test.describe("Dashboard SIDAK insights (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
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
          const rail = page.locator(".sidebar-rail");
          if (width >= 1024) {
            const flyout = page.locator(".sidebar-flyout");
            if ((await flyout.getAttribute("data-open")) !== String(expanded)) {
              await rail
                .getByRole("button")
                .filter({ hasText: "SIDAK" })
                .click();
            }
            await expect(flyout).toHaveAttribute("data-open", String(expanded));
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
            // The yearly chart grows with its panel instead of leaving a gap.
            const heatmapGap = await page
              .getByRole("region", { name: "Pola temuan mingguan" })
              .evaluate((panel) => {
                const stats = panel.querySelector(
                  "[aria-label='Statistik pola harian']",
                );
                const note = [...panel.querySelectorAll("p")].find((item) =>
                  item.textContent?.startsWith("Tahun penuh"),
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
      page.getByRole("heading", { level: 1, name: "Dashboard SIDAK" }),
    ).toBeVisible();
    await expect(
      page.locator("header nav").getByText("Dashboard SIDAK", { exact: true }),
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
    await expect(
      page.getByRole("combobox", { name: "Bulan awal" }),
    ).toContainText("Januari");
    await expect(
      page.getByRole("combobox", { name: "Bulan akhir" }),
    ).toContainText(currentMonth);
    const dashboardRequest = audit.mockedApi.find((entry) =>
      entry.includes("/sidak/dashboard?"),
    );
    expect(dashboardRequest).toContain(`year=${YEAR}`);
    expect(dashboardRequest).toContain("service_type=call");
    expect(dashboardRequest).toContain("startMonth=1");
    expect(dashboardRequest).toContain(`endMonth=${new Date().getMonth() + 1}`);

    // KPI strip: one region, four indicators, values preserved.
    const kpis = page.getByRole("region", { name: "Indikator utama" });
    await expect(kpis.locator("article")).toHaveCount(4);
    for (const value of ["108", "5.4", "92.4%", "65.0%"]) {
      await expect(kpis.getByText(value, { exact: true })).toBeVisible();
    }
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
    expect(heatmapRequest).not.toContain("folder_ids");
    expect(heatmapRequest).not.toContain("startMonth");
    const heatmap = page.getByRole("region", { name: "Pola temuan mingguan" });
    await expect(
      heatmap.getByText(`Puncak: 2 Mei ${YEAR} · 8 temuan`),
    ).toBeVisible();
    await expect(
      heatmap.getByText(
        /tahun penuh.*volume temuan, bukan rate.*filter tim\/bulan.*akses akun/i,
      ),
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
      .getByRole("heading", { level: 1, name: "Dashboard SIDAK" })
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
      .getByRole("heading", { level: 1, name: "Dashboard SIDAK" })
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
          .getByRole("heading", { level: 1, name: "Dashboard SIDAK" })
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

  test("menjelaskan jika tidak ada temuan pada heatmap tahunan", async ({
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
      heatmap.getByText(`Belum ada temuan pada heatmap tahun ${YEAR}.`),
    ).toBeVisible();
    await expect(heatmap.getByText(/Puncak:/)).toHaveCount(0);
    expectHermetic(audit);
  });
});
