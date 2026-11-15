// Shared by the ketik-flow-*.spec.ts files.
import { expect, type Page } from "@playwright/test";
import {
  DEFAULT_KETIK_SETTINGS,
  type KetikAppSettings,
  type KetikSessionHistoryItem,
  type KetikServerSession,
} from "@trainers/types";
import {
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./hermeticShell";
import { summarizeKetikLanding } from "../../src/routes/ketik/utils/landingSummary";

/** Tanggal relatif ke hari ini, supaya "sesi bulan ini" tidak basi. */
export function daysAgo(days: number, hour = 3): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

export const REVIEWED_AT = daysAgo(0);

export const REVIEWED_SESSION: KetikSessionHistoryItem = {
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
    {
      id: "m1",
      sender: "consumer",
      text: "Tagihan saya dobel.",
      timestamp: REVIEWED_AT,
    },
    {
      id: "m2",
      sender: "agent",
      text: "Baik Bu, saya cek tagihn Ibu.",
      timestamp: REVIEWED_AT,
    },
    {
      id: "m3",
      sender: "consumer",
      text: "Tolong cepat ya.",
      timestamp: REVIEWED_AT,
    },
  ],
};

/** Sesi lebih lama yang sudah ditelaah: dasar perbandingan skor. */
export const OLDER_REVIEWED: KetikSessionHistoryItem = {
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
    {
      id: "o1",
      sender: "consumer",
      text: "Saya diteror penagih.",
      timestamp: daysAgo(2),
    },
    {
      id: "o2",
      sender: "agent",
      text: "Mohon maaf, saya bantu cek.",
      timestamp: daysAgo(2),
    },
  ],
};

export const PENDING_SESSION: KetikSessionHistoryItem = {
  id: "ketik-pending-1",
  date: daysAgo(1),
  scenarioTitle: "Pengecekan SLIK",
  consumerName: "Pak Dimas",
  consumerCity: "Surabaya",
  reviewStatus: "pending",
  messages: [
    {
      id: "p1",
      sender: "consumer",
      text: "Mau cek SLIK.",
      timestamp: daysAgo(1),
    },
    {
      id: "p2",
      sender: "agent",
      text: "Baik Pak, saya jelaskan caranya.",
      timestamp: daysAgo(1),
    },
  ],
};

export const FAILED_SESSION: KetikSessionHistoryItem = {
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
    {
      id: "f1",
      sender: "consumer",
      text: "Klaim saya ditolak.",
      timestamp: daysAgo(1, 5),
    },
    {
      id: "f2",
      sender: "agent",
      text: "Saya bantu periksa, Bu.",
      timestamp: daysAgo(1, 5),
    },
  ],
};

export const FULL_HISTORY: readonly KetikSessionHistoryItem[] = [
  REVIEWED_SESSION,
  FAILED_SESSION,
  PENDING_SESSION,
  OLDER_REVIEWED,
];

export const DIMENSIONS = [
  ["probing", "Probing", 64, "Cukup", 1],
  ["resolution", "Resolusi", 78, "Baik", 2],
  ["empathy", "Empati & Komunikasi", 80, "Baik", 3],
  ["compliance", "Kepatuhan", 85, "Baik", 4],
  ["typo", "Tata Tulis", 90, "Sangat Baik", 5],
] as const;

