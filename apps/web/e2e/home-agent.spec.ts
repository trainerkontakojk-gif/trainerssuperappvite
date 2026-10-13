import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Beranda agent — hermetic.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil D):
 * aksi utama "Lanjutkan KETIK"; tanpa panel tren dan "Perlu tindakan";
 * Latihan hanya modul yang diizinkan; riwayat sesi gabungan KETIK + PDKT dari
 * endpoint riwayat yang sudah ada, termasuk state kosong dan gagal sebagian.
 * Agent tidak memanggil endpoint SIDAK/admin/home: harness fail-closed akan
 * mencatatnya sebagai `blockedApi`.
 */

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

const KETIK_HISTORY = [
  {
    id: "k1",
    date: minutesAgo(60),
    scenarioTitle: "Keluhan tagihan kartu kredit",
    consumerName: "Budi",
    messages: [],
    finalScore: 86,
    reviewStatus: "completed",
  },
  {
    id: "k2",
    date: minutesAgo(10),
    scenarioTitle: "Pengaduan asuransi",
    consumerName: "Sari",
    messages: [],
    reviewStatus: "pending",
  },
];

const PDKT_HISTORY = [
  {
    id: "p1",
    timestamp: minutesAgo(30),
    config: { scenarios: [{ title: "Restrukturisasi kredit" }] },
    emails: [],
    evaluation: { score: 78 },
    evaluation_status: "completed",
  },
];

function mocks(
  ketik: { status?: number; body: unknown },
  pdkt: { status?: number; body: unknown },
): ApiMock[] {
  return [
    { method: "GET", path: "/api/v1/ketik/history", ...ketik },
    { method: "GET", path: "/api/v1/pdkt/history", ...pdkt },
  ];
}

const ok = (data: unknown) => ({ body: { success: true, data } });

function history(page: Page) {
  return page.getByRole("region", { name: "Riwayat sesi" });
}

test.describe("Beranda agent", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("aksi utama, latihan yang diizinkan, tanpa tren dan perlu tindakan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok(KETIK_HISTORY), ok(PDKT_HISTORY)),
    });
    const main = page.getByRole("region", { name: "Konten halaman" });
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20000,
    });
    await expect(
      main.getByRole("link", { name: "Lanjutkan KETIK", exact: true }),
    ).toHaveAttribute("href", "/ketik");

    const practice = page.getByRole("region", { name: "Latihan" });
    await expect(
      practice.getByRole("link", { name: /^KETIK/ }),
    ).toHaveAttribute("href", "/ketik");
    await expect(practice.getByRole("link", { name: /^PDKT/ })).toHaveAttribute(
      "href",
      "/pdkt",
    );
    await expect(practice.getByRole("link")).toHaveCount(2);

    for (const absent of ["Tren temuan QA", "Perlu tindakan"]) {
      await expect(main.getByRole("heading", { name: absent })).toHaveCount(0);
    }
    await expect(history(page).getByRole("row")).toHaveCount(4);
    expectHermetic(audit);
  });

  test("riwayat: gabungan terbaru dulu, skor atau status ulasan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok(KETIK_HISTORY), ok(PDKT_HISTORY)),
    });
    const rows = history(page).getByRole("row");
    // Baris pertama adalah kepala tabel.
    await expect(rows).toHaveCount(4, { timeout: 20000 });
    await expect(rows.nth(1)).toContainText("KETIK");
    await expect(rows.nth(1)).toContainText("Pengaduan asuransi");
    await expect(rows.nth(1)).toContainText("Menunggu ulasan");
    await expect(rows.nth(2)).toContainText("PDKT");
    await expect(rows.nth(2)).toContainText("Restrukturisasi kredit");
    await expect(rows.nth(2)).toContainText("78");
    await expect(rows.nth(3)).toContainText("Keluhan tagihan kartu kredit");
    await expect(rows.nth(3)).toContainText("86");
    expectHermetic(audit);
  });

  test("riwayat kosong", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok([]), ok([])),
    });
    await expect(history(page).getByText("Belum ada sesi latihan")).toBeVisible(
      { timeout: 20000 },
    );
    expectHermetic(audit);
  });

  test("satu riwayat gagal: sesi lain tetap tampil dengan catatan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(
        {
          status: 500,
          body: {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "boom" },
          },
        },
        ok(PDKT_HISTORY),
      ),
    });
    const section = history(page);
    await expect(section.getByRole("row")).toHaveCount(2, { timeout: 20000 });
    await expect(
      section.getByText("Riwayat KETIK belum dapat dimuat"),
    ).toBeVisible();
    expectHermetic(audit);
  });
});
