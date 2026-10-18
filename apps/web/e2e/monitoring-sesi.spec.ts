import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Detail sesi Monitoring di halaman sendiri (tahap 4). Semua `/api` dimock;
 * kepala `header` dari backend nyata dibuktikan di
 * `monitoring-numbers-api.spec.ts`.
 */

const KETIK_ID = "6f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f30";
const PDKT_ID = "7f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f31";
const TELEFUN_ID = "8f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f32";
const OCCURRED_AT = "2026-10-17T07:15:00.000Z";

const SUBJECT = {
  type: "participant",
  participantId: "123e4567-e89b-12d3-a456-426614174000",
  displayName: "Rina Kartika",
  batchName: "Batch Pagi",
  team: "Tim Call",
};

const KETIK_REVIEW = {
  module: "ketik",
  header: {
    scenario_title: "Tagihan Kartu Kredit Dobel",
    occurred_at: OCCURRED_AT,
    actor_name: "Rina Kartika",
    duration_seconds: 412,
  },
  user_id: "user-1",
  user_email: "rina@ojk.test",
  user_role: "agent",
  simulationSubject: SUBJECT,
  review_status: "completed",
  scores: { final: 82, empathy: 80, probing: 75, typo: 90, compliance: 85 },
  session: {
    consumerName: "Bu Sri",
    consumerPhone: "0812-3456-7890",
    consumerCity: "Bandung",
    simulationDuration: 10,
    messages: [
      {
        id: "m1",
        sender: "consumer",
        text: "Selamat siang, tagihan kartu kredit saya bulan ini dobel.",
        timestamp: "2026-10-17T07:15:00.000Z",
      },
      {
        id: "m2",
        sender: "agent",
        text: "Selamat siang Bu Sri, saya bantu cek tagihn Ibu ya.",
        timestamp: "2026-10-17T07:16:00.000Z",
      },
    ],
  },
  review: {
    id: "review-1",
    sessionId: KETIK_ID,
    aiSummary: "Agen empatik, tetapi verifikasi data terlambat.",
    strengths: ["Menyapa dengan nama"],
    weaknesses: ["Verifikasi terlambat"],
    coachingFocus: ["Verifikasi identitas di awal"],
    education: {
      dimensionGuidance: [
        {
          key: "probing",
          label: "Probing",
          score: 75,
          verdict: "Cukup",
          diagnosis: "Pertanyaan verifikasi baru muncul di akhir.",
          howToFix: "Tanyakan nama bank dan tanggal transaksi di awal.",
          exampleRewrite: "Boleh saya tahu nama bank Ibu?",
          priorityRank: 1,
        },
      ],
      typosEnriched: [],
    },
    createdAt: OCCURRED_AT,
  },
  typos: [
    {
      id: "typo-1",
      sessionId: KETIK_ID,
      messageId: "m2",
      originalWord: "tagihn",
      correctedWord: "tagihan",
      severity: "minor",
    },
  ],
};

const PDKT_REPLY =
  "Yth. Bapak Hendra, pesan tersebut merupakan modus penipuan undain berhadiah.";

const PDKT_REVIEW = {
  module: "pdkt",
  header: {
    scenario_title: "Penipuan Undian Berhadiah",
    occurred_at: "2026-10-17T04:15:00.000Z",
    actor_name: "Ayu Lestari",
    duration_seconds: 1325,
  },
  user_id: "user-2",
  user_email: "ayu@ojk.test",
  user_role: "agent",
  simulationSubject: {
    ...SUBJECT,
    displayName: "Ayu Lestari",
    batchName: "Batch Siang",
    team: "Tim Email",
  },
  review_status: "completed",
  session: {
    config: null,
    emails: [],
    created_at: "2026-10-17T04:15:00.000Z",
    consumer_name: "Hendra Wijaya",
    consumer_type: "Konsumen kritis",
    recipient: null,
    contact: null,
  },
  evaluation: {
    score: 85,
    feedback: "Jawaban relevan dan jelas.",
    typos: ["undain → undian"],
    clarityIssues: ["Kalimat pembuka terlalu panjang"],
    contentGaps: ["Belum menyebut kanal pengaduan resmi"],
    scoreBreakdown: {
      recipientDirectionScore: 90,
      normativeResponseScore: 80,
      clarityScore: 70,
      typoScore: 85,
      templateComplianceScore: 95,
    },
    expectedAnswerAlignment: {
      category: "Hampir sesuai",
      reason: "Sebagian besar poin jawaban ideal sudah ada.",
    },
    annotations: [
      {
        quote: "undain",
        dimension: "typo",
        note: "Tulis “undian”.",
        start: PDKT_REPLY.indexOf("undain"),
        end: PDKT_REPLY.indexOf("undain") + 6,
      },
    ],
  },
  emails: [
    {
      id: "inbound",
      from: "hendra.w@mail.test",
      to: "pengaduan@ojk.test",
      subject: "Undian Rp 50 juta",
      body: "Saya menerima SMS bahwa saya memenangkan undian.",
      timestamp: "2026-10-17T04:15:00.000Z",
      isAgent: false,
    },
    {
      id: "reply",
      from: "pengaduan@ojk.test",
      to: "hendra.w@mail.test",
      subject: "Re: Undian Rp 50 juta",
      body: PDKT_REPLY,
      timestamp: "2026-10-17T04:37:00.000Z",
      isAgent: true,
    },
  ],
  evaluation_error: null,
  time_taken: 1325,
};

