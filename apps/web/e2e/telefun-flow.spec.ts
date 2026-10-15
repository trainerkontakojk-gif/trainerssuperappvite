import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import {
  ANNOTATED_ROW,
  FAILED_ROW,
  FULL_HISTORY,
  NO_RECORDING_ROW,
  PENDING_ROW,
  REVIEWED_ROW,
  recordingMock,
  serveRecording,
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

async function open(page: Page, path: string, apiMocks: ApiMock[]) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    waitForUrl: /\/telefun/,
  });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

test.describe("Telefun landing (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
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
  const audit = await open(page, telaahPath(row.id), [
    ...telefunMocks(history),
    recordingMock(row.id),
    ...extra,
  ]);
  await serveRecording(page);
  return audit;
}

test.describe("Telefun Telaah (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
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
    await result.getByRole("tab", { name: /^Perbaiki dulu/ }).click();
    await result.getByRole("button", { name: /00\.36 · Filler/ }).click();
    await expect(agentLine).toHaveAttribute("data-highlighted", "true");

    await result.getByRole("tab", { name: /^Catatan trainer/ }).click();
    await expect(
      result.getByText("Ganti eee dengan kalimat jeda."),
    ).toBeVisible();

    await waitForMockedApi(audit, [
      `/telefun/recording/${REVIEWED_ROW.id}`,
      `/telefun/annotations/${REVIEWED_ROW.id}`,
    ]);
    expectHermetic(audit);
  });

  test("tab Profil membandingkan hasil dengan target dalam satuan asli, tanpa radar", async ({
    page,
  }) => {
    const audit = await openTelaah(page, REVIEWED_ROW);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("tab", { name: "Profil" })
      .click({ timeout: 20000 });
    const targets = result.getByRole("list", { name: "Target vs hasil" });
    const rows = targets.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    const rate = rows.filter({ hasText: "Kecepatan bicara" });
    await expect(rate).toContainText("158 kata/menit");
    await expect(rate).toContainText("ideal 130–150");
    const filler = rows.filter({ hasText: "Filler" });
    await expect(filler).toContainText("7 filler");
    await expect(filler).toContainText("maks 3");
    await expect(filler).toContainText("Kurang");
    const articulation = rows.filter({ hasText: "Artikulasi" });
    await expect(articulation).toContainText("8,8 / 10");
    await expect(articulation).toContainText("target 8,0–10,0");
    await expect(articulation).toContainText("Baik");
    await expect(rows.filter({ hasText: "Nada emosi" })).toContainText("tenang");
    // Tidak ada radar berbahasa Inggris lagi.
    await expect(result.locator(".recharts-wrapper")).toHaveCount(0);
    await expect(result.getByText("Speaking Rate")).toHaveCount(0);
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
    const audit = await openTelaah(page, ANNOTATED_ROW, [], [
      ANNOTATED_ROW,
      ...FULL_HISTORY.filter((row) => row.id !== ANNOTATED_ROW.id),
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(result.getByRole("region", { name: "Inti kasus" })).toContainText(
      "Klaim asuransi konsumen ditolak",
      { timeout: 20000 },
    );

    // Ada poin konsumen: tab Pertanyaan konsumen terbuka lebih dulu.
    await expect(
      result.getByRole("tab", { name: "Pertanyaan konsumen (2)" }),
    ).toHaveAttribute("aria-selected", "true");
    const points = result.getByRole("list", { name: "Pertanyaan konsumen" });
    const first = points.getByRole("listitem").nth(0);
    await expect(first).toContainText("A");
    await expect(first).toContainText("Alasan klaim ditolak");
    await expect(first).toContainText("Sebagian");
    await expect(first).toContainText("belum menjelaskan alasannya");
    await expect(first.getByRole("button", { name: /Dijawab di 01\.18/ })).toBeVisible();
    const second = points.getByRole("listitem").nth(1);
    await expect(second).toContainText("Belum terjawab");
    await expect(second).toContainText("Belum ada jawaban agen untuk pertanyaan ini.");

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
    await expect(agentLine.locator("mark", { hasText: /^Eee$/ })).toHaveCount(1);

    await result.getByRole("tab", { name: "Kalimat agen (2)" }).click();
    const notes = result.getByRole("list", { name: "Kalimat agen" });
    await expect(notes.getByRole("listitem").nth(0)).toContainText("Sudah tepat");
    const fix = notes.getByRole("listitem").nth(1);
    await expect(fix).toContainText("Perlu diperbaiki");
    await expect(fix).toContainText(
      "Kalimat yang lebih tepat: Mohon izin, saya cek aturannya sekitar satu menit ya, Bu.",
    );
    await fix.getByRole("button", { name: /Agen 00\.36/ }).click();
    await expect(agentLine).toHaveAttribute("data-highlighted", "true");
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
    await expect(result.getByRole("region", { name: "Inti kasus" })).toHaveCount(0);
    await expect(result.getByRole("tab", { name: /^Perbaiki dulu/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await result.getByRole("tab", { name: "Pertanyaan konsumen" }).click();
    await expect(result.getByText(/Belum tersedia untuk hasil ini/)).toContainText(
      "Telaah ulang",
    );
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
    await expect(result.getByRole("region", { name: "Inti kasus" })).toBeVisible();
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
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const found = [
        ...(await findLowContrastText(transcript, { selector: "mark" })),
        ...(await findLowContrastText(result)),
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
    await assertLocalDevOnlyTarget();
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
    await assertLocalDevOnlyTarget();
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
});
