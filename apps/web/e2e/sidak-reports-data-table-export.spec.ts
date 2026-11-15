/**
 * E2E untuk workspace `/sidak/reports-data`.
 *
 * Kontrak yang dibuktikan (docs/SIDAK_LOGIC_AND_SCORING.md — "Logika Workspace Data"):
 *   - Eksklusi phantom: `is_phantom_padding = true` tidak pernah tampil.
 *   - Findings-only: hanya baris dengan Temuan (`ketidaksesuaian`) DAN
 *     Rekomendasi (`sebaiknya`) yang tampil, lengkap utuh.
 *   - Count, isi tabel, dan export memakai satu sumber hasil terpilih; file
 *     `.xlsx` yang benar-benar diunduh dibaca dengan `exceljs` (dependensi app
 *     yang sudah ada) dan harus memuat dua baris actionable yang sama.
 *
 * Isolasi (WAJIB — jangan dihapus, jangan longgarkan):
 *   1. Semua respons API dimock; tidak ada proses backend yang dijalankan.
 *   2. `assertLocalDevOnlyTarget` (preflight) membuktikan listener
 *      `localhost:3005` adalah dev-server Vite repo ini dan proxy `/api`-nya
 *      hanya menunjuk ke loopback — bukan build produksi atau backend lain.
 *   3. `installNetworkGuard` adalah fail-closed allowlist. Satu-satunya request
 *      yang boleh menyentuh jaringan adalah:
 *        - endpoint yang PERSIS dimock (method + path dari `MOCKED_API`),
 *        - endpoint auth/profile yang PERSIS dimock (`MOCKED_SUPABASE`),
 *        - document/aset/HMR dev-server lokal pada origin app, tanpa `/api`.
 *      Setiap request lain di-`abort`, termasuk `/api/v1/*` yang tidak dimock —
 *      ini mencegah Vite mem-proxy path tak dikenal ke backend non-test
 *      (`server.proxy` hanya `/api` → `http://localhost:3001`) dan mencegah
 *      host eksternal mana pun tersentuh.
 *   4. Bukti isolasi diuji oleh test "Guard memblokir ..." di
 *      `sidak-reports-data-filters.spec.ts`, bukan
 *      hanya diklaim.
 */

import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  FINDING_ACTIONABLE_CALL,
  RECOMMENDATION_ACTIONABLE_CALL,
  FINDING_ACTIONABLE_EMAIL,
  RECOMMENDATION_ACTIONABLE_EMAIL,
  PAGINATION_TOTAL,
  PAGINATION_PAGE_SIZE,
  paginationFinding,
  paginationRecommendation,
  paginationTicket,
  PAGINATION_ROWS,
  PAGINATION_NON_ACTIONABLE,
  ALL_ROWS,
  VISUAL_ROWS,
  NON_ACTIONABLE_TEXTS,
  type DataRequest,
  activeReportResponseGate,
  assertLocalDevOnlyTarget,
  openReportsData,
  expectNoApplicationTraffic,
  resultRows,
  RESULTS_COUNT,
  desktopResults,
  resolveArtifactDir,
  DESKTOP_MIN_WIDTH,
  VISUAL_VIEWPORTS,
  MOBILE_VIEWPORTS,
  DARK_VIEWPORTS,
  setTheme,
  openPopulatedResults,
  scrollPageTo,
  captureViewportPair,
  inScopeControls,
  assertTouchTargets,
  readFocusIndicator,
  assertSingleRepresentation,
  readDownloadedWorkbook,
  activeAudits,
  startAudit,
  TICKET_CELL_INDEX,
  FINDING_CELL_INDEX,
  RECOMMENDATION_CELL_INDEX,
  PADDED_TICKET_VALUE,
  ROW_ACTIONABLE_PADDED_TICKET,
  ROW_ACTIONABLE_TICKET_NULL,
  ROW_ACTIONABLE_TICKET_ABSENT,
  RAW_TICKET_PAD,
  EXPORT_PARITY_ROWS,
  EXPORT_PARITY_NON_ACTIONABLE,
  EXPORT_PARITY_AGENTS,
  EXPORT_PARITY_RAW_TEXTS,
  rawText,
  desktopTicketCell,
  mobileItemFor,
  mobileTicketLine,
  TICKET_DESKTOP_VIEWPORT,
  TICKET_MOBILE_VIEWPORT,
  expectActiveRepresentation,
} from "./helpers/sidakReportsDataHarness";

