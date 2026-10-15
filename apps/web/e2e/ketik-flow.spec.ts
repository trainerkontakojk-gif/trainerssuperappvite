import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_KETIK_SETTINGS,
  type KetikAppSettings,
  type KetikSessionHistoryItem,
} from "@trainers/types";
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

/**
 * KETIK — landing berbasis data, ruang chat, tahap Telaah, dan halaman Riwayat
 * (hermetic). Semua `/api` dimock; mutasi data nyata tetap milik spec backend.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * supaya spec gagal ketika UI menyimpang dari kontrak bersama.
 */

/** Tanggal relatif ke hari ini, supaya "sesi bulan ini" tidak basi. */
function daysAgo(days: number, hour = 3): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const REVIEWED_AT = daysAgo(0);
const REVIEWED_SESSION: KetikSessionHistoryItem = {
  id: "ketik-reviewed-1",
  date: REVIEWED_AT,
  scenarioTitle: "Tagihan Kartu Kredit",
  consumerName: "Bu Rina",
  consumerCity: "Bandung",
  consumerPhone: "0812-1111-2222",
  simulationDuration: 5,
  finalScore: 82,
  empathyScore: 80,
  probingScore: 64,
  resolutionScore: 78,
  typoScore: 90,
  complianceScore: 85,
  reviewStatus: "completed",
  simulationSubject: {
    type: "participant",
    participantId: "p-1",
    displayName: "Sinta",
    batchName: "Batch 7",
    team: "Tim B",
  },
  messages: [
    { id: "m1", sender: "consumer", text: "Tagihan saya dobel.", timestamp: REVIEWED_AT },
    { id: "m2", sender: "agent", text: "Baik Bu, saya cek tagihn Ibu.", timestamp: REVIEWED_AT },
    { id: "m3", sender: "consumer", text: "Tolong cepat ya.", timestamp: REVIEWED_AT },
  ],
};

/** Sesi lebih lama yang sudah ditelaah: dasar perbandingan skor. */
const OLDER_REVIEWED: KetikSessionHistoryItem = {
  id: "ketik-reviewed-0",
  date: daysAgo(2),
  scenarioTitle: "Pinjol Ilegal",
  consumerName: "Pak Budi",
  finalScore: 76,
  empathyScore: 82,
  probingScore: 70,
  resolutionScore: 74,
  typoScore: 80,
  complianceScore: 74,
  reviewStatus: "completed",
  simulationSubject: {
    type: "self",
    participantId: null,
    displayName: "Trainer E2E",
    batchName: null,
    team: null,
  },
  messages: [
    { id: "o1", sender: "consumer", text: "Saya diteror penagih.", timestamp: daysAgo(2) },
    { id: "o2", sender: "agent", text: "Mohon maaf, saya bantu cek.", timestamp: daysAgo(2) },
  ],
};

const PENDING_SESSION: KetikSessionHistoryItem = {
  id: "ketik-pending-1",
  date: daysAgo(1),
  scenarioTitle: "Pengecekan SLIK",
  consumerName: "Pak Dimas",
  consumerCity: "Surabaya",
  reviewStatus: "pending",
  messages: [
    { id: "p1", sender: "consumer", text: "Mau cek SLIK.", timestamp: daysAgo(1) },
    { id: "p2", sender: "agent", text: "Baik Pak, saya jelaskan caranya.", timestamp: daysAgo(1) },
  ],
};