export const REVIEW_DETAIL = {
  sessionId: REVIEWED_SESSION.id,
  scores: {
    final: 82,
    empathy: 80,
    probing: 64,
    resolution: 78,
    typo: 90,
    compliance: 85,
  },
  review: {
    id: "review-1",
    sessionId: REVIEWED_SESSION.id,
    aiSummary: "Agen empatik, tetapi verifikasi data terlambat.",
    strengths: ["Menyapa dengan nama"],
    weaknesses: ["Verifikasi terlambat"],
    coachingFocus: ["Verifikasi identitas di awal"],
    createdAt: REVIEWED_AT,
    education: {
      dimensionGuidance: DIMENSIONS.map(
        ([key, label, score, verdict, rank]) => ({
          key,
          label,
          score,
          verdict,
          priorityRank: rank,
          diagnosis: `Diagnosis ${label}.`,
          howToFix: `Cara memperbaiki ${label}.`,
          exampleRewrite: `Contoh kalimat ${label}.`,
        }),
      ),
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
export const ANNOTATED_REVIEW_DETAIL = {
  ...REVIEW_DETAIL,
  review: {
    ...REVIEW_DETAIL.review,
    education: {
      ...REVIEW_DETAIL.review.education,
      dimensionGuidance: REVIEW_DETAIL.review.education.dimensionGuidance.map(
        (item) => ({
          ...item,
          source: "transcript",
          evidence: [{ messageId: "m2", quote: "Baik Bu" }],
        }),
      ),
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
export const FAST_SETTINGS: KetikAppSettings = {
  ...DEFAULT_KETIK_SETTINGS,
  responsePacingMode: "training_fast",
};

export const CHAT_ID = "13000000-0000-4000-8000-000000000001";

export function serverSession(
  overrides: Partial<KetikServerSession> = {},
): KetikServerSession {
  return {
    id: CHAT_ID,
    state: "active",
    version: 0,
    agentVersion: 0,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    config: {
      scenarios: FAST_SETTINGS.scenarios,
      consumerType: FAST_SETTINGS.consumerTypes[0],
      identity: { name: "Konsumen", city: "Bandung", phone: "0800000000" },
      selectedModel: FAST_SETTINGS.selectedModel,
      simulationDuration: 5,
      responsePacingMode: "training_fast",
    },
    scenario: FAST_SETTINGS.scenarios[0],
    simulationSubject: {
      type: "self",
      participantId: null,
      displayName: "Agen",
      batchName: null,
      team: null,
    },
    messages: [],
    consumerClosed: false,
    provenance: "server_v1",
    awaitingResponse: false,
    pendingResponse: null,
    pendingTurn: null,
    ...overrides,
  };
}

export const assignedSelf: ApiMock = {
  method: "GET",
  path: "/api/v1/ketik/assignments/self",
  body: {
    success: true,
    data: {
      assignment: {
        recipientId: "user-1",
        assignedBy: "trainer-1",
        version: CHAT_ID,
        sourceSettingsVersion: "absent",
        assignedAt: new Date().toISOString(),
        sourceConfiguration: FAST_SETTINGS,
      },
      recipientSettingsVersion: "absent",
    },
  },
};

export function historyPage(
  items: readonly KetikSessionHistoryItem[],
  all: readonly KetikSessionHistoryItem[],
) {
  const completed = items.filter((s) => s.reviewStatus === "completed");
  return {
    items: items.map(({ messages: _, ...s }) => s),
    nextCursor: null,
    total: items.length,
    reviewedCount: completed.length,
    averageScore: completed.length
      ? Math.round(
          completed.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) /
            completed.length,
        )
      : null,
    counts: {
      all: all.length,
      completed: all.filter((s) => s.reviewStatus === "completed").length,
      running: all.filter((s) => s.reviewStatus === "processing").length,
      failed: all.filter((s) => s.reviewStatus === "failed").length,
      not_started: all.filter(
        (s) => !s.reviewStatus || s.reviewStatus === "pending",
      ).length,
    },
  };
}

export function ketikMocks(
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
      path: "/api/v1/ketik/history/summary",
      body: { success: true, data: summarizeKetikLanding(history) },
    },
    ...history.map((item): ApiMock => ({
      method: "GET",
      path: `/api/v1/ketik/review/status/${item.id}`,
      body: {
        success: true,
        data: {
          status:
            item.reviewStatus === "processing"
              ? "processing"
              : item.reviewStatus === "completed"
                ? "completed"
                : item.reviewStatus === "failed"
                  ? "failed"
                  : "pending",
          resultReady: item.reviewStatus === "completed",
          previousKept: false,
          scores: null,
        },
      },
    })),
    ...history.map((item): ApiMock => ({
      method: "GET",
      path: `/api/v1/ketik/history/${item.id}`,
      body: {
        success: true,
        data: {
          ...item,
          previousFinalScore:
            item.id === REVIEWED_SESSION.id ? OLDER_REVIEWED.finalScore : null,
        },
      },
    })),
    {
      method: "GET",
      path: /q=slik(?:&|$)/,
      body: {
        success: true,
        data: historyPage(
          history.filter((s) => s.scenarioTitle.toLowerCase().includes("slik")),
          history,
        ),
      },
    },
    ...["completed", "running", "failed", "not_started", "all"].map(
      (status): ApiMock => {
        const matching = history.filter(
          (item) =>
            status === "all" ||
            item.reviewStatus === status ||
            (status === "running" && item.reviewStatus === "processing") ||
            (status === "not_started" && item.reviewStatus === "pending"),
        );
        return {
          method: "GET",
          path: new RegExp(
            `^/api/v1/ketik/history\\?[^#]*status=${status}(?:&|$)`,
          ),
          body: { success: true, data: historyPage(matching, history) },
        };
      },
    ),
    {
      method: "GET",
      path: /^\/api\/v1\/ketik\/history\/[^/]+$/,
      status: 404,
      body: { success: false, error: { message: "Sesi tidak ditemukan" } },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history",
      body: { success: true, data: historyPage(history, history) },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/assignments/self",
      body: {
        success: true,
        data: { assignment: null, recipientSettingsVersion: "absent" },
      },
    },
  ];
}

export const reviewDetailMock: ApiMock = {
  method: "GET",
  path: `/api/v1/ketik/review/${REVIEWED_SESSION.id}`,
  body: { success: true, data: REVIEW_DETAIL },
};

export function telaahPath(id: string) {
  return `/ketik?sesi=${id}&tahap=telaah`;
}

/** Foto konsumen di ruang chat berasal dari host aset eksternal (`ketik-avatar.ts`). */
export const KETIK_EXPECTED_ASSET_HOSTS = ["randomuser.me"];

export async function open(
  page: Page,
  path: string,
  apiMocks: ApiMock[],
  role?: string,
) {
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

/** Satu skenario berskrip dan satu nonaktif, supaya baris daftar bisa dibedakan. */
export const SETTINGS_FOR_DIALOG: KetikAppSettings = {
  ...DEFAULT_KETIK_SETTINGS,
  scenarios: DEFAULT_KETIK_SETTINGS.scenarios.map((scenario, index) =>
    index === 0
      ? { ...scenario, script: "Konsumen membuka chat dengan nada panik." }
      : index === 1
        ? { ...scenario, isActive: false }
        : scenario,
  ),
};

export const [SCRIPTED_SCENARIO, INACTIVE_SCENARIO] =
  SETTINGS_FOR_DIALOG.scenarios;

export async function openKetikSettings(
  page: Page,
  settings: KetikAppSettings = SETTINGS_FOR_DIALOG,
) {
  const audit = await open(page, "/ketik", [
    ...ketikMocks([], settings),
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

/** Sesi dengan NIK 15 digit, domain email typo, dan domisili provinsi. */
export const MALFORMED_SESSION: KetikSessionHistoryItem = {
  ...REVIEWED_SESSION,
  id: "ketik-malformed-1",
  consumerName: "Budi Santoso",
  consumerCity: "Lampung",
  consumerNik: "317405120885000",
  consumerEmail: "budi.santoso85@gnail.com",
  messages: [
    {
      id: "v1",
      sender: "consumer",
      text: "Saya ditelepon penagih pinjol terus.",
      timestamp: REVIEWED_AT,
    },
    {
      id: "v2",
      sender: "agent",
      text: "Boleh disebutkan NIK dan email Bapak?",
      timestamp: REVIEWED_AT,
    },
    {
      id: "v3",
      sender: "consumer",
      text: "NIK 317405120885000, email budi.santoso85@gnail.com",
      timestamp: REVIEWED_AT,
    },
    {
      id: "v4",
      sender: "agent",
      text: "Terima kasih, Pak, sudah kami catat.",
      timestamp: REVIEWED_AT,
    },
  ],
};

export const MALFORMED_REVIEW_DETAIL = {
  ...REVIEW_DETAIL,
  sessionId: MALFORMED_SESSION.id,
  review: {
    ...REVIEW_DETAIL.review,
    sessionId: MALFORMED_SESSION.id,
    education: {
      ...REVIEW_DETAIL.review.education,
      typosEnriched: [],
      verification: {
        status: "unconfirmed",
        missedBeforeMessageId: "v4",
        fields: [
          {
            field: "nik",
            value: "317405120885000",
            reason: "15 digit, harus 16",
            status: "unconfirmed",
            agentMessageId: "v2",
            agentQuote: "Boleh disebutkan NIK dan email Bapak?",
          },
          {
            field: "email",
            value: "budi.santoso85@gnail.com",
            reason: "Domain mirip gmail.com",
            status: "unconfirmed",
            agentMessageId: "v2",
            agentQuote: "Boleh disebutkan NIK dan email Bapak?",
          },
          {
            field: "city",
            value: "Lampung",
            reason: "Nama provinsi, kota/kabupaten belum disebut",
            status: "not_asked",
            agentMessageId: null,
            agentQuote: null,
          },
        ],
      },
    },
  },
  typos: [],
};