test.describe("SIDAK reports data workspace", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    // Jangan biarkan penahanan respons bocor ke test berikutnya.
    activeReportResponseGate.current = null;
    for (const audit of activeAudits.splice(0)) {
      console.log(
        [
          "[audit] mockedApi:",
          JSON.stringify(audit.mockedApi),
          "[audit] mockedAuth:",
          JSON.stringify(audit.mockedAuth),
          "[audit] localDev:",
          String(audit.localDev.length),
          "[audit] blockedApi:",
          JSON.stringify(audit.blockedApi),
          "[audit] blockedExternal:",
          JSON.stringify(audit.blockedExternal),
          "[audit] blockedLocal:",
          JSON.stringify(audit.blockedLocal),
        ].join("\n"),
      );
    }
  });

  test("Per Layanan hanya menampilkan temuan actionable dengan Temuan dan Rekomendasi lengkap", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    await page.getByRole("button", { name: "Cari Data" }).click();

    // Kontrak kolom: Temuan dan Rekomendasi harus dua kolom terpisah.
    await expect(
      page.getByRole("columnheader", { name: "Temuan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Rekomendasi" }),
    ).toBeVisible();

    // Dua teks utuh untuk baris actionable, lengkap di representasi desktop.
    await expect(
      desktopResults(page).getByText(FINDING_ACTIONABLE_CALL, { exact: false }),
    ).toBeVisible();
    await expect(
      desktopResults(page).getByText(RECOMMENDATION_ACTIONABLE_CALL, {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      desktopResults(page).getByText(FINDING_ACTIONABLE_EMAIL, {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      desktopResults(page).getByText(RECOMMENDATION_ACTIONABLE_EMAIL, {
        exact: false,
      }),
    ).toBeVisible();

    // Tiket riil tetap terlihat.
    await expect(desktopResults(page).getByText("TKT-2026-0142")).toBeVisible();
    await expect(desktopResults(page).getByText("TKT-2026-0310")).toBeVisible();

    // Hanya 2 dari 5 baris yang actionable: phantom dan dua baris teks kosong hilang.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    await expect(resultRows(page)).toHaveCount(2);
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }
    await expect(page.getByText("TKT-2026-9001")).toHaveCount(0);
    await expect(page.getByText("TKT-2026-0201")).toHaveCount(0);
    await expect(page.getByText("TKT-2026-0202")).toHaveCount(0);

    // Parity export: file .xlsx asli dari button Export Excel harus berisi
    // dua baris actionable yang sama dengan layar, lengkap dengan
    // `sebaiknya`, dan tidak boleh membocorkan baris non-actionable.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^laporan-data-\d{4}\.xlsx$/);
    // Artefak yang bisa diperiksa ulang di luar repo: file .xlsx asli dari app.
    // `resolveArtifactDir` menolak path di dalam repo, jadi working tree tidak
    // pernah dipakai tempatartefak.
    const artifact = path.join(
      resolveArtifactDir(),
      download.suggestedFilename(),
    );
    await download.saveAs(artifact);
    console.log(`[artifact] xlsx export: ${artifact}`);
    const workbook = await readDownloadedWorkbook(download);

    expect(Object.keys(workbook)).toContain("Data Laporan");
    const grid = workbook["Data Laporan"];
    // Header ekspor existing dipertahankan (`Seharusnya`, bukan `Rekomendasi`).
    expect(grid[0]).toEqual([
      "Layanan",
      "Periode",
      "Agen",
      "Batch",
      "No. Tiket",
      "Parameter",
      "Temuan",
      "Seharusnya",
      "Skor",
    ]);

    const exportedRows = grid
      .slice(1)
      .filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(exportedRows).toHaveLength(2);
    expect(exportedRows.map((cells) => cells.join(" | "))).toEqual([
      [
        "Call",
        "03/2026",
        "Alya Pranoto",
        "Batch 7",
        "TKT-2026-0142",
        "Akurasi informasi produk",
        FINDING_ACTIONABLE_CALL,
        RECOMMENDATION_ACTIONABLE_CALL,
        "2",
      ].join(" | "),
      [
        "Email",
        "03/2026",
        "Bima Saputra",
        "Batch 7",
        "TKT-2026-0310",
        "Kelengkapan dokumen",
        FINDING_ACTIONABLE_EMAIL,
        RECOMMENDATION_ACTIONABLE_EMAIL,
        "3",
      ].join(" | "),
    ]);

    const allCells = Object.values(workbook).flat(2).join("\n");
    for (const text of NON_ACTIONABLE_TEXTS) {
      expect(
        allCells,
        `ekspor membocorkan baris non-actionable: ${text}`,
      ).not.toContain(text);
    }
    for (const ticket of ["TKT-2026-9001", "TKT-2026-0201", "TKT-2026-0202"]) {
      expect(
        allCells,
        `ekspor membocorkan tiket non-actionable: ${ticket}`,
      ).not.toContain(ticket);
    }

    // Bukti isolasi: tidak ada request ke host eksternal selain font, dan
    // tidak ada endpoint yang tidak dimock.
    expectNoApplicationTraffic(audit);
  });

  test("Nomor tiket ber-spasi tampil sudah dinormalisasi di desktop dan mobile", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ROW_ACTIONABLE_PADDED_TICKET,
    ]);
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");

    // (1) Desktop: tabel yang tampil. `toHaveText` = bacaan user; `rawText` =
    // bukti `.trim()` benar-benar jalan pada nilai yang dirender.
    await expectActiveRepresentation(page, TICKET_DESKTOP_VIEWPORT);
    const desktopCell = desktopTicketCell(page, FINDING_ACTIONABLE_EMAIL);
    await expect(desktopCell).toBeVisible();
    await expect(desktopCell).toHaveText(PADDED_TICKET_VALUE);
    expect(
      await rawText(desktopCell),
      "spasi tepi nomor tiket bocor ke DOM tabel",
    ).toBe(PADDED_TICKET_VALUE);

    // (2) Mobile: daftar ringkas yang sama nilainya, juga tanpa spasi tepi.
    await expectActiveRepresentation(page, TICKET_MOBILE_VIEWPORT);
    const mobileLine = mobileTicketLine(
      page,
      FINDING_ACTIONABLE_EMAIL,
      PADDED_TICKET_VALUE,
    );
    await expect(mobileLine).toBeVisible();
    await expect(mobileLine).toHaveText(`Tiket ${PADDED_TICKET_VALUE}`);
    expect(
      await rawText(mobileLine),
      "spasi tepi nomor tiket bocor ke DOM daftar mobile",
    ).toBe(`Tiket ${PADDED_TICKET_VALUE}`);

    // Baris ini tetap utuh: hanya nomor tiket yang dinormalisasi.
    await expect(
      mobileItemFor(page, FINDING_ACTIONABLE_EMAIL).getByText(
        FINDING_ACTIONABLE_EMAIL,
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    expect(
      RAW_TICKET_PAD,
      "fixture harus benar-benar punya spasi tepi",
    ).not.toBe(PADDED_TICKET_VALUE);

    expectNoApplicationTraffic(audit);
  });

  test("Nomor tiket null atau tidak ada tetap terlihat sebagai - di desktop dan mobile", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ROW_ACTIONABLE_TICKET_NULL,
      ROW_ACTIONABLE_TICKET_ABSENT,
    ]);
    await page.getByRole("button", { name: "Cari Data" }).click();
    // Kedua baris tetap ACTIONABLE: Temuan + Rekomendasi lengkap. Yang berubah
    // hanya kolom nomor tiket, jadi penyingkirannya tidak boleh ikut menurunkan
    // jumlah temuan.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    await expect(resultRows(page)).toHaveCount(2);

    for (const finding of [FINDING_ACTIONABLE_CALL, FINDING_ACTIONABLE_EMAIL]) {
      // (1) Desktop: placeholder harus benar-benar "-" yang terlihat, bukan
      // sel kosong. `rawText` yang membuktikan itu — teks kosong menormalisasi
      // jadi `""`, jadi hanya "-" yang bisa membedakan keduanya.
      await expectActiveRepresentation(page, TICKET_DESKTOP_VIEWPORT);
      const cell = desktopTicketCell(page, finding);
      await expect(cell).toBeVisible();
      await expect(cell).toHaveText("-");
      expect(
        await rawText(cell),
        `placeholder "-" hilang pada baris "${finding.slice(0, 32)}…"`,
      ).toBe("-");

      // (2) Mobile: nilai yang sama, di representasi yang tampil di sana.
      await expectActiveRepresentation(page, TICKET_MOBILE_VIEWPORT);
      const line = mobileTicketLine(page, finding, "-");
      await expect(line).toBeVisible();
      await expect(line).toHaveText("Tiket -");
      expect(
        await rawText(line),
        `placeholder "-" hilang di daftar mobile untuk "${finding.slice(0, 32)}…"`,
      ).toBe("Tiket -");
    }

    expectNoApplicationTraffic(audit);
  });

  test("Excel memakai sel No. Tiket, Temuan, dan Seharusnya yang sama persis dengan UI", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ...EXPORT_PARITY_ROWS,
      ...EXPORT_PARITY_NON_ACTIONABLE,
    ]);

    await page.getByRole("button", { name: "Cari Data" }).click();
    // Ketiga baris paritas tetap ACTIONABLE — yang diuji adalah format sel, bukan
    // kelayakan baris, jadi hitungan tidak boleh turun jadi 0.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText(
      `${EXPORT_PARITY_ROWS.length} temuan`,
    );

    // (1) Acuan pembanding: teks yang benar-benar TERLIHAT di layar, dibaca lewat
    // `textContent` mentah supaya normalisasi whitespace locator tidak menutupi
    // padding. Tiga sel ini tidak boleh dibuktikan "cocok" hanya karena kedua sisi
    // membaca sumber yang sama.
    await expectActiveRepresentation(page, TICKET_DESKTOP_VIEWPORT);
    const uiByAgent = new Map<
      string,
      { ticket: string; finding: string; recommendation: string }
    >();
    for (const agent of EXPORT_PARITY_AGENTS) {
      const row = desktopResults(page)
        .getByRole("row")
        .filter({ hasText: agent });
      await expect(
        row,
        `baris agen "${agent}" tidak ada tepat satu kali di UI`,
      ).toHaveCount(1);
      uiByAgent.set(agent, {
        ticket: await rawText(row.getByRole("cell").nth(TICKET_CELL_INDEX)),
        finding: await rawText(row.getByRole("cell").nth(FINDING_CELL_INDEX)),
        recommendation: await rawText(
          row.getByRole("cell").nth(RECOMMENDATION_CELL_INDEX),
        ),
      });
    }
    // UI sendiri yang jadi kontrak: tiket ber-spasi terpangkas, tiket null dan
    // tiket kosong jadi "-".
    expect(
      RAW_TICKET_PAD,
      "fixture tiket harus benar-benar punya spasi tepi",
    ).not.toBe(PADDED_TICKET_VALUE);
    expect(
      uiByAgent.get("Sari Prasetya")?.ticket,
      "UI belum menormalisasi tiket ber-spasi",
    ).toBe(PADDED_TICKET_VALUE);
    expect(
      uiByAgent.get("Bima Saputra")?.ticket,
      "UI harus menulis - untuk tiket null",
    ).toBe("-");
    expect(
      uiByAgent.get("Citra Lestari")?.ticket,
      "UI harus menulis - untuk tiket kosong",
    ).toBe("-");

    // (2) File Excel sungguhan dari button Export Excel, dibaca dengan exceljs.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^laporan-data-\d{4}\.xlsx$/);
    // Artefak di luar repo yang bisa diperiksa ulang: .xlsx asli dari app.
    const artifact = path.join(resolveArtifactDir(), "export-cell-parity.xlsx");
    await download.saveAs(artifact);
    console.log(`[artifact] xlsx paritas sel: ${artifact}`);

    const workbook = await readDownloadedWorkbook(download);
    expect(Object.keys(workbook)).toContain("Data Laporan");
    const grid = workbook["Data Laporan"];
    const header = grid[0];
    // Header Rekomendasi tetap `Seharusnya` demi kompatibilitas file.
    expect(header).toContain("Seharusnya");
    const columnFor = (label: string): number => {
      const index = header.indexOf(label);
      expect(index, `kolom export "${label}" hilang`).toBeGreaterThanOrEqual(0);
      return index;
    };
    const agentColumn = columnFor("Agen");
    const ticketColumn = columnFor("No. Tiket");
    const findingColumn = columnFor("Temuan");
    const recommendationColumn = columnFor("Seharusnya");

    // (3) Isi sel Excel = isi sel UI, baris per baris.
    const exportedRows = grid
      .slice(1)
      .filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(
      exportedRows,
      "baris non-actionable ikut masuk file Excel",
    ).toHaveLength(EXPORT_PARITY_ROWS.length);
    for (const agent of EXPORT_PARITY_AGENTS) {
      const exported = exportedRows.filter(
        (cells) => cells[agentColumn] === agent,
      );
      expect(
        exported,
        `baris agen "${agent}" tidak ada tepat satu kali di file Excel`,
      ).toHaveLength(1);
      expect(
        {
          ticket: exported[0][ticketColumn],
          finding: exported[0][findingColumn],
          recommendation: exported[0][recommendationColumn],
        },
        `sel Excel untuk "${agent}" berbeda dari yang tampil di UI`,
      ).toEqual(uiByAgent.get(agent));
    }

    // (4) Nilai mentah ber-spasi tidak boleh masuk file sama sekali.
    const allCells = Object.values(workbook).flat(2).join("\n");
    for (const raw of EXPORT_PARITY_RAW_TEXTS) {
      expect(
        allCells,
        `nilai mentah ber-spasi bocor ke Excel: ${JSON.stringify(raw)}`,
      ).not.toContain(raw);
    }
    for (const text of NON_ACTIONABLE_TEXTS) {
      expect(
        allCells,
        `ekspor membocorkan baris non-actionable: ${text}`,
      ).not.toContain(text);
    }

    expect(dataRequests).toHaveLength(1);
    expectNoApplicationTraffic(audit);
  });

  test("Pagination memotong hasil terseleksi dan ekspor tetap memakai seluruh hasil", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // 28 actionable + 2 non-actionable = 30 baris respons.
    await openReportsData(page, audit, dataRequests, [
      ...PAGINATION_ROWS,
      ...PAGINATION_NON_ACTIONABLE,
    ]);

    await page.getByRole("button", { name: "Cari Data" }).click();

    // (1) Seleksi dilakukan SEBELUM pagination: count harus 28, bukan 30. Kalau
    // urannya terbalik, halaman 1 akan menampilkan 25 dari 30 dan baris
    // non-actionable ikut bocor ke layar.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText(
      `${PAGINATION_TOTAL} temuan`,
    );
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }

    // (2) Halaman 1: tepat `pageSize` baris, dan baris pertama halaman 2 belum
    // dirender di representasi mana pun.
    await expect(resultRows(page)).toHaveCount(PAGINATION_PAGE_SIZE);
    await expect(
      resultRows(page).getByText(paginationFinding(PAGINATION_PAGE_SIZE), {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(paginationFinding(PAGINATION_PAGE_SIZE + 1), {
        exact: false,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        `Menampilkan 1-${PAGINATION_PAGE_SIZE} dari ${PAGINATION_TOTAL}`,
      ),
    ).toBeVisible();

    // (3) Halaman 2: hanya sisa 3 baris, dua teks lengkap per baris, dan
    // baris halaman 1 tidak ikut terulang.
    await page.getByRole("button", { name: "Halaman berikutnya" }).click();
    await expect(resultRows(page)).toHaveCount(
      PAGINATION_TOTAL - PAGINATION_PAGE_SIZE,
    );
    await expect(
      page.getByText(
        `Menampilkan ${PAGINATION_PAGE_SIZE + 1}-${PAGINATION_TOTAL} dari ${PAGINATION_TOTAL}`,
      ),
    ).toBeVisible();
    for (let n = PAGINATION_PAGE_SIZE + 1; n <= PAGINATION_TOTAL; n += 1) {
      await expect(
        resultRows(page).getByText(paginationFinding(n), { exact: false }),
      ).toBeVisible();
      await expect(
        resultRows(page).getByText(paginationRecommendation(n), {
          exact: false,
        }),
      ).toBeVisible();
    }
    await expect(
      page.getByText(paginationFinding(1), { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByText(paginationRecommendation(1), { exact: false }),
    ).toHaveCount(0);
    // Count tidak boleh ikut terpotong pagination.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText(
      `${PAGINATION_TOTAL} temuan`,
    );

    // (4) Ekspor memakai seluruh hasil terseleksi, bukan hanya halaman aktif:
    // baris yang hanya ada di halaman 2 wajib ikut di file.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;
    const workbook = await readDownloadedWorkbook(download);
    const grid = workbook["Data Laporan"];
    const exportedRows = grid
      .slice(1)
      .filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(exportedRows).toHaveLength(PAGINATION_TOTAL);
    const allCells = Object.values(workbook).flat(2).join("\n");
    expect(allCells, "baris halaman 2 tidak ikut diekspor").toContain(
      paginationTicket(PAGINATION_TOTAL),
    );
    expect(allCells, "baris halaman 1 tidak ikut diekspor").toContain(
      paginationFinding(1),
    );
    for (const text of NON_ACTIONABLE_TEXTS) {
      expect(
        allCells,
        `ekspor membocorkan baris non-actionable: ${text}`,
      ).not.toContain(text);
    }

    expect(dataRequests).toHaveLength(1);
    expectNoApplicationTraffic(audit);
  });

  // ── Bukti visual: satu loop untuk light (4 viewport) dan dark (representatif)

  for (const theme of ["light", "dark"] as const) {
    const viewports =
      theme === "light"
        ? VISUAL_VIEWPORTS
        : VISUAL_VIEWPORTS.filter((v) => DARK_VIEWPORTS.includes(v.label));

    test(`Tampilan ${theme}: screenshot top+bottom, tanpa overflow, satu representasi per breakpoint`, async ({
      page,
    }) => {
      const audit = startAudit();
      const dataRequests: DataRequest[] = [];
      const dir = resolveArtifactDir();

      await setTheme(page, theme);
      await openPopulatedResults(page, audit, dataRequests, VISUAL_ROWS);
      // `light` tidak menambah class apa pun ke <html> (hanya `dark` yang
      // di-toggle), jadi yang dibuktikan adalah flag dark + background nyata.
      const applied = await page.evaluate(() => ({
        isDark: document.documentElement.classList.contains("dark"),
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
      }));
      expect(applied.isDark, `tema ${theme} tidak diterapkan`).toBe(
        theme === "dark",
      );

      const metrics: Record<string, unknown> = {
        theme: applied,
      };

      // (0) Artefak dulu, untuk SETIAP viewport, dalam satu pass. Dengan begitu
      // run RED yang gagal di assertion pertama tetap menyimpan bukti visual
      // lengkap (top + bottom, light + dark) dari halaman yang sedang berjalan.
      for (const viewport of viewports) {
        await captureViewportPair(page, dir, theme, viewport);
      }

      for (const viewport of viewports) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        // (1) Overflow: nol di dokumen dan di scroll container efektif. App
        // shell `h-screen` membuat dokumen tidak pernah menggulir, jadi angka
        // yang benar-benar mencerminkan layout ada di container halaman.
        const layout = await scrollPageTo(page, "top");
        metrics[`${theme}-${viewport.label}-layout`] = layout;
        console.log(
          `[visual] ${theme} @${viewport.label}px top: ${JSON.stringify(layout)}`,
        );
        expect(
          layout.documentOverflow,
          `overflow dokumen @${viewport.label}px`,
        ).toBe(0);
        expect(
          layout.containerOverflow,
          `overflow container @${viewport.label}px`,
        ).toBe(0);

        // (2) Tepat satu representasi aktif, dan isinya lengkap.
        await assertSingleRepresentation(page, viewport);

        // (3) Bottom-nav fixed tidak boleh menutupi konten terakhir.
        const atBottom = await scrollPageTo(page, "bottom");
        console.log(
          `[visual] ${theme} @${viewport.label}px bottom: ${JSON.stringify(atBottom)}`,
        );
        if (viewport.width < DESKTOP_MIN_WIDTH) {
          expect(
            atBottom.navVisible,
            `bottom-nav tidak ada @${viewport.label}px`,
          ).toBe(true);
          expect(
            atBottom.clearance,
            `ruang aman bawah hanya ${atBottom.clearance}px (elemen terakhir: ${atBottom.lastTag}) @${viewport.label}px`,
          ).toBeGreaterThanOrEqual(35);
        } else {
          expect(
            atBottom.navVisible,
            `bottom-nav tidak boleh tampil @${viewport.label}px`,
          ).toBe(false);
        }
      }

      // (4) Target sentuh: kontrol halaman ini ≥44px di lebar sentuh.
      const targetViewport = MOBILE_VIEWPORTS[0] ?? viewports[0];
      await page.setViewportSize({
        width: targetViewport.width,
        height: targetViewport.height,
      });
      await scrollPageTo(page, "top");
      const sizes = await assertTouchTargets(page);
      metrics[`${theme}-touch-targets`] = sizes;

      // (5) Keyboard: semua kontrol terjangkau Tab dan fokusnya terlihat.
      const order = inScopeControls(page);
      await order[0].focus();
      for (let index = 1; index < order.length; index += 1) {
        await page.keyboard.press("Tab");
        const focused = await readFocusIndicator(page);
        metrics[`${theme}-focus-${index}`] = focused;
        await expect(order[index], `Tab ke-${index}`).toBeFocused();
        expect(
          focused.ring || focused.outline,
          `fokus tidak terlihat pada ${focused.tag} (Tab ke-${index})`,
        ).toBe(true);
      }
      // Cakupan mode terekspos ke assistive tech, bukan hanya warna.
      await expect(
        page.getByRole("button", { name: "Per Layanan" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: "Per Individu" }),
      ).toHaveAttribute("aria-pressed", "false");

      console.log(`[visual] ${theme} metrics: ${JSON.stringify(metrics)}`);
      expectNoApplicationTraffic(audit);
    });
  }
});
