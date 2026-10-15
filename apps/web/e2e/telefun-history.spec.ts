import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import {
  FULL_HISTORY,
  PENDING_ROW,
  REVIEWED_ROW,
  telefunMocks,
  type TelefunRow,
} from "./helpers/telefunFixtures";

/**
 * Telefun — halaman Riwayat `/telefun/history` (hermetic).
 *
 * Menggantikan modal riwayat lama. Fixture memakai baris DB snake_case dari
 * `telefunFixtures.ts`, supaya pemetaan `mapTelefunSessionRow` ikut terbukti.
 */

/** Peserta yang record hidupnya sudah tidak tersedia. */
const UNAVAILABLE_PARTICIPANT_ROW: TelefunRow = {
  ...PENDING_ROW,
  id: "telefun-unavailable-1",
  scenario_title: "Skenario Peserta Lama",
  consumer_name: "Andi",
  simulationSubject: {
    type: "participant",
    participantId: null,
    displayName: "Andi",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
};

async function openHistory(
  page: Page,
  history: readonly TelefunRow[],
  extra: ApiMock[] = [],
) {
  const audit = await openHermeticShell(page, {
    path: "/telefun/history",
    apiMocks: [...telefunMocks(history), ...extra],
  });
  console.log("[audit]", formatAudit(audit));
  const table = page.getByRole("table", { name: "Daftar panggilan Telefun" });
  return { audit, table };
}

test.describe("Telefun Riwayat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("halaman Riwayat berupa tabel dengan filter status, cari, dan data sesi yang sebenarnya", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, FULL_HISTORY);
    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat panggilan" }),
    ).toBeVisible({ timeout: 20000 });

    await expect(table.getByRole("row")).toHaveCount(FULL_HISTORY.length + 1);
    await expect(table).toContainText("Rina Susanti");
    await expect(table).toContainText("7,6");

    await page.getByRole("button", { name: /^Gagal/ }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Pinjol Ilegal");

    await page.getByRole("button", { name: /^Rekaman tidak tersimpan/ }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Restrukturisasi Kredit");

    await page.getByRole("button", { name: /^Semua/ }).click();
    await page.getByRole("searchbox", { name: "Cari panggilan" }).fill("slik");
    await expect(table.getByRole("row")).toHaveCount(2);

    // Baris membuka tahap Telaah lewat URL.
    await page.getByRole("searchbox", { name: "Cari panggilan" }).fill("");
    await table.getByRole("link", { name: "Klaim Asuransi Ditolak" }).click();
    await expect(page).toHaveURL(/sesi=telefun-reviewed-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    await waitForMockedApi(audit, ["/telefun/sessions"]);
    expectHermetic(audit);
  });

  test("status analisis tampil jujur sebagai teks, skor hanya bila sudah dinilai", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, [
      REVIEWED_ROW,
      PENDING_ROW,
      { ...PENDING_ROW, id: "p2", scenario_title: "Proses", scoring_status: "processing" },
      {
        ...PENDING_ROW,
        id: "p3",
        scenario_title: "Gagal Otomatis",
        scoring_status: "failed",
        scoring_retryable: true,
      },
      {
        ...PENDING_ROW,
        id: "p4",
        scenario_title: "Selesai Tanpa Skor",
        scoring_status: "completed",
        score: null,
      },
    ]);
    await expect(table).toBeVisible({ timeout: 20000 });
    const rowOf = (title: string) =>
      table.getByRole("row").filter({ hasText: title });
    await expect(rowOf("Klaim Asuransi Ditolak")).toContainText("Sudah dinilai");
    await expect(rowOf("Tagihan Kartu Kredit")).toContainText("Menunggu analisis");
    await expect(rowOf("Proses")).toContainText("Sedang dianalisis");
    await expect(rowOf("Gagal Otomatis")).toContainText(
      "Analisis gagal, akan dicoba lagi otomatis",
    );
    // Selesai tanpa skor bukan keberhasilan, dan tidak memalsukan angka.
    await expect(rowOf("Selesai Tanpa Skor")).not.toContainText("Sudah dinilai");
    await expect(rowOf("Selesai Tanpa Skor")).toContainText("Hasil belum lengkap");
    expectHermetic(audit);
  });

  test("baris menandai peserta yang record-nya tidak tersedia", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, [
      UNAVAILABLE_PARTICIPANT_ROW,
    ]);
    await expect(table).toContainText("record peserta tidak lagi tersedia", {
      timeout: 20000,
    });
    expectHermetic(audit);
  });

  test("ekspor CSV memuat sesi dan penanda peserta tidak tersedia", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, [
      UNAVAILABLE_PARTICIPANT_ROW,
      REVIEWED_ROW,
    ]);
    await expect(table).toBeVisible({ timeout: 20000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^telefun_riwayat_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const csv = readFileSync((await download.path()) as string, "utf8");
    expect(csv).toContain("record peserta tidak lagi tersedia");
    expect(csv).toContain("Klaim Asuransi Ditolak");
    expect(csv).toContain("Rina Susanti");
    expectHermetic(audit);
  });

  test("menu baris berisi unduh rekaman dan hapus; kontrol memenuhi 44px", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, [REVIEWED_ROW]);
    await expect(
      page.getByRole("menuitem", { name: "Unduh rekaman" }),
    ).toHaveCount(0);

    const open = table.getByRole("link", { name: "Klaim Asuransi Ditolak" });
    const more = table.getByRole("button", {
      name: "Aksi lain untuk Klaim Asuransi Ditolak",
    });
    await expect(more).toBeVisible({ timeout: 20000 });
    for (const [label, control] of [
      ["Buka", open],
      ["Aksi lain", more],
    ] as const) {
      expect(
        await control.evaluate((el) => (el as HTMLElement).offsetHeight),
        label,
      ).toBeGreaterThanOrEqual(44);
    }

    await more.click();
    for (const name of ["Unduh rekaman", "Hapus"]) {
      const item = page.getByRole("menuitem", { name });
      await expect(item).toBeVisible();
      expect(
        await item.evaluate((el) => (el as HTMLElement).offsetHeight),
        name,
      ).toBeGreaterThanOrEqual(44);
    }
    expectHermetic(audit);
  });

  test("hapus satu sesi dan hapus semua memakai dialog konfirmasi aplikasi", async ({
    page,
  }) => {
    const { audit, table } = await openHistory(page, FULL_HISTORY, [
      {
        method: "DELETE",
        path: `/api/v1/telefun/history/${PENDING_ROW.id}`,
        body: { success: true, data: null },
      },
      {
        method: "DELETE",
        path: "/api/v1/telefun/history",
        body: { success: true, data: null },
      },
    ]);
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    await table
      .getByRole("button", { name: "Aksi lain untuk Tagihan Kartu Kredit" })
      .click({ timeout: 20000 });
    await page.getByRole("menuitem", { name: "Hapus" }).click();
    const confirm = page.getByRole("dialog", { name: "Hapus panggilan ini?" });
    await confirm.getByRole("button", { name: "Hapus panggilan" }).click();
    await expect(table).not.toContainText("Tagihan Kartu Kredit");

    await page.getByRole("button", { name: "Hapus semua riwayat" }).click();
    await page
      .getByRole("dialog", { name: "Hapus semua riwayat?" })
      .getByRole("button", { name: "Hapus semua" })
      .click();
    await expect(page.getByText("Belum ada panggilan")).toBeVisible();
    expect(nativeDialog).toBe(false);
    expectHermetic(audit);
  });

  test(`teks Riwayat Telefun minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const { audit, table } = await openHistory(page, FULL_HISTORY);
    await expect(table).toBeVisible({ timeout: 20000 });
    const offenders = await findTextBelowFloor(page.locator("main").first());
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
