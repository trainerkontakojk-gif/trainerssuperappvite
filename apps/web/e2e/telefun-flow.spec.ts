import { expect, test, type Page } from "@playwright/test";
import vercelConfig from "../../../vercel.json" with { type: "json" };
import {
  APP_ORIGIN,
  expectHermetic,
  formatAudit,
  openHermeticShell,
  practiceQuotaMock,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import {
  AGENT_RECORDING_URL,
  ANNOTATED_ROW,
  FAILED_ROW,
  FULL_HISTORY,
  NO_RECORDING_ROW,
  PENDING_ROW,
  RECORDING_URL,
  REVIEWED_ROW,
  agentRecordingMock,
  recordingMock,
  serveRecording,
  serveSpeechRecordings,
  speechWav,
  telefunMocks,
  voiceAssessment,
  annotatedAssessment,
  type TelefunRow,
} from "./helpers/telefunFixtures";

/**
 * Telefun — landing berbasis data, layar panggilan, dan tahap Telaah
 * (hermetic). Semua `/api` dimock; server suara Gemini Live ditiru lewat
 * `routeWebSocket`, dan mikrofon memakai perangkat palsu Chromium.
 */

function telaahPath(id: string) {
  return `/telefun?sesi=${id}&tahap=telaah`;
}

async function open(
  page: Page,
  path: string,
  apiMocks: ApiMock[],
  beforeNavigate?: (page: Page) => Promise<void>,
) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    waitForUrl: /\/telefun/,
    beforeNavigate,
  });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

