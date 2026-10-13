import { expect, test, type Page } from "@playwright/test";
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

const TREND = {
  labels: ["Agu 2026", "Sep 2026"],
  totalData: [40, 30],
  serviceData: { call: [25, 18], chat: [15, 12] },
  activeServices: ["call", "chat"],
  serviceSummary: {
    call: { totalDefects: 43, auditedAgents: 20 },
    chat: { totalDefects: 27, auditedAgents: 12 },
  },
  totalSummary: { totalDefects: 70, auditedAgents: 32, activeServiceCount: 2 },
};

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
      path: "/api/v1/sidak/dashboard/available-years",
      body: { success: true, data: [2026] },
    },
    {
      method: "GET",
      path: "/api/v1/sidak/dashboard/trend",
      body: {
        success: true,
        data: { trendMap: { "3m": TREND, "6m": TREND, all: TREND } },
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
      main.getByRole("heading", { name: "Tren Temuan QA" }),
    ).toBeVisible();
    const order = await main
      .getByRole("heading", { level: 2 })
      .allTextContents();
    const expected = [
      "Perlu tindakan",
      "Tren Temuan QA",
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
      content(page).getByRole("heading", { name: "Tren Temuan QA" }),
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

  test("ringkasan tren: agen diaudit dan layanan aktif", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      apiMocks: mocks(ok([])),
    });
    const main = content(page);
    await expect(main.getByText("Agen diaudit")).toBeVisible({
      timeout: 20000,
    });
    // Temuan per layanan ditampilkan di "Ringkasan Performa" milik panel tren,
    // jadi Beranda tidak menggandakannya.
    await expect(
      main.getByRole("heading", { name: "Temuan per layanan" }),
    ).toHaveCount(0);
    const summary = main.locator("dl").filter({ hasText: "Agen diaudit" });
    await expect(summary).toContainText("32");
    await expect(summary).toContainText("Layanan aktif");
    await expect(summary).toContainText("2");
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
