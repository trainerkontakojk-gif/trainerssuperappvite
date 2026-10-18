import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Riwayat Monitoring (tahap 3). Semua `/api` dimock; filter, halaman, dan
 * cakupan leader di server dibuktikan di `monitoring-riwayat-api.spec.ts`.
 */

const SUBJECT = {
  type: "participant",
  participantId: "123e4567-e89b-12d3-a456-426614174000",
  displayName: "Rina Kartika",
  batchName: "Batch Pagi",
  team: "Tim Call",
};

function row(overrides: Record<string, unknown>) {
  return {
    id: "6f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f30",
    module: "ketik",
    user_id: "user-1",
    occurred_at: "2026-10-17T07:15:00.000Z",
    scenario_title: "Tagihan Kartu Kredit Dobel",
    consumer_name: "Bu Sri",
    duration_seconds: 412,
    score: 82,
    score_scale: 100,
    review_status: "completed",
    legacy: false,
    participant: { name: "Rina Kartika", batch: "Batch Pagi" },
    actor: { email: "trainer@local.test", name: "Trainer", role: "trainer" },
    simulationSubject: SUBJECT,
    ...overrides,
  };
}

const ROWS = [
  row({}),
  row({
    id: "7f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f31",
    module: "pdkt",
    occurred_at: "2026-10-17T04:15:00.000Z",
    scenario_title: "Restrukturisasi Kredit UMKM",
    duration_seconds: 1610,
    score: null,
    review_status: "failed",
    participant: { name: "Ayu Lestari", batch: "Batch Siang" },
  }),
  row({
    id: "8f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f32",
    module: "telefun",
    occurred_at: "2026-10-17T03:15:00.000Z",
    scenario_title: "Klaim Asuransi Ditolak",
    duration_seconds: 540,
    score: 7.5,
    score_scale: 10,
    participant: { name: "Dimas Prasetyo", batch: "Batch Pagi" },
  }),
];

function page(
  rows: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    rows,
    total: 30,
    page: 1,
    page_size: 25,
    counts: {
      ketik: 12,
      pdkt: 10,
      telefun: 8,
      completed: 27,
      processing: 1,
      failed: 1,
      not_started: 1,
    },
    scope: { kind: "all" },
    ...extra,
  };
}

function mocks(history: unknown, extra: readonly ApiMock[] = []): ApiMock[] {
  return [
    ...extra,
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/history",
      body: { success: true, data: history },
    },
  ];
}

