import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Beranda staff (admin/trainer/leader) — hermetic.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil D):
 * urutan Header → Perlu tindakan → Tren temuan → Aktivitas
 * (hanya baca) + Pintasan; tanpa Workspace Terpadu, Opsi Manajerial, atau
 * tombol hapus log; "Perlu tindakan" dari `GET /home/attention` dengan state
 * kosong, error + coba lagi, dan sebagian; aksi dan pintasan sesuai peran.
 */

// Label mengikuti format API tren (`MONTHS_SHORT` + tahun dua digit).
const LABELS = ["Apr 26", "Mei 26", "Jun 26", "Jul 26", "Agu 26", "Sep 26"];
const CALL = [30, 28, 26, 27, 25, 18];
const CHAT = [20, 19, 18, 16, 15, 12];
const series = (months: number) => {
  const cut = LABELS.length - months;
  const call = CALL.slice(cut);
  const chat = CHAT.slice(cut);
  return {
    labels: LABELS.slice(cut),
    totalData: call.map((v, i) => v + chat[i]),
    serviceData: { call, chat },
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
  };
};
const TREND_MAP = { "3m": series(3), "6m": series(6), all: series(6) };

const ATTENTION_ITEMS = [
  { kind: "leader_access_pending", count: 3, scope: "all" },
  { kind: "agents_below_target", count: 12, scope: "all" },
  {
    kind: "qa_period_missing",
    count: 1,
    scope: "all",
    period: { year: 2026, month: 10 },
  },
];

function mocks(attention: ApiMock["body"], status = 200): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/sidak/dashboard/trend",
      body: {
        success: true,
        data: { trendMap: TREND_MAP },
      },
    },
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
    .filter({ has: list.page().locator("dt", { hasText: label }) })
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
    await expect(main.getByText("Rina Kusuma")).toBeVisible();
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
    await expect(
      rows.nth(1).getByRole("link", { name: /Lihat agen/ }),
    ).toHaveAttribute("href", "/sidak/agents");

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

  test("tren temuan: rentang, layanan, dan ringkasan angka", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const card = trendCard(page);
    const range = card.getByRole("group", { name: "Rentang" });
    await expect(range.getByRole("button", { name: "6 bln" })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 20000 },
    );
    // Kontrol detail tetap di halaman SIDAK, bukan di Beranda.
    await expect(card.getByRole("button", { name: /Prediksi/ })).toHaveCount(0);
    await expect(card.getByRole("combobox", { name: /Tahun/ })).toHaveCount(0);

    const stats = card.locator("dl");
    await expect(stat(stats, "Temuan 6 bulan")).toHaveText("254");
    await expect(stat(stats, "Sep 26 vs Agu 26")).toHaveText("−25% turun");
    await expect(stat(stats, "Agen diaudit")).toHaveText("32");
    await expect(stat(stats, "Layanan aktif")).toHaveText("2");
    await expect(chartRows(card)).toHaveCount(6);

    await range.getByRole("button", { name: "3 bln" }).click();
    await expect(stat(stats, "Temuan 3 bulan")).toHaveText("113");
    await expect(chartRows(card)).toHaveCount(3);

    await card
      .getByRole("combobox", { name: "Layanan" })
      .selectOption({ label: "Layanan Chat" });
    await expect(stat(stats, "Temuan 3 bulan")).toHaveText("43");
    await expect(stat(stats, "Sep 26 vs Agu 26")).toHaveText("−20% turun");
    expectHermetic(audit);
  });

  test("temuan per layanan: bulan terakhir, urut terbanyak, tautan SIDAK", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const card = page.getByRole("region", { name: "Temuan per layanan" });
    await expect(card).toContainText("Sep 26 · 30 temuan", { timeout: 20000 });
    const rows = card.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveText(/Call\s*18/);
    await expect(rows.nth(1)).toHaveText(/Chat\s*12/);
    await expect(
      card.getByRole("link", { name: "Buka Dashboard SIDAK" }),
    ).toHaveAttribute("href", "/sidak");
    await expect(content(page)).toContainText("Periode QA terakhir: Sep 26");
    expectHermetic(audit);
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
  }) => {
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
    expectHermetic(audit);
  });

  test("leader: aksi ranking tim, scope tim, tanpa aktivitas dan input temuan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "leader" },
      apiMocks: mocks(
        ok([{ kind: "agents_below_target", count: 4, scope: "team" }]),
      ),
    });
    const main = content(page);
    await expect(
      main.getByRole("link", { name: "Ranking tim", exact: true }),
    ).toHaveAttribute("href", "/sidak/ranking", { timeout: 20000 });
    await expect(attentionSection(page)).toContainText("Tim Anda");
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
