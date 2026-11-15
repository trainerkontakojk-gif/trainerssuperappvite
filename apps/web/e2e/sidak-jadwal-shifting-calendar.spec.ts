import { expect, test } from "@playwright/test";
import {
  FIXTURE_MONTH,
  assertLocalDevOnlyTarget,
  capturedJadwalRequests,
  expectIsolation,
  openJadwalShifting,
  resetCapturedJadwalRequests,
} from "./helpers/sidakJadwalShiftingHarness";
import { createResponseGate } from "./helpers/responseGate";
import {
  loopExitBrowserEvents,
  expectPageShell,
  readCalendarGeometry,
  attachCalendarMetrics,
  expectCalendarLayoutContract,
  selectSection,
  MATRIX_ROWS,
  BIG_MATRIX_ROWS,
} from "./helpers/sidakJadwalShiftingFixtures";

/**
 * E2E untuk workspace `/sidak/jadwal-shifting`.
 *
 * Layer yang dibuktikan di sini adalah APA YANG DILIHAT PENGGUNA:
 *   - Role gate di navigasi dan di route (deep link), untuk `admin`/`trainer`
 *     Versus `leader`/`agent` yang TIDAK boleh masuk.
 *   - Keempat state UI: memuat, kosong, gagal, dan data + "terakhir diperbarui".
 *   - Shift yang melintasi tengah malam ditampilkan utuh.
 *   - Browser hanya memanggil API Trainers: tidak ada kontak ke WFM/GAS, tidak
 *     ada `/api` di luar allowlist, dan tidak ada operasi tulis sama sekali.
 *
 * Kontrak backend (role gate di router Hono, allowlist respons, error upstream
 * yang tidak disamarkan sebagai jadwal kosong) dibuktikan di
 * `sidak-jadwal-shifting-api.spec.ts` terhadap router asli + stub upstream.
 *
 * Isolasi: `assertLocalDevOnlyTarget` (preflight) + `installNetworkGuard`
 * fail-closed. Lihat komentar di `helpers/sidakJadwalShiftingHarness.ts`.
 */

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test.beforeEach(({ page }, testInfo) => {
  resetCapturedJadwalRequests();
  if (!testInfo.title.includes("[loop-exit]")) return;
  const events = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  loopExitBrowserEvents.set(page, events);
  page.on("console", (message) => {
    if (message.type() === "error") events.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => events.pageErrors.push(error.message));
});

test.afterEach(async ({ page }, testInfo) => {
  const events = loopExitBrowserEvents.get(page);
  if (!events) return;
  await testInfo.attach("browser-events.json", {
    body: JSON.stringify(
      {
        browserVersion: page.context().browser()?.version() ?? "unknown",
        consoleErrors: events.consoleErrors,
        pageErrors: events.pageErrors,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test.describe("Format kalender (matriks agen × hari)", () => {
  test("barisnya agent dan kolomnya tanggal bulan terpilih, sel berisi kode shift", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });

    await expectPageShell(page);
    const grid = page.getByTestId("jadwal-shifting-calendar");
    await expect(grid, "matriks kalender tidak dirender").toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    // Baris = agent, bukan tanggal. Dua agen pada bagian Call.
    const agentRows = page.getByTestId("jadwal-shifting-matrix-row");
    await expect(agentRows, "baris agent tidak dirender").toHaveCount(2);
    await expect(agentRows.nth(0)).toContainText("Alya Pranoto");
    await expect(agentRows.nth(1)).toContainText("Bagas Prakoso");
    // Team leader tampil sebagai metadata baris, bukan kolom tersendiri.
    await expect(agentRows.nth(0)).toContainText("Rina Salim");

    // Kolom = tanggal. September 2026 mulai Selasa; tanggal di luar bulan
    // (2026-10-02) tidak boleh jadi kolom.
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-09-01"),
      "kolom 1 September tidak ada",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-09-30"),
      "kolom 30 September tidak ada",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-matrix-col-2026-10-02"),
      "tanggal di luar bulan tidak boleh jadi kolom",
    ).toHaveCount(0);

    // Sel berisi kode shift apa adanya, dan rekap dihitung dari kode itu.
    const alyaDay1 = page.getByTestId(
      "jadwal-shifting-cell-Alya_Pranoto-2026-09-01",
    );
    await expect(alyaDay1, "sel 1 September Alya tidak dirender").toHaveText(
      "H",
    );
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-02"),
    ).toHaveText("OFF");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-03"),
    ).toHaveText("CUTI");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-04"),
    ).toHaveText("TBCCI");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-07"),
    ).toHaveText("S2");

    // Tanggal tanpa baris untuk agen itu → sel kosong, bukan "—".
    await expect(
      page.getByTestId("jadwal-shifting-cell-Alya_Pranoto-2026-09-05"),
      "sel tanpa jadwal tidak dirender",
    ).toHaveText("");

    expectIsolation(audit);
  });

  test("rekap per baris menghitung CUTI, OFF, TBCCI, dan jumlah hari kerja", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);

    // Rekap adalah milik satu baris agen, jadi di-scope ke baris itu — bukan
    // dikumpulkan lintas semua sel. Empat kolom rekap = empat sel per baris.
    const alyaRow = page.getByTestId("jadwal-shifting-matrix-row").nth(0);
    await expect(
      alyaRow.getByTestId("jadwal-shifting-matrix-summary"),
      "satu blok rekap per baris agen",
    ).toHaveCount(1);
    // Empat angka harus tetap dipisah testid masing-masing.
    for (const field of ["cuti", "off", "tbcc", "work"] as const) {
      await expect(
        alyaRow.getByTestId(`jadwal-shifting-summary-${field}`),
        `angka rekap ${field} tidak ada di dalam blok rekap`,
      ).toHaveCount(1);
    }

    // Alya: H, OFF, CUTI, TBCCI, S2 → cuti 1, off 1, tbcc 1, kerja 3.
    // TBCCI ikut terhitung hari kerja: kodenya berarti jadwal kerja (dibaca
    // sebagai sel hijau pada matriks acuan), bukan hari tanpa duty. Menghilangkannya
    // dari rekap akan membuat Training Days selalu 0.
    const alya = alyaRow;
    await expect(
      alya.getByTestId("jadwal-shifting-summary-cuti"),
      "rekap CUTI Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-off"),
      "rekap OFF Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-tbcc"),
      "rekap TBCCI Alya salah",
    ).toHaveText("1");
    await expect(
      alya.getByTestId("jadwal-shifting-summary-work"),
      "jumlah hari kerja Alya salah",
    ).toHaveText("3");

    // Bagas (bulan September saja): H, S1, H, OFF, H → cuti 0, off 1, tbcc 0,
    // kerja 4 (H + S1 + H + H). Baris 2026-10-02 di luar bulan tidak dihitung.
    const bagas = page.getByTestId("jadwal-shifting-matrix-row").nth(1);
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-cuti"),
      "rekap CUTI Bagas salah",
    ).toHaveText("0");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-off"),
      "rekap OFF Bagas salah",
    ).toHaveText("1");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-tbcc"),
      "rekap TBCCI Bagas salah",
    ).toHaveText("0");
    await expect(
      bagas.getByTestId("jadwal-shifting-summary-work"),
      "jumlah hari kerja Bagas salah",
    ).toHaveText("4");
  });

  test("pencarian nama menyaring baris dan kolom rekap ikut menyesuaikan", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-matrix-row")).toHaveCount(2);

    await page.getByTestId("jadwal-shifting-agent-search").fill("alya");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row"),
      "pencarian nama tidak menyaring baris",
    ).toHaveCount(1);
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row").first(),
    ).toContainText("Alya Pranoto");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-summary"),
      "kolom rekap tidak menyesuaikan jumlah baris hasil pencarian",
    ).toHaveCount(1);

    // Pencarian tidak boleh memicu pembacaan baru ke upstream.
    expect(
      capturedJadwalRequests().every((r) => r.method === "GET"),
      "pencarian nama harus murni di klien",
    ).toBe(true);
  });

  test("bagian Email menukar isi matriks dan bukan menampilkan sisa bagian Call", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-matrix-row")).toHaveCount(2);

    // Default kalender = Call; membuka selector harus menandai bagian aktif,
    // bukan selalu "semua".
    await selectSection(page, "call", "email");
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row"),
      "baris dari bagian lain masih tampil",
    ).toHaveCount(1);
    await expect(
      page.getByTestId("jadwal-shifting-matrix-row").first(),
    ).toContainText("Citra Wulandari");
    await expect(
      page.getByTestId("jadwal-shifting-cell-Citra_Wulandari-2026-09-01"),
    ).toHaveText("H");
  });

  test("navigasi bulan mengirim bulan yang diminta ke API dan tetap hanya-baca", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: MATRIX_ROWS },
    });
    await expectPageShell(page);
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    const monthCalls = () =>
      capturedJadwalRequests().filter((r) => r.path.endsWith("/month"));

    await page.getByTestId("jadwal-shifting-month-next").click();
    await expect
      .poll(() => monthCalls().at(-1)?.month, { timeout: 10_000 })
      .toBe("2026-10");
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "Oktober 2026",
    );
    // Data bulan berikutnya benar-benar mengikuti bulan yang diminta.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Bagas_Prakoso-2026-10-02"),
    ).toHaveText("H");

    await page.getByTestId("jadwal-shifting-month-prev").click();
    await expect
      .poll(() => monthCalls().at(-1)?.month, { timeout: 10_000 })
      .toBe(FIXTURE_MONTH);
    await expect(page.getByTestId("jadwal-shifting-month-label")).toHaveText(
      "September 2026",
    );

    expect(
      monthCalls().every((r) => r.method === "GET"),
      "kalender harus selalu GET",
    ).toBe(true);
    expectIsolation(audit);
  });

  const LOOP_EXIT_VIEWPORTS = [
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 480, height: 800 },
    { width: 390, height: 844 },
    { width: 1280, height: 400 },
    { width: 1280, height: 300 },
    { width: 390, height: 400 },
  ] as const;
  const LOOP_EXIT_FONT_SIZES = [14, 20, 28] as const;

  for (const viewport of LOOP_EXIT_VIEWPORTS) {
    test(`[loop-exit] ${viewport.width}×${viewport.height} at font 14/20/28px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const audit = await openJadwalShifting(page, {
        view: "calendar",
        month: FIXTURE_MONTH,
        behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
      });
      await expectPageShell(page);
      await expect(page.getByTestId("jadwal-shifting-calendar")).toBeVisible();
      const fontStyle = await page.addStyleTag({
        content: `html { font-size: ${LOOP_EXIT_FONT_SIZES[0]}px !important; }`,
      });

      for (const rootFontSize of LOOP_EXIT_FONT_SIZES) {
        await fontStyle.evaluate((style, fontSize) => {
          style.textContent = `html { font-size: ${fontSize}px !important; }`;
        }, rootFontSize);
        await expect
          .poll(() =>
            page.evaluate(() =>
              Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
              ),
            ),
          )
          .toBe(rootFontSize);

        const metrics = await readCalendarGeometry(page);
        await attachCalendarMetrics(
          testInfo,
          `layout-metrics-${rootFontSize}px.json`,
          {
            browserVersion: page.context().browser()?.version() ?? "unknown",
            expectedFontSize: rootFontSize,
            metrics,
          },
        );
        expect(metrics.viewport).toEqual(viewport);
        expect(metrics.rootFontSize).toBe(rootFontSize);
        expect(metrics.matrix.scrollWidth).toBeGreaterThan(
          metrics.matrix.clientWidth,
        );
        expect(metrics.matrix.scrollHeight).toBeGreaterThan(
          metrics.matrix.clientHeight,
        );
        expectCalendarLayoutContract(metrics);
      }
      expectIsolation(audit);
    });
  }

  test("[loop-exit] matriks dan kontrol benar-benar menggulir; keyboard mencapai filter dan Hari ini", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
    });
    await expectPageShell(page);
    const controls = page.getByTestId("jadwal-shifting-calendar-controls");
    const matrix = page.getByTestId("jadwal-shifting-calendar");
    await expect(matrix).toBeVisible();
    await page.addStyleTag({
      content: "html { font-size: 28px !important; }",
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          ),
        ),
      )
      .toBe(28);

    const initial = await readCalendarGeometry(page);
    expectCalendarLayoutContract(initial);
    const mobileScreenshotPath = testInfo.outputPath(
      "calendar-mobile-large-text.png",
    );
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    await testInfo.attach("calendar-mobile-large-text.png", {
      path: mobileScreenshotPath,
      contentType: "image/png",
    });
    expect(initial.matrix.scrollWidth).toBeGreaterThan(
      initial.matrix.clientWidth,
    );
    expect(initial.matrix.scrollHeight).toBeGreaterThan(
      initial.matrix.clientHeight,
    );
    expect(["auto", "scroll"]).toContain(initial.matrix.style.overflowX);
    expect(["auto", "scroll"]).toContain(initial.matrix.style.overflowY);
    expect(initial.controls.scrollHeight).toBeGreaterThan(
      initial.controls.clientHeight,
    );
    expect(["auto", "scroll"]).toContain(initial.controls.style.overflowX);
    expect(["auto", "scroll"]).toContain(initial.controls.style.overflowY);

    expect(initial.matrix.scrollLeft).toBe(0);
    expect(initial.matrix.scrollTop).toBe(0);
    expect(initial.controls.scrollTop).toBe(0);
    await matrix.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => matrix.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect
      .poll(() => matrix.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await controls.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => controls.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const noteParagraphs = controls
      .getByTestId("jadwal-shifting-calendar-notes")
      .locator("p");
    await noteParagraphs.nth(0).scrollIntoViewIfNeeded();
    await expect(noteParagraphs.nth(0)).toBeInViewport();
    await noteParagraphs.nth(1).scrollIntoViewIfNeeded();
    await expect(noteParagraphs.nth(1)).toBeInViewport();

    const afterScroll = await readCalendarGeometry(page);
    expectCalendarLayoutContract(afterScroll);
    expect(afterScroll.matrix.scrollLeft).toBeGreaterThan(
      initial.matrix.scrollLeft,
    );
    expect(afterScroll.matrix.scrollTop).toBeGreaterThan(
      initial.matrix.scrollTop,
    );
    expect(afterScroll.controls.scrollTop).toBeGreaterThan(
      initial.controls.scrollTop,
    );
    expect(
      Math.abs(afterScroll.matrix.rect.height - initial.matrix.rect.height),
    ).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 480, height: 800 });
    await page.addStyleTag({
      content: "html { font-size: 20px !important; }",
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
          ),
        ),
      )
      .toBe(20);
    const afterResize = await readCalendarGeometry(page);
    expectCalendarLayoutContract(afterResize);
    await attachCalendarMetrics(testInfo, "scroll-metrics.json", {
      initial,
      afterScroll,
      afterResize,
    });

    await controls.evaluate((el) => {
      el.scrollTop = 0;
    });
    const agentSearch = page.getByTestId("jadwal-shifting-agent-search");
    await agentSearch.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByTestId("jadwal-shifting-section-call"),
    ).toBeFocused();
    await expect(
      page.getByTestId("jadwal-shifting-section-call"),
    ).toBeInViewport();

    const calendarTab = page.getByRole("tab", { name: "Kalender" });
    await calendarTab.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Hari ini" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("jadwal-shifting-table")).toBeVisible();

    expectIsolation(audit);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`[loop-exit] sticky corner and identity stay opaque in ${theme} mode`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const audit = await openJadwalShifting(page, {
        view: "calendar",
        month: FIXTURE_MONTH,
        behavior: { kind: "data", monthRows: BIG_MATRIX_ROWS },
      });
      const matrix = page.getByTestId("jadwal-shifting-calendar");
      await expect(matrix).toBeVisible();
      await page.evaluate((isDark) => {
        document.documentElement.classList.toggle("dark", isDark);
      }, theme === "dark");
      await matrix.evaluate((el) => {
        el.scrollLeft = 240;
        el.scrollTop = 220;
      });
      await expect
        .poll(() => matrix.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      await expect
        .poll(() => matrix.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);

      const stickyMetrics = await page.evaluate(() => {
        const matrixElement = document.querySelector<HTMLElement>(
          '[data-testid="jadwal-shifting-calendar"]',
        );
        const corner = matrixElement?.querySelector<HTMLElement>(
          "thead th:first-child",
        );
        const rowHeads = Array.from(
          matrixElement?.querySelectorAll<HTMLElement>("tbody th") ?? [],
        );
        const rowHead = rowHeads.find((candidate) => {
          const box = candidate.getBoundingClientRect();
          const region = matrixElement?.getBoundingClientRect();
          return Boolean(
            region && box.bottom > region.top + 32 && box.top < region.bottom,
          );
        });
        const sampleAlpha = (element: HTMLElement | undefined) => {
          if (!element) return null;
          const color = getComputedStyle(element).backgroundColor;
          if (!color || !CSS.supports("color", color)) return null;
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext("2d");
          if (!context) return null;
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return {
            color,
            alpha: context.getImageData(0, 0, 1, 1).data[3],
            opacity: Number.parseFloat(getComputedStyle(element).opacity),
          };
        };
        if (!matrixElement || !corner || !rowHead) return null;
        const matrixRect = matrixElement.getBoundingClientRect();
        const cornerRect = corner.getBoundingClientRect();
        const rowRect = rowHead.getBoundingClientRect();
        const style = getComputedStyle(matrixElement);
        const borderTop = Number.parseFloat(style.borderTopWidth);
        const borderLeft = Number.parseFloat(style.borderLeftWidth);
        const x = rowRect.left + Math.min(12, rowRect.width / 2);
        const y = rowRect.top + rowRect.height / 2;
        const hit = document.elementsFromPoint(x, y);
        return {
          corner: sampleAlpha(corner),
          rowHead: sampleAlpha(rowHead),
          cornerTopDelta: Math.abs(
            cornerRect.top - (matrixRect.top + borderTop),
          ),
          rowHeadLeftDelta: Math.abs(
            rowRect.left - (matrixRect.left + borderLeft),
          ),
          hitIdentity: hit.some(
            (element) => rowHead === element || rowHead.contains(element),
          ),
          matrixRect: {
            left: matrixRect.left,
            top: matrixRect.top,
            right: matrixRect.right,
            bottom: matrixRect.bottom,
          },
          hitPoint: { x, y },
        };
      });
      expect(
        stickyMetrics,
        "corner/row identity metrics must exist",
      ).not.toBeNull();
      expect(stickyMetrics?.corner?.alpha).toBe(255);
      expect(stickyMetrics?.rowHead?.alpha).toBe(255);
      expect(stickyMetrics?.corner?.opacity).toBe(1);
      expect(stickyMetrics?.rowHead?.opacity).toBe(1);
      expect(stickyMetrics?.cornerTopDelta).toBeLessThanOrEqual(2);
      expect(stickyMetrics?.rowHeadLeftDelta).toBeLessThanOrEqual(2);
      expect(stickyMetrics?.hitIdentity).toBe(true);

      const screenshotPath = testInfo.outputPath(`sticky-overlap-${theme}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await testInfo.attach(`sticky-overlap-${theme}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      await attachCalendarMetrics(
        testInfo,
        `sticky-${theme}.json`,
        stickyMetrics,
      );
      expectIsolation(audit);
    });
  }

  test("[loop-exit] loading calendar states occupy the bounded result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    // Respons bulan ditahan sampai dilepas, jadi state loading stabil
    // berapa pun lambatnya runner.
    const gate = createResponseGate();
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        holdUntil: gate.promise,
        monthRows: MATRIX_ROWS,
      },
    });
    const slot = page.getByTestId("jadwal-shifting-view-calendar");
    const loading = page.getByTestId("jadwal-shifting-month-state-loading");
    await expect(loading).toBeVisible();
    await expect(slot).toBeVisible();
    // Kalender baru dirender setelah data tiba, bukan saat loading.
    await expect(page.getByTestId("jadwal-shifting-calendar")).toHaveCount(0);
    gate.release();
    await expect(page.getByTestId("jadwal-shifting-calendar")).toBeVisible();
    await expect(loading).toHaveCount(0);
    expectIsolation(audit);
  });

  test("[loop-exit] error calendar state stays reachable in the result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "error",
        status: 502,
        code: "WFM_UNAVAILABLE",
        message: "Sumber jadwal WFM sedang tidak dapat dihubungi.",
      },
    });
    const slot = page.getByTestId("jadwal-shifting-view-calendar");
    await expect(slot).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-month-state-error"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /coba lagi/i }),
    ).toBeVisible();
    expectIsolation(audit);
  });

  test("[loop-exit] empty calendar state stays reachable in the result slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: { kind: "empty" },
    });
    await expect(
      page.getByTestId("jadwal-shifting-view-calendar"),
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-month-state-empty"),
    ).toBeVisible();
    expectIsolation(audit);
  });

  test("[loop-exit] truncated warning and no-results state remain reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 400 });
    const audit = await openJadwalShifting(page, {
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        truncated: true,
        monthRows: MATRIX_ROWS,
      },
    });
    const controls = page.getByTestId("jadwal-shifting-calendar-controls");
    await expect(controls).toBeVisible();
    const warning = page.getByTestId("jadwal-shifting-month-truncated");
    await expect(warning).toBeVisible();
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeInViewport();
    const requestCount = capturedJadwalRequests().length;
    await page
      .getByTestId("jadwal-shifting-agent-search")
      .fill("no matching agent");
    await expect(page.getByText("Tidak ada agen yang cocok")).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-view-calendar"),
    ).toBeVisible();
    expect(capturedJadwalRequests()).toHaveLength(requestCount);
    expect(await controls.evaluate((el) => el.scrollHeight)).toBeGreaterThan(
      await controls.evaluate((el) => el.clientHeight),
    );
    expectIsolation(audit);
  });

  test("kode shift yang tidak dikenal tetap ditampilkan utuh, bukan dianggap libur", async ({
    page,
  }) => {
    await openJadwalShifting(page, {
      role: "trainer",
      view: "calendar",
      month: FIXTURE_MONTH,
      behavior: {
        kind: "data",
        monthRows: [
          {
            nama: "Sari Melati",
            tl: "Yusuf Hakim",
            channel: "Call",
            shift: "WFH",
            date: "2026-09-01",
          },
          {
            nama: "Sari Melati",
            tl: "Yusuf Hakim",
            channel: "Call",
            shift: "",
            date: "2026-09-02",
          },
        ],
      },
    });
    await expectPageShell(page);

    // Kode tak dikenal: tampil utuh. Tidak boleh hilang atau jadi "libur" —
    // kehilangan kode shift lebih berbahaya daripada warna yang meleset.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Sari_Melati-2026-09-01"),
    ).toHaveText("WFH");
    // Rekap tidak boleh menghitung kode tak dikenal sebagai CUTI/OFF.
    const summary = page.getByTestId("jadwal-shifting-matrix-row").first();
    await expect(
      summary.getByTestId("jadwal-shifting-summary-cuti"),
    ).toHaveText("0");
    await expect(summary.getByTestId("jadwal-shifting-summary-off")).toHaveText(
      "0",
    );
    // Shift kosong = tidak ada shift, jadi bukan hari kerja.
    await expect(
      page.getByTestId("jadwal-shifting-cell-Sari_Melati-2026-09-02"),
    ).toHaveText("");
    await expect(
      summary.getByTestId("jadwal-shifting-summary-work"),
    ).toHaveText("1");
  });
});