const FAILED_SESSION: KetikSessionHistoryItem = {
  id: "ketik-failed-1",
  date: daysAgo(1, 5),
  scenarioTitle: "Klaim Asuransi Ditolak",
  consumerName: "Ibu Ratna",
  consumerCity: "Medan",
  reviewStatus: "failed",
  simulationSubject: {
    type: "participant",
    participantId: null,
    displayName: "Andi",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
  messages: [
    { id: "f1", sender: "consumer", text: "Klaim saya ditolak.", timestamp: daysAgo(1, 5) },
    { id: "f2", sender: "agent", text: "Saya bantu periksa, Bu.", timestamp: daysAgo(1, 5) },
  ],
};

const FULL_HISTORY: readonly KetikSessionHistoryItem[] = [
  REVIEWED_SESSION,
  FAILED_SESSION,
  PENDING_SESSION,
  OLDER_REVIEWED,
];

const DIMENSIONS = [
  ["probing", "Probing", 64, "Cukup", 1],
  ["resolution", "Resolusi", 78, "Baik", 2],
  ["empathy", "Empati & Komunikasi", 80, "Baik", 3],
  ["compliance", "Kepatuhan", 85, "Baik", 4],
  ["typo", "Tata Tulis", 90, "Sangat Baik", 5],
] as const;

const REVIEW_DETAIL = {
  sessionId: REVIEWED_SESSION.id,
  scores: { final: 82, empathy: 80, probing: 64, resolution: 78, typo: 90, compliance: 85 },
  review: {
    id: "review-1",
    sessionId: REVIEWED_SESSION.id,
    aiSummary: "Agen empatik, tetapi verifikasi data terlambat.",
    strengths: ["Menyapa dengan nama"],
    weaknesses: ["Verifikasi terlambat"],
    coachingFocus: ["Verifikasi identitas di awal"],
    createdAt: REVIEWED_AT,
    education: {
      dimensionGuidance: DIMENSIONS.map(([key, label, score, verdict, rank]) => ({
        key,
        label,
        score,
        verdict,
        priorityRank: rank,
        diagnosis: `Diagnosis ${label}.`,
        howToFix: `Cara memperbaiki ${label}.`,
        exampleRewrite: `Contoh kalimat ${label}.`,
      })),
      overallNextSteps: ["Konfirmasi data sebelum memberi solusi."],
      typosEnriched: [
        {
          messageId: "m2",
          originalWord: "tagihn",
          correctedWord: "tagihan",
          severity: "minor",
          contextSentence: "saya cek tagihn Ibu",
          whyWrong: "Huruf a tertinggal.",
        },
      ],
    },
  },
  typos: [
    {
      id: "typo-1",
      sessionId: REVIEWED_SESSION.id,
      messageId: "m2",
      originalWord: "tagihn",
      correctedWord: "tagihan",
      severity: "minor",
    },
  ],
};

/** Telaah baru: inti kasus, pertanyaan konsumen, dan kalimat agen yang dinilai. */
const ANNOTATED_REVIEW_DETAIL = {
  ...REVIEW_DETAIL,
  review: {
    ...REVIEW_DETAIL.review,
    education: {
      ...REVIEW_DETAIL.review.education,
      caseCore:
        "Tagihan kartu kredit konsumen tertagih dua kali dan ia minta segera dibereskan.",
      consumerPoints: [
        {
          messageId: "m1",
          quote: "Tagihan saya dobel",
          summary: "Kenapa tagihan tertagih dua kali",
          status: "partial",
          reason: "Agen baru berjanji mengecek, belum menjelaskan penyebabnya.",
          answerMessageId: "m2",
          answerQuote: "saya cek tagihn Ibu",
        },
        {
          messageId: "m3",
          quote: "Tolong cepat ya",
          summary: "Minta penanganan cepat",
          status: "unanswered",
          reason: "Tidak ada estimasi waktu penyelesaian.",
          answerMessageId: null,
          answerQuote: null,
        },
      ],
      agentNotes: [
        {
          messageId: "m2",
          quote: "saya cek tagihn Ibu",
          dimension: "resolution",
          verdict: "fix",
          note: "Belum ada langkah atau estimasi waktu.",
          example:
            "Saya cek transaksi ganda Ibu sekarang, hasilnya saya kabari dalam 10 menit di chat ini.",
        },
        {
          messageId: "m2",
          quote: "Baik Bu",
          dimension: "empathy",
          verdict: "good",
          note: "Sapaan sopan dan menyebut panggilan konsumen.",
          example: null,
        },
      ],
    },
  },
};

/** Tempo cepat supaya balasan konsumen di spec chat tidak menunggu lama. */
const FAST_SETTINGS: KetikAppSettings = {
  ...DEFAULT_KETIK_SETTINGS,
  responsePacingMode: "training_fast",
};

function ketikMocks(
  history: readonly KetikSessionHistoryItem[],
  settings: KetikAppSettings = DEFAULT_KETIK_SETTINGS,
): ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: settings },
      // `ketikApi` menyimpan versi dari header ini; tanpanya jalur simpan
      // kehilangan prasyaratnya.
      headers: {
        "x-settings-version": "2026-10-14T05:00:00.000Z",
        "x-ketik-templates-version": "2026-10-14T05:00:00.000Z",
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history",
      body: { success: true, data: history },
    },
  ];
}

const reviewDetailMock: ApiMock = {
  method: "GET",
  path: `/api/v1/ketik/review/${REVIEWED_SESSION.id}`,
  body: { success: true, data: REVIEW_DETAIL },
};

function telaahPath(id: string) {
  return `/ketik?sesi=${id}&tahap=telaah`;
}

/** Foto konsumen di ruang chat berasal dari host aset eksternal (`ketik-avatar.ts`). */
const KETIK_EXPECTED_ASSET_HOSTS = ["randomuser.me"];

async function open(page: Page, path: string, apiMocks: ApiMock[], role?: string) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    waitForUrl: /\/ketik/,
    ...(role ? { auth: { role } } : {}),
  });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

