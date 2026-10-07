import { expect, test } from "@playwright/test";
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
 * Monitoring — cakupan browser pertama untuk modul ini (plan 026).
 *
 * Sebelum ini Monitoring punya 60 unit test tapi nol E2E. Semua `/api` dimock
 * lewat harness hermetic; lihat `docs/e2e-testing.md`.
 *
 * Yang TIDAK dibuktikan di sini: assertion appearance (class CSS, min-h) dan
 * kontrak di dalam modal detail review (butuh payload assessment berat).
 */

/** Satu baris harga; semua rate numerik diisi supaya render tidak pecah. */
const PRICING_ROW = {
  model_id: "gemini-3.8-flash",
  model_name: "Gemini 3.8 Flash",
  input_price_usd_per_million: 0.3,
  output_price_usd_per_million: 1.2,
  input_text_price_usd_per_million: 0.3,
  cached_input_text_price_usd_per_million: 0.075,
  input_audio_price_usd_per_million: 0,
  cached_input_audio_price_usd_per_million: 0,
  output_text_price_usd_per_million: 1.2,
  output_audio_price_usd_per_million: 0,
};

function monitoringMocks(
  overrides: readonly ApiMock[] = [],
): readonly ApiMock[] {
  // Override diletakkan DULU: harness memakai `.find()`, jadi match pertama menang.
  return [
    ...overrides,
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/history",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/aggregation",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/pricing",
      body: { success: true, data: [PRICING_ROW] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/billing",
      body: { success: true, data: { usd_to_idr_rate: 15000 } },
    },
  ];
}

