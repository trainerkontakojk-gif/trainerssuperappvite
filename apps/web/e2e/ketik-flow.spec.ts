import { expect, test } from "@playwright/test";
import {
  DEFAULT_KETIK_SETTINGS,
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
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * KETIK — landing + modal workspace (hermetic).
 *
 * Modul ini sebelumnya tidak punya spec E2E sama sekali (plan 025 Wave 2, spec
 * #9). Semua `/api` dimock; mutasi data nyata tetap milik spec backend loopback.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * bukan salinan yang ditulis tangan, supaya spec gagal ketika UI menyimpang dari
 * kontrak bersama dan tidak basi saat default berubah.
 */

/** Riwayat dengan peserta yang record-nya sudah tidak ada (`participantId` null). */
const HISTORY_UNAVAILABLE_PARTICIPANT: readonly KetikSessionHistoryItem[] = [
  {
    id: "ketik-history-1",
    date: "2026-09-10T00:00:00.000Z",
    scenarioTitle: "Skenario Chat",
    consumerName: "Andi",
    messages: [],
    simulationSubject: {
      type: "participant",
      participantId: null,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    },
  },
];

/** Sesi selesai dengan review lengkap (termasuk edukasi), untuk scan ukuran teks. */
const REVIEWED_AT = "2026-09-12T08:00:00.000Z";
const REVIEWED_SESSION: KetikSessionHistoryItem = {
  id: "ketik-reviewed-1",
  date: REVIEWED_AT,
  scenarioTitle: "Tagihan Kartu Kredit",
  consumerName: "Bu Rina",
  consumerCity: "Bandung",
  simulationDuration: 300,
  finalScore: 82,
  empathyScore: 80,
  probingScore: 75,
  resolutionScore: 78,
  typoScore: 90,
  complianceScore: 85,
  reviewStatus: "completed",
  messages: [
    { id: "m1", sender: "consumer", text: "Tagihan saya dobel.", timestamp: REVIEWED_AT },
    { id: "m2", sender: "agent", text: "Baik Bu, saya cek tagihn Ibu.", timestamp: REVIEWED_AT },
  ],
};
const DIMENSIONS = [
  ["empathy", "Empati & Komunikasi", 80, "Baik"],
  ["probing", "Probing", 75, "Cukup"],
  ["resolution", "Resolusi", 78, "Baik"],
  ["typo", "Tata Tulis", 90, "Sangat Baik"],
  ["compliance", "Kepatuhan", 85, "Baik"],
] as const;
const REVIEW_DETAIL = {
  sessionId: REVIEWED_SESSION.id,
  scores: { final: 82, empathy: 80, probing: 75, resolution: 78, typo: 90, compliance: 85 },
  review: {
    id: "review-1",
    sessionId: REVIEWED_SESSION.id,
    aiSummary: "Agen empatik, tetapi verifikasi data terlambat.",
    strengths: ["Menyapa dengan nama"],
    weaknesses: ["Verifikasi terlambat"],
    coachingFocus: ["Verifikasi identitas di awal"],
    createdAt: REVIEWED_AT,
    education: {
      dimensionGuidance: DIMENSIONS.map(([key, label, score, verdict], index) => ({
        key,
        label,
        score,
        verdict,
        priorityRank: index + 1,
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

function ketikMocks(
  history: readonly KetikSessionHistoryItem[],
): readonly ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: DEFAULT_KETIK_SETTINGS },
      // `ketikApi` menyimpan versi dari header ini; tanpanya jalur simpan
      // kehilangan prasyaratnya.
      headers: {
        "x-settings-version": "v1",
        "x-ketik-templates-version": "t1",
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history",
      body: { success: true, data: history },
    },
  ];
}

/** Landing KETIK merujuk logo OJK dari host eksternal. */
const KETIK_EXPECTED_ASSET_HOSTS = ["ojk.go.id"];

const ACTIVE_SCENARIOS = DEFAULT_KETIK_SETTINGS.scenarios.filter(
  (scenario) => scenario.isActive,
).length;

test.describe("KETIK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("landing KETIK dirender tanpa menyentuh backend", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: ketikMocks([]),
      // Tetap di-abort (tidak ada egress); hanya tidak dihitung sebagai temuan,
      // karena aset dekoratif yang sudah diketahui bukan traffic aplikasi.
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", {
        name: /Latih percakapan chat\. Balas lebih tepat dan empatik\./,
      }),
    ).toBeVisible({ timeout: 20000 });

    // Jumlah skenario aktif berasal dari settings, bukan angka tetap.
    await expect(
      page.getByText(`${ACTIVE_SCENARIOS} skenario aktif`),
    ).toBeVisible();

    for (const label of ["Mulai simulasi", "Pengaturan", "Riwayat"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
        `tombol "${label}" tidak tampil`,
      ).toBeVisible();
    }

    // Copy pengantar landing: bagian dari kontrak "intro" yang sama.
    await expect(page.getByText(/Ketik — singkatan dari/)).toBeVisible();
    await expect(page.getByText(/Pemakaian bulan ini/i).first()).toBeVisible();

    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);
    expectHermetic(audit);
  });

  test("kartu riwayat menampilkan target dan penanda peserta tidak tersedia", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: ketikMocks(HISTORY_UNAVAILABLE_PARTICIPANT),
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    console.log("[audit]", formatAudit(audit));

    await page
      .getByRole("button", { name: /^Riwayat/ })
      .first()
      .click();

    await expect(page.getByText(/Target: Peserta: Andi/)).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(/record peserta tidak lagi tersedia/),
    ).toBeVisible();

    expectHermetic(audit);
  });

  test(`teks landing KETIK minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: ketikMocks([]),
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    await expect(page.getByText(/Ketik — singkatan dari/)).toBeVisible({
      timeout: 20000,
    });
    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);

    // Mockup chat ponsel (aria-hidden) meniru layar ponsel pada skala kecil,
    // termasuk jam pesan; ia ilustrasi, bukan teks UI yang dibaca.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="ketik-motion-frame"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test(`teks riwayat, review, dan replay KETIK minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: [
        ...ketikMocks([REVIEWED_SESSION]),
        {
          method: "GET",
          path: `/api/v1/ketik/review/${REVIEWED_SESSION.id}`,
          body: { success: true, data: REVIEW_DETAIL },
        },
      ],
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    await page.getByRole("button", { name: /^Riwayat/ }).first().click();
    const history = page.getByRole("dialog");
    await expect(history.getByText("Tagihan Kartu Kredit").first()).toBeVisible({
      timeout: 20000,
    });
    const offenders = (await findTextBelowFloor(history)).map((o) => `[riwayat] ${o}`);

    await history.getByRole("button", { name: "Replay sesi" }).first().click();
    // Modal replay belum punya role="dialog"; dikenali lewat label "Replay".
    const replay = page
      .locator("div.fixed")
      .filter({ has: page.getByText("Replay", { exact: true }) })
      .last();
    await expect(replay.getByText("Tagihan saya dobel.").first()).toBeVisible();
    offenders.push(...(await findTextBelowFloor(replay)).map((o) => `[replay] ${o}`));
    await replay.locator("header button").click();
    await expect(replay).toHaveCount(0);

    await history
      .getByRole("button", { name: "Lihat sesi Tagihan Kartu Kredit" })
      .click();
    await waitForMockedApi(audit, [`/ketik/review/${REVIEWED_SESSION.id}`]);
    const review = page.getByRole("dialog").last();
    await expect(review.getByText(/verifikasi data terlambat/).first()).toBeVisible({
      timeout: 20000,
    });
    offenders.push(...(await findTextBelowFloor(review)).map((o) => `[review] ${o}`));

    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
