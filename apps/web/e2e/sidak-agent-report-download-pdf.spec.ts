import {
  printedIncludes,
  readPrintedMarkers,
  printedReadBack,
  readPdfPages,
  readPdfInfo,
  recordDownloadBlobs,
  expectTextBasedPdf,
  expectPageFooters,
} from "./helpers/pdfReadback";
import { expect, test, type Download } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  AGENT_NAME,
  APP_ORIGIN,
  LONG_TABLE_AGENT_ID,
  LONG_TABLE_AGENT_NAME,
  LONG_TABLE_ROWS,
  CHAT_TICKET_A,
  CHAT_TICKET_B,
  CLEAN_SESSION_TICKET,
  EXPORT_ERROR_TITLE,
  HOSTILE_FINDING_TEXT,
  HOSTILE_RECOMMENDATION_TEXT,
  INDICATOR_NAME,
  LONG_TEXT_AGENT_ID,
  LONG_TEXT_AGENT_NAME,
  LONG_TEXT_HEAD,
  LONG_TEXT_TAIL,
  LONG_TEXT_SCORE_HISTORY,
  longTableRowLabel,
  LONG_TEXT_TICKET,
  LONG_TEXT_TICKET_2,
  LONG_UNBREAKABLE_TOKEN,
  REAL_TICKET,
  UNSUPPORTED_IN_TOKEN,
  UNSUPPORTED_IN_TOKEN_ASCII_HEAD,
  UNSUPPORTED_IN_TOKEN_ASCII_TAIL,
  UNSUPPORTED_SAMPLE_CODE_POINTS,
  UNSUPPORTED_SAMPLE_PAIRS,
  UNSUPPORTED_UNICODE_TEXT,
  YEAR,
  assertLocalDevOnlyTarget,
  drainAudits,
  expectNoApplicationTraffic,
  exportFromMenu,
  formatAudit,
  openAgentDetail,
  reportArtifactDir,
  startAudit,
  unsupportedMarker,
} from "./helpers/sidakAgentReportFixture";
import {
  missingPrintedFacts,
  TREND_TOTAL_CHART_TITLE,
  TREND_PARAMETER_TABLE_CAPTION,
  MONTHLY_TABLE_CAPTION,
  SCORE_FINAL_CHART_TITLE,
  SCORE_NON_CRITICAL_CHART_TITLE,
  SCORE_CRITICAL_CHART_TITLE,
  FINDING_COUNT_UNIT,
  expectNoBom,
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
  // FASE 4 — PDF. Menu → generator → Blob biner → file yang diunduh.
  // ═══════════════════════════════════════════════════════════════════════

  test("Menu Unduh Laporan menghasilkan PDF asli: A4 multi-halaman, teks bisa dicari, tanpa BOM", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Kontrak: empat format (Excel, HTML Interaktif, HTML Statis, PDF).
    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    // `allTextContents()` tidak menunggu render menu, jadi jumlah item
    // diperiksa lewat `toHaveCount` yang ikut menunggu menu terisi.
    const menuItems = page.getByRole("menuitem");
    await expect(
      menuItems,
      `menu Unduh Laporan harus punya empat format termasuk PDF; isi menu: ${JSON.stringify(
        await menuItems.allTextContents(),
      )}`,
    ).toHaveCount(4);
    const menuLabels = (await menuItems.allTextContents()).map((label) =>
      label.trim(),
    );
    const pdfItem = menuItems.filter({ hasText: "PDF" });
    await expect(
      pdfItem,
      `menu Unduh Laporan belum punya opsi PDF; isi menu: ${JSON.stringify(menuLabels)}`,
    ).toHaveCount(1);

    const readBlobs = await recordDownloadBlobs(page);
    // Menu ditutup dulu supaya `exportFromMenu` menjalankan jalur yang sama
    // dengan test lain: klik trigger dari keadaan tertutup.
    await page.keyboard.press("Escape");
    await expect(menuItems).toHaveCount(0);
    const file = await exportFromMenu(page, "PDF", "fase4-pdf");
    const blobs = await readBlobs();

    // (1) Nama file dari state UI, sama seperti format lain.
    expect(file.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.pdf`);
    // (2) Biner: magic bytes, tanpa BOM, ukuran masuk akal. BOM di file biner
    //     tidak pernah dibutuhkan dan menggeser header `%PDF-`.
    expect(
      file.bytes.subarray(0, 5).toString("latin1"),
      "file PDF harus magic bytes %PDF-",
    ).toBe("%PDF-");
    expectNoBom(file);
    expect(
      file.bytes.length,
      "PDF kosong/tidak wajar tidak boleh lahir dari kegagalan",
    ).toBeGreaterThan(2000);
    expect(file.bytes.length).toBeLessThan(2_000_000);

    // (3) Blob yang benar-benar diterima browser: `application/pdf` dan
    //     tidak nol byte. PDF tidak memakai prefix BOM seperti HTML.
    expect(blobs, "tidak ada blob yang dibuat untuk unduhan PDF").toHaveLength(
      1,
    );
    expect(blobs[0].type).toBe("application/pdf");
    expect(blobs[0].size).toBeGreaterThan(0);
    expect(blobs[0].size).toBe(file.bytes.length);

    // (4) Metadata dokumen: judul/subjek memuat identitas + konteks laporan,
    //     bukan nama file generik.
    const info = readPdfInfo(file.bytes);
    expect(info.Title ?? "", "/Title PDF").toContain(AGENT_NAME);
    expect(info.Subject ?? "", "/Subject PDF").toContain(String(YEAR));
    expect(info.Subject ?? "", "/Subject PDF").toContain("Layanan Call");
    expect(info.Author ?? "", "/Author PDF").toContain("SIDAK");
    expect(info.Producer ?? "", "/Producer PDF").not.toBe("");

    // (5) Halaman: lebih dari satu, tidak ada halaman kosong, dan tiap halaman
    //     punya footer "Halaman X dari N" (bukti header/footer berulang).
    const pdfPages = readPdfPages(file.bytes);
    const pages = pdfPages.texts;
    expect(
      pages.length,
      `PDF tidak terbaca per halaman: ${pages.length} halaman`,
    ).toBeGreaterThan(0);
    expect(
      pages.length,
      "laporan A4 dengan tabel + tren + seluruh temuan harus multi-halaman",
    ).toBeGreaterThan(1);
    expect(pages.length, "jumlah halaman PDF tidak masuk akal").toBeLessThan(
      12,
    );
    expectTextBasedPdf(file.bytes, pdfPages);
    expect(
      printedReadBack(pages).includes("?"),
      "decoder PDF gagal memetakan byte ke Unicode; read-back tidak sah",
    ).toBe(false);
    expectPageFooters(pages);

    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];
    const whole = printedReadBack(pages);

    // (6) Halaman pertama: identitas + konteks laporan (tanpa halaman sampul
    //     terpisah) dan ringkasan eksekutif sudah berisi skor & rekap bulanan.
    for (const fact of [
      AGENT_NAME,
      "Tim Call",
      "Batch 7",
      `Tahun ${YEAR}`,
      "Layanan Call",
      "Kesimpulan Utama",
      MONTHLY_TABLE_CAPTION,
      "Januari 2026",
      "Februari 2026",
    ]) {
      expect(
        printedIncludes(firstPage, fact),
        `halaman pertama tidak memuat "${fact}"; read-back: ${firstPage}`,
      ).toBe(true);
    }

    // (7) Tiket pengurang skor ikut di PDF, dengan angka dediksi yang dihitung
    //     hook (bentuk satu desimal), bukan angka karangan.
    expect(
      printedIncludes(whole, REAL_TICKET),
      `tiket riil tidak ikut di PDF; read-back: ${whole}`,
    ).toBe(true);
    expect(
      /TKT-2026-0142[\s\S]{0,80}?\d+(,\d)?/.test(whole),
      "kolom Pengurangan Skor tidak ikut di PDF",
    ).toBe(true);

    // (8) Halaman terakhir: seluruh temuan (tiket, indikator, nilai, teks
    //     Ketidaksesuaian +Sebaiknya) dan colophon, termasuk teks BERBAHAYA
    //     yang harus keluar sebagai TEKS, bukan dieksekusi atau terpotong.
    for (const fact of [
      INDICATOR_NAME,
      REAL_TICKET,
      HOSTILE_FINDING_TEXT,
      HOSTILE_RECOMMENDATION_TEXT,
      "Sebaiknya:",
      "Laporan Audit SIDAK",
    ]) {
      expect(
        printedIncludes(lastPage, fact),
        `halaman terakhir tidak memuat "${fact}"; read-back: ${lastPage}`,
      ).toBe(true);
    }
    // Akar masalah + rekap + tiket ada di halaman ringkasan; seluruh fakta
    // laporan harus ada di dokumen, tidak ada yang hilang di tengah.
    expect(
      printedIncludes(firstPage, "Akurasi jawaban"),
      `halaman pertama tidak memuat akar masalah; read-back: ${firstPage}`,
    ).toBe(true);
    expect(missingPrintedFacts(whole), "fakta laporan hilang dari PDF").toEqual(
      [],
    );

    // (9) Cakupan jujur: dokumen ini layanan CALL bulan Februari, jadi tiket
    //     chat dan tiket sesi bersih tidak boleh bocor ke PDF mana pun.
    for (const foreign of [
      CHAT_TICKET_A,
      CHAT_TICKET_B,
      CLEAN_SESSION_TICKET,
    ]) {
      expect(
        printedIncludes(whole, foreign),
        `PDF membocorkan data di luar cakupan: ${foreign}`,
      ).toBe(false);
    }
    // Setiap seksi menyatakan cakupannya sendiri; tidak boleh ada satu periode
    // yang lendoh ke seluruh dokumen.
    for (const scope of [
      `Layanan Call • Tahun ${YEAR}`,
      "Bulan terpilih Februari 2026",
      "Hanya Februari 2026",
      `Januari s.d. Februari 2026`,
    ]) {
      expect(
        printedIncludes(whole, scope),
        `label cakupan tidak ikut di PDF: ${scope}`,
      ).toBe(true);
    }

    // (10) Artefak review di luar repo: PDF + read-back per halaman.
    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, file.filename);
    writeFileSync(copy, file.bytes);
    writeFileSync(
      path.join(dir, `${file.filename}-pages.txt`),
      pages
        .map((text, index) => `=== PAGE ${index + 1} ===\n${text}`)
        .join("\n\n"),
    );
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pages.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("PDF memuat teks panjang di beberapa halaman dan tidak memotong blok antar halaman", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });

    const file = await exportFromMenu(page, "PDF", "fase4-pdf-teks-panjang");
    const pdfPages = readPdfPages(file.bytes);
    const pages = pdfPages.texts;
    const whole = printedReadBack(pages);

    expect(
      pages.length,
      "isi panjang harus menghasilkan PDF multi-halaman; read-back:\n" +
        pages
          .map((text, index) => `[p${index + 1}] ${text.slice(0, 160)}`)
          .join("\n"),
    ).toBeGreaterThanOrEqual(3);
    expectTextBasedPdf(file.bytes, pdfPages);
    expect(
      whole.includes("?"),
      "decoder PDF gagal memetakan byte ke Unicode; read-back tidak sah",
    ).toBe(false);
    expectPageFooters(pages);

    // (1) Blok temuan panjang utuh: penanda awal selalu mendahului penanda
    //     akhir dalam urutan baca, dan baris penutup blok ("Sebaiknya: ...")
    //     ikut pada halaman yang sama dengan penanda akhir. Kalau blok pernah
    //     terpotong di batas halaman, salah satu dari dua syarat ini gagal.
    //
    //     Bukti "paginasi benar-benar berjalan" sengaja dipisah dari bukti
    //     "blok utuh": layout sekarang menjaga blok panjang ini bersama di
    //     satu halaman (pita nomor tiket tidak lagi menggantung di dasar
    //     halaman), sehingga head dan tail boleh berada di halaman yang sama.
    //     Yang tetap wajib terlihat: isi temuan yang mengalir melewati batas
    //     halaman pada dokumen yang sama.
    const headPage = pages.findIndex((text) =>
      printedIncludes(text, LONG_TEXT_HEAD),
    );
    const tailPage = pages.findIndex((text) =>
      printedIncludes(text, LONG_TEXT_TAIL),
    );
    expect(
      headPage,
      "penanda awal teks panjang hilang dari PDF",
    ).toBeGreaterThanOrEqual(0);
    expect(
      tailPage,
      "penanda akhir teks panjang hilang dari PDF",
    ).toBeGreaterThanOrEqual(headPage);
    // Halaman yang memuat ekor teks panjang juga memuat baris penutup
    // temuan ("Sebaiknya") dan penjelasannya: blok tidak terpotong di tepi.
    const tailText = pages[tailPage];
    expect(
      printedIncludes(tailText, "Gunakan naskah satu halaman"),
      `blok temuan terpotong di batas halaman; read-back: ${tailText.slice(0, 300)}`,
    ).toBe(true);
    // Isi temuan benar-benar mengalir lintas halaman: minimal dua halaman
    // memuat baris temuan, jadi ada konten yang melewati batas halaman tanpa
    // hilang di thereof.
    const findingPages = pages.filter((text) =>
      printedIncludes(text, "Ketidaksesuaian:"),
    );
    expect(
      findingPages.length,
      `temuan hanya muncul di ${findingPages.length} halaman — paginasi tidak pernah diuji; read-back:\n${pages
        .map((text, index) => `[p${index + 1}] ${text.slice(0, 120)}`)
        .join("\n")}`,
    ).toBeGreaterThanOrEqual(2);
    // Identitas mencatat waktu pembuatan di halaman pertama, dan catatan sesi
    // tanpa temuan ikut di dokumen (di bawah rekap bulanan). Tidak ada blok
    // penutup tersendiri yang bisa jatuh sendirian ke halaman terakhir.
    expect(
      printedIncludes(pages[0], "dari SIDAK"),
      `halaman pertama tidak mencatat waktu pembuatan; read-back: ${pages[0].slice(0, 300)}`,
    ).toBe(true);
    expect(
      printedIncludes(
        whole,
        "Sesi tanpa temuan dihitung pada kolom Sesi, tetapi tidak ditampilkan sebagai temuan.",
      ),
      "catatan sesi tanpa temuan hilang dari PDF",
    ).toBe(true);
    const lastPage = pages[pages.length - 1];
    expect(
      printedIncludes(lastPage, "Sebaiknya:"),
      `daftar tiket terakhir terpisah dari temuannya; read-back: ${lastPage.slice(0, 300)}`,
    ).toBe(true);

    // (2) Token tanpa spasi yang lebih lebar dari kolom harus dipecah per
    //     karakter dan tetap utuh secara harfiah setelah whitespace read-back
    //     dibuang. Kalau terpotong, barisnya akan hilang di sisi kanan margin.
    expect(
      printedIncludes(whole, LONG_UNBREAKABLE_TOKEN),
      "token tanpa spasi terpotong di batas kolom",
    ).toBe(true);

    // (3) Temuan lain pada periode berbeda juga ikut: PDF tidak berhenti di
    //     satu periode atau satu tiket.
    for (const fact of [
      LONG_TEXT_TICKET,
      LONG_TEXT_TICKET_2,
      LONG_TEXT_AGENT_NAME,
      "Maret 2026",
      "Kepatuhan prosedur",
    ]) {
      expect(
        printedIncludes(whole, fact),
        `bagian ini hilang dari PDF: ${fact}`,
      ).toBe(true);
    }

    // (4) Karakter di luar WinAnsi yang punya padanan ejaan Indonesia
    //     disanitasi menjadi teks biasa, dan tidak ada byte rusak yang lolos
    //     ke PDF.
    expect(
      printedIncludes(whole, "Alur harus naik ke lalu turun"),
      "panah di luar WinAnsi harus disanitasi menjadi teks biasa",
    ).toBe(true);
    expect(
      printedIncludes(whole, "2 tingkat"),
      "bagian teks setelah karakter disanitasi hilang",
    ).toBe(true);

    // (4b) BAWAAN FASE 5 — karakter yang TIDAK punya padanan ejaan (CJK, emoji,
    //      Latin-Extended) tidak boleh hilang diam-diam jadi spasi. Setiap kode
    //     such muncul sebagai penanda `[U+XXXX]`: terlihat, bisa dicari, dan
    //      bisa dibalik ke karakter aslinya.
    const markers = readPrintedMarkers(whole);
    // Penanda yang terpotong oleh pembungkusan baris tidak bisa dibalik; jumlah
    // `[U+` harus sama dengan jumlah penanda utuh.
    expect(
      markers.starts,
      "ada penanda [U+…] yang terpotong di batas kolom/halaman: tidak bisa dibalik",
    ).toBe(markers.complete.length);
    // Himpunan penanda harus PERSIS titik kode karakter yang tidak bisa
    // dicetak pada fixture. Karakter yang sebenarnya bisa dicetak (é, —, •)
    // tidak boleh ikut ditandai — kalau muncul di daftar ini, sanitizer terlalu
    // lebar dan bukti yang bisa dibaca jadi rusak.
    expect(
      markers.codePoints,
      "penanda karakter tak-tercetak tidak sama dengan fixture; lihat penanda yang terbaca",
    ).toEqual(UNSUPPORTED_SAMPLE_CODE_POINTS);
    for (const [codePoint, char] of UNSUPPORTED_SAMPLE_PAIRS) {
      // Mengikat daftar titik kode ke fixture: kalau teks fixture berubah dan
      // daftar ini tidak ikut, test gagal di sini — bukan diam-diam melolos.
      expect(
        UNSUPPORTED_UNICODE_TEXT.includes(char) ||
          UNSUPPORTED_IN_TOKEN.includes(char),
        `daftar titik kode tidak cocok dengan fixture: ${codePoint}`,
      ).toBe(true);
      expect(
        whole.includes(char),
        `karakter "${char}" lolos apa adanya ke PDF; WinAnsi tidak bisa menencetaknya`,
      ).toBe(false);
    }

    // (4c) Penanda di dalam token tanpa spasi harus UTUH meski tokennya dipecah
    //      per karakter. `U+1EC7` hanya muncul di token itu, jadi penandanya
    //      tidak mungkin datang dari kalimat lain.
    expect(
      printedIncludes(whole, UNSUPPORTED_IN_TOKEN_ASCII_HEAD),
      "awal token tanpa spasi hilang dari PDF",
    ).toBe(true);
    expect(
      printedIncludes(whole, UNSUPPORTED_IN_TOKEN_ASCII_TAIL),
      "akhir token tanpa spasi hilang dari PDF",
    ).toBe(true);
    // Paragraf boleh mengalir melewati batas halaman; header/footer halaman
    // yang terselip di antara dua baris token bukan bagian dari tokennya.
    const flowing = pages
      .map((text) =>
        text
          .replace(
            `Laporan Audit SIDAK ${LONG_TEXT_AGENT_NAME} • Layanan Call • ${YEAR}`,
            "",
          )
          .replace(/Laporan Audit SIDAK Halaman \d+ dari \d+/, ""),
      )
      .join("\n");
    const markedToken = UNSUPPORTED_IN_TOKEN.replace(
      "ệ",
      unsupportedMarker("U+1EC7"),
    );
    expect(
      printedIncludes(flowing, markedToken),
      `token tanpa spasi terpotong di batas kolom; sekitar token: ${flowing.slice(
        Math.max(0, flowing.indexOf(UNSUPPORTED_IN_TOKEN_ASCII_HEAD) - 20),
        flowing.indexOf(UNSUPPORTED_IN_TOKEN_ASCII_HEAD) + 260,
      )}`,
    ).toBe(true);

    // (4d) Karakter yang DIDUKUNG WinAnsi tetap utuh di kalimat yang sama:
    //      é (Latin-1), em dash, dan bullet tidak boleh jadi penanda.
    for (const supported of ["André", "—", "•"]) {
      expect(
        printedIncludes(whole, supported),
        `karakter yang didukung font standar (${supported}) hilang dari PDF`,
      ).toBe(true);
    }
    for (const prose of [
      "Temuwa agen: pelanggan menulis",
      "lalu membalas",
      "saat menunggu konfirmasi,",
      "Nama klien",
    ]) {
      expect(
        printedIncludes(whole, prose),
        `teks di sekitar karakter tak-tercetak hilang: "${prose}"`,
      ).toBe(true);
    }

    // (5) Sesi bersih tetap tidak masuk, dan cakupan bulan terakhir (Maret)
    //     dipakai untuk tiket/akar masalah.
    expect(
      printedIncludes(whole, CLEAN_SESSION_TICKET),
      "PDF memuat tiket sesi bersih",
    ).toBe(false);
    expect(
      printedIncludes(whole, "Bulan terpilih Maret 2026"),
      "bulan terpilih tidak mengikuti state UI",
    ).toBe(true);

    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, "pdf-teks-panjang.pdf");
    writeFileSync(copy, file.bytes);
    writeFileSync(
      path.join(dir, "pdf-teks-panjang-pages.txt"),
      pages
        .map((text, index) => `=== PAGE ${index + 1} ===\n${text}`)
        .join("\n\n"),
    );
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pages.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("PDF: temuan dikelompokkan per parameter dengan nomor tiket di depan, dan dua keluarga tren tetap terpisah", async ({
    page,
  }) => {
    const audit = startAudit();
    // Fixture teks panjang dipakai di sini karena personalTrend-nya punya
    // TIGA seri (total + dua parameter) dan tiga periode, dan riwayat skornya
    // punya nilai desimal (74,5) yang tidak mungkin tertukar dengan hitungan
    // temuan.
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });

    const file = await exportFromMenu(page, "PDF", "fase6-pdf-hierarki");
    const pdfPages = readPdfPages(file.bytes);
    const runs = pdfPages.runs.flat();
    const whole = printedReadBack(pdfPages.texts);

    expect(
      pdfPages.runs.length,
      "tidak ada run teks per halaman untuk diperiksa",
    ).toBe(pdfPages.texts.length);

    const indexAfter = (title: string, from = 0) =>
      runs.findIndex((run, index) => index > from && run.text === title);
    const regionOf = (from: number, to: number) =>
      runs
        .slice(from, to)
        .map((run) => run.text)
        .join(" ");

    // (1) Detail temuan per parameter: tiap parameter punya pita bold yang
    //     lebih besar dari teks isi, dan setiap kemunculan dimulai dengan
    //     nomor tiket supaya tiket mudah dipindai.
    const detailHeading = indexAfter("Detail Temuan");
    expect(detailHeading, "judul Detail Temuan tidak ada").toBeGreaterThan(0);
    const detailRuns = runs.slice(detailHeading);
    for (const parameter of [INDICATOR_NAME, "Kepatuhan prosedur"]) {
      const band = detailRuns.find((run) => run.text === parameter);
      expect(band, `pita parameter "${parameter}" tidak ada`).toBeDefined();
      expect(band!.baseFont, `pita "${parameter}" harus bold`).toMatch(/bold/i);
      expect(band!.size).toBeGreaterThanOrEqual(10);
    }
    for (const ticket of [LONG_TEXT_TICKET, LONG_TEXT_TICKET_2]) {
      expect(
        detailRuns.some((run) => run.text.startsWith(ticket)),
        `kemunculan temuan untuk ${ticket} harus dimulai dengan nomor tiketnya`,
      ).toBe(true);
    }

    // (2) DUA KELUARGA TREN, DUA SEKSI, dalam urutan dokumen:
    //       Perkembangan Skor -> [Skor Final, Non-Critical, Critical] ->
    //       Tren Temuan -> [Total Temuan per Bulan, Temuan per Parameter] ->
    //       Detail Temuan.
    const scoreHeading = indexAfter("Perkembangan Skor");
    const finalTitle = indexAfter(SCORE_FINAL_CHART_TITLE, scoreHeading);
    const nonCriticalTitle = indexAfter(
      SCORE_NON_CRITICAL_CHART_TITLE,
      scoreHeading,
    );
    const criticalTitle = indexAfter(SCORE_CRITICAL_CHART_TITLE, scoreHeading);
    const findingTrendHeading = indexAfter("Tren Temuan", scoreHeading);
    const totalTitle = indexAfter(TREND_TOTAL_CHART_TITLE, findingTrendHeading);
    const paramCaption = indexAfter(
      TREND_PARAMETER_TABLE_CAPTION,
      findingTrendHeading,
    );
    for (const [label, index] of [
      ["heading seksi skor", scoreHeading],
      ["judul grafik skor final", finalTitle],
      ["judul grafik skor non-critical", nonCriticalTitle],
      ["judul grafik skor critical", criticalTitle],
      ["heading seksi tren temuan", findingTrendHeading],
      ["judul grafik total temuan", totalTitle],
      ["caption tabel temuan per parameter", paramCaption],
    ] as const) {
      expect(index, `${label} tidak ada di PDF yang diunduh`).toBeGreaterThan(
        0,
      );
    }
    expect(scoreHeading).toBeLessThan(finalTitle);
    expect(finalTitle).toBeLessThan(nonCriticalTitle);
    expect(nonCriticalTitle).toBeLessThan(criticalTitle);
    expect(criticalTitle).toBeLessThan(findingTrendHeading);
    expect(findingTrendHeading).toBeLessThan(totalTitle);
    expect(totalTitle).toBeLessThan(paramCaption);
    expect(paramCaption).toBeLessThan(detailHeading);

    // Satu grafik jumlah temuan → satuan "Jumlah temuan" tertulis sekali;
    // tiap grafik skor punya garis target 95 dengan keterangannya.
    expect(
      runs.filter((run) => run.text === FINDING_COUNT_UNIT).length,
      `satuan "${FINDING_COUNT_UNIT}" harus tertulis sekali`,
    ).toBe(1);
    const scoreRegion = regionOf(scoreHeading, findingTrendHeading);
    expect(
      runs
        .slice(scoreHeading, findingTrendHeading)
        .filter((run) => run.text === "Target 95").length,
      "tiap grafik skor harus menandai target 95",
    ).toBe(3);

    // (2a) Seksi skor memuat skor asli dari riwayat bulanan — bukan jumlah
    //      temuan — dan desimal tertulis utuh gaya Indonesia (74,5).
    const asText = (value: number) => String(value).replace(".", ",");
    for (const period of LONG_TEXT_SCORE_HISTORY) {
      for (const value of [
        period.finalScore,
        period.nonCriticalScore,
        period.criticalScore,
      ]) {
        expect(
          printedIncludes(scoreRegion, asText(value)),
          `skor ${value} (${period.period}) tidak muncul di seksi Perkembangan Skor; region: ${scoreRegion}`,
        ).toBe(true);
      }
    }
    expect(printedIncludes(scoreRegion, "74,5")).toBe(true);
    for (const foreign of [
      "Total Temuan",
      FINDING_COUNT_UNIT,
      INDICATOR_NAME,
      "Kepatuhan prosedur",
    ]) {
      expect(
        scoreRegion,
        `seksi Perkembangan Skor ikut memuat "${foreign}" — seksi ini harus soal skor saja`,
      ).not.toContain(foreign);
    }

    // (2b) Seksi tren temuan tidak memuat label maupun angka skor.
    const findingTrendRegion = regionOf(findingTrendHeading, detailHeading);
    for (const foreign of [
      SCORE_NON_CRITICAL_CHART_TITLE,
      SCORE_CRITICAL_CHART_TITLE,
      "Target 95",
    ]) {
      expect(
        findingTrendRegion,
        `seksi Tren Temuan ikut memuat "${foreign}"`,
      ).not.toContain(foreign);
    }
    expect(
      printedIncludes(findingTrendRegion, "74,5"),
      "skor desimal bocor ke seksi Tren Temuan",
    ).toBe(false);

    // (3) Tabel per parameter memuat baris total dan kedua parameter, dengan
    //     setiap periode.
    const paramRegion = regionOf(paramCaption, detailHeading);
    for (const label of [
      "Total Temuan",
      INDICATOR_NAME,
      "Kepatuhan prosedur",
    ]) {
      expect(paramRegion, `tabel parameter tidak memuat "${label}"`).toContain(
        label,
      );
    }
    for (const period of ["Jan", "Feb", "Mar"]) {
      expect(
        scoreRegion,
        `periode "${period}" hilang dari seksi skor`,
      ).toContain(period);
      expect(
        paramRegion,
        `periode "${period}" hilang dari tabel parameter`,
      ).toContain(period);
    }
    expect(
      printedIncludes(whole, LONG_TEXT_TICKET_2),
      "tiket periode lain ikut hilang dari PDF",
    ).toBe(true);

    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, "pdf-hierarki-tren.pdf");
    writeFileSync(copy, file.bytes);
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pdfPages.texts.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("PDF: tabel panjang dipaginasi dengan header berulang dan tanpa baris terpotong", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TABLE_AGENT_ID,
      name: LONG_TABLE_AGENT_NAME,
    });

    const file = await exportFromMenu(page, "PDF", "fase6-pdf-tabel-panjang");
    const pdfPages = readPdfPages(file.bytes);
    const pages = pdfPages.texts;
    expectPageFooters(pages);

    // Halaman mana saja yang memuat baris tabel benchmark. Baris ditandai
    // dengan label uniknya, bukan dengan posisi karakter, supaya bukti ini
    // tidak bergantung pada koordinat.
    const rowPages = new Map<number, number>();
    pages.forEach((text, pageIndex) => {
      for (let index = 1; index <= LONG_TABLE_ROWS; index += 1) {
        if (printedIncludes(text, longTableRowLabel(index))) {
          rowPages.set(index, pageIndex);
        }
      }
    });
    const distinctPages = new Set(rowPages.values());
    // (1) Tabel benar-benar melewati batas halaman: tanpa ini, paginasi tabel
    //     tidak pernah diuji oleh fixture mana pun.
    expect(
      distinctPages.size,
      `tabel benchmark tidak melewati batas halaman; baris found: ${JSON.stringify(
        [...rowPages.entries()],
      )}`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      rowPages.size,
      `hanya ${rowPages.size} dari ${LONG_TABLE_ROWS} baris terbaca; label yang hilang: ${JSON.stringify(
        Array.from(
          { length: LONG_TABLE_ROWS },
          (_, offset) => offset + 1,
        ).filter((index) => !rowPages.has(index)),
      )}`,
    ).toBe(LONG_TABLE_ROWS);

    // (2) Setiap baris utuh di SATU halaman: baris yang terpotong akan hilang
    //     dari semua halaman, dan baris yang terduplikasi berarti satu baris
    //     bocor ke halaman lain.
    for (const [index, pageIndex] of rowPages) {
      const occurrences = pages.filter((text) =>
        printedIncludes(text, longTableRowLabel(index)),
      );
      expect(
        occurrences.length,
        `baris "${longTableRowLabel(index)}" muncul di ${occurrences.length} halaman; baris tabel tidak boleh terpotong atau terduplikasi`,
      ).toBe(1);
      expect(occurrences[0]).toBe(pages[pageIndex]);
    }

    // (3) Header tabel berulang di SETIAP halaman yang memuat baris tabel:
    //     pembaca halaman kedua harus tahu arti kolomnya tanpa menggulir
    //     kembali ke halaman pertama.
    for (const pageIndex of distinctPages) {
      for (const header of [
        "Parameter",
        "Agen ini",
        "Rata-rata tim",
        "Rata-rata layanan",
        "Selisih vs tim",
        "Selisih vs layanan",
      ]) {
        expect(
          printedIncludes(pages[pageIndex], header),
          `halaman ${pageIndex + 1} memuat baris tabel tapi header "${header}" tidak diulang; read-back: ${pages[pageIndex].slice(0, 300)}`,
        ).toBe(true);
      }
    }

    // (4) Urutan baris tetap sesuai urutan data: baris terakhir tidak boleh
    //     mendahului baris pertama.
    const firstRowPage = rowPages.get(1)!;
    const lastRowPage = rowPages.get(LONG_TABLE_ROWS)!;
    expect(
      lastRowPage,
      "baris benchmark terakhir muncul sebelum baris pertama",
    ).toBeGreaterThanOrEqual(firstRowPage);

    // (5) Header identitas di SETIAP halaman memakai warna yang sama dan
    //     netral. Fixture ini sengaja punya baris dengan delta negatif (warna
    //     status merah) tepat sebelum baris tabel pindah halaman: tanpa
    //    FIX ini, header halaman berikutnya mewarisi warna status itu dan
    //     identitas tercetak merah seperti peringatan.
    const headerFills = pdfPages.runs.map((pageRuns) => {
      const header = pageRuns.find(
        (run) => run.text === "Laporan Audit SIDAK" && run.size === 8,
      );
      expect(
        header,
        "header identitas tidak ditemukan di salah satu halaman",
      ).toBeDefined();
      return header!.fill;
    });
    // `INK_FAINT` (abu-biru netral) punya sebaran kanal 0.153; tiap warna
    // status laporan punya sebaran jauh lebih besar (merah 0.674, jingga
    // 0.66, hijau 0.61). Ambang 0.25 memisahkan keduanya dengan jelas tanpa
    // mengikat test ke nilai palet yang tepat.
    for (const fill of headerFills) {
      expect(fill, "warna header halaman tidak terbaca").not.toBeNull();
      const channels = fill!;
      const spread = Math.max(...channels) - Math.min(...channels);
      expect(
        spread,
        `warna header identitas bukan netral (spread ${spread.toFixed(3)} = ${JSON.stringify(channels)}); header halaman mewarisi warna sel terakhir`,
      ).toBeLessThan(0.25);
    }
    const firstHeader = headerFills[0]!;
    for (const fill of headerFills) {
      expect(
        fill!.map((channel) => channel.toFixed(3)).join(","),
        "warna header identitas berbeda antar halaman",
      ).toBe(firstHeader.map((channel) => channel.toFixed(3)).join(","));
    }

    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, "pdf-tabel-panjang.pdf");
    writeFileSync(copy, file.bytes);
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pages.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("Kegagalan pembuatan PDF memberi umpan balik error tanpa menghasilkan file", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    /**
     * Kegagalan yang nyata: modul PDF yang diimpor dinamis diganti dengan
     * modul yang melempar error saat evaluasi, jadi `await import()` benar-benar
     * menolak di tengah percakapan async `handleExport`.
     */
    const intercepted: string[] = [];
    await page.route(
      `${APP_ORIGIN}/src/utils/agentReportPdf.ts*`,
      async (route) => {
        intercepted.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: 'throw new Error("E2E: generator PDF gagal dimuat");\n',
        });
      },
    );

    const downloads: Download[] = [];
    page.on("download", (download) => downloads.push(download));

    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    const item = page.getByRole("menuitem").filter({ hasText: "PDF" });
    await expect(item).toBeEnabled();
    await item.click();

    // Impor modul terjadi setelah klik (dynamic import), jadi penangkapan
    // request-nya harus menunggu, bukan diasumsikan sudah terjadi.
    await expect
      .poll(() => intercepted.length, {
        message:
          "intercept generator PDF tidak pernah dipanggil — test ini tidak membuktikan apa pun",
        timeout: 15000,
      })
      .toBeGreaterThan(0);

    const liveRegion = page.locator('section[aria-live="polite"]');
    await expect(liveRegion.getByText(EXPORT_ERROR_TITLE)).toBeVisible();

    // Tidak ada file kosong, tidak ada file separuh jadi, tidak ada unduhan.
    expect(
      downloads.map((download) => download.suggestedFilename()),
      "kegagalan PDF tetap menghasilkan unduhan",
    ).toEqual([]);

    expectNoApplicationTraffic(audit);
  });
});
