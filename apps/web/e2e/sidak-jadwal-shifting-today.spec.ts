import { expect, test } from "@playwright/test";
import {
  FIXTURE_DATE,
  dailyRows,
  NO_ACTIVITY_AGENT,
  assertLocalDevOnlyTarget,
  capturedJadwalRequests,
  expectIsolation,
  openJadwalShifting,
  resetCapturedJadwalRequests,
} from "./helpers/sidakJadwalShiftingHarness";
import {
  loopExitBrowserEvents,
  expectPageShell,
  selectSection,
  TODAY_SECTION_TESTIDS,
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

test.describe("Format hari ini", () => {
  test("aktivitas kosong memakai jam mulai dan pulang sesuai kode shift", async ({
    page,
  }) => {
    const schedule = [
      ["H", "07:45", "16:50"],
      ["S1", "06:00", "15:00"],
      ["S2", "08:00", "17:00"],
      ["S3", "13:00", "22:00"],
      ["S4", "22:00", "07:00"],
    ] as const;
    const rows = schedule.map(([shift, start, end], index) => ({
      nama: `Fallback Agent ${index + 1}`,
      tl: "Team Lead",
      channel: "Call",
      shift,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
      expectedStart: start,
      expectedEnd: end,
    }));

    // Nilai jam ekspektasi adalah metadata fixture lokal, bukan payload API.
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: {
        kind: "data",
        rows: rows.map(
          ({ expectedStart: _start, expectedEnd: _end, ...row }) => row,
        ),
      },
    });
    await expectPageShell(page);

    for (const row of rows) {
      const activityCell = page
        .getByTestId("jadwal-shifting-row")
        .filter({ hasText: row.nama })
        .locator("td")
        .nth(5);
      await expect(activityCell).toContainText(`Mulai${row.expectedStart}`);
      await expect(activityCell).toContainText("Istirahat");
      await expect(activityCell).toContainText("Pulang");
      await expect(activityCell).toContainText(row.expectedEnd);
      await expect(activityCell.locator("dd").nth(1)).toHaveText("—");
    }
    expectIsolation(audit);
  });

  test("slot LB berurutan diringkas menjadi interval istirahat 15 menit", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: {
        kind: "data",
        rows: [
          {
            nama: "Agent Break Fixture",
            tl: "Team Lead",
            channel: "Call",
            shift: "H",
            shiftPrev: "",
            date: FIXTURE_DATE,
            activities: [17, 18, 19, 20].map((slot) => ({
              slot,
              label: "04:15",
              value: "LB",
            })),
          },
        ],
      },
    });
    await expectPageShell(page);

    const activityCell = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Agent Break Fixture" })
      .locator("td")
      .nth(5);
    await expect(activityCell).toContainText("Mulai");
    await expect(activityCell).toContainText("07:45");
    await expect(activityCell).toContainText("Istirahat");
    await expect(activityCell).toContainText("04:15–05:15");
    await expect(activityCell).toContainText("Pulang");
    await expect(activityCell).toContainText("16:50");
    await expect(activityCell).not.toContainText("LB");
    expectIsolation(audit);
  });

  test("Hari ini memakai tabel sebagai satu-satunya daftar", async ({
    page,
  }, testInfo) => {
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: dailyRows() },
    });
    await expectPageShell(page);

    const table = page.getByTestId("jadwal-shifting-table");
    await expect(table).toBeVisible();
    await expect(page.getByTestId("jadwal-shifting-row")).toHaveCount(4);

    const todayView = page.getByTestId("jadwal-shifting-view-today");
    await expect(todayView, "format Hari ini tidak dirender").toBeVisible();
    await expect(
      todayView.locator("h2, h3, h4"),
      "panel dan subjudul pengelompokan tidak boleh tampil di luar tabel",
    ).toHaveCount(0);
    // Memeriksa heading saja tidak cukup: daftar/panel lama bisa kembali tanpa
    // heading. Jadi dua hal diperiksa terpisah — sisa testid panel lama, dan
    // daftar non-tabel (`ul`/`ol`) di dalam format Hari ini.
    await expect(
      page.locator(
        '[data-testid^="jadwal-shifting-masuk"], [data-testid^="jadwal-shifting-libur"]',
      ),
      "sisa panel Masuk/Libur tidak boleh dirender lagi",
    ).toHaveCount(0);
    await expect(
      todayView.locator("ul, ol"),
      "format Hari ini hanya boleh berisi tabel, bukan daftar",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("jadwal-shifting-row").filter({
        hasText: "Guntur Saputra",
      }),
      "baris Off tetap menjadi bagian dari tabel detail",
    ).toHaveCount(1);

    // Jika WFM tidak mengirim aktivitas, tampilkan jam shift terverifikasi;
    // jam istirahat tetap kosong karena sumber/mapping belum memberikannya.
    const fallbackRow = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: NO_ACTIVITY_AGENT.nama });
    await expect(fallbackRow).toContainText("Mulai");
    await expect(fallbackRow).toContainText("07:45");
    await expect(fallbackRow).toContainText("Istirahat");
    await expect(fallbackRow).toContainText("Pulang");
    await expect(fallbackRow).toContainText("16:50");

    // Filter bagian layanan tetap tersedia dengan lima pilihan yang sama.
    await page.getByTestId("jadwal-shifting-section-all").click();
    for (const section of TODAY_SECTION_TESTIDS) {
      await expect(
        page.getByTestId(`jadwal-shifting-section-option-${section}`),
        `pilihan bagian ${section} tidak ada di dropdown`,
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    const screenshotPath = testInfo.outputPath("hari-ini-tabel-saja.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("hari-ini-tabel-saja", {
      path: screenshotPath,
      contentType: "image/png",
    });

    expectIsolation(audit);
  });

  test("urutan tabel mengikuti layanan, shift, TL, lalu nama dari baris acak", async ({
    page,
  }) => {
    // Input sengaja berlawanan dengan urutan yang diharapkan: bagian tak dikenal
    // muncul lebih awal, Email mendahului Call, dan semua tingkat memiliki ties
    // yang cukup agar pengurutan yang dihilangkan atau dibalik terdeteksi.
    // Layanan adalah kunci paling luar: SEMUA baris Call tampil berurutan
    // (S1 → H → S2 → S3 → S4 → Off), baru Digital Chat, Email, dan Leader.
    const rows = [
      {
        nama: "Zeta Service H",
        tl: "Rina Salim",
        channel: "Zeta Support",
        shift: "H",
      },
      { nama: "Email H", tl: "Doni Kurnia", channel: "Email", shift: "H" },
      { nama: "Shift S4", tl: "Doni Kurnia", channel: "Call", shift: "S4" },
      {
        nama: "Call Zainal H",
        tl: "Zainal Abidin",
        channel: "call",
        shift: "H",
      },
      { nama: "Off no TL", tl: "", channel: "Call", shift: "OFF" },
      { nama: "Shift S2", tl: "Doni Kurnia", channel: "Leader", shift: "S2" },
      { nama: "Call Zulu H", tl: "Rina Salim", channel: "Call", shift: "H" },
      { nama: "Blank Section H", tl: "Doni Kurnia", channel: "", shift: "H" },
      { nama: "Shift S1", tl: "Doni Kurnia", channel: "Email", shift: "S1" },
      { nama: "Call No TL H", tl: "", channel: "Call", shift: "H" },
      { nama: "Shift S3", tl: "Doni Kurnia", channel: "Email", shift: "S3" },
      { nama: "Call Leave", tl: "Rina Salim", channel: "Call", shift: "LIBUR" },
      {
        nama: "Digital H",
        tl: "Doni Kurnia",
        channel: "Digital Chat",
        shift: "H",
      },
      { nama: "Off Call", tl: "Rina Salim", channel: "Call", shift: "OFF" },
      { nama: "Leader H", tl: "Doni Kurnia", channel: "Leader", shift: "H" },
      {
        nama: "Alpha Service H",
        tl: "Rina Salim",
        channel: "Alpha Support",
        shift: "H",
      },
      {
        nama: "Digital LBR",
        tl: "Doni Kurnia",
        channel: "Digital Chat",
        shift: "LBR",
      },
      {
        nama: "Email CUTI",
        tl: "Doni Kurnia",
        channel: "Email",
        shift: "CUTI",
      },
      {
        nama: "Leader blank shift",
        tl: "Doni Kurnia",
        channel: "Leader",
        shift: "",
      },
      {
        nama: "TBCCI Label",
        tl: "Rina Salim",
        channel: "Call",
        shift: "TBCCI",
      },
      {
        nama: "Time Label",
        tl: "Rina Salim",
        channel: "Email",
        shift: "23:00 - 07:00",
      },
      { nama: "Call Arif H", tl: "Rina Salim", channel: "Call", shift: "H" },
    ].map((row) => ({
      ...row,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const detailRows = page.getByTestId("jadwal-shifting-row");
    await expect(detailRows).toHaveCount(rows.length);
    const actualOrder = await detailRows.evaluateAll((tableRows) =>
      tableRows.map(
        (row) => row.querySelector("td")?.textContent?.trim() ?? "",
      ),
    );
    expect(actualOrder).toEqual([
      // Call: shift lebih dulu di dalam layanan, baru bucket Off dan kode asing.
      "Call Arif H",
      "Call Zulu H",
      "Call Zainal H",
      "Call No TL H",
      "Shift S4",
      "Call Leave",
      "Off Call",
      "Off no TL",
      "TBCCI Label",
      // Digital Chat
      "Digital H",
      "Digital LBR",
      // Email
      "Shift S1",
      "Email H",
      "Shift S3",
      "Email CUTI",
      "Time Label",
      // Leader: H sebelum S2, dan shift kosong masuk bucket Off di belakang.
      "Leader H",
      "Shift S2",
      "Leader blank shift",
      // Bagian di luar daftar tetap tampil, di belakang dan A–Z.
      "Alpha Service H",
      "Zeta Service H",
      "Blank Section H",
    ]);

    expectIsolation(audit);
  });

  test("filter bagian menyaring tabel secara case-insensitive tanpa request baru", async ({
    page,
  }) => {
    const rows = [
      {
        nama: "Email Fixture",
        tl: "Doni Kurnia",
        channel: "Email",
        shift: "H",
      },
      {
        nama: "Leader Off Fixture",
        tl: "Doni Kurnia",
        channel: "Leader",
        shift: "OFF",
      },
      {
        nama: "Call Upper Fixture",
        tl: "Rina Salim",
        channel: "Call",
        shift: "H",
      },
      {
        nama: "Call Lower Fixture",
        tl: "Rina Salim",
        channel: "call",
        shift: "H",
      },
    ].map((row) => ({
      ...row,
      shiftPrev: "",
      date: FIXTURE_DATE,
      activities: [],
    }));
    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const tableRows = page.getByTestId("jadwal-shifting-row");
    await expect(tableRows).toHaveCount(4);
    const initialRequests = capturedJadwalRequests().length;

    await selectSection(page, "all", "call");
    await expect(tableRows).toHaveCount(2);
    await expect(
      tableRows.filter({ hasText: "Call Upper Fixture" }),
    ).toHaveCount(1);
    await expect(
      tableRows.filter({ hasText: "Call Lower Fixture" }),
    ).toHaveCount(1);

    await selectSection(page, "call", "email");
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText("Email Fixture");

    await selectSection(page, "email", "leader");
    await expect(tableRows).toHaveCount(1);
    await expect(tableRows.first()).toContainText("Leader Off Fixture");

    await selectSection(page, "leader", "all");
    await expect(tableRows).toHaveCount(4);
    expect(capturedJadwalRequests()).toHaveLength(initialRequests);
    expect(
      capturedJadwalRequests().every((request) => request.method === "GET"),
      "filter bagian harus murni di klien dan tetap read-only",
    ).toBe(true);
    expectIsolation(audit);
  });

  /**
   * Urutan lengkapnya: layanan → shift → JAM ISTIRAHAT → TL → nama. Fixture ini
   * sengaja membuat istirahat dan TL saling bertentangan (istirahat paling pagi
   * punya TL yang paling akhir menurut abjad), supaya terbukti istirahat benar
   * diurutkan sebelum TL, bukan sekadar kebetulan sama.
   */
  test("di dalam satu layanan: shift, lalu istirahat — yang break duluan lebih dulu", async ({
    page,
  }) => {
    const breakSlot = (slot: number) => ({ slot, label: "", value: "LB" });
    const rows = [
      { nama: "Break Siang", tl: "Rina Salim", activities: [breakSlot(48)] },
      { nama: "Tanpa Break", tl: "Rina Salim", activities: [] },
      { nama: "Break Pagi", tl: "Rina Salim", activities: [breakSlot(40)] },
      { nama: "Break Sore", tl: "Zainal Abidin", activities: [breakSlot(36)] },
    ].map((row) => ({
      ...row,
      channel: "Call",
      shift: "S2",
      shiftPrev: "",
      date: FIXTURE_DATE,
    }));

    await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows },
    });
    await expectPageShell(page);

    const tableRows = page.getByTestId("jadwal-shifting-row");
    await expect(tableRows).toHaveCount(4);
    const order = await tableRows.evaluateAll((rows) =>
      rows.map((row) => row.querySelector("td")?.textContent?.trim() ?? ""),
    );
    expect(
      order,
      "istirahat 09:00 → 10:00 → 12:00 → tanpa istirahat, dan urutan istirahat lebih dulu daripada TL",
    ).toEqual(["Break Sore", "Break Pagi", "Break Siang", "Tanpa Break"]);
  });

  test("[loop-exit] urutan layanan, shift, LB, TL, nama dan interval memakai satu fixture bertentangan", async ({
    page,
  }) => {
    const activity = (slot: number, value: string) => ({
      slot,
      label: "",
      value,
    });
    const contractRows = [
      {
        nama: "Unknown Z Service",
        tl: "",
        channel: "Zeta Support",
        shift: "OFF",
        activities: [],
      },
      {
        nama: "Call Foreign WFH",
        tl: "Rina",
        channel: "Call",
        shift: "WFH",
        activities: [],
      },
      {
        nama: "Leader H",
        tl: "Rina",
        channel: "Leader",
        shift: "H",
        activities: [],
      },
      {
        nama: "Off OFF",
        tl: "Team Off",
        channel: "Call",
        shift: "OFF",
        activities: [],
      },
      {
        nama: "Call Break 12 TL A",
        tl: "Ahmad",
        channel: "Call",
        shift: "H",
        activities: [activity(48, "LB")],
      },
      {
        nama: "Email H",
        tl: "Rina",
        channel: "Email",
        shift: "H",
        activities: [],
      },
      {
        nama: "Call Break Tie Z",
        tl: "Team Tie",
        channel: "call",
        shift: "H",
        activities: [activity(40, "LB")],
      },
      {
        nama: "Off LBR",
        tl: "Team Off",
        channel: "Call",
        shift: "LBR",
        activities: [],
      },
      {
        nama: "Digital S1",
        tl: "Rina",
        channel: "Digital Chat",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Call No Break A",
        tl: "Ahmad",
        channel: "Call",
        shift: "H",
        activities: [],
      },
      {
        nama: "Off LIBUR",
        tl: "Team Off",
        channel: "Call",
        shift: "LIBUR",
        activities: [],
      },
      {
        nama: "Call S4",
        tl: "Rina",
        channel: "Call",
        shift: "S4",
        activities: [],
      },
      {
        nama: "Call Break 00",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [activity(1, "LB"), activity(0, "lb")],
      },
      {
        nama: "Call S2",
        tl: "Rina",
        channel: "Call",
        shift: "S2",
        activities: [],
      },
      {
        nama: "Call Foreign AUX",
        tl: "Rina",
        channel: "Call",
        shift: "AUX",
        activities: [],
      },
      {
        nama: "Off CUTI",
        tl: "Team Off",
        channel: "Call",
        shift: "CUTI",
        activities: [],
      },
      {
        nama: "Call Break Tie A",
        tl: "Team Tie",
        channel: "Call",
        shift: "H",
        activities: [activity(40, "LB")],
      },
      {
        nama: "Call Break 10 TL Z",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [activity(48, "LB"), activity(40, "LB")],
      },
      {
        nama: "Call S3",
        tl: "Rina",
        channel: "Call",
        shift: "S3",
        activities: [],
      },
      {
        nama: "Off Blank",
        tl: "Team Off",
        channel: "Call",
        shift: "",
        activities: [],
      },
      {
        nama: "Call Invalid LB",
        tl: "Zulu",
        channel: "Call",
        shift: "H",
        activities: [
          activity(-1, "LB"),
          activity(96, "LB"),
          activity(106, "LB"),
          activity(12.5, "LB"),
          activity(12, "Lunch"),
        ],
      },
      {
        nama: "Call S1 Slot Edge",
        tl: "Rina",
        channel: "Call",
        shift: "S1",
        activities: [
          activity(95, "LB"),
          activity(1, "LB"),
          activity(0, "lb"),
          activity(1, "LB"),
          activity(-1, "LB"),
          activity(96, "LB"),
          activity(106, "LB"),
          activity(12.5, "LB"),
          activity(2, "Lunch"),
        ],
      },
      {
        nama: "Call Foreign Z",
        tl: "Rina",
        channel: "Call",
        shift: "Z-X",
        activities: [],
      },
      {
        nama: "Call S1",
        tl: "Rina",
        channel: "Call",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Alpha Service",
        tl: "Rina",
        channel: "Alpha Support",
        shift: "H",
        activities: [],
      },
      {
        nama: "Empty Service",
        tl: "Rina",
        channel: "",
        shift: "S1",
        activities: [],
      },
      {
        nama: "Call Foreign TBCCI",
        tl: "Rina",
        channel: "Call",
        shift: "TBCCI",
        activities: [],
      },
    ].map((row) => ({ ...row, shiftPrev: "", date: FIXTURE_DATE }));

    const audit = await openJadwalShifting(page, {
      role: "trainer",
      behavior: { kind: "data", rows: contractRows },
    });
    await expectPageShell(page);

    const rows = page.getByTestId("jadwal-shifting-row");
    const actualOrder = await rows.evaluateAll((tableRows) =>
      tableRows.map(
        (row) => row.querySelector("td")?.textContent?.trim() ?? "",
      ),
    );
    expect(actualOrder).toEqual([
      "Call S1 Slot Edge",
      "Call S1",
      "Call Break 00",
      "Call Break Tie A",
      "Call Break Tie Z",
      "Call Break 10 TL Z",
      "Call Break 12 TL A",
      "Call No Break A",
      "Call Invalid LB",
      "Call S2",
      "Call S3",
      "Call S4",
      "Off Blank",
      "Off CUTI",
      "Off LBR",
      "Off LIBUR",
      "Off OFF",
      "Call Foreign AUX",
      "Call Foreign TBCCI",
      "Call Foreign WFH",
      "Call Foreign Z",
      "Digital S1",
      "Email H",
      "Leader H",
      "Alpha Service",
      "Unknown Z Service",
      "Empty Service",
    ]);

    const edgeInterval = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Call S1 Slot Edge" })
      .locator("td")
      .nth(5)
      .locator("dd")
      .nth(1);
    await expect(edgeInterval).toHaveText("00:00–00:30, 23:45–24:00");
    const invalidInterval = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: "Call Invalid LB" })
      .locator("td")
      .nth(5)
      .locator("dd")
      .nth(1);
    await expect(invalidInterval).toHaveText("—");
    expectIsolation(audit);
  });

  test("bisa berpindah dari format hari ini ke kalender dan kembali", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    await expectPageShell(page);

    const calendarTab = page.getByRole("tab", { name: "Kalender" });
    await expect(page.getByRole("tab", { name: "Hari ini" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("jadwal-shifting-calendar")).toHaveCount(0);

    await calendarTab.click();
    await expect(calendarTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByTestId("jadwal-shifting-calendar"),
      "format kalender tidak dirender setelah pindah tab",
    ).toBeVisible();
    await expect(
      page.getByTestId("jadwal-shifting-table"),
      "tabel harian harus hilang saat kalender aktif",
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Hari ini" }).click();
    await expect(
      page.getByTestId("jadwal-shifting-calendar"),
      "kalender harus hilang saat kembali ke format harian",
    ).toHaveCount(0);
    await expect(page.getByTestId("jadwal-shifting-table")).toBeVisible();

    expectIsolation(audit);
  });
});
