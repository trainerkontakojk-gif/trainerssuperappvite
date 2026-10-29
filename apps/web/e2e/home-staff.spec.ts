import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";

/**
 * Beranda staff (admin/trainer/leader) — hermetic.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil D):
 * urutan Header → Perlu tindakan → Tren temuan → Aktivitas
 * (hanya baca) + Pintasan; tanpa Workspace Terpadu, Opsi Manajerial, atau
 * tombol hapus log; "Perlu tindakan" dari `GET /home/attention` dengan state
 * kosong, error + coba lagi, dan sebagian; aksi dan pintasan sesuai peran.
 */

// Jam browser dipatok ke Oktober 2026 supaya YTD = Jan–Okt 2026. Waktunya
// sengaja di masa lalu agar sesi mock (kedaluwarsa dari jam nyata) tetap sah.
const NOW = new Date("2026-10-05T05:00:00Z");

// Periode QA ada April–September; label mengikuti format API tren
// (`MONTHS_SHORT` + tahun dua digit). `audited` adalah jumlah agen diaudit per
// periode (dipakai periode terakhir: per agen diaudit dan kalimat tren).
type PeriodRow = {
  month: number;
  label: string;
  call: number;
  chat: number;
  audited: number;
  callAudited: number;
  chatAudited: number;
};

const PERIODS: PeriodRow[] = [
  {
    month: 4,
    label: "Apr 26",
    call: 30,
    chat: 20,
    audited: 30,
    callAudited: 20,
    chatAudited: 10,
  },
  {
    month: 5,
    label: "Mei 26",
    call: 28,
    chat: 19,
    audited: 30,
    callAudited: 20,
    chatAudited: 10,
  },
  {
    month: 6,
    label: "Jun 26",
    call: 26,
    chat: 18,
    audited: 30,
    callAudited: 20,
    chatAudited: 10,
  },
  {
    month: 7,
    label: "Jul 26",
    call: 27,
    chat: 16,
    audited: 30,
    callAudited: 20,
    chatAudited: 10,
  },
  {
    month: 8,
    label: "Agu 26",
    call: 25,
    chat: 15,
    audited: 20,
    callAudited: 18,
    chatAudited: 15,
  },
  {
    month: 9,
    label: "Sep 26",
    call: 18,
    chat: 12,
    audited: 28,
    callAudited: 26,
    chatAudited: 6,
  },
];

/** Bentuk respons `GET /sidak/dashboard/trend` yang dipakai Beranda. */
function seriesFrom(rows: PeriodRow[]) {
  return {
    labels: rows.map((p) => p.label),
    totalData: rows.map((p) => p.call + p.chat),
    serviceData: {
      call: rows.map((p) => p.call),
      chat: rows.map((p) => p.chat),
    },
    activeServices: ["call", "chat"],
    serviceSummary: {
      call: { totalDefects: 18, auditedAgents: 20 },
      chat: { totalDefects: 12, auditedAgents: 12 },
    },
    totalSummary: {
      totalDefects: 30,
      auditedAgents: 32,
      activeServiceCount: 2,
    },
    periodStats: rows.map((p) => ({
      id: `period-${p.month}`,
      label: p.label,
      totalDefects: p.call + p.chat,
      auditedAgents: p.audited,
      serviceStats: {
        call: { totalDefects: p.call, auditedAgents: p.callAudited },
        chat: { totalDefects: p.chat, auditedAgents: p.chatAudited },
      },
    })),
  };
}

const series = (start: number, end: number) =>
  seriesFrom(PERIODS.filter((p) => p.month >= start && p.month <= end));
/** Rentang yang dijawab mock; rentang lain di-abort oleh harness. */
const RANGES: [number, number][] = [
  [1, 10],
  [7, 10],
  [7, 8],
];
const trendQuery = (start: number, end: number) =>
  new RegExp(
    `^/api/v1/sidak/dashboard/trend\\?(?=.*\\byear=2026\\b)(?=.*\\bstartMonth=${start}\\b)(?=.*\\bendMonth=${end}\\b)`,
  );

const ATTENTION_ITEMS = [
  { kind: "leader_access_pending", count: 3, scope: "all" },
  {
    kind: "agents_below_target",
    count: 12,
    scope: "all",
    worstAgents: [
      { agentId: "a-1", nama: "Rina Kusuma", score: 81.4 },
      { agentId: "a-2", nama: "Dimas Prakoso", score: 84 },
      { agentId: "a-3", nama: "Sari Wulandari", score: 85.2 },
    ],
  },
  {
    kind: "qa_period_missing",
    count: 1,
    scope: "all",
    period: { year: 2026, month: 10 },
  },
];