test.describe("Telefun landing (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("hero memberi satu aksi utama, menu kecil, dan demo yang bisa dijeda", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Dengarkan konsumennya\.\s*Jawab dengan suara yang tenang\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();

    const menu = page.getByRole("navigation", { name: "Menu Telefun" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        menu.getByRole("button", { name: new RegExp(`^${label}`) }),
        `menu "${label}" tidak tampil`,
      ).toBeVisible();
    }

    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Putar animasi" }),
    ).toBeVisible();

    await waitForMockedApi(audit, ["/telefun/settings", "/telefun/sessions"]);
    expectHermetic(audit);
  });

  test("agen membuka Telefun dari menu tanpa jendela Akses Terbatas; tombol mulai mengikuti jatah harian", async ({
    page,
  }) => {
    const closed = await openHermeticShell(page, {
      path: "/telefun",
      auth: { role: "agent" },
      waitForUrl: /\/telefun/,
      apiMocks: [
        practiceQuotaMock({ telefun: { limit: 0, used: 0 } }),
        ...telefunMocks(FULL_HISTORY),
      ],
    });
    await expect(
      page.getByRole("heading", { level: 1, name: /Dengarkan konsumennya/ }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Hanya dapat diakses/)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^Telefun/i }).first(),
    ).toBeVisible();
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    const reason =
      "Telefun belum dibuka untuk akunmu. Trainer bisa membukanya dari halaman Pengguna.";
    await expect(page.getByText(reason)).toBeVisible();
    await expect(start).toBeDisabled();
    await expect(start).toHaveAccessibleDescription(reason);
    expectHermetic(closed);

    const allowed = await openHermeticShell(page, {
      path: "/telefun",
      auth: { role: "agent" },
      waitForUrl: /\/telefun/,
      apiMocks: [
        practiceQuotaMock({ telefun: { limit: 2, used: 1 } }),
        ...telefunMocks(FULL_HISTORY),
      ],
    });
    await expect(
      page.getByText(
        "Sisa hari ini 1 dari 2 panggilan. Dihitung lagi besok pukul 00.00 WIB.",
      ),
    ).toBeVisible({ timeout: 20000 });
    await expect(start).toBeEnabled();
    expectHermetic(allowed);
  });

  test("panggilan bulan ini dihitung server (tidak terpotong 50), panggilan lokal tidak dihitung ganda", async ({
    page,
  }) => {
    // Panggilan yang belum tersinkron: barisnya sudah dibuat server saat
    // panggilan dimulai, jadi sudah termasuk dalam hitungan server.
    await page.addInitScript((record) => {
      try {
        if (!sessionStorage.getItem("e2e-seeded")) {
          sessionStorage.setItem("e2e-seeded", "1");
          localStorage.setItem("telefun_history", JSON.stringify([record]));
        }
      } catch {
        // about:blank tidak punya penyimpanan.
      }
    }, {
      id: "telefun-local-only-month",
      date: new Date().toISOString(),
      url: "",
      consumerName: "Sari Wulandari",
      scenarioTitle: "Panggilan Offline",
      duration: 95,
      syncStatus: "unsynced",
    });
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY, {}, 73));
    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("73 panggilan bulan ini", {
      timeout: 20000,
    });
    expectHermetic(audit);
  });

  test("hitungan bulan ini gagal dimuat: tampil tanda kosong, bukan angka karangan", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", [
      {
        method: "GET",
        path: "/api/v1/telefun/sessions/month-count",
        status: 500,
        body: {
          success: false,
          error: { code: "DATABASE_ERROR", message: "Gagal." },
        },
      },
      ...telefunMocks(FULL_HISTORY),
    ]);
    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("rata-rata skor", { timeout: 20000 });
    await expect(progress).toContainText("– panggilan bulan ini");
    expectHermetic(audit);
  });

  test("bagian data dihitung dari riwayat: progres, tindak lanjut, fokus, hasil terbaru", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));

    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("7,4", { timeout: 20000 });
    await expect(progress).toContainText(
      "rata-rata skor dari 2 panggilan terakhir",
    );
    await expect(progress).toContainText("panggilan bulan ini");
    await expect(progress).toContainText("1 sedang dianalisis");

    const followUp = page.getByRole("region", { name: "Perlu tindak lanjut" });
    await expect(followUp.getByText("Pinjol Ilegal")).toBeVisible();
    await expect(followUp.getByText(/Analisis gagal/)).toBeVisible();
    await expect(followUp.getByText("Restrukturisasi Kredit")).toBeVisible();
    await expect(followUp.getByText(/Rekaman tidak tersimpan/)).toBeVisible();

    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Filler");
    await expect(focus).not.toContainText("Kata pengisi");
    await expect(focus).toContainText("5,8");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    const firstRow = recent.getByRole("row").nth(1);
    await expect(firstRow).toContainText("Klaim Asuransi Ditolak");
    await expect(firstRow).toContainText("Filler");
    await expect(firstRow).toContainText("7,6");

    await recent
      .getByRole("button", { name: "Klaim Asuransi Ditolak" })
      .click();
    await expect(page).toHaveURL(/sesi=telefun-reviewed-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    expectHermetic(audit);
  });

  test("pengguna baru melihat ajakan, bukan angka kosong", async ({ page }) => {
    const audit = await open(page, "/telefun", telefunMocks([]));
    await expect(
      page.getByRole("heading", { name: "Belum ada latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("telefun-progress-summary")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("riwayat yang gagal dimuat bisa dicoba lagi", async ({ page }) => {
    const audit = await open(page, "/telefun", [
      telefunMocks([])[0],
      telefunMocks([])[1],
      {
        method: "GET",
        path: "/api/v1/telefun/sessions",
        status: 500,
        body: {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "x" },
        },
      },
    ]);
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah terbaru" })
        .getByRole("alert"),
    ).toContainText("Riwayat belum bisa dimuat", { timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Coba lagi" }).first(),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tombol Mulai simulasi dan aksen Telefun memenuhi kontras WCAG di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    await expect(start).toBeVisible({ timeout: 20000 });
    await waitForMockedApi(audit, ["/telefun/settings", "/telefun/sessions"]);

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator("../.."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
      const main = page.locator("main").first();
      const accent = await findLowContrastText(main, {
        selector:
          '.text-module-telefun:not(h1 *):not([data-testid="telefun-stage-demo"] *)',
      });
      expect(accent, `${theme}: ${accent.join("\n")}`).toEqual([]);
      const hero = await findLowContrastText(main, {
        selector: "h1 .text-module-telefun",
        minRatio: 3,
      });
      expect(hero, `${theme}: ${hero.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing Telefun minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));
    await expect(page.getByTestId("telefun-progress-summary")).toBeVisible({
      timeout: 20000,
    });
    // Demo panggilan (aria-hidden) meniru layar pada skala kecil.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="telefun-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

const ANNOTATIONS_MOCKS: ApiMock[] = [
  {
    method: "GET",
    path: `/api/v1/telefun/annotations/${REVIEWED_ROW.id}`,
    body: {
      success: true,
      data: [
        {
          id: "anno-1",
          session_id: REVIEWED_ROW.id,
          user_id: "user-1",
          timestamp_ms: 36000,
          category: "improvement_area",
          moment: "Jeda saat mencari aturan",
          text: "Ganti eee dengan kalimat jeda.",
          is_manual: true,
          created_at: REVIEWED_ROW.created_at,
        },
      ],
    },
  },
  {
    method: "GET",
    path: `/api/v1/telefun/coaching-summary/${REVIEWED_ROW.id}`,
    body: {
      success: true,
      data: {
        id: "sum-1",
        session_id: REVIEWED_ROW.id,
        user_id: "user-1",
        recommendations: [],
        generated_at: REVIEWED_ROW.created_at,
      },
    },
  },
];

async function openTelaah(
  page: Page,
  row: TelefunRow,
  extra: ApiMock[] = [],
  history: readonly TelefunRow[] = FULL_HISTORY,
) {
  // Rekaman dilayani sebelum halaman dibuka: permintaan pertama <audio> tidak boleh lolos.
  return open(
    page,
    telaahPath(row.id),
    [...telefunMocks(history), recordingMock(row.id), ...extra],
    (page) => serveRecording(page),
  );
}

test.describe("Telefun Telaah (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("kolom telaah: navigasi hanya menggulir panel, aspek membuka alasan, dan sembunyikan/tampilkan", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await openTelaah(page, ANNOTATED_ROW, [], [ANNOTATED_ROW]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toBeVisible({
      timeout: 20000,
    });
    await expect(result.getByRole("tab")).toHaveCount(0);
    const scores = result.getByRole("region", { name: "Alasan skor" });
    await expect(scores.locator("details[open]")).toHaveCount(1);
    await expect(
      result.locator("#telefun-score-intonation"),
    ).not.toHaveAttribute("open", "");
    const rows = await result
      .getByRole("list", { name: "Skor per aspek" })
      .getByRole("listitem")
      .evaluateAll((els) =>
        els.map((el) => {
          const boxes = [...el.children].map((child) =>
            child.getBoundingClientRect(),
          );
          return {
            height: el.getBoundingClientRect().height,
            aligned:
              Math.abs(
                boxes[1].top +
                  boxes[1].height / 2 -
                  boxes[2].top -
                  boxes[2].height / 2,
              ) < 1,
          };
        }),
      );
    expect(new Set(rows.map((row) => row.height)).size).toBe(1);
    expect(rows.every((row) => row.aligned)).toBe(true);
    const header = page.getByRole("button", { name: "Sembunyikan telaah" });
    const top = (await header.boundingBox())!.y;
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    const widthBefore = (await transcript.boundingBox())!.width;
    const navigation = result.getByRole("navigation", {
      name: "Lompat ke bagian",
    });
    await navigation
      .getByRole("button", { name: "Pertanyaan 2", exact: true })
      .click();
    const questions = result.getByRole("region", {
      name: "Pertanyaan konsumen",
    });
    await expect(questions).toBeFocused();
    expect(await result.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect((await questions.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await navigation.boundingBox())!.y +
        (await navigation.boundingBox())!.height,
    );
    expect((await header.boundingBox())!.y).toBe(top);
    expect(await transcript.evaluate((el) => el.scrollTop)).toBe(0);
    await result
      .getByRole("button", { name: "Lihat penjelasan Intonasi" })
      .click();
    const aspect = result.locator("#telefun-score-intonation");
    await expect(aspect).toHaveAttribute("open", "");
    await expect(aspect.locator("summary")).toBeFocused();
    await expect(header).toHaveAttribute(
      "aria-controls",
      (await result.getAttribute("id")) as string,
    );
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await header.click();
    await expect(result).toHaveCount(0);
    const show = page.getByRole("button", { name: "Tampilkan telaah" }).first();
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await expect(show).not.toHaveAttribute("aria-controls");
    const rail = page.getByRole("complementary", {
      name: "Telaah disembunyikan",
    });
    await expect(rail).toContainText("Skor");
    await expect(rail).toContainText("7,6");
    expect((await transcript.boundingBox())!.width).toBeGreaterThan(
      widthBefore,
    );
    await rail.getByRole("button", { name: "Tampilkan telaah" }).click();
    await expect(result).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await navigation
        .getByRole("button", { name: "Ringkasan", exact: true })
        .click();
      expect(
        await result.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(
        await navigation.evaluate((el) => getComputedStyle(el).position),
      ).toBe("sticky");
      expect(
        await navigation.evaluate((el) => el.clientHeight),
      ).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: test.info().outputPath(`telefun-column-${width}.png`),
      });
      await page.getByRole("button", { name: "Sembunyikan telaah" }).click();
      await expect(rail).toBeVisible();
      await rail.getByRole("button", { name: "Tampilkan telaah" }).click();
    }
    expectHermetic(audit);
  });

  test("catatan trainer dimuat hanya saat dibuka dan tetap tersimpan setelah ditutup", async ({
    page,
  }) => {
    const counts = { annotations: 0, summary: 0 };
    const audit = await open(
      page,
      telaahPath(REVIEWED_ROW.id),
      [
        ...telefunMocks(FULL_HISTORY),
        recordingMock(REVIEWED_ROW.id),
        ...ANNOTATIONS_MOCKS,
      ],
      async (page) => {
        await serveRecording(page);
        await page.route("**/telefun/annotations/*", async (route) => {
          counts.annotations++;
          await route.fallback();
        });
        await page.route("**/telefun/coaching-summary/*", async (route) => {
          counts.summary++;
          await route.fallback();
        });
      },
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toBeVisible({
      timeout: 20000,
    });
    await result
      .getByRole("button", { name: "Lihat penjelasan Intonasi" })
      .click();
    expect(counts).toEqual({ annotations: 0, summary: 0 });
    const disclosure = result.locator("#telefun-trainer-notes");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await disclosure.locator("summary").click();
    await expect(
      result.getByText("Ganti eee dengan kalimat jeda."),
    ).toBeVisible();
    expect(counts).toEqual({ annotations: 1, summary: 1 });
    await disclosure.locator("summary").click();
    await result
      .getByRole("navigation")
      .getByRole("button", { name: "Catatan trainer" })
      .click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(
      result.getByText("Ganti eee dengan kalimat jeda."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sembunyikan telaah" }).click();
    await page
      .getByRole("complementary")
      .getByRole("button", { name: "Tampilkan telaah" })
      .click();
    expect(counts).toEqual({ annotations: 1, summary: 1 });
    expectHermetic(audit);
  });

  test("kekuatan AI menjadi fallback hanya bila tidak ada catatan agen yang sudah baik", async ({
    page,
  }) => {
    const assessment = annotatedAssessment();
    const row = {
      ...ANNOTATED_ROW,
      voice_assessment: {
        ...assessment,
        contentReview: {
          ...assessment.contentReview,
          agentNotes: assessment.contentReview.agentNotes.filter(
            (note) => note.verdict === "fix",
          ),
        },
      },
    };
    const audit = await openTelaah(page, row, [], [row]);
    const good = page.getByRole("region", { name: "Sudah baik", exact: true });
    await expect(
      good.getByText("Menyapa dengan salam lengkap", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText("Menyapa dengan salam lengkap", { exact: true }),
    ).toHaveCount(1);
    expectHermetic(audit);
  });

  test("skor suara tampil pertama, enam aspek dengan angka mentah, transkrip memutar rekaman", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW, ANNOTATIONS_MOCKS);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6", {
      timeout: 20000,
    });
    await expect(result).toContainText("/ 10");

    const aspects = result.getByRole("list", { name: "Skor per aspek" });
    await expect(aspects.getByRole("listitem")).toHaveCount(6);
    await expect(aspects).toContainText("158 kata/menit");
    await expect(aspects).toContainText("7 kali");
    await expect(aspects).toContainText("dominan: tenang");
    await expect(aspects).toContainText("1 kali · 27 detik");

    // Kata pengisi disorot di kalimat agen, bukan di kalimat konsumen.
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    const agentLine = transcript.getByTestId("telefun-line-00.36");
    await expect(agentLine.locator("mark")).toHaveText(["Eee", "jadi gini"]);
    await expect(
      transcript.getByTestId("telefun-line-00.04").locator("mark"),
    ).toHaveCount(0);

    // Jeda hold dari metrik sesi, bukan gelombang karangan.
    await expect(transcript).toContainText(
      "Hold 02.01 – 02.28 · 27 detik · dalam batas",
    );

    // Baris transkrip memutar rekaman dari detik itu.
    await transcript.getByRole("button", { name: "Putar dari 00.36" }).click();
    await expect(page.getByTestId("telefun-player-time")).toHaveText("00.36");

    // Temuan menunjuk waktu di transkrip.
    await result
      .getByRole("button", { name: "Lihat penjelasan Filler" })
      .click();
    await result.getByRole("button", { name: /00\.36 · Filler/ }).click();
    await expect(agentLine).toHaveAttribute("data-highlighted", "true");

    await result
      .locator("summary")
      .filter({ hasText: "Catatan trainer" })
      .click();
    await expect(
      result.getByText("Ganti eee dengan kalimat jeda."),
    ).toBeVisible();

    await waitForMockedApi(audit, [
      `/telefun/recording/${REVIEWED_ROW.id}`,
      `/telefun/annotations/${REVIEWED_ROW.id}`,
    ]);
    expectHermetic(audit);
  });

  test("Ringkasan memuat profil suara dan diagram spider: lima aspek berbahasa Indonesia, skala 0–10 berlabel, tanpa zona hijau", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const overview = result.getByRole("region", { name: "Ringkasan" });
    await expect(
      overview.getByRole("heading", { name: "Profil suara" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(overview.locator("p").first()).not.toBeEmpty();
    const radar = result.getByRole("img", {
      name: /^Diagram profil komunikasi/,
    });
    await expect(radar).toBeVisible();
    for (const label of [
      "Kecepatan bicara",
      "Intonasi",
      "Artikulasi",
      "Filler",
      "Nada emosi",
    ]) {
      await expect(radar.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(radar).toHaveAccessibleName(/Artikulasi 8,8/);
    // Skala cincin berlabel; tidak ada zona hijau yang batasnya membingungkan.
    for (const ring of ["2", "4", "6", "8", "10"]) {
      await expect(radar.getByText(ring, { exact: true })).toBeVisible();
    }
    await expect(result.getByText(/Zona sudah baik/)).toHaveCount(0);
    await expect(result.getByText("Speaking Rate")).toHaveCount(0);
    await expect(
      result.getByRole("list", { name: "Target vs hasil" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("penanda di transkrip dan garis waktu bisa diklik menuju poinnya", async ({
    page,
  }) => {
    const audit = await openTelaah(page, ANNOTATED_ROW, ANNOTATIONS_MOCKS, [
      ANNOTATED_ROW,
      ...FULL_HISTORY.filter((row) => row.id !== ANNOTATED_ROW.id),
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });

    // Huruf pertanyaan konsumen di transkrip membuka poinnya.
    await expect(result.getByTestId("telefun-voice-score")).toBeVisible({
      timeout: 20000,
    });
    await transcript
      .getByRole("button", { name: "Lihat pertanyaan konsumen A" })
      .click();
    const point = result.locator("#telefun-question-0");
    await expect(point).toBeFocused();
    await expect(point).toHaveAttribute("data-highlighted", "true");

    // Nomor kalimat agen membuka catatannya.
    await transcript
      .getByRole("button", { name: "Lihat kalimat agen 2" })
      .click();
    const line = result.locator("#telefun-line-1");
    await expect(line).toBeFocused();
    await expect(line).toHaveAttribute("data-highlighted", "true");
    await transcript
      .getByRole("button", { name: "Lihat kalimat agen 1" })
      .click();
    await expect(result.locator("#telefun-line-0")).toBeFocused();

    // Nomor catatan trainer di garis waktu menunjuk catatannya dan memutar dari sana.
    await result
      .locator("summary")
      .filter({ hasText: "Catatan trainer" })
      .click();
    await expect(
      result.getByText("Ganti eee dengan kalimat jeda."),
    ).toBeVisible();
    await result
      .locator("summary")
      .filter({ hasText: "Catatan trainer" })
      .click();
    await transcript
      .getByRole("button", { name: "Catatan trainer 1 di 00.36" })
      .click();
    await expect(page.getByTestId("telefun-player-time")).toHaveText("00.36");
    await expect(
      result.getByRole("listitem", { name: "Catatan 1 pada 00.36" }),
    ).toHaveAttribute("data-highlighted", "true");
    await expect(
      result.getByRole("listitem", { name: "Catatan 1 pada 00.36" }),
    ).toBeFocused();
    await expect(result.locator("#telefun-trainer-notes")).toHaveAttribute(
      "open",
      "",
    );
    expectHermetic(audit);
  });

  test("klik waktu memutar dari awal ucapan, bukan ujungnya; rekaman tampil sebagai gelombang", async ({
    page,
  }) => {
    // Waktu baris tercatat saat transkrip tiba, sesudah orangnya bicara.
    // Rekaman: konsumen 2–3,5 dtk + 4,5–6 dtk (satu giliran berjeda) dan
    // 20–23 dtk, agen 8,5–10,5 dtk dan 30–35 dtk.
    const audit = await open(page, telaahPath(REVIEWED_ROW.id), [
      ...telefunMocks(FULL_HISTORY),
      agentRecordingMock(REVIEWED_ROW.id),
      recordingMock(REVIEWED_ROW.id),
    ]);
    await serveSpeechRecordings(page, {
      full: [
        [2, 3.5],
        [4.5, 6],
        [8.5, 10.5],
        [20, 23],
        [30, 35],
      ],
      agent: [
        [8.5, 10.5],
        [30, 35],
      ],
    });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    const waveform = transcript.getByTestId("telefun-waveform");
    await expect(waveform).toHaveAttribute("data-state", "ready", {
      timeout: 20000,
    });

    const agentLine = transcript.getByTestId("telefun-line-00.36");
    await expect(
      agentLine.getByRole("button", { name: /^Putar dari/ }),
    ).toHaveText("00.29");
    await agentLine.getByRole("button", { name: /^Putar dari/ }).click();
    await expect(page.getByTestId("telefun-player-time")).toHaveText("00.29");

    await expect(
      transcript
        .getByTestId("telefun-line-00.04")
        .getByRole("button", { name: /^Putar dari/ }),
    ).toHaveText("00.01");
    await expect(
      transcript
        .getByTestId("telefun-line-00.11")
        .getByRole("button", { name: /^Putar dari/ }),
    ).toHaveText("00.08");
    // Jeda di tengah giliran konsumen tidak menggeser baris konsumen berikutnya.
    await expect(
      transcript
        .getByTestId("telefun-line-00.24")
        .getByRole("button", { name: /^Putar dari/ }),
    ).toHaveText("00.19");
    // Tanpa bunyi di dekatnya, waktu tercatat dipakai apa adanya.
    await expect(
      transcript
        .getByTestId("telefun-line-01.18")
        .getByRole("button", { name: /^Putar dari/ }),
    ).toHaveText("01.18");
    expectHermetic(audit);
  });

  test("rekaman diunduh sekali per halaman: gelombang, putar, dan geser memakai salinan yang sama", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000); // Pemutaran + dua ukuran layar dan screenshot.
    // Kuota egress Supabase: tiap unduhan rekaman dari storage dihitung.
    const downloads = { full: 0, agent: 0 };
    page.on("request", (request) => {
      if (request.url() === RECORDING_URL) downloads.full += 1;
      if (request.url() === AGENT_RECORDING_URL) downloads.agent += 1;
    });
    const audit = await open(
      page,
      telaahPath(REVIEWED_ROW.id),
      [
        ...telefunMocks(FULL_HISTORY),
        agentRecordingMock(REVIEWED_ROW.id),
        recordingMock(REVIEWED_ROW.id),
      ],
      async (target) => {
        // Reproduce the real production fetch policy, including blob reads.
        // Other directives are omitted here for Vite's development bootstrap.
        const connectSrc = vercelConfig.headers
          .flatMap((entry) => entry.headers)
          .find((header) => header.key === "Content-Security-Policy")!
          .value.split(";")
          .map((directive) => directive.trim())
          .find((directive) => directive.startsWith("connect-src "))!;
        await target.route(
          (url) => url.origin === APP_ORIGIN && url.pathname === "/telefun",
          async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              headers: {
                ...response.headers(),
                "content-security-policy": connectSrc,
              },
            });
          },
        );
        await serveSpeechRecordings(target, {
          full: [[30, 35]],
          agent: [[30, 35]],
        });
        // Bunyi tiruan dengan jeda dan amplitudo bervariasi untuk pratinjau
        // waveform; tetap hermetic, tanpa rekaman konsumen sungguhan.
        const full = speechWav(252, [
          [2, 18],
          [24, 46],
          [100, 116],
          [135, 160],
          [180, 208],
          [220, 248],
        ]);
        for (let index = 44; index < full.length; index += 1) {
          const seconds = (index - 44) / 4000;
          const gain =
            (0.25 + 0.75 * Math.abs(Math.sin(seconds * 1.3))) *
            (0.4 + 0.6 * Math.abs(Math.sin(seconds * 0.17)));
          full[index] = 128 + Math.round((full[index] - 128) * gain);
        }
        await target.route(RECORDING_URL, (route) =>
          route.fulfill({
            status: 200,
            contentType: "audio/wav",
            body: full,
          }),
        );
      },
    );
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(transcript.getByTestId("telefun-waveform")).toHaveAttribute(
      "data-state",
      "ready",
      { timeout: 20000 },
    );
    const audio = page.locator("audio");
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration))
      .toBe(252);

    await page.getByRole("button", { name: "Putar rekaman" }).click();
    await transcript
      .getByTestId("telefun-line-01.18")
      .getByRole("button", { name: /^Putar dari/ })
      .click();
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(78);
    await page.getByRole("button", { name: "Jeda rekaman" }).click();

    // Batang nyata simetris terhadap garis tengah; tinggi dan posisi tetap
    // terbaca saat berganti ukuran layar, tanpa mengambil audio lagi.
    const waveform = transcript.getByTestId("telefun-waveform");
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await waveform.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          waveform.locator("svg").evaluate((svg) => {
            const heights = Array.from(svg.querySelectorAll("rect"), (bar) =>
              Number(bar.getAttribute("height")),
            );
            return Math.max(...heights);
          }),
        )
        .toBeGreaterThan(40);
      const geometry = await waveform.locator("svg").evaluate((svg) => {
        const height = svg.getBoundingClientRect().height;
        return Array.from(svg.querySelectorAll("rect")).every(
          (bar) =>
            Math.abs(
              Number(bar.getAttribute("y")) +
                Number(bar.getAttribute("height")) / 2 -
                height / 2,
            ) < 0.01,
        );
      });
      expect(geometry).toBe(true);
      await expect(
        transcript.getByRole("slider", { name: "Posisi rekaman" }),
      ).toBeInViewport();
      const screenshot = testInfo.outputPath(`waveform-${viewport.width}.png`);
      await page
        .getByTestId("telefun-call-player")
        .screenshot({ path: screenshot });
      await testInfo.attach(`waveform-${viewport.width}`, {
        path: screenshot,
        contentType: "image/png",
      });
    }

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh rekaman" }).click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    expect(downloads).toEqual({ full: 1, agent: 1 });
    expectHermetic(audit);
  });

  test("rekaman senyap selama hold: digeser ke dalam hold maupun diputar melewatinya", async ({
    page,
  }) => {
    // Sesi lama merekam suara agen saat hold. Hold 02.01–02.28 di jam sesi;
    // sesi tercatat 253,5 dtk (ditulis 0,5 dtk setelah perekam berhenti)
    // untuk rekaman 252 dtk, jadi jam rekaman tertinggal 1 dtk: 02.00–02.27.
    const row: TelefunRow = {
      ...REVIEWED_ROW,
      session_metrics: {
        ...REVIEWED_ROW.session_metrics!,
        sessionDurationMs: 253_500,
      },
    };
    const audit = await openTelaah(page, row, ANNOTATIONS_MOCKS, [row]);
    const audio = page.locator("audio");
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration), {
        timeout: 20000,
      })
      .toBe(252);

    const mutedAt = async (seconds: number) => {
      await audio.evaluate(
        (el: HTMLAudioElement, at) =>
          new Promise<void>((resolve) => {
            el.addEventListener("seeked", () => resolve(), { once: true });
            el.currentTime = at;
          }),
        seconds,
      );
      return audio.evaluate((el: HTMLAudioElement) => el.muted);
    };
    // Label hold di transkrip memakai jam rekaman yang sama dengan pemutar.
    await expect(
      page.getByText("Hold 02.00 – 02.27 · 27 detik · dalam batas"),
    ).toBeVisible();
    expect(await mutedAt(119.5)).toBe(false);
    expect(await mutedAt(120.5)).toBe(true);
    expect(await mutedAt(135)).toBe(true);
    expect(await mutedAt(146.5)).toBe(true);
    expect(await mutedAt(147.5)).toBe(false);

    // Diputar dari luar hold: senyap begitu masuk hold, bersuara lagi sesudahnya.
    await mutedAt(119.2);
    await page.getByRole("button", { name: "Putar rekaman" }).click();
    await expect
      .poll(() =>
        audio.evaluate((el: HTMLAudioElement) => ({
          past: el.currentTime > 120.05,
          muted: el.muted,
        })),
      )
      .toEqual({ past: true, muted: true });
    await page.getByRole("button", { name: "Jeda rekaman" }).click();
    await mutedAt(146.6);
    await page.getByRole("button", { name: "Putar rekaman" }).click();
    await expect
      .poll(() =>
        audio.evaluate((el: HTMLAudioElement) => ({
          past: el.currentTime > 147.05,
          muted: el.muted,
        })),
      )
      .toEqual({ past: true, muted: false });
    expectHermetic(audit);
  });

  test("tautan rekaman yang kedaluwarsa diganti sekali; rekaman lokal tetap diputar; gagal terus tampil Coba lagi", async ({
    page,
  }) => {
    const row = REVIEWED_ROW;
    // Tiap permintaan tautan memberi URL baru. URL yang "kedaluwarsa" menjawab
    // 403; sesudah `expireNew`, URL yang baru diberikan pun langsung 403.
    const wav = speechWav(252, []);
    const expired = new Set<number>([0]);
    let expireNew = false;
    let issued = 0;
    const audit = await open(
      page,
      telaahPath(row.id),
      [...telefunMocks([row]), ...ANNOTATIONS_MOCKS],
      async (target) => {
        await target.route(
          new RegExp(`/api/v1/telefun/recording/${row.id}(\\?.*)?$`),
          async (route) => {
            if (route.request().url().includes("type=agent_only")) {
              await route.fulfill({ json: { success: true, data: { url: null } } });
              return;
            }
            const n = issued++;
            if (expireNew) expired.add(n);
            await route.fulfill({
              json: {
                success: true,
                data: { url: `${APP_ORIGIN}/e2e-telefun-expiring-${n}.wav` },
              },
            });
          },
        );
        await target.route(/\/e2e-telefun-expiring-(\d+)\.wav$/, async (route) => {
          const n = Number(/expiring-(\d+)/.exec(route.request().url())![1]);
          if (expired.has(n)) {
            await route.fulfill({ status: 403, body: "expired" });
            return;
          }
          await route.fulfill({ status: 200, contentType: "audio/wav", body: wav });
        });
      },
    );
    const audio = page.locator("audio");
    const loaded = () =>
      audio.evaluate(
        (el: HTMLAudioElement) =>
          el.duration === 252 && el.currentSrc.startsWith("blob:"),
      );

    // Tautan pertama sudah kedaluwarsa: diganti sekali, lalu rekaman termuat
    // dari salinan lokal.
    await expect.poll(loaded, { timeout: 20000 }).toBe(true);
    expect(issued).toBe(2);

    // Halaman dibiarkan lama: tautan kedaluwarsa tidak memengaruhi salinan
    // lokal, dan tidak ada tautan atau unduhan baru.
    expired.add(1);
    await audio.evaluate((el: HTMLAudioElement) => el.load());
    await expect.poll(loaded).toBe(true);
    expect(issued).toBe(2);

    // Salinan lokal gagal diputar dan unduhan ulang pun gagal: pemutar tidak
    // diam, ada pesan dan Coba lagi.
    expireNew = true;
    await audio.evaluate((el: HTMLAudioElement) => {
      el.src = "blob:e2e-revoked";
    });
    const alert = page.getByRole("alert").filter({
      hasText: "Rekaman belum bisa dimuat.",
    });
    await expect(alert).toBeVisible();
    expireNew = false;
    await alert.getByRole("button", { name: "Coba lagi" }).click();
    await expect.poll(loaded).toBe(true);
    await expect(alert).toHaveCount(0);
    expectHermetic(audit);
  });

  test("catatan trainer: rekomendasi paling mendesak dulu, label momen, catatan tetap ada saat gagal simpan", async ({
    page,
  }) => {
    const id = REVIEWED_ROW.id;
    const audit = await openTelaah(page, REVIEWED_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/annotations/${id}`,
        body: {
          success: true,
          data: [
            {
              id: "anno-key",
              session_id: id,
              user_id: "user-1",
              timestamp_ms: 12000,
              category: "improvement_area",
              moment: "missed_empathy",
              text: "Belum mengakui kekesalan konsumen.",
              is_manual: true,
              created_at: REVIEWED_ROW.created_at,
            },
            {
              id: "anno-free",
              session_id: id,
              user_id: "user-1",
              timestamp_ms: 36000,
              category: "improvement_area",
              moment: "Jeda saat mencari aturan",
              text: "Ganti eee dengan kalimat jeda.",
              is_manual: true,
              created_at: REVIEWED_ROW.created_at,
            },
          ],
        },
      },
      {
        method: "GET",
        path: `/api/v1/telefun/coaching-summary/${id}`,
        body: {
          success: true,
          data: {
            id: "sum-1",
            session_id: id,
            user_id: "user-1",
            // Prioritas 5 = paling mendesak (prompt coaching di API).
            recommendations: [
              { text: "Pertahankan salam pembuka.", priority: 1 },
              {
                text: "Akui kekesalan konsumen sebelum menjelaskan.",
                priority: 5,
              },
              { text: "Kurangi filler saat mencari data.", priority: 3 },
            ],
            generated_at: REVIEWED_ROW.created_at,
          },
        },
      },
      {
        method: "POST",
        path: `/api/v1/telefun/annotations/${id}`,
        status: 500,
        body: {
          success: false,
          error: { code: "DATABASE_ERROR", message: "Gagal menyimpan." },
        },
      },
    ]);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .locator("summary")
      .filter({ hasText: "Catatan trainer" })
      .click({ timeout: 20000 });

    const recommendations = result
      .getByRole("heading", { name: "Rekomendasi coaching" })
      .locator("..")
      .getByRole("listitem");
    // Soft: tiap bug (urutan, label, catatan hilang) dilaporkan dalam satu run.
    await expect
      .soft(recommendations)
      .toHaveText([
        "Akui kekesalan konsumen sebelum menjelaskan.",
        "Kurangi filler saat mencari data.",
        "Pertahankan salam pembuka.",
      ]);

    const first = result.getByRole("listitem", { name: /^Catatan 1 pada/ });
    await expect.soft(first).toContainText("Empati terlewat");
    await expect.soft(first).not.toContainText("missed_empathy");
    await expect
      .soft(result.getByRole("listitem", { name: /^Catatan 2 pada/ }))
      .toContainText("Jeda saat mencari aturan");

    const note = result.getByRole("textbox", { name: "Catatan" });
    await note.fill("Tawarkan ringkasan sebelum menutup.");
    await result.getByRole("button", { name: "Simpan catatan" }).click();
    await expect(
      page.getByText("Catatan belum tersimpan. Coba lagi."),
    ).toBeVisible();
    await expect.soft(note).toHaveValue("Tawarkan ringkasan sebelum menutup.");
    expectHermetic(audit);
  });

  test("Unduh rekaman di pemutar menghasilkan berkas bernama", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW, ANNOTATIONS_MOCKS, [
      REVIEWED_ROW,
    ]);
    const downloadEvent = page.waitForEvent("download", { timeout: 20000 });
    await page.getByRole("button", { name: "Unduh rekaman" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(
      "Telefun_Rina Susanti_telefun-reviewed-1.webm",
    );
    expectHermetic(audit);
  });

  test("rekaman tetap bersuara selama mute; hanya hold yang senyap", async ({
    page,
  }) => {
    // Mute hanya mematikan mikrofon agen; konsumen tetap bicara dan terekam.
    // Sesi 252,5 dtk untuk rekaman 252 dtk: jam rekaman sama dengan jam sesi.
    const row: TelefunRow = {
      ...REVIEWED_ROW,
      session_metrics: {
        ...REVIEWED_ROW.session_metrics!,
        sessionDurationMs: 252_500,
        mutes: [{ startedAtMs: 60_000, endedAtMs: 70_000 }],
      },
    };
    const audit = await openTelaah(page, row, ANNOTATIONS_MOCKS, [row]);
    const audio = page.locator("audio");
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration), {
        timeout: 20000,
      })
      .toBe(252);
    const mutedAt = async (seconds: number) => {
      await audio.evaluate(
        (el: HTMLAudioElement, at) =>
          new Promise<void>((resolve) => {
            el.addEventListener("seeked", () => resolve(), { once: true });
            el.currentTime = at;
          }),
        seconds,
      );
      return audio.evaluate((el: HTMLAudioElement) => el.muted);
    };
    expect(await mutedAt(59.5)).toBe(false);
    expect(await mutedAt(65)).toBe(false);
    expect(await mutedAt(70.5)).toBe(false);
    expect(await mutedAt(130)).toBe(true);
    expectHermetic(audit);
  });

  test("menunggu analisis: status jujur, Periksa status memuat hasil", async ({
    page,
  }) => {
    const audit = await openTelaah(page, PENDING_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/history/${PENDING_ROW.id}`,
        body: {
          success: true,
          data: {
            ...PENDING_ROW,
            score: 6.8,
            scoring_status: "completed",
            voice_assessment: voiceAssessment({ overall: 6.8 }),
          },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    // Halaman dengan sesi belum dinilai memeriksa status sekali secara otomatis;
    // tombol tetap tersedia bila hasil belum ada.
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("6,8", {
      timeout: 20000,
    });
    await expect(result.getByText("%")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("analisis gagal dilaporkan jujur dan bisa diulang tanpa mengulang panggilan", async ({
    page,
  }) => {
    const scored = voiceAssessment({ overall: 8.1 });
    const audit = await openTelaah(page, FAILED_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/history/${FAILED_ROW.id}`,
        body: { success: true, data: FAILED_ROW },
      },
      {
        method: "POST",
        path: `/api/v1/telefun/score/${FAILED_ROW.id}`,
        body: {
          success: true,
          data: { score: 8.1, feedback: "Baik", assessment: scored },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const failed = result.getByRole("alert");
    await expect(failed).toContainText("Analisis belum berhasil", {
      timeout: 20000,
    });
    await expect(failed).toContainText("Rekaman tetap tersimpan");
    await result.getByRole("button", { name: "Analisis ulang" }).click();
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("8,1");
    await waitForMockedApi(audit, [
      `POST /api/v1/telefun/score/${FAILED_ROW.id}`,
    ]);
    expectHermetic(audit);
  });

  test("anotasi isi: inti kasus, pertanyaan konsumen berstatus, kalimat agen, dan tanda di transkrip", async ({
    page,
  }) => {
    const highAssessment = annotatedAssessment({ fillers: 9 });
    const highScoreRow = {
      ...ANNOTATED_ROW,
      voice_assessment: {
        ...highAssessment,
        holdManagement: {
          ...highAssessment.holdManagement,
          drill: "Sebutkan perkiraan waktu sebelum hold.",
        },
      },
    };
    const audit = await openTelaah(
      page,
      highScoreRow,
      [],
      [
        highScoreRow,
        ...FULL_HISTORY.filter((row) => row.id !== ANNOTATED_ROW.id),
      ],
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(
      result.getByRole("region", { name: "Ringkasan" }),
    ).toContainText("Klaim asuransi konsumen ditolak", { timeout: 20000 });

    await expect(result.getByRole("tab")).toHaveCount(0);
    await expect(
      result
        .getByRole("region", { name: "Pertanyaan konsumen" })
        .getByRole("heading"),
    ).toContainText("0 dari 2 terjawab");
    const points = result.getByRole("list", { name: "Pertanyaan konsumen" });
    const first = points.getByRole("listitem").nth(1);
    await expect(first).toContainText("A");
    await expect(first).toContainText("Alasan klaim ditolak");
    await expect(first).toContainText("Sebagian");
    await expect(first).toContainText("belum menjelaskan alasannya");
    await expect(
      first.getByRole("button", { name: /Dijawab di 01\.18/ }),
    ).toBeVisible();
    const second = points.getByRole("listitem").nth(0);
    await expect(second).toContainText("Belum terjawab");
    await expect(second).toContainText(
      "Belum ada jawaban agen untuk pertanyaan ini.",
    );

    // Tombol kutipan menuju baris transkrip.
    await first.getByRole("button", { name: /Konsumen 00\.04/ }).click();
    await expect(transcript.getByTestId("telefun-line-00.04")).toHaveAttribute(
      "data-highlighted",
      "true",
    );

    // Kutipan ditandai di transkrip; kata pengisi tetap bertanda.
    const consumerMark = transcript
      .getByTestId("telefun-line-00.04")
      .locator("mark", { hasText: "kok klaim asuransi saya ditolak" });
    await expect(consumerMark).toContainText("A");
    const agentLine = transcript.getByTestId("telefun-line-00.36");
    await expect(
      agentLine.locator("mark", { hasText: "saya cek dulu ya aturannya" }),
    ).toContainText("2");
    await expect(agentLine.locator("mark", { hasText: /^Eee$/ })).toHaveCount(
      1,
    );

    const good = result.getByRole("region", {
      name: "Sudah baik",
      exact: true,
    });
    const fixes = result.getByRole("region", {
      name: "Perbaiki dulu",
      exact: true,
    });
    await expect(good).toContainText("Sudah tepat");
    await expect(
      result.getByText("Menggali data perusahaan sebelum menjawab.", {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      result.getByText("Konsumen tidak tahu berapa lama harus menunggu.", {
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      result.getByText("Menyapa dengan salam lengkap", { exact: true }),
    ).toHaveCount(0);
    const fix = fixes
      .getByRole("list", { name: "Kalimat agen" })
      .getByRole("listitem");
    await expect(fix).toContainText("Perlu diperbaiki");
    await expect(fix).toContainText(
      "Kalimat yang lebih tepat: Mohon izin, saya cek aturannya sekitar satu menit ya, Bu.",
    );
    await fix.getByRole("button", { name: /Agen 00\.36/ }).click();
    await expect(agentLine).toHaveAttribute("data-highlighted", "true");
    // Marker yang sama harus memfokuskan catatan lagi setelah kembali ke transkrip.
    const marker = agentLine.getByRole("button", {
      name: "Lihat kalimat agen 2",
    });
    const target = page.locator("#telefun-line-1");
    for (let round = 0; round < 2; round++) {
      await marker.click();
      await expect(target).toBeFocused();
      await target.getByRole("button", { name: /Agen 00\.36/ }).click();
      await expect(agentLine).toBeFocused();
    }
    await expect(good).not.toContainText("Perlu diperbaiki");
    await expect(good).not.toContainText("Intonasi naik turun wajar.");
    await expect(fixes).toContainText("Mohon izin, saya cek aturannya");
    await result
      .getByRole("list", { name: "Skor per aspek" })
      .getByRole("button", { name: /Intonasi/ })
      .click();
    const explanation = result.locator("#telefun-score-intonation");
    await expect(explanation).toHaveAttribute("open", "");
    await expect(explanation.locator("summary")).toBeFocused();
    await expect(explanation).toContainText("Intonasi naik turun wajar.");
    await result
      .getByRole("button", { name: "Lihat penjelasan Penggunaan hold" })
      .click();
    await expect(
      result.getByRole("region", { name: "Alasan skor" }),
    ).toContainText("Sebutkan perkiraan waktu sebelum hold.");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await result
        .getByRole("button", { name: "Lihat penjelasan Intonasi" })
        .click();
      await expect(
        explanation.getByText("Intonasi naik turun wajar.", { exact: true }),
      ).toBeVisible();
      expect(
        await result.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`telefun-scores-${width}.png`),
      });
    }

    expectHermetic(audit);
  });

  test("hasil lama tanpa anotasi menulis Belum tersedia dan menunjuk Telaah ulang", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6", {
      timeout: 20000,
    });
    await expect(
      result.getByRole("heading", { name: "Inti kasus" }),
    ).toHaveCount(0);
    await expect(result.getByRole("tab")).toHaveCount(0);
    await expect(
      result
        .getByRole("region", { name: "Pertanyaan konsumen" })
        .getByText(/Belum tersedia untuk hasil ini/),
    ).toContainText("Telaah ulang");
    expectHermetic(audit);
  });

  test("agen melihat hasil telaah tanpa tombol Telaah ulang (hanya trainer dan admin)", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: telaahPath(REVIEWED_ROW.id),
      auth: { role: "agent" },
      waitForUrl: /\/telefun/,
      apiMocks: [...telefunMocks(FULL_HISTORY), recordingMock(REVIEWED_ROW.id)],
      beforeNavigate: (page) => serveRecording(page),
    });
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6", {
      timeout: 20000,
    });
    await expect(
      result.getByRole("button", { name: "Telaah ulang" }),
    ).toHaveCount(0);
    await expect(
      result
        .getByRole("region", { name: "Pertanyaan konsumen" })
        .getByText(/Belum tersedia untuk hasil ini/),
    ).not.toContainText("Telaah ulang");
    expectHermetic(audit);
  });

  test("telaah ulang: konfirmasi, batal tidak mengirim, hasil baru menggantikan yang lama", async ({
    page,
  }) => {
    const fresh = annotatedAssessment({ overall: 8.3 });
    const audit = await openTelaah(page, REVIEWED_ROW, [
      {
        method: "POST",
        path: `/api/v1/telefun/score/${REVIEWED_ROW.id}/rerun`,
        body: {
          success: true,
          data: { score: 8.3, feedback: "Baik", assessment: fresh },
        },
      },
      {
        method: "GET",
        path: `/api/v1/telefun/history/${REVIEWED_ROW.id}`,
        body: {
          success: true,
          data: { ...REVIEWED_ROW, score: 8.3, voice_assessment: fresh },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6", {
      timeout: 20000,
    });

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    const dialog = page.getByRole("dialog", { name: "Telaah ulang panggilan ini?" });
    await expect(dialog).toContainText("hasil sekarang tetap dipakai");
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    expect(audit.mockedApi.filter((entry) => entry.includes("/rerun"))).toEqual([]);

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    await page
      .getByRole("dialog", { name: "Telaah ulang panggilan ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("8,3");
    await expect(
      result.getByRole("region", { name: "Ringkasan" }).getByRole("heading", { name: "Inti kasus" }),
    ).toBeVisible();
    await waitForMockedApi(audit, [
      `POST /api/v1/telefun/score/${REVIEWED_ROW.id}/rerun`,
    ]);
    expectHermetic(audit);
  });

  test("telaah ulang yang berjalan menampilkan waktu berjalan dan perkiraan, tanpa persen", async ({
    page,
  }) => {
    await page.clock.install();
    const fresh = annotatedAssessment({ overall: 8.3 });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const audit = await openTelaah(page, REVIEWED_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/history/${REVIEWED_ROW.id}`,
        body: {
          success: true,
          data: { ...REVIEWED_ROW, score: 8.3, voice_assessment: fresh },
        },
      },
    ]);
    // Route ditambahkan setelah shell: Playwright mendahulukan yang terakhir.
    await page.route(
      `**/api/v1/telefun/score/${REVIEWED_ROW.id}/rerun`,
      async (route) => {
        await held;
        await route.fulfill({
          json: {
            success: true,
            data: { score: 8.3, feedback: "Baik", assessment: fresh },
          },
        });
      },
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("button", { name: "Telaah ulang" })
      .click({ timeout: 20000 });
    await page
      .getByRole("dialog", { name: "Telaah ulang panggilan ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();

    const wait = result.getByRole("status", { name: "Telaah ulang berjalan" });
    await expect(wait).toContainText("Biasanya 1–2 menit");
    await expect(wait).toContainText("paling lama sekitar 3 menit");
    await expect(wait.getByTestId("telefun-wait-elapsed")).toHaveText("00.00");
    await page.clock.fastForward(65_000);
    await expect(wait.getByTestId("telefun-wait-elapsed")).toHaveText("01.05");
    await expect(wait).not.toContainText("%");
    // Hasil lama tetap tampil selama menunggu.
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6");

    await page.clock.fastForward(130_000);
    await expect(wait).toContainText("Lebih lama dari biasanya");

    release();
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("8,3");
    await expect(wait).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah ulang yang gagal melapor jujur dan hasil lama tetap tampil", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW, [
      {
        method: "POST",
        path: `/api/v1/telefun/score/${REVIEWED_ROW.id}/rerun`,
        status: 502,
        body: {
          success: false,
          error: {
            code: "RERUN_FAILED",
            message: "Telaah ulang belum berhasil.",
            details: { previousKept: true },
          },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("button", { name: "Telaah ulang" })
      .click({ timeout: 20000 });
    await page
      .getByRole("dialog", { name: "Telaah ulang panggilan ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    const notice = result.getByRole("alert");
    await expect(notice).toContainText("Telaah ulang belum berhasil");
    await expect(notice).toContainText("Hasil sebelumnya tetap ditampilkan");
    await expect(notice).not.toContainText("RERUN_FAILED");
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("7,6");
    await waitForMockedApi(audit, [
      `POST /api/v1/telefun/score/${REVIEWED_ROW.id}/rerun`,
    ]);
    expectHermetic(audit);
  });

  test("sesi tanpa rekaman: tidak ada skor karangan dan tidak ada tombol palsu", async ({
    page,
  }) => {
    const audit = await openTelaah(page, NO_RECORDING_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/history/${NO_RECORDING_ROW.id}`,
        body: { success: true, data: NO_RECORDING_ROW },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result).toContainText("Rekaman tidak tersimpan", {
      timeout: 20000,
    });
    await expect(result.getByTestId("telefun-voice-score")).toHaveCount(0);
    await expect(
      result.getByRole("button", { name: /Analisis|Unggah/ }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("riwayat ringkas: Telaah mengambil satu panggilan penuh dengan transkripnya", async ({
    page,
  }) => {
    // Daftar riwayat tidak membawa transkrip dan metrik sesi.
    const {
      messages: _messages,
      session_metrics: _metrics,
      ...rest
    } = REVIEWED_ROW;
    const summary: TelefunRow = { ...rest, detail: "summary" };
    const audit = await openTelaah(
      page,
      REVIEWED_ROW,
      [
        ...ANNOTATIONS_MOCKS,
        {
          method: "GET",
          path: `/api/v1/telefun/history/${REVIEWED_ROW.id}`,
          body: { success: true, data: REVIEWED_ROW },
        },
      ],
      FULL_HISTORY.map((row) => (row.id === REVIEWED_ROW.id ? summary : row)),
    );

    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(transcript.getByTestId("telefun-line-00.36")).toBeVisible({
      timeout: 20000,
    });
    await expect(transcript).toContainText(
      "Hold 02.01 – 02.28 · 27 detik · dalam batas",
    );
    await waitForMockedApi(audit, [
      "/telefun/sessions?view=list",
      `/telefun/history/${REVIEWED_ROW.id}`,
    ]);
    expectHermetic(audit);
  });

  test("riwayat ringkas: panggilan yang gagal dimuat kembali ke landing dengan pesan", async ({
    page,
  }) => {
    const { messages: _messages, ...rest } = REVIEWED_ROW;
    const audit = await openTelaah(
      page,
      REVIEWED_ROW,
      [
        {
          method: "GET",
          path: `/api/v1/telefun/history/${REVIEWED_ROW.id}`,
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: "gagal" },
          },
        },
      ],
      [{ ...rest, detail: "summary" }],
    );
    await expect(
      page.getByText("Panggilan itu belum bisa dibuka. Coba lagi."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/sesi=/);
    expectHermetic(audit);
  });

  test("alamat replay lama dialihkan ke tahap Telaah", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: `/telefun/replay/${REVIEWED_ROW.id}`,
      apiMocks: [...telefunMocks(FULL_HISTORY), recordingMock(REVIEWED_ROW.id)],
      waitForUrl: /tahap=telaah/,
    });
    await serveRecording(page);
    await expect(page).toHaveURL(new RegExp(`sesi=${REVIEWED_ROW.id}`));
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah" })
        .getByTestId("telefun-voice-score"),
    ).toBeVisible({ timeout: 20000 });
    expectHermetic(audit);
  });

  test("sesi yang tidak ada lagi kembali ke landing dengan pesan", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath("telefun-hilang"),
      telefunMocks(FULL_HISTORY),
    );
    await expect(
      page.getByText("Sesi itu tidak ada lagi di riwayat Anda."),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page).not.toHaveURL(/sesi=/);
    expectHermetic(audit);
  });

  test("tanda kata pengisi dan panel hasil memenuhi kontras di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("telefun-voice-score")).toBeVisible({
      timeout: 20000,
    });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await result.getByRole("button", { name: "Lihat penjelasan Filler" }).click();
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const found = [
        ...(await findLowContrastText(transcript, { selector: "mark" })),
        ...(await findLowContrastText(result, {
          selector: "p, span, button, h3, h4",
          leafOnly: true,
        })),
      ];
      expect(found, `${theme}: ${found.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks tahap Telaah minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openTelaah(page, REVIEWED_ROW);
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah" })
        .getByTestId("telefun-voice-score"),
    ).toBeVisible({ timeout: 20000 });
    const offenders = await findTextBelowFloor(page.locator("body"));
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("Telefun cek mikrofon ditolak (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("izin mikrofon ditolak: penjelasan, Coba lagi, dan Mulai panggilan nonaktif", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
    const audit = await open(page, "/telefun", telefunMocks([]));
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });
    const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
    await expect(picker.getByText("Mikrofon belum diizinkan")).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Mulai panggilan" }),
    ).toBeDisabled();
    expectHermetic(audit);
  });
});

test.describe("Telefun Pengaturan (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("kategori berlabel jelas, sakelar skenario, perubahan ditandai, tutup memakai konfirmasi aplikasi", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", [
      ...telefunMocks([]),
      {
        method: "PUT",
        path: "/api/v1/telefun/settings",
        body: { success: true, data: null },
      },
    ]);
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Berlaku untuk panggilan yang Anda mulai berikutnya."),
    ).toBeVisible();

    const tabs = dialog.getByRole("tablist", { name: "Bagian pengaturan" });
    for (const label of [
      /^Skenario\s*\d+\/\d+/,
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Sesi & AI/,
    ]) {
      await expect(tabs.getByRole("tab", { name: label })).toBeVisible();
    }

    // Baru dibuka tanpa perubahan: tidak ada penanda palsu.
    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);

    const firstSwitch = dialog.getByRole("switch").first();
    const before = await firstSwitch.getAttribute("aria-checked");
    await firstSwitch.click();
    await expect(firstSwitch).not.toHaveAttribute("aria-checked", before ?? "");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "Tutup tanpa menyimpan?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Lanjut mengubah" }).click();

    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toBeHidden();
    await waitForMockedApi(audit, ["PUT /api/v1/telefun/settings"]);
    expect(nativeDialog).toBe(false);
    expectHermetic(audit);
  });

  test("karakter konsumen terakhir tidak bisa dihapus", async ({ page }) => {
    const audit = await open(
      page,
      "/telefun",
      telefunMocks([], {
        consumerTypes: [
          {
            id: "only-consumer",
            name: "Pak Budi",
            gender: "random",
            description: "Konsumen sabar yang ingin penjelasan rinci.",
            difficulty: "Medium",
          },
        ],
      }),
    );
    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    // Tanpa karakter, panggilan berikutnya tidak punya persona konsumen.
    await expect(
      dialog.getByRole("button", { name: "Hapus Pak Budi" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText("Minimal satu karakter konsumen harus ada."),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("isi tiap kategori mengikuti KETIK: judul, filter, baris karakter, grup radio, tanpa tantangan", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks([]));
    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await expect(dialog).toBeVisible();

    // Skenario: judul, filter kategori, dan editor dengan sakelar Ikuti skrip.
    await expect(
      dialog.getByRole("heading", { name: "Skenario", exact: true }),
    ).toBeVisible();
    const filter = dialog.getByRole("group", { name: "Filter kategori" });
    await filter.getByRole("button", { name: "Pinjol", exact: true }).click();
    await expect(
      filter.getByRole("button", { name: "Pinjol", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const rows = dialog.getByRole("list").first().getByRole("listitem");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index)).toContainText("Pinjol");
    }
    await filter.getByRole("button", { name: "Semua", exact: true }).click();

    await dialog.getByRole("button", { name: "Skenario baru" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Skenario baru", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("switch", { name: "Ikuti skrip" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(dialog.getByRole("button", { name: "Terapkan" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Kembali ke daftar" }).click();

    // Karakter konsumen: baris pilihan, kesulitan dalam bahasa Indonesia.
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Karakter konsumen", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Marah & Emosional" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      dialog.getByRole("listitem").filter({ hasText: "Marah & Emosional" }),
    ).toContainText("Sulit");
    await expect(
      dialog.getByRole("button", { name: "Karakter baru" }),
    ).toBeVisible();

    // Identitas konsumen: judul yang sama dengan nama kategori.
    await dialog.getByRole("tab", { name: /^Identitas konsumen/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Identitas konsumen", exact: true }),
    ).toBeVisible();

    // Sesi & AI: durasi, tempo, model sebagai grup radio; tantangan percakapan sudah dihapus.
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Sesi & AI", exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Durasi panggilan" })
        .getByRole("radio", { name: "5 menit", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Tempo bicara konsumen" })
        .getByRole("radio", { name: /^Natural/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Model AI" })
        .getByRole("radio", { checked: true }),
    ).toHaveCount(1);

    await expect(dialog.getByText("Tantangan percakapan")).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);

    const offenders = await findTextBelowFloor(dialog);
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