test.describe("Monitoring Riwayat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("satu baris per sesi dengan ringkasan, skor berskala, dan halaman", async ({
    page: browser,
  }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring",
      apiMocks: mocks(page(ROWS)),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);

    await expect(browser.getByText("30 sesi", { exact: true })).toBeVisible({ timeout: 20000 });
    for (const text of ["KETIK 12", "PDKT 10", "Telefun 8", "Gagal 1"]) {
      await expect(browser.getByText(text, { exact: true })).toBeVisible();
    }

    const table = browser.getByRole("table", { name: "Riwayat sesi" });
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toContainText("17 Okt, 14.15");
    await expect(rows.nth(1)).toContainText("Rina Kartika · Batch Pagi");
    await expect(rows.nth(1)).toContainText("6 mnt 52 dtk");
    await expect(rows.nth(1)).toContainText("82/100");
    await expect(rows.nth(1)).toContainText("Selesai");
    await expect(rows.nth(2)).toContainText("26 mnt 50 dtk");
    await expect(rows.nth(2)).toContainText("Gagal");
    await expect(rows.nth(3)).toContainText("7,5/10");

    await expect(browser.getByText("1–25 dari 30 sesi")).toBeVisible();
    await expect(
      browser.getByRole("button", { name: "Sebelumnya" }),
    ).toBeDisabled();
    const next = browser.waitForRequest((request) =>
      request.url().includes("/ai/monitoring/history?page=2"),
    );
    await browser.getByRole("button", { name: "Berikutnya" }).click();
    await next;
    await expect(browser).toHaveURL(/\/monitoring\?hal=2$/);
    expectHermetic(audit);
  });

  test("filter tersimpan di alamat dan dikirim ke server", async ({
    page: browser,
  }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring?modul=pdkt&status=gagal&dari=2026-10-01&sampai=2026-10-17&q=rina",
      apiMocks: mocks(page([ROWS[1]], { total: 1 })),
    });
    const request = await browser.waitForRequest(
      (r) => r.url().includes("/ai/monitoring/history"),
      { timeout: 20000 },
    );
    const query = new URL(request.url()).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      module: "pdkt",
      status: "failed",
      from: "2026-10-01",
      to: "2026-10-17",
      q: "rina",
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await expect(
      browser.getByRole("combobox", { name: "Modul" }),
    ).toContainText("PDKT");
    await expect(
      browser.getByRole("combobox", { name: "Status" }),
    ).toContainText("Gagal");
    await expect(
      browser.getByRole("button", { name: /1 Okt – 17 Okt 2026/ }),
    ).toBeVisible();
    await expect(browser.getByLabel("Cari riwayat")).toHaveValue("rina");

    // Mengetik pencarian baru memperbarui alamat dan kembali ke halaman 1.
    await browser.getByLabel("Cari riwayat").fill("ayu");
    await expect(browser).toHaveURL(/q=ayu/);
    expectHermetic(audit);
  });

  test("tanggal cepat Bulan ini mengisi rentang WIB", async ({
    page: browser,
  }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring",
      apiMocks: mocks(page(ROWS)),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await browser
      .getByRole("button", { name: "Semua tanggal" })
      .click({ timeout: 20000 });
    await expect(
      browser.getByText("Tanggal dihitung dalam WIB."),
    ).toBeVisible();
    await browser.getByRole("button", { name: "Bulan ini" }).click();
    await expect(browser).toHaveURL(
      /dari=\d{4}-\d{2}-01&sampai=\d{4}-\d{2}-\d{2}/,
    );
    expectHermetic(audit);
  });

  test("hasil kosong menawarkan hapus filter", async ({ page: browser }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring?modul=pdkt&status=gagal",
      apiMocks: mocks(page([], { total: 0 })),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await expect(browser.getByText("Tidak ada sesi yang cocok")).toBeVisible({
      timeout: 20000,
    });
    await browser.getByRole("button", { name: "Hapus filter" }).click();
    await expect(browser).toHaveURL(/\/monitoring$/);
    expectHermetic(audit);
  });

  test("hapus sesi lewat dialog yang menyebut sesinya", async ({
    page: browser,
  }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring",
      apiMocks: mocks(page(ROWS), [
        {
          method: "DELETE",
          path: `/api/v1/ai/monitoring/history/ketik/${ROWS[0].id}`,
          body: { success: true, data: null },
        },
      ]),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await browser
      .getByRole("button", { name: "Aksi sesi Tagihan Kartu Kredit Dobel" })
      .click({ timeout: 20000 });
    await browser.getByRole("menuitem", { name: "Hapus sesi…" }).click();
    const dialog = browser.getByRole("alertdialog", {
      name: "Hapus sesi ini?",
    });
    await expect(dialog).toContainText(
      "KETIK · Tagihan Kartu Kredit Dobel, Rina Kartika, 17 Okt, 14.15",
    );
    await expect(dialog).toContainText("Catatan biaya AI tetap disimpan.");
    await dialog.getByRole("button", { name: "Hapus sesi" }).click();
    await waitForMockedApi(audit, [
      `/ai/monitoring/history/ketik/${ROWS[0].id}`,
    ]);
    expectHermetic(audit);
  });

  test("leader melihat catatan tim dan tidak bisa menghapus", async ({
    page: browser,
  }) => {
    const audit = await openHermeticShell(browser, {
      path: "/monitoring",
      auth: { role: "leader" },
      apiMocks: mocks(
        page([ROWS[0]], {
          total: 1,
          scope: { kind: "team", batches: ["Batch Pagi"], teams: ["Tim Call"] },
        }),
      ),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await expect(
      browser.getByText(
        "Menampilkan peserta dari tim yang aksesnya sudah disetujui: Tim Call, Batch Pagi.",
      ),
    ).toBeVisible({ timeout: 20000 });
    await browser
      .getByRole("button", { name: "Aksi sesi Tagihan Kartu Kredit Dobel" })
      .click();
    await expect(
      browser.getByRole("menuitem", { name: "Buka detail" }),
    ).toBeVisible();
    await expect(
      browser.getByRole("menuitem", { name: "Hapus sesi…" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("di HP riwayat tampil sebagai daftar ringkas", async ({
    page: browser,
  }) => {
    await browser.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(browser, {
      path: "/monitoring",
      apiMocks: mocks(page(ROWS)),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    const list = browser.getByRole("list", { name: "Riwayat sesi" });
    await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 20000 });
    await expect(list.getByRole("listitem").first()).toContainText(
      "Rina Kartika · KETIK · 17 Okt, 14.15",
    );
    await expect(
      browser.getByRole("table", { name: "Riwayat sesi" }),
    ).toBeHidden();
    await expect(browser.getByRole("combobox", { name: "Modul" })).toBeHidden();
    await browser.getByRole("button", { name: "Filter" }).click();
    await expect(
      browser.getByRole("combobox", { name: "Modul" }),
    ).toBeVisible();
    const width = await browser.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
    expectHermetic(audit);
  });
});