/** Fixture khusus: satu layanan naik tajam di periode terakhir. */
const RISING_PERIODS: PeriodRow[] = [
  {
    month: 8,
    label: "Agu 26",
    call: 10,
    chat: 10,
    audited: 10,
    callAudited: 10,
    chatAudited: 10,
  },
  {
    month: 9,
    label: "Sep 26",
    call: 9,
    chat: 20,
    audited: 10,
    callAudited: 10,
    chatAudited: 10,
  },
];

function mocks(
  attention: ApiMock["body"],
  status = 200,
  /** Pengganti badan respons tren; bawaan memakai `PERIODS`. */
  trendSeries: (start: number, end: number) => unknown = series,
): ApiMock[] {
  return [
    ...RANGES.map(([start, end]): ApiMock => ({
      method: "GET",
      path: trendQuery(start, end),
      body: { success: true, data: trendSeries(start, end) },
    })),
    {
      method: "GET",
      path: "/api/v1/admin/activity-logs",
      body: {
        success: true,
        data: [
          {
            id: 1,
            user_name: "Rina Kusuma",
            action: "Menambah temuan SIDAK",
            type: "add",
            created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          },
        ],
      },
    },
    { method: "GET", path: "/api/v1/home/attention", status, body: attention },
    {
      method: "POST",
      path: "/api/v1/sidak/dashboard/forecast",
      body: { success: true, data: { status: "missing", snapshot: null } },
    },
  ];
}

const ok = (items: unknown[], partial = false) => ({
  success: true,
  data: { items, partial },
});

function content(page: Page) {
  return page.getByRole("region", { name: "Konten halaman" });
}

function attentionSection(page: Page) {
  return page.getByRole("region", { name: "Perlu tindakan" });
}

function trendCard(page: Page) {
  return page.getByRole("region", { name: "Tren temuan QA" });
}

/** Nilai `<dd>` milik `<dt>` dengan teks persis `label`. */
function stat(list: Locator, label: string) {
  return list
    .locator("div")
    .filter({ has: list.page().getByText(label, { exact: true }) })
    .locator("dd");
}

/** Baris data di tabel alternatif grafik (untuk pembaca layar). */
function chartRows(card: Locator) {
  return card.locator("table tbody tr:not([data-projection])");
}