/** Satu sesi per modul, berisi data, untuk scan ukuran teks riwayat dan review. */
const CREATED_AT = "2026-09-20T09:30:00.000Z";
const SUBJECT = {
  type: "participant",
  participantId: "123e4567-e89b-12d3-a456-426614174000",
  displayName: "Andi",
  batchName: "Batch 12",
  team: "Tim Alpha",
};
const VOICE_ASSESSMENT = {
  overallScore: 7.5,
  speakingRate: { score: 7.5, wordsPerMinute: 142, verdict: "Baik", feedback: "Tempo pas." },
  intonation: { score: 7, verdict: "Baik", feedback: "Stabil." },
  articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas." },
  fillerWords: { score: 8, count: 3, examples: ["eee"], verdict: "Baik", feedback: "Sedikit." },
  emotionalTone: { score: 8, dominant: "Empati", verdict: "Baik", feedback: "Empatik." },
  transcript: "",
  strengths: ["Artikulasi jelas"],
  highlights: ["De-eskalasi berhasil"],
};
const HISTORY_ENTRIES = [
  {
    id: "ketik-1",
    user_id: "user-1",
    module: "ketik",
    scenario_title: "Tagihan Kartu Kredit (Chat)",
    created_at: CREATED_AT,
    duration_seconds: 300,
    score: 82,
    history: [],
    user_email: "agent@local.test",
    user_role: "agent",
    review_status: "completed",
    scores: { final: 82, empathy: 80, probing: 75, typo: 90, compliance: 85 },
    consumer_name: "Bu Rina",
    simulationSubject: SUBJECT,
  },
  {
    id: "pdkt-1",
    user_id: "user-1",
    module: "pdkt",
    scenario_title: "Penipuan Undian (Email)",
    created_at: CREATED_AT,
    duration_seconds: 225,
    score: 85,
    history: [],
    user_email: "agent@local.test",
    user_role: "agent",
    review_status: "completed",
    pdkt_evaluation: {
      score: 85,
      feedback: "Jawaban relevan dan jelas.",
      typos_count: 1,
      clarity_issues_count: 1,
      content_gaps_count: 1,
    },
    simulationSubject: SUBJECT,
  },
  {
    id: "telefun-1",
    user_id: "user-1",
    module: "telefun",
    scenario_title: "Keluhan Asuransi (Telefon)",
    created_at: CREATED_AT,
    duration_seconds: 240,
    score: 7.5,
    history: null,
    user_email: "agent@local.test",
    user_role: "agent",
    review_status: "completed",
    simulationSubject: SUBJECT,
  },
];
const REVIEWS: Record<string, unknown> = {
  "ketik-1": {
    module: "ketik",
    review_status: "completed",
    simulationSubject: SUBJECT,
    scores: { final: 82, empathy: 80, probing: 75, typo: 90, compliance: 85 },
    session: {
      consumerName: "Bu Rina",
      consumerPhone: null,
      consumerCity: "Bandung",
      simulationDuration: 300,
      messages: [
        { id: "m1", sender: "consumer", text: "Tagihan saya dobel.", timestamp: CREATED_AT },
        { id: "m2", sender: "agent", text: "Baik Bu, saya cek tagihn Ibu.", timestamp: CREATED_AT },
      ],
    },
    review: {
      id: "review-1",
      sessionId: "ketik-1",
      aiSummary: "Agen empatik, tetapi verifikasi data terlambat.",
      strengths: ["Menyapa dengan nama"],
      weaknesses: ["Verifikasi terlambat"],
      coachingFocus: ["Verifikasi identitas di awal"],
      education: null,
      createdAt: CREATED_AT,
    },
    typos: [
      {
        id: "typo-1",
        sessionId: "ketik-1",
        messageId: "m2",
        originalWord: "tagihn",
        correctedWord: "tagihan",
        severity: "minor",
      },
    ],
  },
  "pdkt-1": {
    module: "pdkt",
    user_id: "user-1",
    user_email: "agent@local.test",
    user_role: "agent",
    simulationSubject: SUBJECT,
    review_status: "completed",
    session: null,
    evaluation: {
      score: 85,
      feedback: "Jawaban relevan dan jelas.",
      typos: ["undain"],
      clarityIssues: ["Kalimat pembuka terlalu panjang"],
      contentGaps: ["Belum menyebut kanal pengaduan resmi"],
    },
    emails: [],
    evaluation_error: null,
    time_taken: 225,
  },
  "telefun-1": {
    module: "telefun",
    simulationSubject: SUBJECT,
    review_status: "completed",
    score: 7.5,
    recording_path: null,
    agent_recording_path: null,
    recording_url: null,
    scenario_title: "Keluhan Asuransi (Telefon)",
    duration_seconds: 240,
    voice_assessment: VOICE_ASSESSMENT,
    transcript: [
      { speaker: "consumer", text: "Klaim saya ditolak.", startMs: 0 },
      { speaker: "agent", text: "Saya bantu cek, Pak.", startMs: 2100 },
    ],
    ai_summary: "Nada tenang dan empatik.",
    strengths: ["Empati"],
    weaknesses: ["Penutupan kurang jelas"],
    coaching_focus: ["Rangkum solusi sebelum menutup"],
    consumer_name: "Pak Budi",
    consumer_phone: null,
    consumer_city: "Medan",
    consumer_gender: null,
    persona_config: null,
    coaching_recommendations: [{ text: "Rangkum solusi.", priority: 1 }],
    coaching_generated_at: CREATED_AT,
    telefun_legacy: false,
  },
};
const AGGREGATION = [
  {
    user_id: "user-1",
    user_name: "Andi",
    user_email: "agent@local.test",
    user_role: "agent",
    total_calls: 12,
    total_input_tokens: 48000,
    total_output_tokens: 9000,
    total_tokens: 57000,
    total_cost_idr: 4200,
    simulation_cost_idr: 3000,
    review_cost_idr: 1200,
    models: [
      {
        model_id: "gemini-3.8-flash",
        module: "ketik",
        action: "chat",
        action_category: "simulation",
        calls: 10,
        input_tokens: 40000,
        output_tokens: 7000,
        total_tokens: 47000,
        cost_idr: 3000,
      },
      {
        model_id: "gemini-3.8-flash",
        module: "ketik",
        action: "review",
        action_category: "review",
        calls: 2,
        input_tokens: 8000,
        output_tokens: 2000,
        total_tokens: 10000,
        cost_idr: 1200,
      },
    ],
  },
];
const POPULATED_MOCKS = monitoringMocks([
  {
    method: "GET",
    path: "/api/v1/ai/monitoring/history",
    body: { success: true, data: HISTORY_ENTRIES },
  },
  {
    method: "GET",
    path: "/api/v1/ai/monitoring/aggregation",
    body: { success: true, data: AGGREGATION },
  },
  ...Object.entries(REVIEWS).map(([id, review]) => ({
    method: "GET" as const,
    path: `/api/v1/ai/monitoring/history/${id.split("-")[0]}/${id}/review`,
    body: { success: true, data: review },
  })),
]);