test.describe("KETIK landing (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("hero memberi satu aksi utama, menu kecil, dan demo yang bisa dijeda", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami konsumennya\.\s*Balas chat dengan tepat\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Kelas Etika & Trik Komunikasi/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();

    const menu = page.getByRole("navigation", { name: "Menu KETIK" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        menu.getByRole("button", { name: new RegExp(`^${label}`) }),
        `menu "${label}" tidak tampil`,
      ).toBeVisible();
    }

    // Demo berjalan sendiri dan punya tombol jeda (WCAG 2.2.2).
    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(page.getByRole("button", { name: "Putar animasi" })).toBeVisible();

    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);
    expectHermetic(audit);
  });

  test("bagian data dihitung dari riwayat: progres, tindak lanjut, fokus, hasil terbaru", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));

    const progress = page.getByTestId("ketik-progress-summary");
    // 4 sesi dalam 3 hari terakhir: semuanya masuk bulan ini kecuali bila
    // hari ini tanggal 1-2; hitungan bulan diuji lewat angka rata-rata saja.
    await expect(progress).toContainText("79", { timeout: 20000 });
    await expect(progress).toContainText("rata-rata skor dari 2 sesi terakhir");
    await expect(progress).toContainText("sesi bulan ini");

    const followUp = page.getByRole("region", { name: "Perlu tindak lanjut" });
    await expect(followUp.getByText("Klaim Asuransi Ditolak")).toBeVisible();
    await expect(followUp.getByText(/Telaah gagal/)).toBeVisible();
    await expect(followUp.getByText("Pengecekan SLIK")).toBeVisible();
    await expect(followUp.getByText(/Belum ditelaah/)).toBeVisible();

    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Probing");
    await expect(focus).toContainText("67");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    const firstRow = recent.getByRole("row").nth(1);
    await expect(firstRow).toContainText("Tagihan Kartu Kredit");
    await expect(firstRow).toContainText("Probing");
    await expect(firstRow).toContainText("82");

    // Baris membuka tahap Telaah lewat URL.
    await recent.getByRole("button", { name: "Tagihan Kartu Kredit" }).click();
    await expect(page).toHaveURL(/sesi=ketik-reviewed-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    expectHermetic(audit);
  });

  test("pengguna baru melihat ajakan, bukan angka kosong", async ({ page }) => {
    const audit = await open(page, "/ketik", ketikMocks([]));
    await expect(
      page.getByRole("heading", { name: "Belum ada latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("ketik-progress-summary")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("riwayat yang gagal dimuat bisa dicoba lagi", async ({ page }) => {
    const audit = await open(page, "/ketik", [
      ketikMocks([])[0],
      {
        method: "GET",
        path: "/api/v1/ketik/history",
        status: 500,
        body: { success: false, error: { code: "INTERNAL_ERROR", message: "x" } },
      },
    ]);
    await expect(
      page.getByRole("region", { name: "Hasil telaah terbaru" }).getByRole("alert"),
    ).toContainText("Riwayat belum bisa dimuat", { timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Coba lagi" }).first(),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tombol Mulai simulasi dan aksen KETIK memenuhi kontras WCAG di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    await expect(start).toBeVisible({ timeout: 20000 });
    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator("../.."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
      const main = page.locator("main").first();
      const accent = await findLowContrastText(main, {
        selector: ".text-module-ketik:not(h1 *)",
      });
      expect(accent, `${theme}: ${accent.join("\n")}`).toEqual([]);
      // Aksen judul hero adalah teks besar (≥18px tebal): batas WCAG 3:1.
      const hero = await findLowContrastText(main, {
        selector: "h1 .text-module-ketik",
        minRatio: 3,
      });
      expect(hero, `${theme}: ${hero.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing KETIK minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));
    await expect(page.getByTestId("ketik-progress-summary")).toBeVisible({
      timeout: 20000,
    });

    // Demo chat (aria-hidden) meniru layar chat pada skala kecil.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="ketik-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("KETIK Telaah (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("skor akhir tampil pertama, lima aspek, dan temuan menunjuk nomor pesan", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);

    const stage = page.getByRole("navigation", { name: "Tahap latihan" });
    await expect(stage.getByText("Telaah")).toHaveAttribute("aria-current", "step", {
      timeout: 20000,
    });

    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await expect(result).toContainText("Baik");
    // Naik 6 dari sesi sebelumnya yang ditelaah (76).
    await expect(result).toContainText("naik 6 dari sesi sebelumnya");

    const aspects = result.getByRole("list", { name: "Skor per aspek" });
    await expect(aspects.getByRole("listitem")).toHaveCount(5);
    await expect(aspects).toContainText("Probing");

    // Tab pertama: aspek yang perlu diperbaiki (skor < 75).
    await expect(result.getByRole("tab", { name: /Perbaiki dulu/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(result.getByText("Cara memperbaiki Probing.")).toBeVisible();

    // Ejaan: menyebut nomor pesan, tingkat dalam bahasa Indonesia.
    await result.getByRole("tab", { name: /Ejaan/ }).click();
    const finding = result.getByRole("button", { name: /Pesan 2/ });
    await expect(finding).toContainText("tagihn");
    await expect(finding).toContainText("tagihan");
    await expect(finding).toContainText("Ringan");
    await expect(result.getByText("minor", { exact: true })).toHaveCount(0);

    // Typo digarisbawahi di kalimatnya, dan klik temuan menyorot pesannya.
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(transcript.locator("mark", { hasText: "tagihn" })).toBeVisible();
    await finding.click();
    await expect(transcript.getByTestId("ketik-message-2")).toHaveAttribute(
      "data-highlighted",
      "true",
    );

    await result.getByRole("tab", { name: "Ringkasan" }).click();
    await expect(result.getByText(/verifikasi data terlambat/)).toBeVisible();

    await waitForMockedApi(audit, [`/ketik/review/${REVIEWED_SESSION.id}`]);
    expectHermetic(audit);
  });

  test("anotasi: inti kasus, pertanyaan konsumen terjawab, dan kalimat agen yang dinilai", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      { ...reviewDetailMock, body: { success: true, data: ANNOTATED_REVIEW_DETAIL } },
    ]);

    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });

    // Inti kasus tampil sebelum rincian.
    const caseCore = result.getByRole("region", { name: "Inti kasus" });
    await expect(caseCore).toContainText("tertagih dua kali dan ia minta segera");

    // Tab bawaan: pertanyaan konsumen, dengan status yang tertulis.
    const questionsTab = result.getByRole("tab", { name: /Pertanyaan konsumen \(2\)/ });
    await expect(questionsTab).toHaveAttribute("aria-selected", "true");
    // Enam tab tidak muat; tab aktif tetap terlihat utuh, tidak tergeser keluar.
    const tabList = await result.getByRole("tablist", { name: "Rincian telaah" }).boundingBox();
    const activeTab = await questionsTab.boundingBox();
    expect(activeTab!.x).toBeGreaterThanOrEqual(tabList!.x);
    expect(activeTab!.x + activeTab!.width).toBeLessThanOrEqual(tabList!.x + tabList!.width);
    const points = result.getByRole("list", { name: "Pertanyaan konsumen" });
    await expect(points.getByRole("listitem")).toHaveCount(2);
    const pointA = points.getByRole("listitem").nth(0);
    await expect(pointA).toContainText("A");
    await expect(pointA).toContainText("Sebagian");
    await expect(pointA).toContainText("Kenapa tagihan tertagih dua kali");
    await expect(pointA).toContainText("belum menjelaskan penyebabnya");
    await expect(pointA.getByRole("button", { name: /Dijawab di pesan 2/ })).toBeVisible();
    const pointB = points.getByRole("listitem").nth(1);
    await expect(pointB).toContainText("Belum terjawab");
    await expect(pointB).toContainText("Belum ada balasan agen untuk poin ini.");

    // Kutipan konsumen ditandai di transkrip; tombol pesan menyorot pesannya.
    await expect(
      transcript.getByTestId("ketik-message-1").locator("mark", { hasText: "Tagihan saya dobel" }),
    ).toBeVisible();
    await expect(
      transcript.getByTestId("ketik-message-3").locator("mark", { hasText: "Tolong cepat ya" }),
    ).toBeVisible();
    await pointB.getByRole("button", { name: /Pesan 3/ }).click();
    await expect(transcript.getByTestId("ketik-message-3")).toHaveAttribute(
      "data-highlighted",
      "true",
    );

    // Kalimat agen: catatan, aspek, dan kalimat yang lebih tepat.
    await result.getByRole("tab", { name: /Kalimat agen \(2\)/ }).click();
    const notes = result.getByRole("list", { name: "Kalimat agen yang dinilai" });
    await expect(notes.getByRole("listitem")).toHaveCount(2);
    const fix = notes.getByRole("listitem").nth(0);
    await expect(fix).toContainText("Resolusi");
    await expect(fix).toContainText("Perlu diperbaiki");
    await expect(fix).toContainText("Belum ada langkah atau estimasi waktu.");
    await expect(fix).toContainText(
      "Kalimat yang lebih tepat: Saya cek transaksi ganda Ibu sekarang",
    );
    const good = notes.getByRole("listitem").nth(1);
    await expect(good).toContainText("Sudah tepat");
    await expect(good).not.toContainText("Kalimat yang lebih tepat");

    // Kalimat agen ditandai; typo di dalamnya tetap digarisbawahi.
    const agentMessage = transcript.getByTestId("ketik-message-2");
    await expect(agentMessage.locator("mark", { hasText: "saya cek tagihn Ibu" })).toBeVisible();
    await expect(agentMessage.locator("mark mark", { hasText: "tagihn" })).toBeVisible();
    await fix.getByRole("button", { name: /Pesan 2/ }).click();
    await expect(agentMessage).toHaveAttribute("data-highlighted", "true");

    expectHermetic(audit);
  });

  test("telaah lama tanpa anotasi: ditandai belum tersedia, tab bawaan tetap Perbaiki dulu", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByRole("tab", { name: /Perbaiki dulu/ })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 20000 },
    );
    await expect(result.getByRole("region", { name: "Inti kasus" })).toHaveCount(0);
    await result.getByRole("tab", { name: /Pertanyaan konsumen/ }).click();
    await expect(result).toContainText("Belum tersedia untuk telaah ini");
    await result.getByRole("tab", { name: /Kalimat agen/ }).click();
    await expect(result).toContainText("Belum tersedia untuk telaah ini");
    await expect(result).toContainText("Jalankan Telaah ulang untuk melengkapinya");
    expectHermetic(audit);
  });

  test("tanda anotasi dan panel hasil memenuhi kontras di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      { ...reviewDetailMock, body: { success: true, data: ANNOTATED_REVIEW_DETAIL } },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    const transcript = page.getByRole("region", { name: "Percakapan" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const marks = await findLowContrastText(transcript, { selector: "mark, mark *, li p span" });
      expect(marks, `${theme}: ${marks.join("\n")}`).toEqual([]);
      for (const tab of ["Pertanyaan konsumen", "Kalimat agen"]) {
        await result.getByRole("tab", { name: new RegExp(tab) }).click();
        const panel = await findLowContrastText(result, {
          selector: "[role=tabpanel] *",
          leafOnly: true,
        });
        expect(panel, `${theme} ${tab}: ${panel.join("\n")}`).toEqual([]);
      }
    }
    expectHermetic(audit);
  });

  test("sesi belum ditelaah: agen melihat penjelasan akses, tanpa tombol mulai", async ({
    page,
  }) => {
    const audit = await open(
      page,
      telaahPath(PENDING_SESSION.id),
      ketikMocks(FULL_HISTORY),
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByText("Belum ditelaah")).toBeVisible({ timeout: 20000 });
    await expect(result).toContainText(
      "Hanya admin, trainer, dan QA yang dapat menjalankan telaah AI",
    );
    await expect(result.getByRole("button", { name: /Mulai telaah/ })).toHaveCount(0);
    // Transkrip tetap bisa dibaca.
    await expect(
      page.getByRole("region", { name: "Percakapan" }).getByText("Mau cek SLIK."),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("telaah yang gagal dilaporkan jujur dan bisa diulang tanpa mengulang chat", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(PENDING_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: { success: true, data: { status: "failed", error: "AI_TIMEOUT" } },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result.getByRole("button", { name: "Mulai telaah" }).click({ timeout: 20000 });

    const failure = result.getByRole("alert");
    await expect(failure).toContainText("Telaah belum berhasil");
    await expect(failure).toContainText("Percakapan Anda tetap tersimpan");
    await expect(failure).not.toContainText("AI_TIMEOUT");
    await expect(failure.getByRole("button", { name: "Coba telaah lagi" })).toBeVisible();
    // Tidak ada persen palsu.
    await expect(result.getByText(/\d+%/)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah yang berhasil langsung menampilkan hasil", async ({ page }) => {
    const pendingReviewed = { ...REVIEWED_SESSION, reviewStatus: "pending" as const };
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks([pendingReviewed, OLDER_REVIEWED]),
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: { success: true, data: { status: "completed", scores: REVIEW_DETAIL.scores } },
      },
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result.getByRole("button", { name: "Mulai telaah" }).click({ timeout: 20000 });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await waitForMockedApi(audit, ["POST /api/v1/ketik/review"]);
    expectHermetic(audit);
  });

  test("telaah ulang: konfirmasi, kirim rerun, lalu hasil baru menggantikan yang lama", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await expect(result.getByRole("region", { name: "Inti kasus" })).toHaveCount(0);

    // Route ditambahkan setelah shell: Playwright mendahulukan yang terakhir.
    let rerunBody: unknown = null;
    await page.route("**/api/v1/ketik/review", async (route) => {
      rerunBody = route.request().postDataJSON();
      await route.fulfill({
        json: { success: true, data: { status: "completed", scores: REVIEW_DETAIL.scores } },
      });
    });
    await page.route(`**/api/v1/ketik/review/${REVIEWED_SESSION.id}`, (route) =>
      route.fulfill({ json: { success: true, data: ANNOTATED_REVIEW_DETAIL } }),
    );

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    const dialog = page.getByRole("dialog", { name: "Telaah ulang sesi ini?" });
    await expect(dialog).toContainText("hasil sekarang tetap dipakai");
    // Batal tidak mengirim apa pun.
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    expect(rerunBody).toBeNull();

    await result.getByRole("button", { name: "Telaah ulang" }).click();
    await page
      .getByRole("dialog", { name: "Telaah ulang sesi ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();
    await expect(result.getByRole("region", { name: "Inti kasus" })).toBeVisible();
    expect(rerunBody).toEqual({ sessionId: REVIEWED_SESSION.id, rerun: true });
    expectHermetic(audit);
  });

  test("telaah ulang yang gagal melapor jujur dan hasil lama tetap tampil", async ({
    page,
  }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
      {
        method: "POST",
        path: "/api/v1/ketik/review",
        body: {
          success: true,
          data: { status: "failed", previousKept: true, error: "AI_TIMEOUT" },
        },
      },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await result.getByRole("button", { name: "Telaah ulang" }).click({ timeout: 20000 });
    await page
      .getByRole("dialog", { name: "Telaah ulang sesi ini?" })
      .getByRole("button", { name: "Telaah ulang" })
      .click();

    const notice = result.getByRole("alert");
    await expect(notice).toContainText("Telaah ulang belum berhasil");
    await expect(notice).toContainText("Hasil sebelumnya tetap ditampilkan");
    await expect(notice).not.toContainText("AI_TIMEOUT");
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82");
    await waitForMockedApi(audit, ["POST /api/v1/ketik/review"]);
    expectHermetic(audit);
  });

  test("agen tidak melihat tombol Telaah ulang", async ({ page }) => {
    const audit = await open(
      page,
      telaahPath(REVIEWED_SESSION.id),
      [...ketikMocks(FULL_HISTORY), reviewDetailMock],
      "agent",
    );
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    await expect(result.getByRole("button", { name: "Telaah ulang" })).toHaveCount(0);
    expectHermetic(audit);
  });

  test("unduh transkrip memberi CSV ber-BOM yang aman dari formula", async ({
    page,
  }) => {
    const csvSession: KetikSessionHistoryItem = {
      ...FAILED_SESSION,
      id: "ketik-csv-1",
      messages: [
        {
          id: "c1",
          sender: "consumer",
          text: 'Tagihan José #1, "urgent"\nBaris 2',
          timestamp: daysAgo(1),
        },
        { id: "c2", sender: "agent", text: "=HYPERLINK(1)", timestamp: daysAgo(1) },
      ],
    };
    const audit = await open(
      page,
      telaahPath(csvSession.id),
      ketikMocks([csvSession]),
      "agent",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Unduh transkrip" }).click({ timeout: 20000 }),
    ]);
    expect(download.suggestedFilename()).toBe("ketik_transkrip_ketik-csv-1.csv");
    const bytes = await readFile((await download.path())!);
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = bytes.subarray(3).toString("utf8");
    expect(csv.startsWith("\"Pengirim\",\"Pesan\",\"Waktu\"")).toBe(true);
    expect(csv).toContain('"Konsumen","Tagihan José #1, ""urgent""\nBaris 2"');
    // Sel yang diawali "=" diberi apostrof supaya tidak dieksekusi spreadsheet.
    expect(csv).toContain(`"Agen","'=HYPERLINK(1)"`);
    expect(csv).toContain("Andi");
    expect(csv).toContain("Tidak lagi tersedia");
    expectHermetic(audit);
  });

  test("sesi yang tidak ada lagi kembali ke landing dengan pesan", async ({ page }) => {
    const audit = await open(page, telaahPath("hilang"), ketikMocks(FULL_HISTORY));
    await expect(page.getByText("Sesi itu tidak ada lagi di riwayat Anda.")).toBeVisible({
      timeout: 20000,
    });
    await expect(page).not.toHaveURL(/sesi=/);
    expectHermetic(audit);
  });

  test(`teks tahap Telaah minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, telaahPath(REVIEWED_SESSION.id), [
      ...ketikMocks(FULL_HISTORY),
      { ...reviewDetailMock, body: { success: true, data: ANNOTATED_REVIEW_DETAIL } },
    ]);
    const result = page.getByRole("region", { name: "Hasil telaah" });
    await expect(result.getByTestId("ketik-final-score")).toHaveText("82", {
      timeout: 20000,
    });
    const offenders: string[] = [];
    for (const tab of [
      "Pertanyaan konsumen",
      "Kalimat agen",
      "Perbaiki dulu",
      "Sudah baik",
      "Ejaan",
      "Ringkasan",
    ]) {
      await result.getByRole("tab", { name: new RegExp(tab) }).click();
      offenders.push(...(await findTextBelowFloor(page.locator("body"))));
    }
    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("KETIK ruang chat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("chat tanpa petunjuk sesi, akhiri dengan konfirmasi, lalu masuk tahap Telaah", async ({
    page,
  }) => {
    const savedAt = new Date().toISOString();
    const audit = await open(
      page,
      "/ketik",
      [
        ...ketikMocks([], FAST_SETTINGS),
        {
          method: "GET",
          path: "/api/v1/ai/usage/summary",
          body: { success: true, data: null },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/generate",
          body: { success: true, data: { text: "Iya, tagihan saya muncul dua kali." } },
        },
        {
          method: "POST",
          path: "/api/v1/ketik/history",
          body: {
            success: true,
            data: {
              id: "ketik-new-1",
              date: savedAt,
              scenarioTitle: "Skenario Baru",
              consumerName: "Konsumen",
              messages: [
                { id: "n1", sender: "agent", text: "Selamat pagi, ada yang bisa dibantu?", timestamp: savedAt },
                { id: "n2", sender: "consumer", text: "Iya, tagihan saya muncul dua kali.", timestamp: savedAt },
              ],
              reviewStatus: "pending",
            },
          },
        },
      ],
      "agent",
    );

    await page.getByRole("button", { name: /^Mulai simulasi/ }).click({ timeout: 20000 });

    const room = page.getByRole("region", { name: "Ruang chat" });
    const input = room.getByRole("textbox", { name: "Tulis balasan" });
    await expect(input).toBeVisible();

    // Tidak ada stopwatch, badge "Online", atau nama skenario di layar.
    await expect(room.getByText("Online", { exact: true })).toHaveCount(0);
    await expect(room.getByText(/^\d+:\d{2}$/)).toHaveCount(0);

    await input.fill("Selamat pagi, ada yang bisa dibantu?");
    await input.press("Enter");
    await expect(room.getByText("Iya, tagihan saya muncul dua kali.")).toBeVisible({
      timeout: 15000,
    });

    // "Akhiri chat" netral dan meminta konfirmasi aplikasi.
    await room.getByRole("button", { name: "Akhiri chat" }).click();
    const confirm = page.getByRole("dialog", { name: "Akhiri chat sekarang?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Lanjutkan chat" }).click();
    await expect(confirm).toBeHidden();
    await expect(input).toBeVisible();

    await room.getByRole("button", { name: "Akhiri chat" }).click();
    await page
      .getByRole("dialog", { name: "Akhiri chat sekarang?" })
      .getByRole("button", { name: "Akhiri chat" })
      .click();

    await expect(page).toHaveURL(/sesi=ketik-new-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    await expect(
      page.getByRole("region", { name: "Hasil telaah" }).getByText("Belum ditelaah"),
    ).toBeVisible();
    await waitForMockedApi(audit, ["POST /api/v1/ketik/history"]);
    expectHermetic(audit);
  });
});

test.describe("KETIK Riwayat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("halaman Riwayat berupa tabel dengan filter status dan penanda peserta", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });

    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table).toContainText("data peserta sudah dihapus");

    await page.getByRole("button", { name: /^Gagal/ }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Klaim Asuransi Ditolak");

    await page.getByRole("button", { name: /^Semua/ }).click();
    await page.getByRole("searchbox", { name: "Cari sesi" }).fill("slik");
    await expect(table.getByRole("row")).toHaveCount(2);

    await waitForMockedApi(audit, ["/ketik/history"]);
    expectHermetic(audit);
  });

  test("hapus sesi memakai dialog konfirmasi aplikasi", async ({ page }) => {
    const audit = await open(page, "/ketik/history", [
      ...ketikMocks(FULL_HISTORY),
      {
        method: "DELETE",
        path: `/api/v1/ketik/history/${PENDING_SESSION.id}`,
        body: { success: true, message: "ok" },
      },
    ]);
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await table
      .getByRole("button", { name: "Hapus sesi Pengecekan SLIK" })
      .click({ timeout: 20000 });
    const confirm = page.getByRole("dialog", { name: "Hapus sesi ini?" });
    await confirm.getByRole("button", { name: "Hapus sesi" }).click();
    await expect(table).not.toContainText("Pengecekan SLIK");
    expect(nativeDialog).toBe(false);
    expectHermetic(audit);
  });

  test("replay sesi adalah dialog modal: berlabel, Escape menutup, fokus kembali", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    const replayTrigger = table.getByRole("button", {
      name: "Putar ulang Pinjol Ilegal",
    });
    await replayTrigger.click({ timeout: 20000 });

    const replay = page.getByRole("dialog", { name: "Pinjol Ilegal" });
    await expect(replay).toBeVisible();
    await expect(replay).toHaveAttribute("aria-modal", "true");
    await expect
      .poll(() => replay.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    await expect(replay.getByText("1 / 2")).toBeVisible();
    await replay.getByTitle("Next").click();
    await expect(replay.getByText("2 / 2")).toBeVisible();
    await expect(replay.getByText("Mohon maaf, saya bantu cek.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(replay).toBeHidden();
    await expect(replayTrigger).toBeFocused();

    await replayTrigger.click();
    await replay.getByRole("button", { name: "Tutup replay" }).click();
    await expect(replay).toBeHidden();
    expectHermetic(audit);
  });

  test(`teks Riwayat dan replay KETIK minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await expect(table).toBeVisible({ timeout: 20000 });
    const offenders = (await findTextBelowFloor(page.locator("main").first())).map(
      (o) => `[riwayat] ${o}`,
    );
    await table.getByRole("button", { name: "Putar ulang Tagihan Kartu Kredit" }).click();
    const replay = page.getByRole("dialog", { name: "Tagihan Kartu Kredit" });
    await expect(replay.getByText("Tagihan saya dobel.").first()).toBeVisible();
    offenders.push(...(await findTextBelowFloor(replay)).map((o) => `[replay] ${o}`));
    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

/** Satu skenario berskrip dan satu nonaktif, supaya baris daftar bisa dibedakan. */
const SETTINGS_FOR_DIALOG: KetikAppSettings = {
  ...DEFAULT_KETIK_SETTINGS,
  scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario, index) =>
    index === 0
      ? { ...scenario, script: "Konsumen membuka chat dengan nada panik." }
      : index === 1
        ? { ...scenario, isActive: false }
        : scenario,
  ),
};
const [SCRIPTED_SCENARIO, INACTIVE_SCENARIO] = SETTINGS_FOR_DIALOG.scenarios;

async function openKetikSettings(page: Page) {
  const audit = await open(page, "/ketik", [
    ...ketikMocks([], SETTINGS_FOR_DIALOG),
    {
      method: "PUT",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: null },
      headers: { "x-settings-version": "2026-10-15T05:00:00.000Z" },
    },
  ]);
  await waitForMockedApi(audit, ["/ketik/settings"]);
  await page
    .getByRole("navigation", { name: "Menu KETIK" })
    .getByRole("button", { name: /^Pengaturan/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Pengaturan KETIK" });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  return { audit, dialog };
}

test.describe("KETIK Pengaturan (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("kategori berlabel jelas, daftar skenario bisa dicari dan disaring", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });

    await expect(
      dialog.getByText("Berlaku untuk sesi yang Anda mulai berikutnya."),
    ).toBeVisible();
    await expect(dialog.getByRole("tab", { name: /^Skenario\s*5\/6$/ })).toBeVisible();
    for (const tab of [
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Template cepat/,
      /^Sesi & AI/,
    ]) {
      await expect(dialog.getByRole("tab", { name: tab })).toBeVisible();
    }

    const scriptedRow = dialog
      .getByRole("listitem")
      .filter({ hasText: SCRIPTED_SCENARIO.title });
    await expect(scriptedRow).toContainText(SCRIPTED_SCENARIO.category);
    await expect(scriptedRow).toContainText("Ikuti skrip");
    const inactiveRow = dialog
      .getByRole("listitem")
      .filter({ hasText: INACTIVE_SCENARIO.title });
    await expect(inactiveRow).toContainText("Bebas");
    await expect(
      inactiveRow.getByRole("switch", { name: `Aktifkan ${INACTIVE_SCENARIO.title}` }),
    ).toHaveAttribute("aria-checked", "false");

    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: INACTIVE_SCENARIO.category })
      .click();
    await expect(scriptedRow).toHaveCount(0);
    await expect(inactiveRow).toBeVisible();
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Semua" })
      .click();
    await dialog.getByRole("searchbox", { name: "Cari skenario" }).fill("zzz-tidak-ada");
    await expect(dialog.getByText("Tidak ada skenario yang cocok")).toBeVisible();
    await dialog.getByRole("searchbox", { name: "Cari skenario" }).fill("");

    // Hapus skenario lewat dialog aplikasi.
    await scriptedRow.getByRole("button", { name: `Hapus ${SCRIPTED_SCENARIO.title}` }).click();
    const confirmDelete = page.getByRole("dialog", { name: "Hapus skenario ini?" });
    await expect(confirmDelete).toBeVisible();
    await confirmDelete.getByRole("button", { name: "Batal" }).click();
    await expect(scriptedRow).toBeVisible();

    // Karakter konsumen: baris dengan pilihan "Acak".
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "Karakter baru" })).toBeVisible();

    // Template cepat: baris kata kunci, standar dari admin tidak bisa diubah agen.
    await dialog.getByRole("tab", { name: /^Template cepat/ }).click();
    await expect(dialog.getByText("/selesai")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Template pribadi baru" })).toBeVisible();

    // Sesi & AI: durasi dan tempo sebagai pilihan radio; durasi tidak tampil ke peserta.
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();
    await expect(
      dialog.getByRole("radiogroup", { name: "Durasi sesi" }).getByRole("radio", { name: "5 menit", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByText(/Peserta tidak melihat durasi/)).toBeVisible();
    await expect(
      dialog.getByRole("radiogroup", { name: "Tempo balasan konsumen" }).getByRole("radio", { name: /^Realistis/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("radiogroup", { name: "Model AI" })).toBeVisible();

    const offenders = await findTextBelowFloor(dialog);
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("perubahan ditandai, tutup meminta konfirmasi aplikasi, Simpan mengirim pengaturan", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });

    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);
    const row = dialog.getByRole("listitem").filter({ hasText: SCRIPTED_SCENARIO.title });
    await row
      .getByRole("switch", { name: `Nonaktifkan ${SCRIPTED_SCENARIO.title}` })
      .click();
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();
    await expect(dialog.getByRole("tab", { name: /^Skenario\s*4\/6$/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const discard = page.getByRole("dialog", { name: "Tutup tanpa menyimpan?" });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Lanjut mengubah" }).click();
    await expect(discard).toHaveCount(0);

    // Pulihkan bawaan juga memakai dialog aplikasi.
    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    const reset = page.getByRole("dialog", { name: "Pulihkan pengaturan bawaan?" });
    await expect(reset).toBeVisible();
    await reset.getByRole("button", { name: "Batal" }).click();
    await expect(reset).toHaveCount(0);

    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/v1/ketik/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as KetikAppSettings;
    expect(
      saved.scenarios.find((item) => item.id === SCRIPTED_SCENARIO.id)?.isActive,
    ).toBe(false);
    await expect(page.getByRole("dialog", { name: "Pengaturan KETIK" })).toHaveCount(0);
    expectHermetic(audit);
  });
});