test.describe("Beranda staff", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("trainer: urutan section dan tanpa elemen lama", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok(ATTENTION_ITEMS)),
    });
    const main = content(page);
    await expect(
      main.getByRole("heading", { level: 1, name: /Trainer/ }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      main.getByRole("link", { name: "Input temuan", exact: true }),
    ).toHaveAttribute("href", "/sidak/input");

    await expect(
      main.getByRole("heading", { name: "Tren temuan QA" }),
    ).toBeVisible();
    const order = await main
      .getByRole("heading", { level: 2 })
      .allTextContents();
    const expected = [
      "Perlu tindakan",
      "Tren temuan QA",
      "Temuan per layanan",
      "Aktivitas terakhir",
      "Pintasan",
    ];
    expect(order.filter((text) => expected.includes(text.trim()))).toEqual(
      expected,
    );

    for (const gone of ["Workspace Terpadu", "Opsi Manajerial"]) {
      await expect(main.getByText(gone)).toHaveCount(0);
    }
    await expect(main.getByRole("button", { name: /hapus log/i })).toHaveCount(
      0,
    );
    await expect(main.getByText("Rina Kusuma", { exact: true })).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Lihat semua aktivitas" }),
    ).toHaveAttribute("href", "/dashboard/activities");
    expectHermetic(audit);
  });

  test("perlu tindakan: item, hitungan, dan tujuan CTA", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok(ATTENTION_ITEMS)),
    });
    const section = attentionSection(page);
    const rows = section.getByRole("listitem");
    await expect(rows).toHaveCount(3, { timeout: 20000 });

    await expect(rows.nth(0)).toContainText("3");
    await expect(rows.nth(0)).toContainText("Permintaan akses leader");
    await expect(
      rows.nth(0).getByRole("link", { name: /Tinjau/ }),
    ).toHaveAttribute("href", "/dashboard/access-approval");

    await expect(rows.nth(1)).toContainText("12");
    await expect(rows.nth(1)).toContainText("Agen di bawah target skor 95");
    // Tahap 3: tiga agen terjauh (satu desimal, koma) plus sisa hitungannya.
    await expect(rows.nth(1)).toContainText(
      "Terjauh: Rina Kusuma (81,4), Dimas Prakoso (84,0), Sari Wulandari (85,2) dan 9 lainnya",
    );
    await expect(
      rows.nth(1).getByRole("link", { name: /Lihat 12 agen/ }),
    ).toHaveAttribute("href", "/sidak/agents?status=below");

    await expect(rows.nth(2)).toContainText(
      "Periode QA Oktober 2026 belum dibuat",
    );
    await expect(
      rows.nth(2).getByRole("link", { name: /Buat periode/ }),
    ).toHaveAttribute("href", "/sidak/periods");
    expectHermetic(audit);
  });

  test("perlu tindakan kosong", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    await expect(
      attentionSection(page).getByText("Tidak ada yang menunggu"),
    ).toBeVisible({ timeout: 20000 });
    expectHermetic(audit);
  });

  test("perlu tindakan gagal: section lain tetap tampil, coba lagi memuat ulang", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(
        {
          success: false,
          error: {
            code: "HOME_ATTENTION_UNAVAILABLE",
            message: "Daftar tindakan belum dapat dimuat. Silakan coba lagi.",
          },
        },
        503,
      ),
    });
    const section = attentionSection(page);
    await expect(
      section.getByText("Daftar tindakan belum dapat dimuat"),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      content(page).getByRole("heading", { name: "Tren temuan QA" }),
    ).toBeVisible();

    // Rute yang didaftarkan belakangan didahulukan Playwright.
    await page.route("**/api/v1/home/attention", (route) =>
      route.fulfill({ json: ok(ATTENTION_ITEMS.slice(0, 1)) }),
    );
    await section.getByRole("button", { name: "Coba lagi" }).click();
    await expect(section.getByRole("listitem")).toHaveCount(1);
    expectHermetic(audit);
  });

  test("perlu tindakan sebagian: item tampil dengan catatan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok(ATTENTION_ITEMS.slice(0, 1), true)),
    });
    const section = attentionSection(page);
    await expect(section.getByRole("listitem")).toHaveCount(1, {
      timeout: 20000,
    });
    await expect(
      section.getByText("Sebagian data tidak termuat"),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tren temuan: default YTD, rentang bulan, layanan, dan ringkasan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const card = trendCard(page);
    const range = card.getByRole("group", { name: "Rentang" });
    const start = range.getByRole("combobox", { name: "Bulan awal" });
    const end = range.getByRole("combobox", { name: "Bulan akhir" });
    await expect(start).toHaveValue("1", { timeout: 20000 });
    await expect(end).toHaveValue("10");
    // Hanya bulan yang sudah berjalan tahun ini.
    await expect(end.locator("option")).toHaveCount(10);
    await expect(end.locator("option").last()).toHaveText("Okt");
    await expect(card).toContainText("Jan–Okt 2026");
    // Pilihan 3/6/12 bulan dan kontrol detail SIDAK tidak ada di Beranda.
    await expect(card.getByRole("button", { name: /bln/ })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /Prediksi/ })).toHaveCount(0);
    await expect(card.getByRole("combobox", { name: /Tahun/ })).toHaveCount(0);

    const stats = card.locator("dl");
    await expect(stat(stats, "Temuan 6 bulan")).toHaveText("254");
    await expect(stat(stats, "Sep 26 vs Agu 26")).toHaveText("−25% turun");
    // Tahap 3: temuan per agen diaudit periode terakhir, arah vs sebelumnya.
    await expect(stat(stats, "Per agen diaudit")).toHaveText("1,1 turun");
    await expect(stat(stats, "Agen diaudit")).toHaveText("32");
    await expect(stat(stats, "Layanan aktif")).toHaveText("2");
    await expect(chartRows(card)).toHaveCount(6);

    await start.selectOption({ label: "Jul" });
    await expect(stat(stats, "Temuan 3 bulan")).toHaveText("113");
    await expect(chartRows(card)).toHaveCount(3);
    await expect(card).toContainText("Jul–Okt 2026");
    // Bulan akhir tidak bisa sebelum bulan awal.
    await expect(end.locator("option")).toHaveCount(4);
    await expect(end.locator("option").first()).toHaveText("Jul");

    await card
      .getByRole("combobox", { name: "Layanan" })
      .selectOption({ label: "Layanan Chat" });
    await expect(stat(stats, "Temuan 3 bulan")).toHaveText("43");
    await expect(stat(stats, "Sep 26 vs Agu 26")).toHaveText("−20% turun");
    // Volume turun tidak otomatis berarti baik: laju per agen justru naik.
    await expect(
      stat(stats, "Sep 26 vs Agu 26").locator(".home-good, .home-bad"),
    ).toHaveCount(0);
    // Layanan terpilih memakai agen diaudit layanan itu: 12/6 vs 15/15.
    await expect(stat(stats, "Per agen diaudit")).toHaveText("2 naik");
    expect(audit.mockedApi).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/startMonth=1&endMonth=10/),
        expect.stringMatching(/startMonth=7&endMonth=10/),
      ]),
    );
    expectHermetic(audit);
  });

  test("tren temuan: kalimat apa yang terjadi dan tautan penyebab membawa filter", async ({
    page,
  }, testInfo) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([]), 200),
    });
    const card = trendCard(page);
    const range = card.getByRole("group", { name: "Rentang" });
    const link = card.getByRole("link", { name: "Lihat penyebab di SIDAK" });

    // Turun ≥5% dan per agen diaudit juga turun (40/20 → 30/28).
    await expect(
      card.getByText("Temuan turun 25% dari Agu 26", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText(
      "Rata-rata temuan per agen diaudit juga turun (2 → 1,1), jadi kualitas membaik.",
    );
    // "Semua layanan" tidak mengirim `layanan`; buka periode terakhir berdata,
    // bukan Januari–Oktober (September adalah periode terakhir pada fixture).
    expect(await link.getAttribute("href")).toMatch(/^\/sidak\?tahun=2026/);
    expect(await link.getAttribute("href")).not.toContain("layanan=");
    expect(await link.getAttribute("href")).toContain("dari=9");
    expect(await link.getAttribute("href")).toContain("sampai=9");

    // Turun 20% tetapi per agen diaudit naik (15/15 → 12/6): ikut jumlah audit.
    await card
      .getByRole("combobox", { name: "Layanan" })
      .selectOption({ label: "Layanan Chat" });
    await expect(card).toContainText(
      "Rata-rata temuan per agen diaudit tidak turun (1 → 2). Penurunan ini karena lebih sedikit agen diaudit, belum tentu kualitas membaik.",
    );
    expect(await link.getAttribute("href")).toContain("layanan=chat");

    await range
      .getByRole("combobox", { name: "Bulan awal" })
      .selectOption({ label: "Jul" });
    await expect(card).toContainText("Jul–Okt 2026");
    expect(await link.getAttribute("href")).toContain("dari=9");
    await range
      .getByRole("combobox", { name: "Bulan akhir" })
      .selectOption({ label: "Agu" });
    await expect(card).toContainText("Jul–Agu 2026");
    // Label rentang langsung berganti, tautan menunggu data tren baru.
    await expect(link).toHaveAttribute("href", /dari=8/);
    await expect(link).toHaveAttribute("href", /sampai=8/);

    // Kalimat dan angka baru tetap terbaca di terang/gelap dan tanpa overflow.
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await setDocumentTheme(page, theme);
        await card.scrollIntoViewIfNeeded();
        expect(
          await findLowContrastText(card, {
            selector: "p,span,dd,dt,a",
            leafOnly: true,
          }),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`trend-${width}-${theme}.png`),
        });
      }
    }
    expectHermetic(audit);
  });

  test("temuan per layanan: periode terakhir, porsi, perubahan, tautan SIDAK", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const card = page.getByRole("region", { name: "Temuan per layanan" });
    // Hanya periode terakhir di rentang, bukan jumlah seluruh rentang.
    await expect(card).toContainText("Sep 26 · 30 temuan", {
      timeout: 20000,
    });
    const rows = card.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    // Porsi dari 30 temuan; perubahan vs Agu 26 (25/15).
    await expect(rows.nth(0)).toHaveText(/Call\s*18\s*60%\s*−28%/);
    await expect(rows.nth(1)).toHaveText(/Chat\s*12\s*40%\s*−20%/);
    await expect(
      card.getByRole("link", { name: "Buka Dashboard SIDAK" }),
    ).toHaveAttribute("href", "/sidak");
    await expect(content(page)).toContainText("Periode QA terakhir: Sep 26");

    const range = trendCard(page).getByRole("group", { name: "Rentang" });
    await range
      .getByRole("combobox", { name: "Bulan awal" })
      .selectOption({ label: "Jul" });
    // Juli–Okt: periode terakhirnya tetap September.
    await expect(card).toContainText("Sep 26 · 30 temuan");

    await range
      .getByRole("combobox", { name: "Bulan akhir" })
      .selectOption({ label: "Agu" });
    await expect(card).toContainText("Agu 26 · 40 temuan");
    await expect(rows.nth(0)).toHaveText(/Call\s*25\s*63%\s*−7%/);
    await expect(rows.nth(1)).toHaveText(/Chat\s*15\s*38%\s*−6%/);
    // Periode terakhir di header tidak ikut menyempit bersama filter.
    await expect(content(page)).toContainText("Periode QA terakhir: Sep 26");
    expectHermetic(audit);
  });

  test("temuan per layanan: yang naik paling tajam memimpin kalimat dan tautan", async ({
    page,
  }, testInfo) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([]), 200, () => seriesFrom(RISING_PERIODS)),
    });
    const card = page.getByRole("region", { name: "Temuan per layanan" });
    await expect(card).toContainText("Sep 26 · 29 temuan", {
      timeout: 20000,
    });
    const rows = card.getByRole("listitem");
    await expect(rows.nth(0)).toHaveText(/Chat\s*20\s*69%\s*\+100%/);
    await expect(rows.nth(1)).toHaveText(/Call\s*9\s*31%\s*−10%/);
    const changeColor = (row: Locator) =>
      row
        .locator(".home-bar-change")
        .evaluate((el) => getComputedStyle(el).color);
    const shareColor = (row: Locator) =>
      row
        .locator(".home-bar-share")
        .evaluate((el) => getComputedStyle(el).color);
    expect(await changeColor(rows.nth(0))).not.toBe(
      await shareColor(rows.nth(0)),
    );
    expect(await changeColor(rows.nth(1))).not.toBe(
      await shareColor(rows.nth(1)),
    );
    await expect(card).toContainText("Chat naik paling tajam.");
    await expect(
      card.getByRole("link", { name: "Buka SIDAK untuk Chat" }),
    ).toHaveAttribute("href", /\/sidak\?layanan=chat$/);
    // Kenaikan nyata (per agen diaudit ikut naik) tetap dilaporkan di tren.
    await expect(trendCard(page)).toContainText(
      "jadi kualitas memang menurun.",
    );
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await setDocumentTheme(page, theme);
        await card.scrollIntoViewIfNeeded();
        expect(
          await findLowContrastText(card, {
            selector: "p,span,a,h2",
            leafOnly: true,
          }),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`services-${width}-${theme}.png`),
        });
      }
    }
    expectHermetic(audit);
  });

  test("layanan yang turun menjadi nol tetap menjelaskan penurunan 100%", async ({
    page,
  }) => {
    const zero = [
      { ...RISING_PERIODS[0] },
      { ...RISING_PERIODS[1], call: 0, chat: 0 },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([]), 200, () => seriesFrom(zero)),
    });
    const card = page.getByRole("region", { name: "Temuan per layanan" });
    await expect(card).toContainText("Sep 26 · 0 temuan", { timeout: 20000 });
    const rows = card.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Call" })).toHaveText(
      /Call\s*0\s*0%\s*−100%/,
    );
    await expect(rows.filter({ hasText: "Chat" })).toHaveText(
      /Chat\s*0\s*0%\s*−100%/,
    );
    await expect(
      card.getByRole("link", { name: "Buka Dashboard SIDAK" }),
    ).toHaveAttribute("href", "/sidak");
    expectHermetic(audit);
  });

  test("kalimat tren tidak mengarang pembanding atau penyebut audit", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    for (const scenario of [
      {
        rows: [RISING_PERIODS[1]],
        text: "Pilih rentang minimal dua bulan untuk melihat perubahan temuan.",
      },
      {
        rows: [{ ...RISING_PERIODS[0], call: 0, chat: 0 }, RISING_PERIODS[1]],
        text: "Agu 26 tanpa temuan, jadi persentase perubahan tidak dihitung.",
      },
      {
        rows: [RISING_PERIODS[0], { ...RISING_PERIODS[1], audited: 0 }],
        text: "Jumlah agen diaudit belum tersedia",
      },
      {
        rows: [RISING_PERIODS[0], { ...RISING_PERIODS[1], audited: 20 }],
        text: "karena lebih banyak agen diaudit, belum tentu kualitas menurun.",
      },
      {
        rows: [RISING_PERIODS[0], { ...RISING_PERIODS[1], call: 10, chat: 10 }],
        text: "Temuan stabil (+0%)",
      },
    ]) {
      const audit = await openHermeticShell(page, {
        path: "/dashboard",
        apiMocks: mocks(ok([]), 200, () => seriesFrom(scenario.rows)),
      });
      await expect(trendCard(page)).toContainText(scenario.text, {
        timeout: 20000,
      });
      expectHermetic(audit);
    }
  });

  test("aktivitas dan pintasan sejajar di desktop", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const activity = page.getByRole("region", { name: "Aktivitas terakhir" });
    const shortcuts = page.getByRole("region", { name: "Pintasan" });
    await expect(activity.getByText("Rina Kusuma")).toBeVisible({
      timeout: 20000,
    });
    const top = async (locator: Locator) =>
      (await locator.boundingBox())?.y ?? Number.NaN;
    const [actHead, scHead, actList, scList] = await Promise.all([
      top(activity.getByRole("heading", { level: 2 })),
      top(shortcuts.getByRole("heading", { level: 2 })),
      top(activity.getByRole("list")),
      top(shortcuts.getByRole("list")),
    ]);
    expect(Math.abs(actHead - scHead)).toBeLessThanOrEqual(1);
    expect(Math.abs(actList - scList)).toBeLessThanOrEqual(1);
    for (const link of await shortcuts.getByRole("link").all()) {
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
        44,
      );
    }
    expectHermetic(audit);
  });

  test("mobile: aksi selebar layar dan CTA tindakan di bawah teks", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok(ATTENTION_ITEMS)),
    });
    const main = content(page);
    const primary = main.getByRole("link", {
      name: "Input temuan",
      exact: true,
    });
    await expect(primary).toBeVisible({ timeout: 20000 });
    const heading = main.getByRole("heading", { level: 1 });
    const [primaryBox, headingBox] = await Promise.all([
      primary.boundingBox(),
      heading.boundingBox(),
    ]);
    // Tombol aksi memenuhi lebar kolom konten (390 − 2 × 16px gutter).
    expect(primaryBox!.width).toBeGreaterThanOrEqual(350);
    expect(Math.abs(primaryBox!.x - headingBox!.x)).toBeLessThanOrEqual(1);

    const row = attentionSection(page).getByRole("listitem").first();
    const [title, cta] = await Promise.all([
      row.getByText("Permintaan akses leader", { exact: true }).boundingBox(),
      row.getByRole("link", { name: /Tinjau/ }).boundingBox(),
    ]);
    expect(cta!.y).toBeGreaterThan(title!.y + title!.height);
    expect(Math.abs(cta!.x - title!.x)).toBeLessThanOrEqual(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath("attention-mobile.png"),
    });
    expectHermetic(audit);
  });

  test("leader: aksi ranking tim, scope tim, tanpa aktivitas dan input temuan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "leader" },
      apiMocks: mocks(
        ok([
          {
            kind: "agents_below_target",
            count: 4,
            scope: "team",
            worstAgents: [
              { agentId: "t-1", nama: "Yudi Hartono", score: 78 },
              { agentId: "t-2", nama: "Lestari Puspita", score: 88.5 },
              { agentId: "t-3", nama: "Bagas Nugroho", score: 90 },
            ],
          },
        ]),
      ),
    });
    const main = content(page);
    await expect(
      main.getByRole("link", { name: "Ranking tim", exact: true }),
    ).toHaveAttribute("href", "/sidak/ranking", { timeout: 20000 });
    await expect(attentionSection(page)).toContainText("Tim Anda");
    // Sisa hitungan dihitung dari jumlah item, bukan dari panjang daftar.
    await expect(attentionSection(page)).toContainText(
      "Terjauh: Yudi Hartono (78,0), Lestari Puspita (88,5), Bagas Nugroho (90,0) dan 1 lainnya",
    );
    await expect(
      attentionSection(page).getByRole("link", { name: /Lihat 4 agen/ }),
    ).toHaveAttribute("href", "/sidak/agents?status=below");
    await expect(
      main.getByRole("heading", { name: "Aktivitas terakhir" }),
    ).toHaveCount(0);
    const shortcuts = page.getByRole("region", { name: "Pintasan" });
    await expect(
      shortcuts.getByRole("link", { name: /Ranking agen/ }),
    ).toBeVisible();
    await expect(
      shortcuts.getByRole("link", { name: /Input temuan/ }),
    ).toHaveCount(0);
    await expect(
      main.getByRole("link", { name: "Input temuan", exact: true }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });
});
