/**
 * Telefun — landing berbasis data, layar panggilan, dan tahap Telaah
 * (hermetic). Semua `/api` dimock; server suara Gemini Live ditiru lewat
 * `routeWebSocket`, dan mikrofon memakai perangkat palsu Chromium.
 */

import { expect, test } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
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
import {
  telaahPath,
  open,
  ANNOTATIONS_MOCKS,
  openTelaah,
} from "./helpers/telefunFlowHarness";

test.describe("Telefun Telaah (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
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

  test("analisis ulang langsung memakai transkrip Telaah dari hasil baru", async ({
    page,
  }) => {
    const row: TelefunRow = {
      ...FAILED_ROW,
      messages: [
        {
          speaker: "agent",
          text: "Selamat pagi, dengan Kontak Gojek 157.",
          startMs: 1000,
        },
      ],
    };
    const scored = {
      ...voiceAssessment({ overall: 8.1 }),
      reviewTranscript: [
        {
          speaker: "agent",
          text: "Selamat pagi, dengan Kontak OJK 157.",
          startMs: 1000,
        },
      ],
    };
    // Baris server belum dinilai, jadi hanya hasil skor yang memuat transkrip baru.
    const audit = await openTelaah(
      page,
      row,
      [
        {
          method: "GET",
          path: `/api/v1/telefun/history/${row.id}`,
          body: { success: true, data: row },
        },
        {
          method: "POST",
          path: `/api/v1/telefun/score/${row.id}`,
          body: {
            success: true,
            data: { score: 8.1, feedback: "Baik", assessment: scored },
          },
        },
      ],
      FULL_HISTORY.map((item) => (item.id === row.id ? row : item)),
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(transcript.getByTestId("telefun-line-00.01")).toContainText(
      "Kontak Gojek 157",
      { timeout: 20000 },
    );
    await result.getByRole("button", { name: "Analisis ulang" }).click();
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("8,1");
    await expect(transcript.getByTestId("telefun-line-00.01")).toContainText(
      "Kontak OJK 157",
    );
    await waitForMockedApi(audit, [`POST /api/v1/telefun/score/${row.id}`]);
    expectHermetic(audit);
  });

  test("rekaman agen terlalu pendek: alasan tampil dan analisis ulang tidak ditawarkan", async ({
    page,
  }) => {
    const reason =
      "Rekaman bicara agen terlalu pendek untuk dinilai (minimal 5 detik).";
    const audit = await openTelaah(page, FAILED_ROW, [
      {
        method: "GET",
        path: `/api/v1/telefun/history/${FAILED_ROW.id}`,
        body: { success: true, data: FAILED_ROW },
      },
      {
        method: "POST",
        path: `/api/v1/telefun/score/${FAILED_ROW.id}`,
        status: 422,
        body: {
          success: false,
          error: { code: "AGENT_SPEECH_TOO_SHORT", message: reason },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result
      .getByRole("button", { name: "Analisis ulang" })
      .click({ timeout: 20000 });
    const failed = result.getByRole("alert");
    await expect(failed).toContainText(reason);
    await expect(failed).not.toContainText("bisa dijalankan ulang");
    await expect(
      result.getByRole("button", { name: "Analisis ulang" }),
    ).toHaveCount(0);
    await waitForMockedApi(audit, [
      `POST /api/v1/telefun/score/${FAILED_ROW.id}`,
    ]);
    expectHermetic(audit);
  });

  test("kategori bahasa: pengulangan punya dua bukti, offset satu baris, dan tanda tumpang tindih tetap bisa dibuka", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const repeated = "Saya akan memeriksa tagihan Ibu.";
    const row: TelefunRow = {
      ...ANNOTATED_ROW,
      messages: [
        {
          speaker: "consumer",
          text: "Kenapa tagihan saya belum berubah?",
          startMs: 4000,
        },
        { speaker: "agent", text: repeated, startMs: 11000 },
        { speaker: "agent", text: repeated, startMs: 24000 },
        {
          speaker: "agent",
          text: "Untuk dapat bisa memeriksa, mohon nomor tiketnya.",
          startMs: 36000,
        },
        {
          speaker: "agent",
          text: "Mohon tunggu. Mohon tunggu.",
          startMs: 78000,
        },
        { speaker: "agent", text: "Baik, terima kasih.", startMs: 150000 },
      ],
      voice_assessment: {
        ...voiceAssessment(),
        contentReview: {
          caseCore: "Tagihan belum berubah.",
          consumerPoints: [],
          agentNotes: [
            {
              category: "repetition",
              startMs: 24000,
              startOffset: 0,
              quote: repeated,
              comparison: { startMs: 11000, startOffset: 0, quote: repeated },
              verdict: "fix",
              note: "Janji pemeriksaan diulang tanpa informasi baru.",
              example:
                "Mohon nomor tiketnya agar saya bisa memeriksa tagihan Ibu.",
            },
            {
              category: "effectiveness",
              startMs: 36000,
              quote: "Untuk dapat bisa memeriksa",
              verdict: "fix",
              note: "Dapat dan bisa bermakna sama.",
              example: "Untuk memeriksa, mohon nomor tiketnya.",
            },
            {
              category: "repetition",
              startMs: 78000,
              startOffset: 14,
              quote: "Mohon tunggu.",
              comparison: {
                startMs: 78000,
                startOffset: 0,
                quote: "Mohon tunggu.",
              },
              verdict: "fix",
              note: "Permintaan menunggu diulang dalam satu ucapan.",
              example: "Mohon tunggu sebentar.",
            },
            {
              startMs: 150000,
              quote: "Baik, terima kasih.",
              verdict: "good",
              note: "Catatan lama tetap terbaca.",
              example: null,
            },
            {
              category: "confirmation",
              startMs: 11000,
              quote: "Saya akan memeriksa",
              verdict: "good",
              note: "Memberi tahu langkah pemeriksaan.",
              example: null,
            },
          ],
        },
      },
    };
    const audit = await openTelaah(page, row, [], [row]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(
      result.getByText("Efektivitas kalimat", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(result.getByText("Pengulangan", { exact: true })).toHaveCount(
      2,
    );
    const target = result.locator("#telefun-line-0");
    for (const line of ["00.11", "00.24"]) {
      const marker = transcript
        .getByTestId(`telefun-line-${line}`)
        .getByRole("button", {
          name:
            line === "00.11"
              ? "Lihat pembanding kalimat agen 1"
              : "Lihat kalimat agen 1",
          exact: true,
        });
      for (let round = 0; round < 2; round++) {
        await marker.click();
        await expect(target).toBeFocused();
        await target
          .getByRole("button", {
            name: new RegExp(
              line === "00.11" ? "Pembanding 00\\.11" : "Agen 00\\.24",
            ),
          })
          .click();
        await expect(
          transcript.getByTestId(`telefun-line-${line}`),
        ).toBeFocused();
      }
    }
    // Partial overlap retains both labels and never duplicates the spoken text.
    expect(
      await transcript
        .getByTestId("telefun-line-00.11")
        .locator("mark")
        .evaluate((el) => {
          const copy = el.cloneNode(true) as HTMLElement;
          copy
            .querySelectorAll("button, sup")
            .forEach((button) => button.remove());
          return copy.textContent;
        }),
    ).toBe(repeated);
    await transcript
      .getByTestId("telefun-line-00.11")
      .getByRole("button", { name: "Lihat kalimat agen 5", exact: true })
      .click();
    await expect(result.locator("#telefun-line-4")).toBeFocused();
    const sameLine = transcript.getByTestId("telefun-line-01.18");
    await expect(sameLine.locator("mark")).toHaveCount(2);
    await expect(sameLine.locator("mark").nth(0)).toContainText("3a");
    await expect(sameLine.locator("mark").nth(1)).toContainText("3");
    await expect(result.locator("#telefun-line-3")).toContainText(
      "Catatan lama tetap terbaca.",
    );
    await expect(result.locator("#telefun-line-3")).not.toContainText(
      "Konfirmasi dan penggalian",
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await setDocumentTheme(page, theme);
        await transcript
          .getByTestId("telefun-line-00.24")
          .getByRole("button", { name: "Lihat kalimat agen 1", exact: true })
          .click();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
        expect(
          await result.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: test
            .info()
            .outputPath(`telefun-language-${width}-${theme}.png`),
        });
      }
    }
    await waitForMockedApi(audit, ["/telefun/settings", "/telefun/sessions"]);
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

  test("transkrip Telaah memakai teks agen dari rekaman bila tersedia", async ({
    page,
  }) => {
    // Live salah dengar; penilaian menyimpan transkrip gabungan dari rekaman.
    const messages = (REVIEWED_ROW.messages as { text: string }[]).map(
      (entry) => ({
        ...entry,
        text: entry.text.replace("Kontak OJK 157", "Kontak Gojek 157"),
      }),
    );
    const row: TelefunRow = {
      ...ANNOTATED_ROW,
      messages,
      voice_assessment: {
        ...annotatedAssessment(),
        reviewTranscript: REVIEWED_ROW.messages,
      },
    };
    const audit = await openTelaah(
      page,
      row,
      [],
      [row, ...FULL_HISTORY.filter((item) => item.id !== row.id)],
    );
    const transcript = page.getByRole("region", {
      name: "Rekaman dan transkrip",
    });
    await expect(transcript.getByTestId("telefun-line-00.11")).toContainText(
      "Kontak OJK 157",
      { timeout: 20000 },
    );
    await expect(transcript).not.toContainText("Gojek");
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
    const dialog = page.getByRole("dialog", {
      name: "Telaah ulang panggilan ini?",
    });
    await expect(dialog).toContainText("hasil sekarang tetap dipakai");
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    expect(audit.mockedApi.filter((entry) => entry.includes("/rerun"))).toEqual(
      [],
    );

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    await page
      .getByRole("dialog", { name: "Telaah ulang panggilan ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect(result.getByTestId("telefun-voice-score")).toHaveText("8,3");
    await expect(
      result
        .getByRole("region", { name: "Ringkasan" })
        .getByRole("heading", { name: "Inti kasus" }),
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
    await result
      .getByRole("button", { name: "Lihat penjelasan Filler" })
      .click();
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
