import { printedIncludes, printedReadBack } from "./helpers/pdfReadback";
import { expect, test } from "@playwright/test";
import {
  AGENT_NAME,
  AGENT_FINDING_COUNTS,
  AGENT_SCORE_HISTORY,
  CLEAN_SESSION_TICKET,
  HOSTILE_FINDING_TEXT,
  INDICATOR_NAME,
  REAL_TICKET,
  REMOTE_RESOURCE_PATTERNS,
  YEAR,
  assertLocalDevOnlyTarget,
  captureViewportShot,
  drainAudits,
  expectNoApplicationTraffic,
  expectNoHorizontalOverflow,
  expectNoOfflineEgress,
  exportFromMenu,
  formatAudit,
  missingFacts,
  openAgentDetail,
  readReportOffline,
  reportArtifactDir,
  startAudit,
  type ExportedFile,
} from "./helpers/sidakAgentReportFixture";
import {
  expectUtf8Bom,
  FAUX_CHROME,
  TREND_TOTAL_CHART_TITLE,
  TREND_PARAMETER_TABLE_CAPTION,
  MONTHLY_TABLE_CAPTION,
  SCORE_FINAL_CHART_TITLE,
  SCORE_NON_CRITICAL_CHART_TITLE,
  SCORE_CRITICAL_CHART_TITLE,
  SCORE_UNIT,
  FINDING_COUNT_UNIT,
  captionPattern,
  contrastRatio,
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

  test("Menu Unduh Laporan menghasilkan HTML Statis self-contained dengan semua panel terbuka", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Statis");

    expect(file.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.statis.html`,
    );
    expectUtf8Bom(file);

    // Varian statis: semua panel audit terbuka (tidak ada `hidden`).
    expect(file.text).toContain('data-report-variant="static"');
    expect(file.text).not.toMatch(/data-report-panel="[a-z]+"[^>]*\shidden/);
    expect(file.text).toMatch(
      /<details class="finding-group" data-finding-group="[^"]+" open>/,
    );

    // Identitas + scope dari state UI.
    expect(file.text).toContain(`<title>Laporan Audit - ${AGENT_NAME}</title>`);
    // Cakupan dokumen dinyatakan sebagai teks biasa (bukan kontrol select palsu).
    expect(file.text).toContain(`Layanan Call • Tahun ${YEAR}`);

    // Isi laporan benar-benar ada, bukan kerangka kosong.
    expect(file.text).toContain("Kesimpulan Utama");
    expect(file.text).toContain("Rekap Skor Bulanan");
    expect(file.text).toContain("Detail Temuan");
    expect(file.text).toContain(REAL_TICKET);
    expect(file.text).toContain("Akurasi jawaban");

    // Markup berbahaya dari fixture di-escape, tidak pernah jadi elemen.
    expect(file.text).toContain("&lt;script&gt;");
    expect(file.text).not.toContain("<script>alert");

    // Self-contained: tidak menarik resource remote untuk render.
    for (const pattern of REMOTE_RESOURCE_PATTERNS) {
      expect(
        pattern.test(file.text),
        `HTML Statis menarik resource remote (${pattern}) — harus offline-safe`,
      ).toBe(false);
    }

    // Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  test("Menu Unduh Laporan menghasilkan HTML Interaktif dengan tab dan hanya satu panel terbuka", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif");

    expect(file.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.interaktif.html`,
    );
    expectUtf8Bom(file);

    // Varian interaktif: tab nyata, Ringkasan default, panel lain tersembunyi.
    expect(file.text).toContain('data-report-variant="interactive"');
    expect(file.text).toContain(
      'data-report-tab="summary" aria-selected="true"',
    );
    expect(file.text).toContain(
      'data-report-tab="temuan" aria-selected="false"',
    );
    expect(file.text).toMatch(/data-report-panel="temuan"[^>]*\shidden/);
    expect(file.text).toMatch(/data-report-panel="trend"[^>]*\shidden/);
    // Seksi skor dan seksi tren temuan tab-nya terpisah: yang satu mengukur
    // skor, yang lain menghitung jumlah temuan.
    expect(file.text).toMatch(/data-report-panel="temuanTren"[^>]*\shidden/);
    expect(file.text).toContain(
      '<h2 class="panel-title" id="report-panel-trend-title">Perkembangan Skor</h2>',
    );
    expect(file.text).toContain(
      '<h2 class="panel-title" id="report-panel-temuanTren-title">Tren Temuan</h2>',
    );
    // Disclosure temuan tertutup secara default (bukan `open`).
    expect(file.text).toMatch(
      /<details class="finding-group" data-finding-group="[^"]+">/,
    );
    // Interaktivitas inline, bukan fetch resource luar.
    expect(file.text).toContain("<script>");
    for (const pattern of REMOTE_RESOURCE_PATTERNS) {
      expect(
        pattern.test(file.text),
        `HTML Interaktif menarik resource remote (${pattern}) — harus offline-safe`,
      ).toBe(false);
    }

    // Konten tetap sama dengan statis: identitas, scope, temuan, akar masalah.
    expect(file.text).toContain(`Layanan Call • Tahun ${YEAR}`);
    expect(file.text).toContain(REAL_TICKET);
    expect(file.text).toContain("Akurasi jawaban");
    expect(file.text).toContain("&lt;script&gt;");
    expect(file.text).not.toContain("<script>alert");

    // Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 — dua HTML profesional: isi sama, tanpa kontrol palsu, tab
  // accessible dari keyboard, cetak membuka semua bagian.
  // ═══════════════════════════════════════════════════════════════════════

  test("HTML Statis adalah dokumen baca: tanpa kontrol palsu, semua bagian terbuka, dan tidak meluber horizontal", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Statis", "fase3-statis");
    const dir = reportArtifactDir("statis");

    // (1) Tidak ada satu pun kontrol yang tidak bisa bekerja pada file offline.
    for (const rule of FAUX_CHROME) {
      expect(
        rule.pattern.test(file.text),
        `HTML Statis masih memuat ${rule.label} (${rule.pattern})`,
      ).toBe(false);
    }
    // Varian statis tidak boleh berpura-pura punya tab: tanpa `role="tab"`
    // yang tidak punya perilaku, pembaca akan hearing kontrol tak berguna.
    expect(
      file.text,
      "HTML Statis tidak boleh punya panel tersembunyi",
    ).not.toMatch(/data-report-panel="[a-z]+"[^>]*\shidden/);

    // (2) Offline: dokumen benar-benar terbuka dan tidak menarik apa pun.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;

      expect(
        missingFacts(offline.state.text),
        "fakta laporan hilang di HTML Statis",
      ).toEqual([]);
      expectNoOfflineEgress(offline, "HTML Statis");
      expect(
        offline.consoleErrors,
        `error saat membuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);

      // (3) Semuanya terbaca: identitas, tabel bulanan, temuan, akar masalah —
      //     tanpa perlu klik dan tanpa JavaScript sama sekali.
      await expect(document.getByRole("heading", { level: 1 })).toHaveText(
        AGENT_NAME,
      );
      await expect(document.getByText(REAL_TICKET).first()).toBeVisible();
      await expect(document.getByText("Akurasi jawaban").first()).toBeVisible();
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "teks temuan berbahaya harus tampil sebagai teks, bukan dieksekusi",
      ).toBeVisible();
      expect(
        await document.locator("script").count(),
        "HTML Statis tidak boleh menjalankan JavaScript apa pun",
      ).toBe(0);
      // Tabel bulanan dan tabel temuan per parameter terlihat, dengan label
      // bulan yang manusiawi.
      const monthlyTable = document.getByRole("table", {
        name: /Rekap Skor Bulanan/i,
      });
      await expect(monthlyTable).toBeVisible();
      await expect(monthlyTable).toContainText("Januari 2026");
      await expect(monthlyTable).toContainText("Februari 2026");
      await expect(
        document.getByRole("table", {
          name: captionPattern(TREND_PARAMETER_TABLE_CAPTION),
        }),
      ).toBeVisible();
      // Tiga grafik skor (satu metrik satu grafik) masing-masing dengan garis
      // target, plus satu grafik total temuan.
      for (const name of [
        /Grafik skor final/i,
        /Grafik skor non-critical/i,
        /Grafik skor critical/i,
        /Grafik jumlah seluruh temuan/i,
      ]) {
        await expect(document.getByRole("img", { name })).toBeVisible();
      }
      expect(await document.locator("[data-target-line]").count()).toBe(3);

      // (4) Tidak meluber horizontal di mobile maupun desktop.
      await captureViewportShot(document, dir, "statis-1440.png", {
        width: 1440,
        height: 1000,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 1440");
      await captureViewportShot(document, dir, "statis-390.png", {
        width: 390,
        height: 844,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 390");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("HTML Statis dan HTML Interaktif menyajikan isi yang sama dari file yang diunduh", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const staticFile = await exportFromMenu(
      page,
      "HTML Statis",
      "fase3-parity",
    );
    const interactiveFile = await exportFromMenu(
      page,
      "HTML Interaktif",
      "fase3-parity",
    );

    const offlineOf = async (file: ExportedFile) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const offline = await readReportOffline(context, file);
        await expectNoHorizontalOverflow(offline.page, `${file.filename} 1440`);
        return offline;
      } finally {
        await context.close();
      }
    };

    const staticOffline = await offlineOf(staticFile);
    const interactiveOffline = await offlineOf(interactiveFile);

    // (1) Isi yang sama: setiap fakta data ada di kedua dokumen, tidak ada
    //     fakta yang hanya muncul di satu varian.
    expect(missingFacts(staticOffline.state.text)).toEqual([]);
    expect(missingFacts(interactiveOffline.state.text)).toEqual([]);

    // (2) Kerangka yang sama: jumlah/urutan bagian dan seluruh heading editorial
    //     identik, jadi tidak ada konten yang hilang di salah satu varian.
    expect(interactiveOffline.state.panels).toBe(staticOffline.state.panels);
    expect(interactiveOffline.state.panelKeys).toEqual(
      staticOffline.state.panelKeys,
    );
    expect(interactiveOffline.state.panelSections).toEqual(
      staticOffline.state.panelSections,
    );
    for (const key of ["summary", "trend", "temuanTren", "temuan"]) {
      expect(
        staticOffline.state.panelKeys,
        `bagian "${key}" harus ada di kedua varian`,
      ).toContain(key);
    }
    expect(interactiveOffline.state.headings).toEqual(
      staticOffline.state.headings,
    );

    // (3) Keduanya offline-safe dan bebas error konsol.
    for (const offline of [staticOffline, interactiveOffline]) {
      expectNoOfflineEgress(offline, `${offline.page.url()}`);
      expect(
        offline.consoleErrors,
        `${offline.page.url()} error saat dibuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);
    }
    for (const file of [staticFile, interactiveFile]) {
      for (const pattern of REMOTE_RESOURCE_PATTERNS) {
        expect(
          pattern.test(file.text),
          `${file.filename} menarik resource remote (${pattern}) — harus offline-safe`,
        ).toBe(false);
      }
    }

    // Keputusan Fajar: sesi tanpa temuan tidak pernah muncul di dokumen.
    for (const file of [staticFile, interactiveFile]) {
      expect(
        file.text,
        `${file.filename} memuat tiket sesi bersih`,
      ).not.toContain(CLEAN_SESSION_TICKET);
      const text =
        file === staticFile
          ? staticOffline.state.text
          : interactiveOffline.state.text;
      expect(text, `${file.filename} memuat tiket sesi bersih`).not.toContain(
        CLEAN_SESSION_TICKET,
      );
    }

    expectNoApplicationTraffic(audit);
  });

  test("HTML Interaktif: tab keyboard-accessible, disclosure temuan bekerja, dan cetak membuka semua bagian", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(
      page,
      "HTML Interaktif",
      "fase3-interaktif",
    );
    const dir = reportArtifactDir("interaktif");

    // Kontrol yang tersisa di varian interaktif HANYA yang benar-benar bekerja
    // (tab dan disclosure). Tidak ada yang meniru tombol aplikasi.
    for (const rule of FAUX_CHROME) {
      if (rule.variant !== "both") continue;
      expect(
        rule.pattern.test(file.text),
        `HTML Interaktif masih memuat ${rule.label} (${rule.pattern})`,
      ).toBe(false);
    }

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;
      expectNoOfflineEgress(offline, "HTML Interaktif");
      expect(
        offline.consoleErrors,
        `error saat membuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);

      // (1) Hanya satu panel terbuka pada satu waktu, Ringkasan sebagai default.
      //     Empat panel: ringkasan, skor, tren temuan, temuan.
      const summaryPanel = document.getByRole("tabpanel", {
        name: "Ringkasan",
      });
      const scorePanel = document.getByRole("tabpanel", { name: "Skor" });
      const trendPanel = document.getByRole("tabpanel", { name: "Tren" });
      const temuanPanel = document.getByRole("tabpanel", { name: "Temuan" });
      const summaryTab = document.getByRole("tab", { name: "Ringkasan" });
      const scoreTab = document.getByRole("tab", { name: "Skor" });
      const trenTab = document.getByRole("tab", { name: "Tren" });
      const temuanTab = document.getByRole("tab", { name: "Temuan" });
      await expect(summaryPanel).toBeVisible();
      await expect(scorePanel).toBeHidden();
      await expect(trendPanel).toBeHidden();
      await expect(temuanPanel).toBeHidden();
      await expect(summaryTab).toHaveAttribute("tabindex", "0");

      // (2) Navigasi tab dari keyboard (pola APG): ArrowRight, End, Home, dengan
      //     roving tabindex sehingga hanya tab aktif yang di-tab. Skor dan Tren
      //     diuji satu per satu karena keduanya panel terpisah.
      await summaryTab.focus();
      await document.keyboard.press("ArrowRight");
      await expect(scoreTab).toHaveAttribute("aria-selected", "true");
      await expect(scoreTab).toHaveAttribute("tabindex", "0");
      await expect(summaryTab).toHaveAttribute("tabindex", "-1");
      await expect(scorePanel).toBeVisible();
      await expect(summaryPanel).toBeHidden();

      await document.keyboard.press("ArrowRight");
      await expect(trenTab).toHaveAttribute("aria-selected", "true");
      await expect(trendPanel).toBeVisible();
      await expect(scorePanel).toBeHidden();

      await document.keyboard.press("End");
      await expect(temuanTab).toHaveAttribute("aria-selected", "true");
      await expect(temuanPanel).toBeVisible();
      await expect(trendPanel).toBeHidden();

      await document.keyboard.press("Home");
      await expect(summaryTab).toHaveAttribute("aria-selected", "true");
      await expect(summaryPanel).toBeVisible();

      // (3) Tren temuan: grafik total + tabel per parameter (bukan grafik
      //     spaghetti yang perlu filter seri). Tidak ada tombol filter lagi.
      await trenTab.click();
      await expect(document.locator(".trend-filters")).toHaveCount(0);
      const parameterTable = document.getByRole("table", {
        name: captionPattern(TREND_PARAMETER_TABLE_CAPTION),
      });
      await expect(parameterTable).toBeVisible();
      await expect(parameterTable).toContainText(INDICATOR_NAME);
      await expect(parameterTable).toContainText("Jan");
      await expect(parameterTable).toContainText("Feb");
      await expect(
        document.getByRole("img", { name: /Grafik jumlah seluruh temuan/i }),
      ).toBeVisible();

      // (5) Disclosure opsional: tertutup secara default tapi isinya nyata.
      await temuanTab.click();
      await expect(temuanPanel).toBeVisible();
      const findingsDisclosure = document
        .locator("details.finding-group")
        .first();
      await expect(findingsDisclosure).toBeVisible();
      expect(
        await findingsDisclosure.evaluate((node) => node.hasAttribute("open")),
        "disclosure parameter temuan harus tertutup secara default",
      ).toBe(false);
      await findingsDisclosure.locator("summary").click();
      await expect(findingsDisclosure).toHaveAttribute("open", "");
      await expect(
        findingsDisclosure.getByText(HOSTILE_FINDING_TEXT),
      ).toBeVisible();

      // (6) Cetak: semua bagian terbuka kembali, kontrol navigasi hilang, dan
      //     tabel tren tetap terbaca.
      await document.emulateMedia({ media: "print" });
      await expect(document.getByRole("tablist")).toBeHidden();
      await expect(summaryPanel).toBeVisible();
      await expect(trendPanel).toBeVisible();
      await expect(temuanPanel).toBeVisible();
      await expect(
        document.getByRole("table", {
          name: captionPattern(TREND_PARAMETER_TABLE_CAPTION),
        }),
      ).toBeVisible();
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "pencetakan harus membuka disclosure yang tadinya tertutup",
      ).toBeVisible();
      await expectNoHorizontalOverflow(document, "HTML Interaktif print 1440");

      // (7) Artefak: viewport desktop/mobile + PDF A4 asli dari cetakan
      //     peramban, bukan potongan `clip` yang mengarang paginasi.
      await document.emulateMedia({ media: "screen" });
      await trenTab.click();
      await captureViewportShot(document, dir, "interaktif-1440.png", {
        width: 1440,
        height: 1000,
      });
      await expectNoHorizontalOverflow(document, "HTML Interaktif 1440");
      await captureViewportShot(document, dir, "interaktif-390.png", {
        width: 390,
        height: 844,
      });
      await expectNoHorizontalOverflow(document, "HTML Interaktif 390");
      await document.emulateMedia({ media: "print" });
      await capturePrintOutput(document, dir, "interaktif-print");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("HTML Statis: grafik skor dengan target, tren temuan sebagai tabel, nomor tiket menonjol, dan cetak tidak memotong tabel", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(
      page,
      "HTML Statis",
      "fase6-statis-hierarki",
    );
    const dir = reportArtifactDir("statis-hierarki");

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;
      expectNoOfflineEgress(offline, "HTML Statis");
      expect(
        offline.consoleErrors,
        `error saat membuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);

      // (1) Dua seksi tren. Seksi skor memuat tiga grafik skor (satu metrik
      //     satu grafik); seksi tren temuan memuat satu grafik total dan tabel
      //     per parameter — tidak ada grafik per parameter yang saling menimpa.
      const scorePanel = document.locator('[data-report-panel="trend"]');
      const findingTrendPanel = document.locator(
        '[data-report-panel="temuanTren"]',
      );
      await expect(scorePanel.locator(".panel-title")).toHaveText(
        "Perkembangan Skor",
      );
      await expect(findingTrendPanel.locator(".panel-title")).toHaveText(
        "Tren Temuan",
      );
      const scoreFigures = {
        final: scorePanel.locator('[data-chart-figure="score-final"]'),
        nonCritical: scorePanel.locator(
          '[data-chart-figure="score-nonCritical"]',
        ),
        critical: scorePanel.locator('[data-chart-figure="score-critical"]'),
      };
      const scoreTitles = {
        final: SCORE_FINAL_CHART_TITLE,
        nonCritical: SCORE_NON_CRITICAL_CHART_TITLE,
        critical: SCORE_CRITICAL_CHART_TITLE,
      } as const;
      const scoreValues = {
        final: AGENT_SCORE_HISTORY.map((row) => row.finalScore),
        nonCritical: AGENT_SCORE_HISTORY.map((row) => row.nonCriticalScore),
        critical: AGENT_SCORE_HISTORY.map((row) => row.criticalScore),
      };
      for (const metric of ["final", "nonCritical", "critical"] as const) {
        const figure = scoreFigures[metric];
        await expect(figure, `grafik skor "${metric}"`).toHaveCount(1);
        await expect(
          findingTrendPanel.locator(`[data-chart-figure="score-${metric}"]`),
        ).toHaveCount(0);
        await expect(figure.locator(".chart-title")).toHaveText(
          scoreTitles[metric],
        );
        await expect(figure.locator("svg .chart-unit")).toHaveText(SCORE_UNIT);
        // Garis target 95, dan sumbu di-zoom (tidak dimulai dari 0) supaya
        // naik-turun skor terlihat.
        await expect(figure.locator("[data-target-line]")).toHaveCount(1);
        await expect(figure.locator("svg")).toContainText("Target 95");
        await expect(
          figure.locator("svg .chart-axis-label").first(),
        ).not.toHaveText("0");
        await expect(figure.locator("svg .chart-value")).toHaveText(
          scoreValues[metric].map(String),
        );
        await expect(figure.locator("svg")).toContainText("Jan");
        await expect(figure.locator("svg")).toContainText("Feb");
        for (const foreign of [
          INDICATOR_NAME,
          "Total Temuan",
          FINDING_COUNT_UNIT,
          ...Object.values(scoreTitles).filter(
            (title) => title !== scoreTitles[metric],
          ),
        ]) {
          await expect(
            figure,
            `grafik skor "${metric}" ikut memuat "${foreign}"`,
          ).not.toContainText(foreign);
        }
      }
      for (const name of [
        /Grafik skor final/i,
        /Grafik skor non-critical/i,
        /Grafik skor critical/i,
        /Grafik jumlah seluruh temuan/i,
      ]) {
        await expect(document.getByRole("img", { name })).toBeVisible();
      }

      const totalFigure = findingTrendPanel.locator(
        '[data-chart-figure="total"]',
      );
      await expect(totalFigure).toHaveCount(1);
      await expect(totalFigure.locator(".chart-title")).toHaveText(
        TREND_TOTAL_CHART_TITLE,
      );
      await expect(totalFigure.locator("svg .chart-unit")).toHaveText(
        FINDING_COUNT_UNIT,
      );
      await expect(totalFigure.locator("svg .chart-value")).toHaveText(
        AGENT_FINDING_COUNTS.map(String),
      );
      await expect(
        document.locator('[data-chart-figure="parameter"]'),
      ).toHaveCount(0);
      await expect(
        scorePanel.locator('[data-chart-figure="total"]'),
      ).toHaveCount(0);

      // (2) Tabel per parameter: baris total lebih dulu lalu tiap parameter,
      //     satu kolom per periode + total. Tidak ada angka skor yang nyasar.
      const paramTable = document.getByRole("table", {
        name: captionPattern(TREND_PARAMETER_TABLE_CAPTION),
      });
      await expect(paramTable).toBeVisible();
      const countCells = [
        ...AGENT_FINDING_COUNTS.map(String),
        String(AGENT_FINDING_COUNTS.reduce((sum, value) => sum + value, 0)),
      ];
      await expect(paramTable.locator("tbody tr")).toHaveCount(2);
      await expect(
        paramTable.locator("tbody tr").nth(0).locator("th"),
      ).toHaveText("Total Temuan");
      await expect(
        paramTable.locator("tbody tr").nth(0).locator("td"),
      ).toHaveText(countCells);
      await expect(
        paramTable.locator("tbody tr").nth(1).locator("th"),
      ).toHaveText(INDICATOR_NAME);
      await expect(
        paramTable.locator("tbody tr").nth(1).locator("td"),
      ).toHaveText(countCells);
      for (const period of AGENT_SCORE_HISTORY) {
        for (const score of [
          period.finalScore,
          period.nonCriticalScore,
          period.criticalScore,
        ]) {
          await expect(
            paramTable,
            `skor ${score} bocor ke tabel temuan per parameter`,
          ).not.toContainText(String(score));
        }
      }

      // (3) Nomor tiket menonjol di daftar kemunculan temuan: lebih tebal dan
      //     berkontras penuh dibanding teks di sekitarnya.
      const occurrence = document
        .locator(`[data-finding-group="${INDICATOR_NAME}"] .occurrences li`)
        .first();
      const ticketCode = occurrence.locator(".ticket-code");
      await expect(ticketCode).toHaveText(REAL_TICKET);
      const typography = await occurrence.evaluate((node) => {
        const code = node.querySelector(".ticket-code")!;
        const item = getComputedStyle(node);
        const codeStyle = getComputedStyle(code);
        return {
          codeWeight: Number(codeStyle.fontWeight),
          itemWeight: Number(item.fontWeight),
          codeColor: codeStyle.color,
          background: getComputedStyle(node.ownerDocument.body).backgroundColor,
        };
      });
      expect(typography.codeWeight).toBeGreaterThanOrEqual(700);
      expect(typography.codeWeight).toBeGreaterThan(typography.itemWeight);
      expect(
        contrastRatio(typography.codeColor, typography.background),
        `kontras nomor tiket terlalu rendah: ${typography.codeColor} di ${typography.background}`,
      ).toBeGreaterThanOrEqual(7);

      // (4) Cetak: lebar konten A4 diukur sebagai viewport CSS (186mm @96dpi
      //     = 703px). Tabel yang lebih lebar dari kertas akan terpotong.
      await document.emulateMedia({ media: "print" });
      await document.setViewportSize({ width: 703, height: 1000 });
      await expectNoHorizontalOverflow(document, "HTML Statis cetak A4");
      const clippedTables = await document
        .locator("table")
        .evaluateAll((nodes) =>
          nodes
            .map((node) => ({
              caption: node.querySelector("caption")?.textContent ?? "",
              width: node.getBoundingClientRect().width,
            }))
            .filter((row) => row.width > 703),
        );
      expect(
        clippedTables,
        `tabel lebih lebar dari kertas A4 dan akan terpotong: ${JSON.stringify(
          clippedTables,
        )}`,
      ).toEqual([]);
      await document.setViewportSize({ width: 1440, height: 1000 });
      const printed = await capturePrintOutput(
        document,
        dir,
        "cetak-statis-hierarki",
      );
      const printedText = printedReadBack(printed.pages);
      for (const fact of [
        "Kesimpulan Utama",
        MONTHLY_TABLE_CAPTION,
        SCORE_FINAL_CHART_TITLE,
        SCORE_NON_CRITICAL_CHART_TITLE,
        SCORE_CRITICAL_CHART_TITLE,
        TREND_TOTAL_CHART_TITLE,
        TREND_PARAMETER_TABLE_CAPTION,
        REAL_TICKET,
      ]) {
        expect(
          printedIncludes(printedText, fact),
          `bagian ini hilang dari cetakan: ${fact}; read-back:\n${printedText}`,
        ).toBe(true);
      }

      // (5) Artefak layar: desktop + mobile, tanpa overflow horizontal.
      await document.emulateMedia({ media: "screen" });
      await captureViewportShot(document, dir, "statis-hierarki-1440.png", {
        width: 1440,
        height: 1000,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 1440");
      await captureViewportShot(document, dir, "statis-hierarki-390.png", {
        width: 390,
        height: 844,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 390");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });
});