test.describe("Monitoring (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("hero, tab strip, dan empty state riwayat dirender", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(/Pantau dan analisis penggunaan modul AI/),
    ).toBeVisible();

    for (const label of ["Riwayat Simulasi", "Penggunaan Token"]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }
    // Riwayat aktif secara default.
    await expect(
      page.getByRole("tab", { name: "Riwayat Simulasi" }),
    ).toHaveAttribute("aria-selected", "true");

    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    // Riwayat kosong tetap merender KPI card dengan angka nol, bukan layar kosong.
    await expect(page.getByText(/0 sesi KETIK/)).toBeVisible();

    expectHermetic(audit);
  });

  test(`teks riwayat dan detail review tiap modul minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: POPULATED_MOCKS,
    });
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    await expect(page.getByText("Tagihan Kartu Kredit (Chat)").first()).toBeVisible({
      timeout: 20000,
    });
    const offenders = await findTextBelowFloor(page.locator("main").first());

    for (const [index, entry] of HISTORY_ENTRIES.entries()) {
      await page.getByRole("button", { name: "Lihat Detail" }).nth(index).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(entry.scenario_title).first()).toBeVisible();
      await waitForMockedApi(audit, [`/${entry.id}/review`]);
      await expect(dialog.getByText(/memuat/i)).toHaveCount(0, { timeout: 20000 });
      offenders.push(
        ...(await findTextBelowFloor(dialog)).map((o) => `[${entry.module}] ${o}`),
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }

    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test(`teks penggunaan token minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: POPULATED_MOCKS,
    });
    await page.getByRole("tab", { name: "Penggunaan Token" }).click();
    await waitForMockedApi(audit, ["/ai/monitoring/aggregation"]);
    await expect(page.getByText("agent@local.test").first()).toBeVisible({
      timeout: 20000,
    });

    const offenders = await findTextBelowFloor(page.locator("main").first());
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("tab harga tampil untuk trainer dan tersembunyi untuk leader", async ({
    page,
  }) => {
    const trainerAudit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });
    await expect(page.getByRole("tab", { name: "Harga & Kurs" })).toBeVisible({
      timeout: 20000,
    });
    expectHermetic(trainerAudit);

    // Leader boleh membuka /monitoring tetapi tidak boleh menyunting harga.
    const leaderAudit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
      auth: { role: "leader" },
    });
    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("tab", { name: "Harga & Kurs" })).toHaveCount(
      0,
    );
    expectHermetic(leaderAudit);
  });

  test("tab penggunaan memuat agregasi", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });

    await page.getByRole("tab", { name: "Penggunaan Token" }).click();
    await expect(
      page.getByRole("tab", { name: "Penggunaan Token" }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20000 });

    await waitForMockedApi(audit, ["/ai/monitoring/aggregation"]);
    expectHermetic(audit);
  });

  test("tab harga memuat pricing dan billing lalu merender tabel harga", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });

    await page.getByRole("tab", { name: "Harga & Kurs" }).click();
    await expect(
      page.getByRole("tab", { name: "Harga & Kurs" }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20000 });

    // Buktikan kedua request terjadi sebelum menuntut isinya.
    await waitForMockedApi(audit, [
      "/ai/monitoring/pricing",
      "/ai/monitoring/billing",
    ]);

    await expect(
      page.getByText("Harga per Model (USD / 1M tokens)"),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Kurs USD ke IDR").first()).toBeVisible();
    // Nilai kurs yang benar-benar dimuat. Diperiksa lewat nilai input, bukan
    // teks terformat: `toLocaleString()` mengikuti locale browser (en-US
    // menghasilkan "15,000"), jadi assertion berbasis teks itu rapuh.
    await expect(page.getByLabel("Kurs USD ke IDR")).toHaveValue("15000");

    expectHermetic(audit);
  });

  test("sesi kedaluwarsa dipetakan ke pesan yang manusiawi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks([
        {
          method: "GET",
          path: "/api/v1/ai/monitoring/history",
          status: 401,
          body: {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Unauthorized" },
          },
        },
      ]),
    });

    // Temuan: di browser, 401 pada `/api` TIDAK berhenti di pesan inline
    // (`mapError`) — handler sesi global lebih dulu bekerja dan aplikasi
    // kembali ke landing. Jadi yang diuji di sini adalah hasil yang terlihat
    // pengguna, bukan teks internal komponen.
    await expect(
      page.getByRole("heading", { name: "Lima modul. Satu pengalaman." }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toHaveCount(0);

    expectHermetic(audit);
  });
});
