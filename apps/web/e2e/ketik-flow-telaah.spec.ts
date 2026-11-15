/**
 * KETIK — landing berbasis data, ruang chat, tahap Telaah, dan halaman Riwayat
 * (hermetic). Semua `/api` dimock; mutasi data nyata tetap milik spec backend.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * supaya spec gagal ketika UI menyimpang dari kontrak bersama.
 */

import { expect, test } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import {
  REVIEWED_SESSION,
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

  test("kolom telaah tanpa tab: unik, navigasi bagian, disclosure, dan sembunyikan", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const detail = {
      ...ANNOTATED_REVIEW_DETAIL,
      review: {
        ...ANNOTATED_REVIEW_DETAIL.review,
        coachingFocus: [
          " Verifikasi identitas di awal ",
          "Konfirmasi data sebelum memberi solusi.",
        ],
      },
    };
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      { ...reviewDetailMock, body: { success: true, data: detail } },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await expect(result.getByRole("tab")).toHaveCount(0);
    for (const note of ANNOTATED_REVIEW_DETAIL.review.education.agentNotes) {
      await expect(result.getByText(note.note, { exact: true })).toHaveCount(1);
    }
    await expect(
      result.getByText("Menyapa dengan nama", { exact: true }),
    ).toHaveCount(0);
    await expect(
      result
        .getByRole("region", { name: "Langkah berikutnya" })
        .getByRole("listitem"),
    ).toHaveCount(2);
    const probing = result.locator(
      'details[data-review-target="scores-probing"]',
    );
    const resolution = result.locator(
      'details[data-review-target="scores-resolution"]',
    );
    await expect(probing).toHaveAttribute("open", "");
    await expect(resolution).not.toHaveAttribute("open");
    await result
      .getByRole("button", { name: "Jelaskan skor Resolusi" })
      .click();
    await expect(resolution).toHaveAttribute("open", "");
    await expect(resolution.locator("summary")).toBeFocused();
    await expect(
      result.getByText("Diagnosis Resolusi.", { exact: false }),
    ).toHaveCount(1);
    const expectControlsResolve = async (count: number) => {
      const controls = page.locator(
        '[data-module="ketik"] > header [aria-controls], aside[aria-label="Telaah disembunyikan"] [aria-controls]',
      );
      await expect(controls).toHaveCount(count);
      for (const control of await controls.all()) {
        const ids = (await control.getAttribute("aria-controls"))!.split(/\s+/);
        for (const id of ids)
          await expect(page.locator("#" + id)).toHaveCount(1);
      }
    };
    const nav = result.getByRole("navigation", { name: "Lompat ke bagian" });
    await expect(nav).toHaveCSS("position", "sticky");
    await expect(nav).toHaveCSS("top", "0px");
    await expect(nav.getByRole("button")).toHaveText([
      "Perbaiki 2",
      "Pertanyaan 2",
      "Alasan skor",
      "Sudah baik 1",
      "Ejaan 1",
      "Langkah berikutnya",
    ]);
    expect(
      await nav
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.every((button) => (button as HTMLElement).offsetHeight >= 44),
        ),
    ).toBe(true);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const transcript = page.getByRole("region", { name: "Percakapan" });
      const transcriptScroll = await transcript.evaluate((el) => el.scrollTop);
      await nav.getByRole("button", { name: "Alasan skor" }).click();
      const scores = result.getByRole("region", {
        name: "Alasan skor",
        exact: true,
      });
      await expect(scores).toBeFocused();
      await expect(
        scores.getByRole("heading", { name: "Alasan skor", exact: true }),
      ).toBeInViewport();
      expect(
        (await scores.getByRole("heading").boundingBox())!.y,
      ).toBeGreaterThanOrEqual(
        (await nav.boundingBox())!.y + (await nav.boundingBox())!.height,
      );
      await nav.getByRole("button", { name: "Langkah berikutnya" }).click();
      const next = result.getByRole("region", { name: "Langkah berikutnya" });
      await expect(next).toBeFocused();
      await expect(next).toBeInViewport();
      if (width >= 1024)
        expect(await transcript.evaluate((el) => el.scrollTop)).toBe(
          transcriptScroll,
        );
      expect(
        await page.evaluate(() => document.documentElement.scrollTop),
      ).toBe(0);
      const hide = page.getByRole("button", { name: "Sembunyikan telaah" });
      await expect(hide).toHaveAttribute(
        "aria-controls",
        "ketik-review-result",
      );
      await expect(hide).toHaveAttribute("aria-expanded", "true");
      await expectControlsResolve(1);
      const oldWidth = (await transcript.boundingBox())!.width;
      await hide.click();
      await expectControlsResolve(2);
      await expect(page.locator("#ketik-review-result")).toHaveAttribute(
        "hidden",
        "",
      );
      await expect(page.locator("#ketik-review-result")).not.toBeVisible();
      await expect(result).toHaveCount(0);
      const show = page.getByRole("button", {
        name: "Tampilkan telaah",
        exact: true,
      });
      await expect(show).toHaveCount(2);
      await expect(show.first()).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByRole("complementary", { name: "Telaah disembunyikan" }),
      ).toContainText("Skor82");
      if (width >= 1024)
        expect((await transcript.boundingBox())!.width).toBeGreaterThan(
          oldWidth,
        );
      await page.screenshot({
        path: test.info().outputPath(`hidden-review-${width}.png`),
        animations: "disabled",
      });
      await show.last().click();
      await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
      await expectControlsResolve(1);
      // Revealing via a transcript mark must focus even the same target again.
      const marker = transcript.getByRole("button", {
        name: "Lihat kalimat agen 1",
      });
      for (let repeat = 0; repeat < 2; repeat++) {
        await page.getByRole("button", { name: "Sembunyikan telaah" }).click();
        await marker.click();
        await expect(
          result.locator('[data-review-target="notes-0"]'),
        ).toBeFocused();
        await expect(result).toBeVisible();
        await expectControlsResolve(1);
      }
      await page.screenshot({
        path: test.info().outputPath(`scroll-review-${width}.png`),
        animations: "disabled",
      });
    }
    await page.getByRole("button", { name: "Sembunyikan telaah" }).click();
    await page.reload();
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    expectHermetic(audit);
  });

  test("skor akhir tampil pertama, lima aspek, dan temuan menunjuk nomor pesan", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);

    const stage = page.getByRole("navigation", { name: "Tahap latihan" });
    await expect(stage.getByText("Telaah")).toHaveAttribute(
      "aria-current",
      "step",
      {
        timeout: 20000,
      },
    );

    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await expect(result).toContainText("Baik");
    // Naik 6 dari sesi sebelumnya yang ditelaah (76).
    await expect(result).toContainText("naik 6 dari sesi sebelumnya");

    const aspects = result.getByRole("list", { name: "Skor per aspek" });
    await expect(aspects.getByRole("listitem")).toHaveCount(5);
    await expect(aspects).toContainText("Probing");

    await expect(result.getByRole("tab")).toHaveCount(0);
    await expect(result.getByText("Cara memperbaiki Probing.")).toBeVisible();

    // Ejaan: menyebut nomor pesan, tingkat dalam bahasa Indonesia.
    await result
      .getByRole("navigation", { name: "Lompat ke bagian" })
      .getByRole("button", { name: /Ejaan/ })
      .click();
    const finding = result.getByRole("button", { name: /Pesan 2/ });
    await expect(finding).toContainText("tagihn");
    await expect(finding).toContainText("tagihan");
    await expect(finding).toContainText("Ringan");
    await expect(result.getByText("minor", { exact: true })).toHaveCount(0);

    // Typo digarisbawahi di kalimatnya, dan klik temuan menyorot pesannya.
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(
      transcript.locator("mark", { hasText: "tagihn" }),
    ).toBeVisible();
    await finding.click();
    await expect(transcript.getByTestId("ketik-message-2")).toHaveAttribute(
      "data-highlighted",
      "true",
    );

    await expect(result.getByText(/verifikasi data terlambat/)).toBeVisible();

    await waitForMockedApi(audit, [`/ketik/review/${REVIEWED_SESSION.id}`]);
    expectHermetic(audit);
  });

  test("telaah yang sudah selesai dibuka dari jawaban status, tanpa membaca telaah dua kali", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
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
            rerunsLeft: null,
            detail: REVIEW_DETAIL,
          },
        },
      },
      // Tanpa `reviewDetailMock`: permintaan detail terpisah akan diblokir.
      ...ketikMocks(FULL_HISTORY),
    ]);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await result
      .getByRole("navigation", { name: "Lompat ke bagian" })
      .getByRole("button", { name: /Ejaan/ })
      .click();
    await expect(result.getByRole("button", { name: /Pesan 2/ })).toContainText(
      "tagihn",
    );
    expect(audit.mockedApi).not.toContain(
      `GET /api/v1/ketik/review/${REVIEWED_SESSION.id}`,
    );
    expectHermetic(audit);
  });

  test("lampiran Telaah tampil dari detail sesi dan bisa dibuka dengan keyboard setelah reload", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=";
    const messages = REVIEWED_SESSION.messages.map((message) =>
      message.id === "m1"
        ? {
            ...message,
            text: "Tagihan saya dobel. [SEND_IMAGE:0] [SEND_IMAGE:2]",
          }
        : message,
    );
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      {
        method: "GET",
        path: `/api/v1/ketik/history/${REVIEWED_SESSION.id}`,
        body: {
          success: true,
          data: {
            ...REVIEWED_SESSION,
            messages,
            previousFinalScore: null,
            attachments: [
              { index: 0, src: png, alt: "Bukti tagihan asli" },
              { index: 2, src: png, alt: "Bukti pembayaran" },
            ],
          },
        },
      },
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);
    const transcript = page.getByRole("region", { name: "Percakapan" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const button = transcript.getByRole("button", {
        name: "Buka lampiran 1: Bukti tagihan asli",
      });
      await expect(button).toBeVisible();
      await button.focus();
      await page.keyboard.press("Enter");
      const preview = page.getByRole("dialog", { name: "Lampiran 1" });
      await expect(preview).toBeVisible();
      const image = preview.getByRole("img", { name: "Bukti tagihan asli" });
      await expect(image).toHaveAttribute("src", png);
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      await page.screenshot({
        path: test.info().outputPath(`attachment-preview-${width}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(preview).toBeHidden();
      await expect(button).toBeFocused();
      await transcript
        .getByRole("button", { name: "Buka lampiran 3: Bukti pembayaran" })
        .click();
      await page
        .getByRole("dialog", { name: "Lampiran 3" })
        .getByRole("button", { name: "Tutup lampiran" })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.reload();
    await expect(
      transcript.getByRole("button", {
        name: "Buka lampiran 1: Bukti tagihan asli",
      }),
    ).toBeVisible();
    await expect(
      transcript.getByRole("button", { name: "Lihat pertanyaan konsumen A" }),
    ).toBeVisible();
    await expect(
      transcript
        .getByTestId("ketik-message-2")
        .locator("mark mark", { hasText: "tagihn" }),
    ).toBeVisible();
    await waitForMockedApi(audit, [
      `/ketik/history/${REVIEWED_SESSION.id}`,
      `/ketik/review/${REVIEWED_SESSION.id}`,
    ]);
    expect(pageErrors).toEqual([]);
    expectHermetic(audit);
  });

  test("lampiran lama yang hilang dan gambar rusak dijelaskan tanpa mengganti dengan gambar lain", async ({
    page,
  }) => {
    const messages = [
      {
        ...REVIEWED_SESSION.messages[0],
        text: "[SEND_IMAGE:0] [SEND_IMAGE:1]",
      },
      ...REVIEWED_SESSION.messages.slice(1),
    ];
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      {
        method: "GET",
        path: `/api/v1/ketik/history/${REVIEWED_SESSION.id}`,
        body: {
          success: true,
          data: {
            ...REVIEWED_SESSION,
            messages,
            previousFinalScore: null,
            attachments: [
              {
                index: 0,
                src: "data:image/png;base64,broken",
                alt: "Bukti rusak",
              },
            ],
          },
        },
      },
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(transcript).toContainText(
      "Lampiran 2 tidak tersedia dalam riwayat sesi ini.",
    );
    await transcript
      .getByRole("button", { name: "Buka lampiran 1: Bukti rusak" })
      .click();
    const preview = page.getByRole("dialog", { name: "Lampiran 1" });
    await expect(preview).toContainText("Gambar lampiran tidak dapat dimuat.");
    await preview.getByRole("button", { name: "Coba muat lagi" }).click();
    await expect(preview.getByRole("alert")).toContainText(
      "Gambar lampiran tidak dapat dimuat.",
    );
    await preview.getByRole("button", { name: "Tutup lampiran" }).click();
    expectHermetic(audit);
  });

  test("feedback berbukti: skor tinggi tetap menampilkan kesalahan dan kekuatan berupa kalimat agen", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("navigation", { name: "Lompat ke bagian" })
      .getByRole("button", { name: /Perbaiki/ })
      .click();
    await expect(result).toContainText(
      "Belum ada langkah atau estimasi waktu.",
    );
    await expect(result).toContainText("Verifikasi terlambat");
    await result
      .getByRole("navigation", { name: "Lompat ke bagian" })
      .getByRole("button", { name: /Sudah baik/ })
      .click();
    await expect(result).toContainText(
      "Sapaan sopan dan menyebut panggilan konsumen.",
    );
    await expect(
      result
        .getByRole("list", { name: "Respons agen yang sudah baik" })
        .getByRole("button", { name: /Pesan 2.*Baik Bu/ }),
    ).toBeVisible();
    await expect(
      result.locator('details[data-review-target="scores-resolution"]'),
    ).not.toHaveAttribute("open");
    await result
      .getByRole("button", { name: /Jelaskan skor Resolusi/ })
      .click();
    await expect(
      result.locator('details[data-review-target="scores-resolution"]'),
    ).toHaveAttribute("open", "");
    const resolution = result.locator(
      'details[data-review-target="scores-resolution"]',
    );
    await expect(resolution).toContainText("Cara memperbaiki Resolusi.");
    await expect(resolution).toContainText("Bukti percakapan");
    await expect(resolution).toContainText("Diagnosis Resolusi.");
    expectHermetic(audit);
  });

  test("penanda anotasi lompat dua arah, berulang, dengan keyboard di desktop dan mobile", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", { name: "Percakapan" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const marker = transcript.getByRole("button", {
        name: "Lihat kalimat agen 1",
      });
      await marker.focus();
      await page.keyboard.press("Enter");
      const note = result.locator('[data-review-target="notes-0"]');
      await expect(note).toBeFocused();
      await note.getByRole("button", { name: /Pesan 2/ }).click();
      await expect(transcript.getByTestId("ketik-message-2")).toBeFocused();
      await marker.click();
      await expect(note).toBeFocused();
      await page.getByRole("button", { name: "Sembunyikan telaah" }).click();
      await transcript
        .getByRole("button", { name: "Lihat kalimat agen 2" })
        .click();
      await expect(
        result.locator('[data-review-target="notes-1"]'),
      ).toBeFocused();
      await transcript
        .getByRole("button", { name: "Lihat pertanyaan konsumen B" })
        .click();
      const point = result.locator('[data-review-target="questions-1"]');
      await expect(point).toBeFocused();
      await expect(point).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`annotation-navigation-${width}.png`),
      });
    }
    expect(errors).toEqual([]);
    expectHermetic(audit);
  });

  test("penjelasan skor lama mengungkap keterbatasan dan tidak menyebut template sebagai bukti", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result.getByRole("button", { name: /Jelaskan skor Empati/ }).click();
    const aspect = result.locator(
      'details[data-review-target="scores-empathy"]',
    );
    await expect(aspect).toContainText(
      "Alasan skor berdasarkan percakapan belum tersedia",
    );
    await expect(aspect).toContainText("Panduan umum");
    await expect(aspect).not.toContainText("Bukti percakapan");
    expectHermetic(audit);
  });

  test("anotasi: inti kasus, pertanyaan konsumen terjawab, dan kalimat agen yang dinilai", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });

    // Inti kasus tampil sebelum rincian.
    const caseCore = result.getByRole("region", { name: "Ringkasan" });
    await expect(caseCore).toContainText(
      "tertagih dua kali dan ia minta segera",
    );

    await expect(
      result.getByRole("region", { name: /Pertanyaan konsumen/ }),
    ).toContainText("0 dari 2 terjawab");
    const points = result.getByRole("list", { name: "Pertanyaan konsumen" });
    await expect(points.getByRole("listitem")).toHaveCount(2);
    const pointA = points.locator('[data-review-target="questions-0"]');
    await expect(points.getByRole("listitem").first()).toHaveAttribute(
      "data-review-target",
      "questions-1",
    );
    await expect(pointA).toContainText("A");
    await expect(pointA).toContainText("Sebagian");
    await expect(pointA).toContainText("Kenapa tagihan tertagih dua kali");
    await expect(pointA).toContainText("belum menjelaskan penyebabnya");
    await expect(
      pointA.getByRole("button", { name: /Dijawab di pesan 2/ }),
    ).toBeVisible();
    const pointB = points.locator('[data-review-target="questions-1"]');
    await expect(pointB).toContainText("Belum terjawab");
    await expect(pointB).toContainText(
      "Belum ada balasan agen untuk poin ini.",
    );

    // Kutipan konsumen ditandai di transkrip; tombol pesan menyorot pesannya.
    await expect(
      transcript
        .getByTestId("ketik-message-1")
        .locator("mark", { hasText: "Tagihan saya dobel" }),
    ).toBeVisible();
    await expect(
      transcript
        .getByTestId("ketik-message-3")
        .locator("mark", { hasText: "Tolong cepat ya" }),
    ).toBeVisible();
    await pointB.getByRole("button", { name: /Pesan 3/ }).click();
    await expect(transcript.getByTestId("ketik-message-3")).toHaveAttribute(
      "data-highlighted",
      "true",
    );

    // Kalimat agen: catatan, aspek, dan kalimat yang lebih tepat.
    const fix = result.locator('[data-review-target="notes-0"]');
    await expect(fix).toHaveCount(1);
    await expect(fix).toContainText("Resolusi");
    await expect(fix).toContainText("Perlu diperbaiki");
    await expect(fix).toContainText("Belum ada langkah atau estimasi waktu.");
    await expect(fix).toContainText(
      "Kalimat yang lebih tepat: Saya cek transaksi ganda Ibu sekarang",
    );
    const good = result.locator('[data-review-target="notes-1"]');
    await expect(good).toHaveCount(1);
    await expect(good).toContainText("Sudah tepat");
    await expect(good).not.toContainText("Kalimat yang lebih tepat");

    // Kalimat agen ditandai; typo di dalamnya tetap digarisbawahi.
    const agentMessage = transcript.getByTestId("ketik-message-2");
    await expect(
      agentMessage.locator("mark", { hasText: "saya cek tagihn Ibu" }),
    ).toBeVisible();
    await expect(
      agentMessage.locator("mark mark", { hasText: "tagihn" }),
    ).toBeVisible();
    await fix.getByRole("button", { name: /Pesan 2/ }).click();
    await expect(agentMessage).toHaveAttribute("data-highlighted", "true");

    expectHermetic(audit);
  });

  test("telaah lama tanpa anotasi: belum tersedia dan kekuatan menjadi fallback Sudah baik", async ({
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
    await expect(result.getByRole("tab")).toHaveCount(0);
    await expect(
      result.getByRole("region", { name: "Sudah baik", exact: true }),
    ).toContainText("Menyapa dengan nama");
    await expect(
      result.getByText("Menyapa dengan nama", { exact: true }),
    ).toHaveCount(1);
    await expect(result).toContainText("Belum tersedia untuk telaah ini");
    await expect(result).toContainText(
      "Jalankan Telaah ulang untuk melengkapinya",
    );
    expectHermetic(audit);
  });

  test("tanda anotasi dan panel hasil memenuhi kontras di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    // Closed native details defer descendant styling; inspect each disclosed body.
    for (const disclosure of await result.locator("details").all()) {
      if ((await disclosure.getAttribute("open")) === null)
        await disclosure.locator("summary").click();
    }
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const marks = await findLowContrastText(transcript, {
        selector: "mark, mark *, li p span",
      });
      expect(marks, `${theme}: ${marks.join("\n")}`).toEqual([]);
      const panel = await findLowContrastText(result, {
        selector: "section *",
        leafOnly: true,
      });
      expect(panel, `${theme}: ${panel.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks tahap Telaah minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        ...reviewDetailMock,
        body: { success: true, data: ANNOTATED_REVIEW_DETAIL },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    for (const disclosure of await result.locator("details").all()) {
      if ((await disclosure.getAttribute("open")) === null)
        await disclosure.locator("summary").click();
    }
    const offenders = await findTextBelowFloor(page.locator("body"));
    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
