import { printedIncludes, printedReadBack } from "./helpers/pdfReadback";
import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  AGENT_NAME,
  CHAT_TICKET_A,
  CHAT_TICKET_B,
  CLEAN_SESSION_TICKET,
  HOSTILE_FINDING_TEXT,
  HOSTILE_RECOMMENDATION_TEXT,
  REAL_TICKET,
  assertLocalDevOnlyTarget,
  drainAudits,
  expectNoApplicationTraffic,
  expectNoHorizontalOverflow,
  expectNoOfflineEgress,
  exportFromMenu,
  formatAudit,
  openAgentDetail,
  readReportOffline,
  reportArtifactDir,
  startAudit,
} from "./helpers/sidakAgentReportFixture";
import {
  missingPrintedFacts,
  TREND_PARAMETER_TABLE_CAPTION,
  MONTHLY_TABLE_CAPTION,
  SCORE_FINAL_CHART_TITLE,
  SCORE_NON_CRITICAL_CHART_TITLE,
  SCORE_CRITICAL_CHART_TITLE,
  capturePrintOutput,
} from "./helpers/sidakAgentReportDownloadHarness";

test.describe("SIDAK agent report download nyata", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    for (const audit of drainAudits()) {
      console.log(formatAudit(audit));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 gate repair — pagination cetak dibaca dari PDF peramban.
  // ═══════════════════════════════════════════════════════════════════════

  test("Cetak laporan: ringkas (maks. empat halaman A4), semua temuan ikut, dan tidak ada halaman terakhir khusus colophon", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif", "fase3-print");
    const dir = reportArtifactDir("print");

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;

      // Disclosure TEMUAN sengaja dibiarkan tertutup — persis seperti file
      // yang diunduh. Test sebelumnya membuka disclosure itu dengan klik
      // sebelum mencetak, jadi klaim "cetak membuka disclosure tertutup"
      // tidak pernah benar-benar diuji; di sini keadaan default ikut diuji.
      expect(
        await document
          .locator("details.finding-group")
          .first()
          .evaluate((node) => node.hasAttribute("open")),
        "fixture harus menguji disclosure yang tadinya tertutup",
      ).toBe(false);
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "default unduhan harus menyembunyikan temuan di balik disclosure tertutup",
      ).toBeHidden();

      // (1) Tidak ada kontrol navigasi yang ikut tercetak, dan tidak ada
      //     petunjuk "geser tabel" di atas kertas.
      await document.emulateMedia({ media: "print" });
      await expect(document.getByRole("tablist")).toBeHidden();
      await expect(document.locator(".table-hint")).toBeHidden();
      await expectNoHorizontalOverflow(document, "cetak 1440");

      // (2) Cetak sungguhan lewat `page.pdf()` (A4 + `@page` dokumen), lalu
      //     baca-balik teks tiap halaman dari PDF itu.
      const printed = await capturePrintOutput(
        document,
        dir,
        "cetak-interaktif",
      );
      const pages = printed.pages;
      const lastPage = pages[pages.length - 1] ?? "";

      // Halaman A4 selalu punya isi; kalau decoder gagal, ini yang menggagalkan
      // test, bukan read-back yang lebih longgar.
      expect(
        pages.length,
        `PDF tidak terbaca per halaman: ${pages.length} halaman`,
      ).toBeGreaterThan(0);
      expect(
        pages.filter((text) => text.trim() === "").length,
        "ada halaman PDF kosong: rule @page atau isi dokumen rusak",
      ).toBe(0);
      // Decoder glyph harus benar-benar memetakan kode ke Unicode. Kalau
      // Chromium mengubah format PDF-nya, placeholder "?" muncul dan test gagal
      // di sini — bukan diam-diam lulus karena teksnya salah baca.
      expect(
        printedReadBack(pages).includes("?"),
        "decoder PDF gagal memetakan kode glyph ke Unicode; read-back tidak sah",
      ).toBe(false);

      // (3) Laporan ringkas: fixture ini (1 agen, 2 bulan, 1 akar masalah)
      //     muat dalam paling banyak empat halaman A4. Sebelumnya lima halaman,
      //     karena tiap grafik skor membawa tabel datanya sendiri dan tren per
      //     parameter digambar sebagai grafik terpisah. Kontrak di (4) dan (5)
      //     yang menjamin pemadatan tidak memotong isi.
      expect(
        pages.length,
        "laporan+cetak+colophon harus muat maksimal 4 halaman A4 (sebelumnya 5); read-back:\n" +
          pages.map((text, index) => `[p${index + 1}] ${text}`).join("\n"),
      ).toBeLessThanOrEqual(4);

      // (4) Tidak ada halaman terakhir yang isinya HANYA colophon. Kandidat
      //     colophon = awalan. Kandidat isi = teks halaman yang bukan awal
      //     colophon, minimal 40 karakter supaya noise glyph tidak lolos.
      const colophonPrefix = `Laporan Audit SIDAK • ${AGENT_NAME}`;
      const nonColophonLength = (text: string) =>
        text.replace(colophonPrefix, "").replace(/[^A-Za-z0-9]/g, "").length;
      expect(
        nonColophonLength(lastPage),
        `halaman terakhir hanya berisi colophon; read-back: ${lastPage}`,
      ).toBeGreaterThanOrEqual(40);
      expect(
        printedIncludes(lastPage, colophonPrefix),
        `footer/colophon tidak ikut tercetak; read-back: ${lastPage}`,
      ).toBe(true);
      expect(
        pages.some((text) => printedIncludes(text, "Laporan Audit SIDAK")),
        "colophon hilang dari cetakan",
      ).toBe(true);

      // (5) Tidak ada isi yang hilang: semua fakta laporan harus ada di dalam
      //     PDF, termasuk isi disclosure tertutup. Ini yang membuat "5 halaman"
      //     bermakna — pemadatan tidak boleh memotong isi.
      const printedText = printedReadBack(pages);
      expect(
        missingPrintedFacts(printedText),
        "fakta laporan hilang dari cetakan",
      ).toEqual([]);
      for (const detail of [
        HOSTILE_FINDING_TEXT,
        HOSTILE_RECOMMENDATION_TEXT,
        REAL_TICKET,
        "Akurasi jawaban",
        "Kesimpulan Utama",
        MONTHLY_TABLE_CAPTION,
        SCORE_FINAL_CHART_TITLE,
        SCORE_NON_CRITICAL_CHART_TITLE,
        SCORE_CRITICAL_CHART_TITLE,
        TREND_PARAMETER_TABLE_CAPTION,
        "Perbandingan dengan Tim dan Layanan",
      ]) {
        expect(
          printedIncludes(printedText, detail),
          `bagian ini tidak tercetak: ${detail}`,
        ).toBe(true);
      }
      // Cakupan tidak berubah hanya karena dicetak: dokumen ini layanan CALL,
      // jadi temuan layanan CHAT tidak boleh bocor ke halaman kertas.
      for (const foreign of [
        CHAT_TICKET_A,
        CHAT_TICKET_B,
        CLEAN_SESSION_TICKET,
      ]) {
        expect(
          printedIncludes(printedText, foreign),
          `cetakan membocorkan data di luar cakupan: ${foreign}`,
        ).toBe(false);
      }

      // (6) Screenshot cetakan penuh (media print aktif) sebagai artefak visual
      //     tambahan. Pagination yang sah dibaca dari `printed.pages`, bukan
      //     dari tinggi dokumen.
      const shot = path.join(dir, "cetak-interaktif-full.png");
      await document.screenshot({ path: shot, fullPage: true });
      console.log(`[artifact] ${shot}`);
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("Petunjuk gulir tabel muncul di 390px, hilang di desktop, dan tidak ikut tercetak", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(
      page,
      "HTML Interaktif",
      "fase3-scrollhint",
    );
    const dir = reportArtifactDir("print");

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;
      const hint = document.locator(".table-hint");
      await expect(hint).toHaveCount(1);

      // Wrapper yang digulir adalah saudara langsung setelah petunjuk, jadi
      // keduanya diikat secara struktural: petunjuk tidak mungkin menempel
      // ke tabel lain.
      const benchmarkScrollBox = hint.locator(
        "xpath=following-sibling::div[1]",
      );

      // Tabel benchmark ada di panel Tren, yang tersembunyi pada tab default.
      // Petunjuk dinilai dari keadaan nyata pembaca: panel Tren terbuka.
      await document.getByRole("tab", { name: "Tren" }).click();
      await expect(
        document.getByRole("tabpanel", { name: "Tren" }),
      ).toBeVisible();

      // Petunjuk ini hanya berguna kalau tabelnya memang melebar di 390px.
      await document.setViewportSize({ width: 390, height: 844 });
      const benchmarkScroll = await benchmarkScrollBox.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      expect(
        benchmarkScroll.scrollWidth,
        `tabel benchmark tidak melebar di 390px (${benchmarkScroll.scrollWidth} <= ${benchmarkScroll.clientWidth}); petunjuk gulir akan berbohong`,
      ).toBeGreaterThan(benchmarkScroll.clientWidth);
      await expect(
        hint,
        "tabel benchmark menggulir di 390px tapi tidak ada petunjuknya",
      ).toBeVisible();
      await expectNoHorizontalOverflow(
        document,
        "HTML Interaktif 390 + petunjuk",
      );
      // Artefak review: scroll ke petunjuk + tabel yang terpotong tepi kanan,
      // supaya affordance-nya terlihat, bukan hanya "ada di DOM".
      await hint.scrollIntoViewIfNeeded();
      const hintShot = path.join(dir, "scroll-hint-390.png");
      await document.screenshot({ path: hintShot, fullPage: false });
      console.log(`[artifact] ${hintShot}`);

      // Desktop: tidak ada ruang untuk petunjuk, jadi tidak ditampilkan —
      // dan tabelnya juga tidak lagi perlu digulir.
      await document.setViewportSize({ width: 1440, height: 1000 });
      await expect(
        hint,
        "petunjuk gulir tidak boleh muncul di desktop",
      ).toBeHidden();
      const desktopScroll = await benchmarkScrollBox.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      expect(
        desktopScroll.scrollWidth,
        `desktop: tabel benchmark tidak seharusnya melebar (${desktopScroll.scrollWidth} > ${desktopScroll.clientWidth})`,
      ).toBeLessThanOrEqual(desktopScroll.clientWidth);

      // Cetak: di atas kertas tabel tidak menggulir, jadi petunjuknya hilang
      // dan tidak memakan ruang halaman.
      await document.emulateMedia({ media: "print" });
      await expect(
        hint,
        "petunjuk gulir tidak boleh ikut tercetak",
      ).toBeHidden();

      expectNoOfflineEgress(offline, "HTML Interaktif");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });
});