const SIGNED_URL = "https://storage.local.test/signed/full-call.webm?token=abc";

const TELEFUN_REVIEW = {
  module: "telefun",
  header: {
    scenario_title: "Klaim Asuransi Ditolak",
    occurred_at: "2026-10-17T03:15:00.000Z",
    actor_name: "Dimas Prasetyo",
    duration_seconds: 540,
  },
  user_id: "user-3",
  user_email: "dimas@ojk.test",
  user_role: "agent",
  simulationSubject: { ...SUBJECT, displayName: "Dimas Prasetyo" },
  review_status: "completed",
  score: 7.5,
  recording_path: `user-3/${TELEFUN_ID}/full_call.webm`,
  agent_recording_path: null,
  recording_url: SIGNED_URL,
  scenario_title: "Klaim Asuransi Ditolak",
  duration_seconds: 540,
  voice_assessment: {
    overallScore: 7.5,
    speakingRate: {
      score: 7.5,
      wordsPerMinute: 142,
      verdict: "Baik",
      feedback: "Tempo pas.",
    },
    intonation: { score: 7, verdict: "Baik", feedback: "Stabil." },
    articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas." },
    fillerWords: {
      score: 8,
      count: 3,
      examples: ["eee"],
      verdict: "Baik",
      feedback: "Sedikit.",
    },
    emotionalTone: {
      score: 8,
      dominant: "Empati",
      verdict: "Baik",
      feedback: "Empatik.",
    },
    transcript: "",
    strengths: ["Artikulasi jelas"],
    highlights: ["De-eskalasi berhasil"],
  },
  transcript: [
    {
      speaker: "consumer",
      text: "Klaim saya ditolak padahal premi lancar.",
      startMs: 0,
    },
    { speaker: "agent", text: "Saya bantu cek, Pak Budi.", startMs: 2100 },
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
  coaching_recommendations: [
    { text: "Rangkum solusi sebelum menutup.", priority: 1 },
  ],
  coaching_generated_at: OCCURRED_AT,
  telefun_legacy: false,
};

function reviewMock(module: string, id: string, data: unknown): ApiMock {
  return {
    method: "GET",
    path: `/api/v1/ai/monitoring/history/${module}/${id}/review`,
    body: { success: true, data },
  };
}

function openSession(
  page: Page,
  path: string,
  apiMocks: ApiMock[],
  role?: string,
) {
  return openHermeticShell(page, {
    path,
    apiMocks,
    ...(role ? { auth: { role } } : {}),
  });
}

test.describe("Monitoring detail sesi (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("KETIK: kepala, transkrip bertanda typo, data sesi, dan penilaian berbaris", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const audit = await openSession(
      page,
      `/monitoring/sesi/ketik/${KETIK_ID}`,
      [reviewMock("ketik", KETIK_ID, KETIK_REVIEW)],
    );
    await waitForMockedApi(audit, [`/ketik/${KETIK_ID}/review`]);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Tagihan Kartu Kredit Dobel",
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(
        "KETIK · Rina Kartika · 17 Okt 2026, 14.15 WIB · Selesai dinilai",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Kembali ke Riwayat" }),
    ).toHaveAttribute("href", "/monitoring");

    const transcript = page.getByRole("region", { name: "Transkrip chat" });
    await expect(transcript).toContainText("2 pesan · 1 typo");
    const lines = transcript.getByRole("listitem");
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText("Konsumen");
    await expect(lines.nth(0)).toContainText("14.15");
    await expect(lines.nth(1)).toContainText("Agen");
    await expect(lines.nth(1).locator("mark")).toHaveText("tagihn");
    await expect(page.getByText("Anda (Agen)")).toHaveCount(0);

    const info = page.getByRole("region", { name: "Sesi", exact: true });
    for (const [label, value] of [
      ["Peserta", "Rina Kartika · Batch Pagi · Tim Call"],
      ["Akun pelaksana", "rina@ojk.test (agent)"],
      ["Konsumen", "Bu Sri · Bandung · 0812-3456-7890"],
      ["Lama sesi", "6 menit 52 detik"],
      ["Batas waktu", "10 menit"],
    ]) {
      await expect(
        info.getByRole("term").filter({ hasText: label }),
      ).toBeVisible();
      await expect(
        info.getByRole("definition").filter({ hasText: value }),
      ).toBeVisible();
    }

    const review = page.getByRole("region", { name: "Penilaian AI" });
    await expect(review).toContainText("82 / 100");
    const scores = review
      .getByRole("list", { name: "Skor per aspek" })
      .getByRole("listitem");
    await expect(scores).toHaveCount(4);
    await expect(scores.nth(0)).toContainText("Empati & komunikasi");
    await expect(scores.nth(0)).toContainText("80");
    await expect(scores.nth(2)).toContainText("Tata tulis · 1 typo");
    await expect(review).toContainText(
      "Agen empatik, tetapi verifikasi data terlambat.",
    );
    await expect(review).toContainText("Verifikasi identitas di awal");
    await expect(review).toContainText("tagihn → tagihan");
    await expect(review).toContainText(
      "Tanyakan nama bank dan tanggal transaksi di awal.",
    );

    await page.getByRole("button", { name: "Salin tautan" }).click();
    await expect(page.getByText("Tautan sesi disalin.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      page.url(),
    );
    expectHermetic(audit);
  });

  test("hapus sesi dari halaman detail lalu kembali ke Riwayat", async ({
    page,
  }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/ketik/${KETIK_ID}`,
      [
        reviewMock("ketik", KETIK_ID, KETIK_REVIEW),
        {
          method: "DELETE",
          path: `/api/v1/ai/monitoring/history/ketik/${KETIK_ID}`,
          body: { success: true, data: null },
        },
        {
          method: "GET",
          path: "/api/v1/ai/monitoring/history",
          body: {
            success: true,
            data: {
              rows: [],
              total: 0,
              page: 1,
              page_size: 25,
              counts: {
                ketik: 0,
                pdkt: 0,
                telefun: 0,
                completed: 0,
                processing: 0,
                failed: 0,
                not_started: 0,
              },
              scope: { kind: "all" },
            },
          },
        },
      ],
    );
    await waitForMockedApi(audit, [`/ketik/${KETIK_ID}/review`]);
    await page
      .getByRole("button", { name: "Hapus sesi" })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("alertdialog", { name: "Hapus sesi ini?" });
    await expect(dialog).toContainText(
      "KETIK · Tagihan Kartu Kredit Dobel, Rina Kartika, 17 Okt, 14.15",
    );
    await dialog.getByRole("button", { name: "Hapus sesi" }).click();
    await waitForMockedApi(audit, [`/ai/monitoring/history/ketik/${KETIK_ID}`]);
    await expect(page).toHaveURL(/\/monitoring$/);
    expectHermetic(audit);
  });

  test("leader tidak melihat tombol hapus", async ({ page }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/ketik/${KETIK_ID}`,
      [reviewMock("ketik", KETIK_ID, KETIK_REVIEW)],
      "leader",
    );
    await waitForMockedApi(audit, [`/ketik/${KETIK_ID}/review`]);
    await expect(
      page.getByRole("button", { name: "Salin tautan" }),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("button", { name: "Hapus sesi" })).toHaveCount(
      0,
    );
    expectHermetic(audit);
  });

  test("sesi di luar cakupan atau terhapus menampilkan tidak ditemukan", async ({
    page,
  }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/ketik/${KETIK_ID}`,
      [
        {
          method: "GET",
          path: `/api/v1/ai/monitoring/history/ketik/${KETIK_ID}/review`,
          status: 404,
          body: {
            success: false,
            error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
          },
        },
      ],
    );
    await waitForMockedApi(audit, [`/ketik/${KETIK_ID}/review`]);
    await expect(
      page.getByRole("heading", { name: "Sesi tidak ditemukan" }),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole("link", { name: "Kembali ke Riwayat" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("PDKT: email, data sesi, rincian skor, kesesuaian jawaban, dan catatan balasan", async ({
    page,
  }) => {
    const audit = await openSession(page, `/monitoring/sesi/pdkt/${PDKT_ID}`, [
      reviewMock("pdkt", PDKT_ID, PDKT_REVIEW),
    ]);
    await waitForMockedApi(audit, [`/pdkt/${PDKT_ID}/review`]);
    await expect(
      page.getByText(
        "PDKT · Ayu Lestari · 17 Okt 2026, 11.15 WIB · Selesai dinilai",
      ),
    ).toBeVisible({ timeout: 20000 });

    const mail = page.getByRole("region", { name: "Email" });
    await expect(mail).toContainText("2 email");
    await expect(mail.getByRole("listitem")).toHaveCount(2);
    await expect(mail.getByRole("listitem").nth(1)).toContainText(
      "Balasan agen",
    );
    await expect(mail.getByRole("listitem").nth(1)).toContainText("11.37");

    const info = page.getByRole("region", { name: "Sesi", exact: true });
    await expect(info).toContainText("Hendra Wijaya · Konsumen kritis");
    await expect(info).toContainText("Lama mengerjakan");
    await expect(info).toContainText("22 menit 5 detik");

    const review = page.getByRole("region", { name: "Penilaian AI" });
    await expect(review).toContainText("85 / 100");
    await expect(
      review
        .getByRole("list", { name: "Skor per aspek" })
        .getByRole("listitem"),
    ).toHaveCount(5);
    await expect(review).toContainText("Jawaban relevan dan jelas.");
    await expect(review).toContainText("Typo (1)");
    await expect(review).toContainText("Kejelasan (1)");
    await expect(review).toContainText("Isi yang kurang (1)");
    await expect(review).toContainText(
      "Sebagian besar poin jawaban ideal sudah ada.",
    );
    const notes = review.getByRole("region", {
      name: "Catatan di balasan agent",
    });
    await expect(notes.locator("mark")).toHaveText("undain1");
    expectHermetic(audit);
  });

  test("PDKT tanpa email dan data sesi tetap terbuka", async ({ page }) => {
    const audit = await openSession(page, `/monitoring/sesi/pdkt/${PDKT_ID}`, [
      reviewMock("pdkt", PDKT_ID, {
        ...PDKT_REVIEW,
        header: undefined,
        session: null,
        emails: [],
        time_taken: null,
        evaluation: null,
        review_status: "failed",
        evaluation_error: "ai_unavailable",
      }),
    ]);
    await waitForMockedApi(audit, [`/pdkt/${PDKT_ID}/review`]);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sesi PDKT" }),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("region", { name: "Email" })).toContainText(
      "Email sesi ini tidak tersimpan.",
    );
    await expect(
      page.getByText(
        "AI belum bisa dihubungi saat menelaah. Coba telaah ulang beberapa saat lagi.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("ai_unavailable")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Telefun: rekaman dari tautan aman, transkrip, dan penilaian suara sebagai baris angka", async ({
    page,
  }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/telefun/${TELEFUN_ID}`,
      [reviewMock("telefun", TELEFUN_ID, TELEFUN_REVIEW)],
    );
    await waitForMockedApi(audit, [`/telefun/${TELEFUN_ID}/review`]);
    const recording = page.getByRole("region", { name: "Rekaman" });
    await expect(recording.locator("audio")).toHaveAttribute(
      "src",
      SIGNED_URL,
      {
        timeout: 20000,
      },
    );
    await expect(
      page.locator(`audio[src*="full_call.webm"]:not([src^="https"])`),
    ).toHaveCount(0);

    const transcript = page.getByRole("region", { name: "Transkrip" });
    await expect(transcript.getByRole("listitem")).toHaveCount(2);
    await expect(transcript.getByRole("listitem").nth(1)).toContainText("Agen");
    await expect(transcript.getByRole("listitem").nth(1)).toContainText("0.02");

    const info = page.getByRole("region", { name: "Sesi", exact: true });
    await expect(info).toContainText("Pak Budi · Medan");
    await expect(info).toContainText("Lama panggilan");
    await expect(info).toContainText("9 menit");

    const review = page.getByRole("region", { name: "Penilaian suara" });
    await expect(review).toContainText("7,5 / 10");
    const rows = review
      .getByRole("list", { name: "Skor per aspek" })
      .getByRole("listitem");
    await expect(rows.filter({ hasText: "Kecepatan bicara" })).toContainText(
      "142 kata/menit",
    );
    await expect(rows.filter({ hasText: "Kata pengisi" })).toContainText(
      "3 kali",
    );
    await expect(rows.filter({ hasText: "Nada emosi" })).toBeVisible();
    await expect(rows.filter({ hasText: "Penanganan hold" })).toContainText(
      "tidak ada hold",
    );
    await expect(
      page.getByRole("img", { name: /Diagram profil komunikasi/ }),
    ).toHaveCount(0);
    await expect(review).toContainText("Nada tenang dan empatik.");
    await expect(review).toContainText("Rangkum solusi sebelum menutup.");
    expectHermetic(audit);
  });

  test("Telefun tanpa rekaman, tanpa coaching, dan riwayat lama", async ({
    page,
  }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/telefun/${TELEFUN_ID}`,
      [
        reviewMock("telefun", TELEFUN_ID, {
          ...TELEFUN_REVIEW,
          recording_path: null,
          recording_url: null,
          voice_assessment: null,
          coaching_recommendations: [],
          coaching_focus: null,
          telefun_legacy: true,
        }),
      ],
    );
    await waitForMockedApi(audit, [`/telefun/${TELEFUN_ID}/review`]);
    await expect(page.getByRole("region", { name: "Rekaman" })).toContainText(
      "Tidak ada rekaman",
      { timeout: 20000 },
    );
    const review = page.getByRole("region", { name: "Penilaian suara" });
    await expect(review).toContainText("Riwayat Telefun lama");
    await expect(review).toContainText("Penilaian suara AI belum tersedia");
    await expect(review).toContainText("Rekomendasi coaching belum tersedia.");
    await expect(
      review.getByRole("list", { name: "Skor per aspek" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("rekaman tersimpan tapi tidak boleh diputar menjelaskan alasannya", async ({
    page,
  }) => {
    const audit = await openSession(
      page,
      `/monitoring/sesi/telefun/${TELEFUN_ID}`,
      [
        reviewMock("telefun", TELEFUN_ID, {
          ...TELEFUN_REVIEW,
          recording_url: null,
        }),
      ],
    );
    await waitForMockedApi(audit, [`/telefun/${TELEFUN_ID}/review`]);
    await expect(page.getByRole("region", { name: "Rekaman" })).toContainText(
      "Rekaman hanya dapat diputar oleh admin dan trainer.",
      { timeout: 20000 },
    );
    expectHermetic(audit);
  });

  test("Riwayat membuka halaman detail dan Kembali menjaga filter", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const row = {
      id: KETIK_ID,
      module: "ketik",
      user_id: "user-1",
      occurred_at: OCCURRED_AT,
      scenario_title: "Tagihan Kartu Kredit Dobel",
      consumer_name: "Bu Sri",
      duration_seconds: 412,
      score: 82,
      score_scale: 100,
      review_status: "completed",
      legacy: false,
      participant: { name: "Rina Kartika", batch: "Batch Pagi" },
      actor: { email: "rina@ojk.test", name: "Rina Kartika", role: "agent" },
      simulationSubject: SUBJECT,
    };
    const audit = await openSession(page, "/monitoring?modul=ketik", [
      reviewMock("ketik", KETIK_ID, KETIK_REVIEW),
      {
        method: "GET",
        path: "/api/v1/ai/monitoring/history",
        body: {
          success: true,
          data: {
            rows: [row],
            total: 1,
            page: 1,
            page_size: 25,
            counts: {
              ketik: 1,
              pdkt: 0,
              telefun: 0,
              completed: 1,
              processing: 0,
              failed: 0,
              not_started: 0,
            },
            scope: { kind: "all" },
          },
        },
      },
    ]);
    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    const table = page.getByRole("table", { name: "Riwayat sesi" });

    await table
      .getByRole("button", { name: "Aksi sesi Tagihan Kartu Kredit Dobel" })
      .click({
        timeout: 20000,
      });
    await page.getByRole("menuitem", { name: "Salin tautan" }).click();
    await expect(page.getByText("Tautan sesi disalin.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(`/monitoring/sesi/ketik/${KETIK_ID}`, page.url()).href,
    );

    await table.getByRole("row").nth(1).getByRole("cell").first().click();
    await expect(page).toHaveURL(
      new RegExp(`/monitoring/sesi/ketik/${KETIK_ID}$`),
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Tagihan Kartu Kredit Dobel",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke Riwayat" }).click();
    await expect(page).toHaveURL(/\/monitoring\?modul=ketik$/);
    expectHermetic(audit);
  });

  test("di HP detail tampil satu kolom tanpa geser samping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openSession(
      page,
      `/monitoring/sesi/ketik/${KETIK_ID}`,
      [reviewMock("ketik", KETIK_ID, KETIK_REVIEW)],
    );
    await waitForMockedApi(audit, [`/ketik/${KETIK_ID}/review`]);
    const transcript = page.getByRole("region", { name: "Transkrip chat" });
    const info = page.getByRole("region", { name: "Sesi", exact: true });
    await expect(info).toBeVisible({ timeout: 20000 });
    const [a, b] = await Promise.all([
      transcript.boundingBox(),
      info.boundingBox(),
    ]);
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
    expectHermetic(audit);
  });
});
