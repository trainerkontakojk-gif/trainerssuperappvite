/**
 * Telefun — landing berbasis data, layar panggilan, dan tahap Telaah
 * (hermetic). Semua `/api` dimock; server suara Gemini Live ditiru lewat
 * `routeWebSocket`, dan mikrofon memakai perangkat palsu Chromium.
 */

import { expect, test } from "@playwright/test";
import vercelConfig from "../../../vercel.json" with { type: "json" };
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  AGENT_RECORDING_URL,
  ANNOTATED_ROW,
  FULL_HISTORY,
  RECORDING_URL,
  REVIEWED_ROW,
  agentRecordingMock,
  recordingMock,
  serveRecording,
  serveSpeechRecordings,
  speechWav,
  telefunMocks,
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
        const cspValues = vercelConfig.routes.flatMap((route) => {
          if (!("headers" in route)) return [];
          const policy = (route.headers as Record<string, string | undefined>)[
            "Content-Security-Policy"
          ];
          return policy ? [policy] : [];
        });
        expect(cspValues.length).toBeGreaterThan(0);
        expect(new Set(cspValues).size).toBe(1);
        const connectSrc = cspValues[0]!
          .split(";")
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
              await route.fulfill({
                json: { success: true, data: { url: null } },
              });
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
        await target.route(
          /\/e2e-telefun-expiring-(\d+)\.wav$/,
          async (route) => {
            const n = Number(/expiring-(\d+)/.exec(route.request().url())![1]);
            if (expired.has(n)) {
              await route.fulfill({ status: 403, body: "expired" });
              return;
            }
            await route.fulfill({
              status: 200,
              contentType: "audio/wav",
              body: wav,
            });
          },
        );
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
});
