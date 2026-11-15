/**
 * PDKT — landing + modal workspace (hermetic).
 *
 * Modul terbesar tanpa E2E (plan 025 Wave 3, spec #10–#12). Semua `/api` dimock;
 * mutasi data nyata tetap milik spec backend loopback.
 *
 * Fixture memakai `data: null` / `[]`, yaitu keadaan pengguna baru tanpa
 * settings tersimpan — bentuk yang sama dengan yang diasumsikan unit test
 * `pdkt-landing` (`useApi` mengembalikan `data: null`). Handler asli juga
 * membalas `null` saat `readPdktSettings` tidak menemukan settings.
 */

import { expect, test } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { findTextBelowFloor } from "./helpers/typographyFloor";
import type { SessionHistory } from "../src/routes/pdkt/utils/sessionHistory";
import {
  REPLIED_MAIL,
  EVALUATED_HISTORY,
  pdktMocks,
  workspaceMarker,
  openWorkspace,
  stageNav,
} from "./helpers/pdktFlowHarness";

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("tahap Telaah: skor, rincian, catatan bernomor, dan contoh balasan", async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("net::ERR_FAILED")
      )
        runtimeErrors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reply = "Terima kasih, kami cek transaksinya.";
    const matchedQuote = "kami cek transaksinya";
    const start = reply.indexOf(matchedQuote);
    const inboundBody =
      "Saldo terpotong tetapi transaksi gagal.\n\nKapan saldo kembali? Mohon nomor tiket.";
    const consumerPoints = [
      {
        quote: "Kapan saldo kembali?",
        summary: "Waktu pengembalian saldo",
        status: "partial",
        reason: "Belum ada batas waktu.",
        start: inboundBody.indexOf("Kapan"),
        end: inboundBody.indexOf("Kapan") + "Kapan saldo kembali?".length,
        replyQuote: "kami",
        replyEnd: start + 4,
      },
      {
        quote: "Saldo terpotong tetapi transaksi gagal.",
        summary: "Transaksi gagal",
        status: "answered",
        reason: null,
        start: 0,
        end: "Saldo terpotong tetapi transaksi gagal.".length,
        replyQuote: "kami",
        replyEnd: start + 4,
      },
      {
        quote: "Mohon nomor tiket.",
        summary: "Nomor tiket pengaduan",
        status: "unanswered",
        reason: "Nomor tiket belum diberikan.",
        start: inboundBody.indexOf("Mohon"),
        end: inboundBody.length,
        replyQuote: null,
        replyEnd: null,
      },
      {
        quote: "Mohon status laporan.",
        summary: "Status laporan",
        status: "unanswered",
        reason: "Status belum diberikan.",
        start: null,
        end: null,
        replyQuote: null,
        replyEnd: null,
      },
    ];
    const base = EVALUATED_HISTORY[0].evaluation as Record<string, unknown>;
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...base,
          consumerPoints,
          scoreBreakdown: {
            recipientDirectionScore: 90,
            normativeResponseScore: 70,
            clarityScore: 85,
            typoScore: 88,
            templateComplianceScore: 82,
          },
          edu: {
            dimensionTips: {
              normative: "Tuliskan batas waktu tindak lanjut.",
              clarity: "Pecah kalimat panjang meski skor kejelasan tinggi.",
            },
            dimensionExplanations: {
              clarity: {
                reason:
                  "Pembuka jelas tetapi kalimat tindak lanjut terlalu panjang.",
                quote: matchedQuote,
              },
            },
            actionItems: [
              {
                dimension: "normative",
                text: "Sebut kanal pengaduan resmi.",
                example: "Silakan hubungi 157.",
                quote: matchedQuote,
                priorityRank: 1,
              },
              {
                dimension: "clarity",
                text: "Pecah kalimat pembuka.",
                priorityRank: 2,
              },
            ],
            suggestedRewrite: {
              body: "Terima kasih, kami cek transaksi Ibu.",
              highlights: ["transaksi Ibu"],
            },
          },
          expectedAnswerAlignment: {
            category: "Hampir sesuai",
            reason: "Solusi benar tetapi tanpa batas waktu.",
          },
          annotations: [
            {
              quote: matchedQuote,
              dimension: "normative",
              note: "Tambahkan pengantar sebelum masuk ke topik transaksi.",
              kind: "transition",
              example: "Selanjutnya, terkait transaksi Ibu, …",
              start,
              end: start + matchedQuote.length,
            },
            {
              quote: "nomor tiket pengaduan",
              dimension: "clarity",
              note: "Tambahkan nomor tiket supaya konsumen bisa menindaklanjuti.",
              start: null,
              end: null,
            },
          ],
        },
      },
    ] as unknown as SessionHistory[];
    const reviewedMail = {
      ...REPLIED_MAIL,
      detail: {
        ...REPLIED_MAIL.detail,
        inbound_email: {
          ...REPLIED_MAIL.detail.inbound_email,
          body: inboundBody,
        },
      },
    };
    const audit = await openWorkspace(page, pdktMocks(history, [reviewedMail]));

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);

    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toHaveCount(0);
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );

    const summary = page.getByRole("region", { name: "Ringkasan skor" });
    await expect(summary.getByTestId("pdkt-review-score")).toHaveText("85");
    await expect(summary).toContainText("Perbaiki ini dulu");
    await expect(summary).toContainText("Sebut kanal pengaduan resmi.");
    await expect(summary).toContainText("Silakan hubungi 157.");
    await expect(summary).toContainText("Aspek: Kualitas OJK");
    await expect(summary).toContainText("Pecah kalimat pembuka.");
    // Langkah perbaikan menunjuk kalimatnya di balasan tanpa perlu menggulir
    // mencari sendiri; langkah tanpa kutipan tidak diberi tautan.
    await expect(summary).toContainText(`Di balasan Anda: “${matchedQuote}”`);
    await expect(
      summary.getByRole("link", { name: "Lihat kalimat ini di balasan" }),
    ).toHaveCount(1);
    await expect(summary).toContainText("Hampir sesuai");
    await expect(summary).toContainText("3 menit 45 detik");

    const breakdown = page.getByRole("region", { name: "Rincian skor" });
    const rows = breakdown.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Arah penerima");
    await expect(rows.nth(0)).toContainText("90");
    await expect(breakdown.getByText("Perlu perbaikan")).toHaveCount(1);
    await expect(rows.nth(1)).toContainText("Perlu perbaikan");
    await expect(rows.nth(1)).toContainText(
      "Tuliskan batas waktu tindak lanjut.",
    );
    await expect(rows.nth(2)).toContainText(
      "Pecah kalimat panjang meski skor kejelasan tinggi.",
    );
    await expect(rows.nth(2)).toContainText(
      "Pembuka jelas tetapi kalimat tindak lanjut terlalu panjang.",
    );
    await expect(rows.nth(2)).toContainText(matchedQuote);
    await expect(rows.nth(0)).toContainText(
      "Alasan penilaian dengan kutipan belum tersedia",
    );
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      expect(
        await findLowContrastText(breakdown, {
          selector: "p, span, blockquote, h3",
          leafOnly: true,
        }),
      ).toEqual([]);
    }
    await breakdown.screenshot({
      path: test.info().outputPath("pdkt-score-explanations.png"),
    });

    const answer = page.getByRole("region", { name: "Balasan Anda" });
    const marks = answer.locator("mark");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText(`${matchedQuote}1`);
    await expect(answer).toContainText("Terima kasih,");

    const fixes = page.getByRole("region", { name: "Catatan pada balasan" });
    const notes = fixes.getByRole("listitem");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toContainText(
      "Tambahkan pengantar sebelum masuk ke topik transaksi.",
    );
    await expect(notes.nth(1)).toContainText("Tidak ditandai di balasan");
    await expect(notes.nth(0)).toContainText("Kalimat penghubung");
    await expect(notes.nth(0)).toContainText(
      "Contoh: “Selanjutnya, terkait transaksi Ibu, …”",
    );

    // Penanda dan catatan saling tertaut; pembaca layar mendengar "catatan 1",
    // bukan angka yang menempel di kata terakhir.
    const markLink = answer.getByRole("link", { name: "Lihat catatan 1" });
    // Lompatan hanya menggulir area Telaah; kerangka aplikasi di atasnya
    // (overflow tersembunyi, tidak bisa digulir balik) tidak boleh bergeser.
    // Layar pendek memaksa lompatan benar-benar menggulir.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 560 });
    const shiftedShell = () =>
      summary.evaluate((el) => {
        const shifted: string[] = [];
        let node: Element | null = el.closest("[data-review-scroll]");
        if (!node) return ["data-review-scroll tidak ada"];
        for (node = node.parentElement; node; node = node.parentElement) {
          if (node.scrollTop !== 0)
            shifted.push(`${node.tagName}.${node.className}`);
        }
        if (window.scrollY !== 0) shifted.push("window");
        return shifted;
      });
    await summary
      .getByRole("link", { name: "Lihat kalimat ini di balasan" })
      .click();
    await expect(markLink).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    await markLink.click();
    await expect(notes.nth(0)).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    await expect(fixes.getByRole("link")).toHaveCount(1);
    await fixes
      .getByRole("link", { name: "Kembali ke kalimat bertanda 1" })
      .click();
    await expect(markLink).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    if (viewport) await page.setViewportSize(viewport);

    // Email konsumen dan balasan satu permukaan perbandingan; email konsumen
    // tetap terlihat saat catatan panjang digulir.
    const comparison = page.getByRole("region", {
      name: "Perbandingan email",
    });
    await expect(
      comparison.getByRole("region", { name: "Email konsumen" }),
    ).toBeVisible();
    await expect(
      comparison.getByRole("region", { name: "Balasan Anda" }),
    ).toBeVisible();

    // Email konsumen selalu terbuka dan berdampingan dengan balasan; catatan
    // berada di kolom balasan. Di ponsel keduanya bertumpuk, konsumen dulu.
    const consumer = page.getByRole("region", { name: "Email konsumen" });
    await expect(consumer).toContainText(
      "Saldo terpotong tetapi transaksi gagal.",
    );
    const points = page.getByRole("region", {
      name: "Poin konsumen",
      exact: true,
    });
    const pointRows = points.getByRole("listitem");
    await expect(consumer.locator("mark")).toHaveCount(3);
    await expect(pointRows).toHaveCount(4);
    await expect(pointRows.nth(0)).toContainText("Terjawab");
    await expect(pointRows.nth(1)).toContainText("Sebagian");
    await expect(pointRows.nth(2)).toContainText("Belum terjawab");
    await expect(pointRows.nth(3)).toContainText("Tidak ditandai di email");
    await expect(
      points.getByRole("heading", { name: "Poin konsumen", level: 4 }),
    ).toBeVisible();
    // Paragraf email tetap seperti sebelum ditelaah (EmailBody: satu <p> per
    // paragraf, leading-6 = 21px pada root 14px); status tidak hanya
    // dibedakan lewat warna.
    await expect(consumer.locator("p")).toHaveCount(2);
    await expect(consumer.locator("p").first()).toHaveCSS(
      "line-height",
      "21px",
    );
    expect(
      await consumer
        .locator("mark")
        .evaluateAll((els) =>
          els.map((el) => getComputedStyle(el).textDecorationStyle),
        ),
    ).toEqual(["solid", "dashed", "dotted"]);
    const pointListSizes = await points.getByRole("link").evaluateAll((els) =>
      els.map((el) => ({
        width: (el as HTMLElement).offsetWidth,
        height: (el as HTMLElement).offsetHeight,
      })),
    );
    expect(pointListSizes.length).toBeGreaterThan(0);
    expect(
      pointListSizes.filter(({ width, height }) => width < 44 || height < 44),
    ).toEqual([]);
    // Label huruf di dalam teks tidak merenggangkan baris, tetapi area
    // sentuhnya tetap 44px: keempat sudut kotak 44px mengenai link-nya.
    for (const links of [
      consumer.locator("mark a"),
      answer.getByRole("link", { name: /^Lihat poin konsumen/ }),
    ]) {
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index++) {
        const link = links.nth(index);
        await link.scrollIntoViewIfNeeded();
        const fit = await link.evaluate((el) => {
          const text = el.closest("p") as HTMLElement;
          const box = el.getBoundingClientRect();
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const centerHit = document.elementFromPoint(cx, cy);
          // Target yang bersebelahan boleh berbagi area sentuh (pengecualian
          // jarak WCAG 2.5.8); yang tidak boleh adalah sudut jatuh ke teks biasa.
          const misses = [
            [-21, -21],
            [21, -21],
            [-21, 21],
            [21, 21],
          ].filter(([dx, dy]) => {
            const hit = document.elementFromPoint(cx + dx, cy + dy);
            return !hit?.closest("a");
          });
          return {
            height: box.height,
            lineHeight: parseFloat(getComputedStyle(text).lineHeight),
            centerOnSelf: Boolean(centerHit && el.contains(centerHit)),
            misses: misses.length,
          };
        });
        expect(fit.height).toBeLessThanOrEqual(fit.lineHeight);
        expect(fit.centerOnSelf).toBe(true);
        expect(fit.misses).toBe(0);
      }
    }

    const pointMark = consumer.getByRole("link", {
      name: "Lihat poin konsumen A, terjawab",
      exact: true,
    });
    await expect(pointMark).toHaveText("A");
    await pointMark.click();
    await expect(pointRows.nth(0)).toBeFocused();
    await points
      .getByRole("link", {
        name: "Kembali ke poin konsumen A di email",
        exact: true,
      })
      .click();
    await expect(pointMark).toBeFocused();
    const replyPoint = answer.getByRole("link", {
      name: "Lihat poin konsumen A, terjawab",
      exact: true,
    });
    await expect(replyPoint).toHaveText("A");
    await expect(
      answer.getByRole("link", {
        name: "Lihat poin konsumen B, sebagian",
        exact: true,
      }),
    ).toHaveText("B");
    // Titik sisip yang berada di dalam catatan dipindahkan ke akhir, tanpa mark baru.
    await expect(answer.locator("mark a")).toHaveCount(1);
    await expect(marks).toHaveCount(1);
    await replyPoint.click();
    await expect(pointRows.nth(0)).toBeFocused();
    expect(await consumer.evaluate((el) => getComputedStyle(el).position)).toBe(
      "sticky",
    );
    await expect(
      page.getByRole("region", { name: "Telaah lama tanpa penanda" }),
    ).toHaveCount(0);
    const box = async (locator: typeof consumer) => {
      const rect = await locator.boundingBox();
      expect(rect).not.toBeNull();
      return rect as NonNullable<typeof rect>;
    };
    const [consumerBox, answerBox, fixesBox] = await Promise.all([
      box(consumer),
      box(answer),
      box(fixes),
    ]);
    expect(consumerBox.x + consumerBox.width).toBeLessThanOrEqual(answerBox.x);
    expect(Math.abs(consumerBox.y - answerBox.y)).toBeLessThan(2);
    expect(Math.abs(fixesBox.x - answerBox.x)).toBeLessThan(2);
    expect(fixesBox.y).toBeGreaterThan(answerBox.y);

    await page.setViewportSize({ width: 390, height: 844 });
    const [phoneConsumer, phoneAnswer] = await Promise.all([
      box(consumer),
      box(answer),
    ]);
    expect(phoneConsumer.y + phoneConsumer.height).toBeLessThanOrEqual(
      phoneAnswer.y,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await consumer.screenshot({ path: "/tmp/pdkt-telaah-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 800 });

    const other = page.getByRole("region", { name: "Temuan lain" });
    await expect(other).not.toContainText("Ejaan:");
    await expect(other).not.toContainText("transkasi");
    await expect(other).not.toContainText("Kalimat pembuka terlalu panjang");
    await expect(other).toContainText("Isi yang kurang:");
    await expect(other).toContainText("Belum menyebut kanal pengaduan resmi");
    await expect(
      page.getByRole("region", { name: "Catatan AI" }),
    ).toContainText("Jawaban relevan dan jelas.");

    // Teks abu di kotak oranye "Perbaiki ini dulu" dan label rincian tetap terbaca.
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      for (const region of [
        summary,
        breakdown,
        consumer,
        points,
        answer,
        fixes,
      ]) {
        const low = await findLowContrastText(region, {
          selector: "span, p, dt, dd, q, a, strong, mark",
          leafOnly: true,
        });
        expect(low, `${theme}: ${low.join("\n")}`).toEqual([]);
      }
      // Mark berisi tautan anak; scan khusus ini turut mengukur teks kutipannya.
      expect(
        await findLowContrastText(consumer, {
          selector: "mark",
          leafOnly: false,
        }),
      ).toEqual([]);
    }
    for (const region of [consumer, points, answer, fixes]) {
      expect(await findTextBelowFloor(region)).toEqual([]);
    }
    await setDocumentTheme(page, "light");
    await comparison.screenshot({ path: "/tmp/pdkt-telaah-desktop.png" });

    const rewrite = page.getByText("Terima kasih, kami cek transaksi Ibu.");
    await expect(rewrite).toBeHidden();
    await page.getByText("Lihat contoh balasan yang lebih baik").click();
    await expect(rewrite).toBeVisible();
    await expect(page.getByText("Bagian yang disorot hijau")).toBeVisible();

    // Kontrol halaman Telaah minimal 44px (root 14px: min-h-11 hanya 38,5px).
    const heights = await page
      .locator("button:visible, summary:visible")
      .evaluateAll((els) =>
        els
          // Isi tahap Telaah saja; header workspace bersama bukan bagian halaman ini.
          .filter((el) =>
            [...document.querySelectorAll("h2")]
              .find((h) => h.textContent?.includes("Balasan untuk"))
              ?.closest("[data-review-scroll]")
              ?.contains(el),
          )
          .map((el) => [
            el.textContent?.trim(),
            el.getBoundingClientRect().height,
          ]),
      );
    expect(heights.length).toBeGreaterThan(3);
    expect(heights.filter(([, h]) => (h as number) < 44)).toEqual([]);

    expect(runtimeErrors).toEqual([]);

    // Kembali ke kotak masuk tidak membuka ulang email yang sama.
    await page.getByRole("button", { name: "Kembali ke kotak masuk" }).click();
    await expect(
      page.getByRole("heading", { name: "Kotak masuk", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah tanpa consumerPoints mempertahankan email lama dan menyembunyikan temuan kosong", async ({
    page,
  }) => {
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...EVALUATED_HISTORY[0].evaluation,
          annotations: [],
          contentGaps: [],
        },
      },
    ];
    const audit = await openWorkspace(page, [
      ...pdktMocks(history, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "processing",
            evaluation: null,
            evaluation_error: null,
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    const consumer = page.getByRole("region", {
      name: "Email konsumen",
      exact: true,
    });
    await expect(consumer).toContainText(
      REPLIED_MAIL.detail.inbound_email.body,
    );
    await expect(consumer.locator("mark")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Poin konsumen", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", {
        name: "Telaah lama tanpa penanda",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Temuan lain", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Catatan AI", exact: true }),
    ).toContainText("Jawaban relevan dan jelas.");
    // Poin konsumen kosong dinyatakan terbuka dan bisa ditelaah ulang, bukan
    // hilang diam-diam.
    const notice = page.getByRole("region", {
      name: "Telaah tanpa poin konsumen",
      exact: true,
    });
    await expect(notice).toContainText("poin mana yang sudah dan belum");
    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await notice.getByRole("button", { name: "Telaah ulang" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    expectHermetic(audit);
  });

  test("telaah lama tanpa penanda kalimat bisa ditelaah ulang", async ({
    page,
  }) => {
    // EVALUATED_HISTORY dibuat sebelum penanda kalimat ada: tanpa `annotations`.
    const audit = await openWorkspace(page, [
      ...pdktMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "processing",
            evaluation: null,
            evaluation_error: null,
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();

    const notice = page.getByRole("region", {
      name: "Telaah lama tanpa penanda",
    });
    await expect(notice).toBeVisible({ timeout: 20000 });
    await expect(notice).toContainText("belum menandai kalimat");
    const legacyFindings = page.getByRole("region", { name: "Temuan lain" });
    await expect(legacyFindings).toContainText("Ejaan:");
    await expect(legacyFindings).toContainText("Kejelasan:");
    await expect(
      page.getByRole("region", { name: "Poin konsumen", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Catatan pada balasan" }),
    ).toHaveCount(0);

    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await notice.getByRole("button", { name: "Telaah ulang" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap Telaah gagal bisa dicoba lagi", async ({ page }) => {
    const failed = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: null,
        // Bentuk respons API /pdkt/history memakai snake_case.
        evaluation_status: "failed",
        evaluation_error: "Model AI sedang sibuk.",
      },
    ] as unknown as SessionHistory[];
    const audit = await openWorkspace(page, [
      ...pdktMocks(failed, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "failed",
            evaluation: null,
            evaluation_error: "Model AI sedang sibuk.",
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();

    // Galat dari server/AI tidak ditampilkan; peserta melihat pesan tetap.
    await expect(
      page.getByText("AI belum bisa menelaah balasan ini."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Telaah gagal", { exact: true })).toBeVisible();
    await expect(page.getByText("Model AI sedang sibuk.")).toHaveCount(0);
    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await page.getByRole("button", { name: "Coba lagi" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();
    expectHermetic(audit);
  });
});
