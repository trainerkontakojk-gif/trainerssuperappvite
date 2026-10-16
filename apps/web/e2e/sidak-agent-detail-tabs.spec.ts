/**
 * Tab Tren, Heatmap, dan Simulasi di detail agen sesuai mockup "Halaman SIDAK".
 *
 * Hermetic: `/api` di-mock lewat harness detail agen; riwayat simulasi
 * di-mock di spec ini. Plan: plans/markdown/sidak-redesign.md.
 */

import { expect, test, type Page } from "@playwright/test";
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
    const calendar = page.getByLabel(/Kalender Januari 2026/);
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
