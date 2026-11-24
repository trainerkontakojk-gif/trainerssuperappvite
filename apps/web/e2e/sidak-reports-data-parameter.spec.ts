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
import {
  pickFromTrigger,
  pickSelect,
  selectedLabel,
  selectOptionLabels,
  selectValue,
} from "./helpers/pickSelect";
import {
  type ReportRow,
  IND_CHAT_AKURASI,
  IND_CALL_KEPATUHAN,
  IND_EMAIL_DOKUMEN,
  FINDING_PARAM_CHAT_AKURASI,
  RECOMMENDATION_PARAM_CHAT_AKURASI,
  FINDING_PARAM_CALL_KEPATUHAN,
  FINDING_PARAM_EMAIL_DOKUMEN,
  PARAMETER_ROWS,
  PARAMETER_NON_ACTIONABLE_TEXTS,
  PARAMETER_FINDINGS,
  otherParameterFindings,
  type DataRequest,
  activeReportResponseGate,
  okIndicatorMock,
  createDeferredIndicatorResponse,
  createDeferredReportResponse,
  assertLocalDevOnlyTarget,
  openReportsData,
  expectNoApplicationTraffic,
  resultRows,
  expectOptionCount,
  RESULTS_COUNT,
  desktopResults,
  ALL_SCOPE_PARAMETER_LABELS,
  parameterSelect,
  cariDataButton,
  parameterPendingStatus,
  parameterErrorAlert,
  indicatorRequestLabels,
  INDICATORS_ALL_SCOPE,
  indicatorsForService,
  lastDataRequest,
  exportDataWorkbook,
  activeAudits,
  startAudit,
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

  test("Filter Parameter meneruskan indicatorId di Per Layanan dan Per Individu", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // Mock data dihitung DARI payload: kalau `indicatorId` tidak terkirim,
    // backend (dan karena itu layar + Excel) mengembalikan semua baris. Jadi
    // "UI benar" tidak mungkin terjadi tanpa "request benar".
    await openReportsData(page, audit, dataRequests, (body) => {
      const indicatorId =
        typeof body.indicatorId === "string" ? body.indicatorId : "";
      if (indicatorId === "") return PARAMETER_ROWS;
      return PARAMETER_ROWS.filter((row) => row.indicator_id === indicatorId);
    });

    const searchButton = page.getByRole("button", { name: /Cari Data|Memuat/ });
    const parameter = parameterSelect(page);

    // (1) KEDUA mode punya kontrol yang sama, default "Semuanya" = tanpa
    // filter. Di Per Layanan katalognya seluruh indikator AKTIF; dua
    // parameter bernama sama wajib terbaca berbeda lewat label layanan, dan
    // `parameter_group` ikut tampil lewat `formatQAIndicatorName`.
    await expect(parameter).toBeVisible();
    expect(await selectedLabel(parameter)).toBe("Semuanya");
    expect(await selectOptionLabels(parameter)).toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    // Katalog diambil tanpa `service_type` saat "Semua Layanan" dipilih.
    // Dev server memakai StrictMode, jadi effect mount bisa jalan dua kali;
    // yang dibuktikan adalah ISI query setiap request, bukan jumlah request.
    const catalogBeforeService = indicatorRequestLabels(audit).length;
    expect(
      indicatorRequestLabels(audit).slice(0, catalogBeforeService),
    ).not.toHaveLength(0);
    expect(
      indicatorRequestLabels(audit).every(
        (label) => label === INDICATORS_ALL_SCOPE,
      ),
    ).toBe(true);

    // (2) Tanpa filter parameter, tidak ada `indicatorId` di payload dan
    // semua baris actionable (4 dari 6) yang terlihat.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");

    // (3) Per Layanan + satu layanan → katalog dipersempit dengan query PERSIS
    // `service_type`, dan label tidak perlu prefiks layanan karena sudah pasti.
    const catalogBeforeCall = indicatorRequestLabels(audit).length;
    await pickSelect(page, "Layanan", "Call");
    await expectOptionCount(parameter, 3);
    expect(await selectOptionLabels(parameter)).toEqual([
      "Semuanya",
      "Akurasi informasi produk",
      "Compliance — Kepatuhan prosedur",
    ]);
    const callScopeRequests =
      indicatorRequestLabels(audit).slice(catalogBeforeCall);
    expect(callScopeRequests).not.toHaveLength(0);
    expect(
      callScopeRequests.every(
        (label) => label === indicatorsForService("call"),
      ),
      `query katalog tidak persis: ${callScopeRequests.join(" | ")}`,
    ).toBe(true);

    // (4) Ganti ke Per Individu: tidak ada select Layanan, jadi cakupannya
    // kembali ke seluruh katalog aktif — dan query `service_type` yang masih
    // tersimpan di state layanan TIDAK boleh ikut terpakai.
    const catalogBeforeModeSwitch = indicatorRequestLabels(audit).length;
    await page.getByRole("button", { name: "Per Individu" }).click();
    await expectOptionCount(parameter, 5);
    expect(await selectOptionLabels(parameter)).toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    const modeSwitchRequests = indicatorRequestLabels(audit).slice(
      catalogBeforeModeSwitch,
    );
    expect(modeSwitchRequests).not.toHaveLength(0);
    expect(
      modeSwitchRequests.every((label) => label === INDICATORS_ALL_SCOPE),
      `Per Individu tidak boleh memakai query layanan: ${modeSwitchRequests.join(" | ")}`,
    ).toBe(true);

    // (5) Per Individu + parameter: `indicatorId` menambah satu field pada
    // POST yang sudah ada, field lain tidak berubah dan `serviceType` tetap
    // tidak ada. Nilainya UUID dari katalog, bukan nama parameter.
    await pickSelect(page, "Agen", "Alya Pranoto — Batch 7");
    await pickFromTrigger(parameter, "Chat · Akurasi informasi produk");
    expect(await selectedLabel(parameter)).toBe(
      "Chat · Akurasi informasi produk",
    );
    await searchButton.click();

    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CHAT_AKURASI.id,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("serviceType");
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CHAT_AKURASI, {
        exact: false,
      }),
    ).toBeVisible();
    // Baris parameter lain, phantom, dan baris tanpa Rekomendasi harus hilang.
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CHAT_AKURASI),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }
    await expect(resultRows(page)).toHaveCount(1);

    // (6) Excel mengikuti ID yang terkirim, bukan namanya: parameter Chat dan
    // Call sama-sama bernama "Akurasi informasi produk", jadi kolom Layanan dan
    // Temuan yang membedakan keduanya.
    const chatRows = await exportDataWorkbook(page, "export-parameter-chat");
    expect(chatRows).toHaveLength(1);
    expect(chatRows[0].join(" | ")).toBe(
      [
        "Chat",
        "03/2026",
        "Alya Pranoto",
        "Batch 7",
        "TKT-2026-1102",
        "Akurasi informasi produk",
        FINDING_PARAM_CHAT_AKURASI,
        RECOMMENDATION_PARAM_CHAT_AKURASI,
        "2",
      ].join(" | "),
    );

    // (7) Per Layanan: layanan + parameter bisa digabung, dan pilihan yang
    // masih valid setelah penyempitan cakupannya TETAP terpilih.
    await page.getByRole("button", { name: "Per Layanan" }).click();
    await pickSelect(page, "Layanan", "Call");
    await pickFromTrigger(parameter, "Compliance — Kepatuhan prosedur");
    expect(await selectedLabel(parameter)).toBe(
      "Compliance — Kepatuhan prosedur",
    );
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "call",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      indicatorId: IND_CALL_KEPATUHAN.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, {
        exact: false,
      }),
    ).toBeVisible();
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CALL_KEPATUHAN),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }

    // (8) Cakupan berubah jadi layanan yang tidak punya parameter itu:
    // pilihan lama tidak bisa dikirim sebagai filter yatim, jadi dibersihkan
    // ke "Semuanya" dan hasil lama (count + export) langsung hilang.
    await pickSelect(page, "Layanan", "Email");
    await expect(selectValue(parameter)).toHaveText("Semuanya");
    expect(await selectedLabel(parameter)).toBe("Semuanya");
    await expectOptionCount(parameter, 2);
    expect(await selectOptionLabels(parameter)).toEqual([
      "Semuanya",
      "Kelengkapan dokumen",
    ]);
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);
    await searchButton.click();
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "email",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");

    // (9) Respons yang telat untuk parameter LAMA tidak boleh muncul sebagai
    // hasil parameter baru: request Email ditahan, filter diganti ke
    // Kepatuhan prosedur, baru responsnya dilepas.
    await pickSelect(page, "Layanan", "Semua Layanan");
    await expect(selectValue(page.getByRole("combobox", { name: "Layanan" }))).toHaveText("Semua Layanan");
    await expect(parameter).toBeEnabled();
    await pickFromTrigger(parameter, "Email · Kelengkapan dokumen");
    const deferred = createDeferredReportResponse();
    await searchButton.click();
    await deferred.arrived;
    expect(lastDataRequest(dataRequests).indicatorId).toBe(
      IND_EMAIL_DOKUMEN.id,
    );

    await pickFromTrigger(parameter, "Call · Compliance — Kepatuhan prosedur");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    deferred.release();
    await expect(searchButton).toBeEnabled();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    for (const text of [
      FINDING_PARAM_EMAIL_DOKUMEN,
      FINDING_PARAM_CALL_KEPATUHAN,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);

    // (10) Guard tidak mematikan flow: pencarian dengan parameter baru tetap
    // mengisi hasil yang benar.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests).indicatorId).toBe(
      IND_CALL_KEPATUHAN.id,
    );
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, {
        exact: false,
      }),
    ).toBeVisible();
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CALL_KEPATUHAN),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }

    // (11) Mengosongkan filter mengembalikan hasil penuh: `indicatorId` dihapus
    // dari payload, tabel dan Excel kembali ke semua baris actionable.
    await pickFromTrigger(parameter, "Semuanya");
    expect(await selectedLabel(parameter)).toBe("Semuanya");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("serviceType");

    const allRows = await exportDataWorkbook(page, "export-parameter-semua");
    expect(allRows).toHaveLength(4);
    expect(allRows.map((cells) => cells[0])).toEqual([
      "Call",
      "Chat",
      "Call",
      "Email",
    ]);
    const allCells = allRows.map((cells) => cells.join(" | ")).join("\n");
    for (const text of PARAMETER_NON_ACTIONABLE_TEXTS) {
      expect(
        allCells,
        `ekspor bocor baris non-actionable: ${text}`,
      ).not.toContain(text);
    }
    for (const finding of PARAMETER_FINDINGS) {
      expect(
        allCells,
        `baris parameter tidak ikut diekspor: ${finding}`,
      ).toContain(finding);
    }

    // Bukti-kriteria katalog: hanya endpoint mock yang dilayani, dan tidak
    // ada satu pun request `/api` yang lolos ke proxy Vite.
    expect(audit.blockedApi).toEqual([]);
    expect(
      indicatorRequestLabels(audit).every((label) =>
        label.startsWith(INDICATORS_ALL_SCOPE),
      ),
    ).toBe(true);
    expectNoApplicationTraffic(audit);
  });

  // ── Validasi katalog pada transisi cakupan ────────────────────────────────
  // Keempat test di bawah satu kontrak yang sama: pilihan Parameter hanya boleh
  // dibuang setelah katalog BARU benar-benar selesai dan UUID itu terbukti
  // tidak ada di sana. Selama transisi, katalog lama tidak boleh dijualkan
  // sebagai daftar cakupan baru, filter basi tidak boleh terkirim, dan "Cari
  // Data" tidak boleh Claims hasil tak terfilter.

  /** Baris dihitung dari `indicatorId` yang benar-benar terkirim. */
  const parameterAwareRows = (body: Record<string, unknown>): ReportRow[] => {
    const indicatorId =
      typeof body.indicatorId === "string" ? body.indicatorId : "";
    if (indicatorId === "") return PARAMETER_ROWS;
    return PARAMETER_ROWS.filter((row) => row.indicator_id === indicatorId);
  };

  test("Parameter terpilih tetap terpilih saat cakupan melebar dan tidak terkirim selama transisi", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(
      page,
      audit,
      dataRequests,
      parameterAwareRows,
      indicators,
    );

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    // (1) Titik awal: seluruh katalog aktif, lalu cakupannya menyempit ke Call
    // dan satu parameter dipilih.
    await expectOptionCount(parameter, 5);
    await pickSelect(page, "Layanan", "Call");
    await expectOptionCount(parameter, 3);
    await pickFromTrigger(parameter, "Compliance — Kepatuhan prosedur");
    expect(await selectedLabel(parameter)).toBe(
      "Compliance — Kepatuhan prosedur",
    );

    // (2) Cakupan MELAR: Per Individu tidak punya select Layanan, jadi katalognya
    // seluruh katalog aktif. Respons ditahan supaya keadaan transisi benar-benar
    // terlihat — tanpa penahanan, seluruh assertion di bawah bisa lolos dalam
    // satu frame dan tidak membuktikan apa pun.
    const pending = createDeferredIndicatorResponse(indicators);
    await page.getByRole("button", { name: "Per Individu" }).click();
    await pending.arrived;

    await expect(parameter).toBeDisabled();
    // Katalog lama (2 parameter Call) tidak boleh stubbornly offering diri
    // sebagai daftar Parameter cakupan baru.
    await expectOptionCount(parameter, 1);
    await expect(parameterPendingStatus(page)).toBeVisible();
    // Agen dipilih lebih dulu, jadi satu-satunya alasan "Cari Data" disabled
    // adalah katalog yang belum divalidasi.
    await pickSelect(page, "Agen", "Alya Pranoto — Batch 7");
    await expect(search).toBeDisabled();
    // Klik paksa ke tombol disabled tidak boleh menghasilkan request: inilah
    // fail-closed-nya, bukan sekadar tombol yang terlihat mati.
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(
      dataRequests,
      "Cari Data mengirim request saat katalog belum tervalidasi",
    ).toEqual([]);

    // (3) Katalog baru sudah settle dan UUID itu MASIH ADA di sana, jadi
    // pilihan wajib utuh. Cakupan melebar tidak berarti pilihan dibuang.
    pending.release();
    await expectOptionCount(parameter, 5);
    expect(await selectOptionLabels(parameter)).toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    expect(await selectedLabel(parameter)).toBe(
      "Call · Compliance — Kepatuhan prosedur",
    );
    await expect(search).toBeEnabled();

    // (4) Yang terkirim harus sama dengan yang tampil.
    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CALL_KEPATUHAN.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, {
        exact: false,
      }),
    ).toBeVisible();

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Katalog parameter yang gagal menutup filter dan retry memulihkan pilihan yang masih valid", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(
      page,
      audit,
      dataRequests,
      parameterAwareRows,
      indicators,
    );

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expectOptionCount(parameter, 5);
    await pickSelect(page, "Layanan", "Call");
    await expectOptionCount(parameter, 3);
    await pickFromTrigger(parameter, "Compliance — Kepatuhan prosedur");

    // Cakupan melebar ke seluruh layanan, tapi request katalognya gagal (500).
    indicators.mode = "error";
    indicators.message = "Gagal memuat daftar parameter.";
    await pickSelect(page, "Layanan", "Semua Layanan");

    await expect(parameterErrorAlert(page)).toBeVisible();
    await expect(parameter).toBeDisabled();
    await expectOptionCount(parameter, 1);
    // Kegagalan katalog tidak boleh dipresentasikan sebagai "Semuanya" yang
    // sah: tombol cari harus tetap tertutup supaya tidak ada laporan
    // tak terfilter yang diklaim.
    await expect(search).toBeDisabled();
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(
      dataRequests,
      "request tak terfilter lolos saat katalog gagal",
    ).toEqual([]);

    // Retry: katalog kembali, dan UUID yang masih valid dipulihkan utuh —
    // kegagalan sesaat tidak boleh menghapus pilihan user.
    indicators.mode = "ok";
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expectOptionCount(parameter, 5);
    expect(await selectOptionLabels(parameter)).toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    expect(await selectedLabel(parameter)).toBe(
      "Call · Compliance — Kepatuhan prosedur",
    );
    await expect(search).toBeEnabled();

    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      indicatorId: IND_CALL_KEPATUHAN.id,
    });

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Respons katalog cakupan lama yang telat diabaikan saat cakupan berubah cepat", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(
      page,
      audit,
      dataRequests,
      parameterAwareRows,
      indicators,
    );

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expectOptionCount(parameter, 5);
    await pickFromTrigger(parameter, "Chat · Akurasi informasi produk");

    // Request Email ditahan: user sudah pindah cakupan sebelum responsnya tiba.
    const stale = createDeferredIndicatorResponse(indicators);
    await pickSelect(page, "Layanan", "Email");
    await stale.arrived;
    await expect(parameter).toBeDisabled();

    // Klik kedua SAAT request pertama masih tertahan: katalog seluruh layanan
    // dilayani normal dan harus menang.
    await page.getByRole("button", { name: "Per Individu" }).click();
    await expectOptionCount(parameter, 5);
    expect(await selectedLabel(parameter)).toBe(
      "Chat · Akurasi informasi produk",
    );

    // Respons Email yang telat sekarang dilepas. Kalau tidak diabaikan, katalog
    // Email (2 opsi) akan menggantikan katalog seluruh layanan dan pilihan Chat
    // ikut terhapus.
    stale.release();
    await page.waitForTimeout(400);
    expect(await selectOptionLabels(parameter)).toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    expect(await selectedLabel(parameter)).toBe(
      "Chat · Akurasi informasi produk",
    );

    // Bukti kedua request benar-benar terjadi, jadi test ini tidak lolos
    // karena tidak ada balasan yang perlu diabaikan.
    const catalogRequests = indicatorRequestLabels(audit);
    expect(catalogRequests).toContain(indicatorsForService("email"));
    expect(
      catalogRequests.filter((label) => label === INDICATORS_ALL_SCOPE).length,
      "katalog seluruh layanan tidak diminta ulang setelah pindah cakupan",
    ).toBeGreaterThan(1);

    await pickSelect(page, "Agen", "Alya Pranoto — Batch 7");
    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CHAT_AKURASI.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CHAT_AKURASI, {
        exact: false,
      }),
    ).toBeVisible();

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Pilihan yang tidak ada di katalog baru dibersihkan tanpa pernah terkirim selama transisi", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(
      page,
      audit,
      dataRequests,
      parameterAwareRows,
      indicators,
    );

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expectOptionCount(parameter, 5);
    await pickFromTrigger(parameter, "Call · Akurasi informasi produk");
    expect(await selectedLabel(parameter)).toBe(
      "Call · Akurasi informasi produk",
    );

    // Cakupan menyempit ke Email dan responsnya ditahan.
    const pending = createDeferredIndicatorResponse(indicators);
    await pickSelect(page, "Layanan", "Email");
    await pending.arrived;

    // Selama transisi UUID lama tidak boleh terlihat sebagai pilihan yang masih
    // berlaku...
    await expect(parameter).toBeDisabled();
    await expect(selectValue(parameter)).toHaveText("Semuanya");
    await expectOptionCount(parameter, 1);
    await expect(parameterPendingStatus(page)).toBeVisible();
    await expect(search).toBeDisabled();
    // ...dan tidak boleh terkirim sebagai filter yatim di tengah jalan.
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(
      dataRequests,
      "filter yatim terkirim selama transisi cakupan",
    ).toEqual([]);

    // Baru setelah katalog Email selesai dan UUID itu memang tidak ada di sana,
    // pilihan dibersihkan ke "Semuanya".
    pending.release();
    await expectOptionCount(parameter, 2);
    expect(await selectOptionLabels(parameter)).toEqual([
      "Semuanya",
      "Kelengkapan dokumen",
    ]);
    expect(await selectedLabel(parameter)).toBe("Semuanya");

    await search.click();
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "email",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });
});
