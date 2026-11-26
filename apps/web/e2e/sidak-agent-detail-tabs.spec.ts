/**
 * Tab Tren, Heatmap, dan Simulasi di detail agen sesuai mockup "Halaman SIDAK".
 *
 * Hermetic: `/api` di-mock lewat harness detail agen; riwayat simulasi
 * di-mock di spec ini. Plan: plans/markdown/sidak-redesign.md.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  AGENT_ID,
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  LAYOUT_FOLDERS,
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";

const AGENT_NAME = "Rahmawati Kusumaningrum";

const TREND = {
  labels: ["Jun", "Jul", "Agu", "Sep", "Okt"],
  datasets: [
    { label: "Total temuan", data: [2, 2, 4, 3, 6], isTotal: true },
    { label: "Verifikasi data", data: [0, 1, 1, 2, 3], isTotal: false },
    { label: "Informasi tidak lengkap", data: [1, 1, 2, 0, 1], isTotal: false },
    { label: "Hold tanpa izin", data: [0, 0, 1, 1, 1], isTotal: false },
    { label: "Salam penutup", data: [1, 0, 0, 0, 1], isTotal: false },
  ],
};

function simulation(
  id: string,
  module: "ketik" | "pdkt" | "telefun",
  scenarioTitle: string,
  occurredAt: string,
  score: number | null,
  reviewStatus: string,
) {
  return {
    id,
    module,
    scenarioTitle,
    occurredAt,
    durationSeconds: 300,
    score,
    scoreScale: module === "telefun" ? 10 : 100,
    reviewStatus,
    simulationSubject: {},
    actor: { userId: "u-1", email: "trainer@example.test", role: "trainer" },
  };
}

const SIMULATIONS = [
  simulation(
    "s-1",
    "ketik",
    "Pinjol Ilegal",
    "2026-10-14T02:12:00.000Z",
    82,
    "completed",
  ),
  simulation(
    "s-2",
    "telefun",
    "Klaim Asuransi Ditolak",
    "2026-10-10T07:30:00.000Z",
    7.4,
    "completed",
  ),
  simulation(
    "s-3",
    "pdkt",
    "Pengecekan SLIK",
    "2026-10-02T03:05:00.000Z",
    null,
    "not_started",
  ),
];

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit, {
    detailPayload: () => ({
      ...(richAgentDetailPayload() as Record<string, unknown>),
      personalTrend: TREND,
    }),
    quickviewPayload: richQuickviewPayload(),
    folders: LAYOUT_FOLDERS,
    heatmapCounts: { "2026-10-06": 2, "2026-10-09": 1 },
  });
  const simulationQueries: string[] = [];
  await page.route(
    (url) => url.pathname === `/api/v1/sidak/agents/${AGENT_ID}/simulations`,
    async (route) => {
      const url = new URL(route.request().url());
      simulationQueries.push(url.search);
      const moduleFilter = url.searchParams.get("module");
      const items =
        moduleFilter && moduleFilter !== "all"
          ? SIMULATIONS.filter((item) => item.module === moduleFilter)
          : SIMULATIONS;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items, nextCursor: null },
        }),
      });
    },
  );
  await expect(page.getByRole("heading", { name: AGENT_NAME })).toBeVisible({
    timeout: 20000,
  });
  return { simulationQueries };
}

const cellsOf = (page: Page, tableName: string) =>
  page
    .getByRole("table", { name: tableName })
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from(row.querySelectorAll("th, td")).map(
          (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ),
      ),
    );

async function expectKeyboardScrollable(wrapper: Locator, tableName: string) {
  await expect(wrapper).toBeFocused();
  const table = wrapper.getByRole("table", { name: tableName });
  await expect.soft(table.locator("caption")).toHaveText(tableName);
  await expect(table.locator('thead th:not([scope="col"])')).toHaveCount(0);
  const start = await wrapper.evaluate((element) => element.scrollLeft);
  await wrapper.press("ArrowRight");
  await expect.poll(() => wrapper.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(start);
}

test.describe("Aksesibilitas detail agen", () => {
  test("panah memindahkan fokus; Enter dan Spasi memilih tab dan memperbarui URL", async ({
    page,
  }) => {
    const { simulationQueries } = await open(page);
    const list = page.getByRole("tablist", { name: "Bagian profil agen" });
    const summary = list.getByRole("tab", { name: "Ringkasan" });
    const trend = list.getByRole("tab", { name: "Tren" });
    const simulation = list.getByRole("tab", { name: "Simulasi" });
    const initialUrl = page.url();

    await summary.focus();
    await page.keyboard.press("ArrowRight");
    await expect(trend).toBeFocused();
    await expect(trend).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tabpanel", { name: "Ringkasan" })).toBeVisible();
    await expect(page).toHaveURL(initialUrl);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/tab=trend/);
    await expect(page.getByRole("tabpanel", { name: "Tren" })).toBeVisible();

    await page.keyboard.press("End");
    await expect(simulation).toBeFocused();
    await page.keyboard.press("Home");
    await expect(summary).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(simulation).toBeFocused();
    await expect(page).toHaveURL(/tab=trend/);
    expect(simulationQueries).toEqual([]);
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/tab=simulations/);
    await expect(page.getByRole("tabpanel", { name: "Simulasi" })).toBeVisible();
  });

  test("Tab keluar dari daftar dan Shift+Tab kembali ke tab aktif", async ({ page }) => {
    await open(page);
    const list = page.getByRole("tablist", { name: "Bagian profil agen" });
    const summary = list.getByRole("tab", { name: "Ringkasan" });
    const trend = list.getByRole("tab", { name: "Tren" });
    const auditYear = page.getByRole("combobox", { name: "Tahun audit" });

    await summary.focus();
    await page.keyboard.press("ArrowRight");
    await expect(trend).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(auditYear).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(summary).toBeFocused();

    await trend.click();
    await page.keyboard.press("ArrowLeft");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(auditYear).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(trend).toBeFocused();
    await expect(page).toHaveURL(/tab=trend/);
  });

  test("tab aktif tetap punya garis bawah yang terlihat dalam forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page);
    const active = page.getByRole("tab", { selected: true });
    const inactive = page.getByRole("tab", { name: "Tren" });
    const underline = await active.evaluate((tab) => {
      const style = getComputedStyle(tab, "::after");
      return {
        width: parseFloat(style.borderBottomWidth),
        style: style.borderBottomStyle,
        opacity: style.opacity,
      };
    });
    expect(underline).toMatchObject({ style: "solid", opacity: "1" });
    expect(underline.width).toBeGreaterThanOrEqual(1);
    await expect.poll(() => inactive.evaluate((tab) => getComputedStyle(tab, "::after").opacity)).toBe("0");
  });

  test("setiap tab menunjuk panel yang ada, termasuk panel yang belum dibuka", async ({ page }) => {
    await open(page);
    const tabs = page.getByRole("tablist", { name: "Bagian profil agen" }).getByRole("tab");
    await expect(tabs).toHaveCount(5);
    for (const tab of await tabs.all()) {
      await expect(tab).toHaveAttribute("aria-controls", /.+/);
      const id = await tab.getAttribute("aria-controls");
      const panel = page.locator(`[id="${id}"]`);
      await expect(panel).toHaveAttribute("role", "tabpanel");
      await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!);
      await expect(panel.and(page.locator("[aria-label]"))).toHaveCount(0);
      if ((await tab.getAttribute("aria-selected")) === "false") {
        await expect(panel).toBeHidden();
      }
    }
    await expect(page.locator('[aria-label="Peringkat dan forecast"]:not([role])')).toHaveCount(0);
  });

  test("grafik Tren memiliki nama dan alternatif data tanpa role application", async ({ page }) => {
    await open(page);
    await page.getByRole("tab", { name: "Tren" }).click();
    const panel = page.getByRole("tabpanel", { name: "Tren" });
    const chart = panel.getByRole("img", {
      name: "Grafik tren temuan per bulan: Total dan parameter",
    });
    const monthlyTotals = /Total temuan: Jun 2, Jul 2, Agu 4, Sep 3, Okt 6/;
    await expect(chart).toHaveAccessibleDescription(monthlyTotals);
    await expect(panel.getByText(monthlyTotals)).toBeVisible();
    await expect(panel.locator('svg[role="application"]')).toHaveCount(0);

    await panel.getByRole("button", { name: "Verifikasi data" }).click();
    await expect(panel.getByRole("img", {
      name: "Grafik tren temuan per bulan: Verifikasi data",
    })).toHaveAccessibleDescription(/Temuan per parameter/);
  });

  test("tabel Tren dan Simulasi dapat dicapai dengan Tab dan digulir dengan panah", async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("tab", { name: "Tren" }).click();
    const series = page.getByRole("group", { name: "Filter seri grafik" });
    await series.getByRole("button").last().focus();
    await page.keyboard.press("Tab");
    await expectKeyboardScrollable(
      page.getByRole("region", { name: "Gulir tabel temuan per parameter" }),
      "Temuan per parameter",
    );

    await page.getByRole("tab", { name: "Simulasi" }).click();
    await expect(page.getByRole("table", { name: "Riwayat simulasi" })).toBeVisible();
    const modules = page.getByRole("group", { name: "Filter modul riwayat simulasi" });
    await modules.getByRole("button", { name: "Telefun" }).focus();
    await page.keyboard.press("Tab");
    await expectKeyboardScrollable(
      page.getByRole("region", { name: "Gulir tabel riwayat simulasi" }),
      "Riwayat simulasi",
    );
  });
});

test.describe("Tab detail agen sesuai mockup (hermetic)", () => {
  test.slow();

  test("Tren: kontrol seri Total + parameter, lalu tabel temuan per parameter dengan Arah", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("tab", { name: "Tren" }).click();

    const series = page.getByRole("group", { name: "Filter seri grafik" });
    await expect(
      series.getByRole("button", { name: "Total + parameter" }),
    ).toHaveAttribute("aria-pressed", "true");

    const table = page.getByRole("table", { name: "Temuan per parameter" });
    await expect(table).toBeVisible();
    await expect(table.locator("thead th")).toHaveText([
      "Parameter",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Total",
      "Arah",
    ]);
    // Diurutkan menurut total terbanyak.
    expect(await cellsOf(page, "Temuan per parameter")).toEqual([
      [
        "Verifikasi data",
        "0",
        "1",
        "1",
        "2",
        "3",
        "7",
        "Naik 3 bulan berturut-turut",
      ],
      ["Informasi tidak lengkap", "1", "1", "2", "0", "1", "5", "Naik turun"],
      ["Hold tanpa izin", "0", "0", "1", "1", "1", "3", "Stabil"],
      ["Salam penutup", "1", "0", "0", "0", "1", "2", "Muncul lagi"],
    ]);
  });

  test("Heatmap: kalender di kiri, tanggal terpilih dan fakta singkat di kanan", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("tab", { name: "Heatmap" }).click();
    const calendar = page.getByRole("grid", { name: "Kalender temuan 2026" });
    await expect(calendar).toBeVisible();

    const aside = page.getByRole("complementary", {
      name: "Ringkasan heatmap agen",
    });
    await expect(aside).toBeVisible();
    const calendarBox = await page
      .getByTestId("agent-heatmap-calendar")
      .boundingBox();
    const asideBox = await aside.boundingBox();
    if (!calendarBox || !asideBox) throw new Error("heatmap tidak ter-render");
    expect(asideBox.x).toBeGreaterThanOrEqual(
      calendarBox.x + calendarBox.width - 1,
    );
    expect(Math.abs(asideBox.y - calendarBox.y)).toBeLessThanOrEqual(40);

    await expect(aside.getByText("Hari dengan temuan")).toBeVisible();
    await expect(aside.getByTestId("agent-heatmap-fact-days")).toHaveText("2");
    await expect(aside.getByTestId("agent-heatmap-fact-peak")).toHaveText(
      "6 Okt",
    );

    await page.getByRole("button", { name: /^06\/10\/2026:/ }).click();
    await expect(aside.getByTestId("agent-heatmap-selected-day")).toHaveText(
      "Selasa, 6 Oktober 2026",
    );
  });

  test("Heatmap: bar hari di bawah kalender agen", async ({ page }) => {
    await open(page);
    await page.getByRole("tab", { name: "Heatmap" }).click();
    const panel = page.getByRole("tabpanel", { name: "Heatmap" });
    const bars = panel.getByRole("region", {
      name: "Temuan per hari dalam minggu",
    });
    await expect(bars).toBeVisible();
    // 6 Okt (Selasa) = 2, 9 Okt (Jumat) = 1.
    const chart = bars.getByRole("img");
    await expect(chart).toHaveAttribute("aria-label", /Selasa: 2 temuan/);
    await expect(chart).toHaveAttribute("aria-label", /Jumat: 1 temuan/);
    const calBox = await page.getByTestId("agent-heatmap-calendar").boundingBox();
    const barBox = await bars.boundingBox();
    expect(barBox!.y).toBeGreaterThan(calBox!.y);
  });

  test("Simulasi: tabel Modul, Skenario, Tanggal, Telaah, Skor dengan filter modul", async ({
    page,
  }) => {
    const { simulationQueries } = await open(page);
    await page.getByRole("tab", { name: "Simulasi" }).click();

    const table = page.getByRole("table", { name: "Riwayat simulasi" });
    await expect(table).toBeVisible();
    await expect(table.locator("thead th")).toHaveText([
      "Modul",
      "Skenario",
      "Tanggal",
      "Telaah",
      "Skor",
      "Aksi",
    ]);
    const rows = await cellsOf(page, "Riwayat simulasi");
    expect(rows.map((row) => [row[0], row[1], row[3], row[4]])).toEqual([
      ["KETIK", "Pinjol Ilegal", "Selesai", "82 / 100"],
      ["Telefun", "Klaim Asuransi Ditolak", "Selesai", "7,4 / 10"],
      ["PDKT", "Pengecekan SLIK", "Belum ditelaah", "—"],
    ]);
    await expect(
      table.getByRole("button", { name: "Lihat telaah Pinjol Ilegal" }),
    ).toBeVisible();
    await expect(
      table.getByRole("button", { name: "Lihat sesi Pengecekan SLIK" }),
    ).toBeVisible();

    const filter = page.getByRole("group", {
      name: "Filter modul riwayat simulasi",
    });
    await filter.getByRole("button", { name: "Telefun" }).click();
    await expect(
      filter.getByRole("button", { name: "Telefun" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    expect(
      simulationQueries.some((query) => query.includes("module=telefun")),
    ).toBe(true);
    await expect(page.getByText(/Skala skor mengikuti modulnya/)).toBeVisible();
  });
});

test.describe("Simulasi: detail telaah", () => {
  test("Lihat telaah membuka tampilan sesi yang sama dengan Monitoring", async ({
    page,
  }) => {
    await open(page);
    await page.route(
      (url) =>
        url.pathname === `/api/v1/sidak/agents/${AGENT_ID}/simulations/ketik/s-1`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              module: "ketik",
              header: {
                scenario_title: "Pinjol Ilegal",
                occurred_at: "2026-10-14T02:12:00.000Z",
                actor_name: "Trainer",
                duration_seconds: 300,
              },
              user_email: "trainer@example.test",
              user_role: "trainer",
              simulationSubject: null,
              review_status: "completed",
              scores: { final: 82, empathy: 80, probing: 75, typo: 90, compliance: 85 },
              session: {
                consumerName: "Bu Sri",
                consumerPhone: null,
                consumerCity: null,
                simulationDuration: 10,
                messages: [
                  {
                    id: "m1",
                    sender: "consumer",
                    text: "Saya ditagih pinjol yang tidak saya kenal.",
                    timestamp: "2026-10-14T02:12:00.000Z",
                  },
                ],
              },
              review: {
                id: "r-1",
                sessionId: "s-1",
                aiSummary: "Agen tenang dan jelas.",
                strengths: [],
                weaknesses: [],
                coachingFocus: [],
                education: null,
                createdAt: "2026-10-14T02:20:00.000Z",
              },
              typos: [],
            },
          }),
        }),
    );
    await page.getByRole("tab", { name: "Simulasi" }).click();
    const trigger = page
      .getByRole("table", { name: "Riwayat simulasi" })
      .getByRole("button", { name: "Lihat telaah Pinjol Ilegal" });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Pinjol Ilegal" });
    await expect(dialog.getByRole("region", { name: "Penilaian AI" })).toContainText(
      "82 / 100",
    );
    await expect(dialog.getByRole("region", { name: "Transkrip chat" })).toContainText(
      "Saya ditagih pinjol yang tidak saya kenal.",
    );
    await expect(dialog).toContainText("Agen tenang dan jelas.");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("Heatmap detail agen ke tab Temuan", () => {
  test("tanggal terpilih menyebut tiketnya dan membuka grup tiket di tab Temuan", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const audit: AgentAudit = {
      mockedApi: [],
      blockedApi: [],
      blockedExternal: [],
    };
    await openAgentDetail(page, audit, {
      detailPayload: () => ({
        ...(richAgentDetailPayload() as Record<string, unknown>),
        personalTrend: TREND,
      }),
      quickviewPayload: richQuickviewPayload(),
      folders: LAYOUT_FOLDERS,
      heatmapCounts: { "2026-06-12": 2 },
      heatmapTickets: {
        "2026-06-12": [{ noTiket: "TKT-2026-06-142", month: 6, year: 2026 }],
      },
    });
    await expect(page.getByRole("heading", { name: AGENT_NAME })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole("tab", { name: "Heatmap" }).click();
    await page.getByRole("button", { name: "12/06/2026: 2 temuan" }).click();

    const aside = page.getByRole("complementary", {
      name: "Ringkasan heatmap agen",
    });
    await expect(aside).toContainText("TKT-2026-06-142");
    await aside
      .getByRole("button", { name: "Buka TKT-2026-06-142 di tab Temuan" })
      .click();

    await expect(page.getByRole("tab", { name: "Temuan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const group = page
      .getByRole("tabpanel", { name: "Temuan" })
      .getByRole("region", { name: "Tiket TKT-2026-06-142" });
    await expect(group).toBeFocused();
  });
});

test.describe("Detail agen mengikuti cakupan bersama", () => {
  test("layanan, tahun, dan bulan dari alamat dipakai request dan tetap saat ganti tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const audit: AgentAudit = {
      mockedApi: [],
      blockedApi: [],
      blockedExternal: [],
    };
    await openAgentDetail(page, audit, {
      detailPayload: () => ({
        ...(richAgentDetailPayload() as Record<string, unknown>),
        personalTrend: TREND,
      }),
      quickviewPayload: richQuickviewPayload(),
      folders: LAYOUT_FOLDERS,
      query: "?layanan=call&tahun=2025&dari=3&sampai=6",
    });
    await expect
      .poll(() => audit.detailQueries?.[0] ?? "")
      .toContain("year=2025");
    const first = new URLSearchParams(audit.detailQueries![0]);
    // Layanan awal = layanan terbaru agen, bukan layanan dari alamat: request
    // pertama tanpa filter layanan, lalu difilter ke layanan terbaru (call).
    expect(first.get("service_type")).toBeNull();
    expect(first.get("startMonth")).toBe("3");
    expect(first.get("endMonth")).toBe("6");
    await expect
      .poll(() => audit.detailQueries?.at(-1) ?? "")
      .toContain("service_type=call");

    await page.getByRole("tab", { name: "Tren" }).click();
    await expect(page).toHaveURL(/tab=trend/);
    await expect(page).toHaveURL(/tahun=2025/);
    await expect(page).toHaveURL(/dari=3/);
    await expect(page).toHaveURL(/sampai=6/);
  });
});
