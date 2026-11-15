/**
 * KETIK — landing berbasis data, ruang chat, tahap Telaah, dan halaman Riwayat
 * (hermetic). Semua `/api` dimock; mutasi data nyata tetap milik spec backend.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * supaya spec gagal ketika UI menyimpang dari kontrak bersama.
 */

import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { type KetikSessionHistoryItem } from "@trainers/types";
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  daysAgo,
  REVIEWED_SESSION,
  OLDER_REVIEWED,
  PENDING_SESSION,
  FAILED_SESSION,
  FULL_HISTORY,
  REVIEW_DETAIL,
  ANNOTATED_REVIEW_DETAIL,
  ketikMocks,
  reviewDetailMock,
  telaahPath,
  open,
} from "./helpers/ketikFlowHarness";

test.describe("KETIK Telaah (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("sesi belum ditelaah: agen dapat memulai secara manual tanpa pemicu otomatis", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath(PENDING_SESSION.id),
      ketikMocks(FULL_HISTORY),
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByText("Belum ditelaah")).toBeVisible({
      timeout: 20000,
    });
    await expect(
      result.getByRole("button", { name: /Mulai telaah/ }),
    ).toBeVisible();
    expect(
      audit.mockedApi.some((path) =>
        path.startsWith("POST /api/v1/ketik/review"),
      ),
    ).toBe(false);
    // Transkrip tetap bisa dibaca.
    await expect(
      page
        .getByRole("region", { name: "Percakapan" })
        .getByText("Mau cek SLIK."),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("telaah yang gagal dilaporkan jujur dan bisa diulang tanpa mengulang chat", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(PENDING_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: {
          success: true,
          data: { status: "failed", error: "AI_TIMEOUT" },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("button", { name: "Mulai telaah" })
      .click({ timeout: 20000 });

    const failure = result.getByRole("alert");
    await expect(failure).toContainText("Telaah belum berhasil");
    await expect(failure).toContainText("Percakapan Anda tetap tersimpan");
    await expect(failure).not.toContainText("AI_TIMEOUT");
    await expect(
      failure.getByRole("button", { name: "Coba telaah lagi" }),
    ).toBeVisible();
    // Tidak ada persen palsu.
    await expect(result.getByText(/\d+%/)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah yang berhasil langsung menampilkan hasil", async ({ page }) => {
    const pendingReviewed = {
      ...REVIEWED_SESSION,
      reviewStatus: "pending" as const,
    };
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks([pendingReviewed, OLDER_REVIEWED]),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: {
          success: true,
          data: { status: "completed", scores: REVIEW_DETAIL.scores },
        },
      },
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("button", { name: "Mulai telaah" })
      .click({ timeout: 20000 });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await waitForMockedApi(audit, ["POST /api/v1/ketik/review"]);
    expectHermetic(audit);
  });

  test("telaah ulang: konfirmasi, kirim rerun, lalu hasil baru menggantikan yang lama", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await expect(
      result.getByRole("heading", { name: "Inti kasus", exact: true }),
    ).toHaveCount(0);

    // Route ditambahkan setelah shell: Playwright mendahulukan yang terakhir.
    let rerunBody: unknown = null;
    await page.route("**/api/v1/ketik/review", async (route) => {
      rerunBody = route.request().postDataJSON();
      await route.fulfill({
        json: {
          success: true,
          data: { status: "completed", scores: REVIEW_DETAIL.scores },
        },
      });
    });
    await page.route(`**/api/v1/ketik/review/${REVIEWED_SESSION.id}`, (route) =>
      route.fulfill({ json: { success: true, data: ANNOTATED_REVIEW_DETAIL } }),
    );

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    const dialog = page.getByRole("dialog", { name: "Telaah ulang sesi ini?" });
    await expect(dialog).toContainText("hasil sekarang tetap dipakai");
    // Batal tidak mengirim apa pun.
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    expect(rerunBody).toBeNull();

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    await page
      .getByRole("dialog", { name: "Telaah ulang sesi ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect(
      result.getByRole("region", { name: "Ringkasan" }),
    ).toContainText("Tagihan kartu kredit konsumen tertagih dua kali");
    expect(rerunBody).toEqual({
      sessionId: REVIEWED_SESSION.id,
      rerun: true,
      requestId: expect.any(String),
    });
    expectHermetic(audit);
  });

  test("telaah ulang yang gagal melapor jujur dan hasil lama tetap tampil", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: {
          success: true,
          data: { status: "queued" },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await page.route(
      `**/api/v1/ketik/review/status/${REVIEWED_SESSION.id}`,
      (route) =>
        route.fulfill({
          json: {
            success: true,
            data: {
              status: "failed",
              previousKept: true,
              resultReady: true,
              scores: REVIEW_DETAIL.scores,
            },
          },
        }),
    );
    await result
      .getByRole("button", { name: "Telaah ulang" })
      .click({ timeout: 20000 });
    await page
      .getByRole("dialog", { name: "Telaah ulang sesi ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();

    const notice = result.getByRole("alert");
    await expect(notice).toContainText("Telaah ulang belum berhasil");
    await expect(notice).toContainText("Hasil sebelumnya tetap ditampilkan");
    await expect(notice).not.toContainText("AI_TIMEOUT");
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await waitForMockedApi(audit, ["POST /api/v1/ketik/review"]);
    expectHermetic(audit);
  });

  test("agen dapat menelaah ulang sesi sendiri secara manual", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath(REVIEWED_SESSION.id),
      [...ketikMocks(FULL_HISTORY), reviewDetailMock],
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await expect(
      result.getByRole("button", { name: "Telaah ulang" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("agen yang sudah memakai telaah ulang tidak melihat tombolnya lagi", async ({
    page,
  }) => {
    // kontrol-user-fase-5: agent dan leader menelaah ulang 1 kali per sesi.
    const audit = await open(
      page,
      telaahPath(REVIEWED_SESSION.id),
      [
        {
          method: "GET",
          path: `/api/v1/ketik/review/status/${REVIEWED_SESSION.id}`,
          body: {
            success: true,
            data: {
              status: "completed",
              resultReady: true,
              previousKept: false,
              scores: REVIEW_DETAIL.scores,
              rerunsLeft: 0,
            },
          },
        },
        ...ketikMocks(FULL_HISTORY),
        reviewDetailMock,
      ],
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await expect(result).toContainText(
      "Telaah ulang sudah dipakai untuk sesi ini.",
    );
    await expect(
      result.getByRole("button", { name: "Telaah ulang" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah ulang yang ditolak karena batas menampilkan alasannya", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath(REVIEWED_SESSION.id),
      [
        {
          method: "GET",
          path: `/api/v1/ketik/review/status/${REVIEWED_SESSION.id}`,
          body: {
            success: true,
            data: {
              status: "completed",
              resultReady: true,
              previousKept: false,
              scores: REVIEW_DETAIL.scores,
              rerunsLeft: 1,
            },
          },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/review",
          status: 429,
          body: {
            success: false,
            error: {
              code: "RERUN_LIMIT",
              message:
                "Telaah ulang untuk sesi ini sudah dipakai. Agent dan leader bisa menelaah ulang 1 kali per sesi.",
            },
          },
        },
        ...ketikMocks(FULL_HISTORY),
        reviewDetailMock,
      ],
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await result.getByRole("button", { name: "Telaah ulang" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Telaah ulang sesi ini?",
    });
    await expect(confirm).toContainText(
      "Anda bisa menelaah ulang 1 kali untuk sesi ini.",
    );
    await confirm.getByRole("button", { name: "Telaah ulang" }).click();
    await expect(result.getByRole("alert")).toContainText(
      "Telaah ulang untuk sesi ini sudah dipakai. Agent dan leader bisa menelaah ulang 1 kali per sesi.",
    );
    // Hasil lama tetap tampil dan tombol hilang.
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await expect(
      result.getByRole("button", { name: "Telaah ulang" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("unduh transkrip memberi CSV ber-BOM yang aman dari formula", async ({
    page,
  }) => {
    const csvSession: KetikSessionHistoryItem = {
      ...FAILED_SESSION,
      id: "ketik-csv-1",
      messages: [
        {
          id: "c1",
          sender: "consumer",
          text: 'Tagihan José #1, "urgent"\nBaris 2',
          timestamp: daysAgo(1),
        },
        {
          id: "c2",
          sender: "agent",
          text: "=HYPERLINK(1)",
          timestamp: daysAgo(1),
        },
      ],
    };
    const audit = await open(
      page,
      telaahPath(csvSession.id),
      ketikMocks([csvSession]),
      "agent",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Unduh transkrip" })
        .click({ timeout: 20000 }),
    ]);
    expect(download.suggestedFilename()).toBe(
      "ketik_transkrip_ketik-csv-1.csv",
    );
    const bytes = await readFile((await download.path())!);
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = bytes.subarray(3).toString("utf8");
    expect(csv.startsWith('"Pengirim","Pesan","Waktu"')).toBe(true);
    expect(csv).toContain('"Konsumen","Tagihan José #1, ""urgent""\nBaris 2"');
    // Sel yang diawali "=" diberi apostrof supaya tidak dieksekusi spreadsheet.
    expect(csv).toContain(`"Agen","'=HYPERLINK(1)"`);
    expect(csv).toContain("Andi");
    expect(csv).toContain("Tidak lagi tersedia");
    expectHermetic(audit);
  });

  test("sesi yang tidak ada lagi mempertahankan URL dengan tindakan pemulihan", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath("hilang"),
      ketikMocks(FULL_HISTORY),
    );
    await expect(page.getByRole("alert")).toBeVisible({
      timeout: 20000,
    });
    await expect(page).toHaveURL(/sesi=hilang/);
    expectHermetic(audit);
  });
});
