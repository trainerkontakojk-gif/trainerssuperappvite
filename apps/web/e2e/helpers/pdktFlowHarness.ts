// Shared by the pdkt-flow-*.spec.ts files.
import { expect, type Locator, type Page } from "@playwright/test";
import {
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./hermeticShell";
import type { SessionHistory } from "../../src/routes/pdkt/utils/sessionHistory";

/** Riwayat dengan peserta yang record-nya sudah tidak ada (`participantId` null). */
export const HISTORY_UNAVAILABLE_PARTICIPANT: readonly SessionHistory[] = [
  {
    id: "pdkt-history-1",
    timestamp: "2026-09-10T00:00:00.000Z",
    config: null,
    emails: [],
    evaluation: null,
    evaluationStatus: "not_started",
    simulationSubject: {
      type: "participant",
      participantId: null,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    },
  },
];

/** Mailbox berisi: satu email terbuka berlampiran, satu sudah dibalas dan dievaluasi. */
export const MAIL_AT = "2026-09-15T08:00:00.000Z";

export const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const SCENARIO = {
  id: "s1",
  category: "Transaksi",
  title: "Keluhan transaksi gagal",
  description: "Konsumen melaporkan transaksi yang gagal.",
  isActive: true,
};

export const SESSION_CONFIG = {
  scenarios: [SCENARIO],
  consumerType: { id: "marah", name: "Marah", description: "Marah." },
  identity: {
    name: "Rina",
    email: "rina@local.test",
    city: "Bandung",
    bodyName: "Rina",
  },
  enableImageGeneration: false,
  selectedModel: "gemini-3.8-flash",
  resolvedConsumerNameMentionPattern: "none",
  writingStyleMode: "training",
};

export function mailboxItem(
  id: string,
  status: "open" | "replied",
  extra: Record<string, unknown> = {},
) {
  const inbound = {
    id: `msg-${id}`,
    from: "rina@local.test",
    to: "ojk@kontak157.go.id",
    subject: `Transaksi gagal ${id}`,
    body: "Saldo terpotong tetapi transaksi gagal.",
    timestamp: MAIL_AT,
    isAgent: false,
    ...(status === "open" ? { attachments: [PIXEL_PNG] } : {}),
  };
  return {
    list: {
      id,
      user_id: "user-1",
      status,
      created_at: MAIL_AT,
      last_activity_at: MAIL_AT,
      sender_name: "Rina",
      sender_email: "rina@local.test",
      subject: inbound.subject,
      snippet: inbound.body,
      permissions: { can_delete: true },
      ...extra,
    },
    detail: {
      id,
      user_id: "user-1",
      status,
      created_at: MAIL_AT,
      last_activity_at: MAIL_AT,
      sender_name: "Rina",
      sender_email: "rina@local.test",
      subject: inbound.subject,
      snippet: inbound.body,
      // Kontrak detail tidak memuat snapshot skenario/config. `inbound.to`
      // sengaja tetap terisi (payload lama) untuk membuktikan UI tidak
      // menampilkan penerima email.
      inbound_email: inbound,
      emails_thread:
        status === "replied"
          ? [
              {
                id: `reply-${id}`,
                from: "agent@local.test",
                to: "rina@local.test",
                subject: `Re: ${inbound.subject}`,
                body: "Terima kasih, kami cek transaksinya.",
                timestamp: MAIL_AT,
                isAgent: true,
              },
            ]
          : [],
      permissions: { can_delete: true },
      ...extra,
    },
  };
}

export const OPEN_MAIL = mailboxItem("mail-open", "open", {
  created_by_user: {
    id: "trainer-1",
    full_name: "Siti Aminah",
    role: "Trainer",
    is_current_user: false,
  },
});

/** Email terbuka yang lebih baru; API mengurutkannya lebih dulu. */
export const NEWER_OPEN_MAIL = mailboxItem("mail-newer", "open", {
  created_at: "2026-09-16T08:00:00.000Z",
  last_activity_at: "2026-09-16T08:00:00.000Z",
});

export const REPLIED_MAIL = mailboxItem("mail-replied", "replied", {
  history_id: "pdkt-evaluated-1",
  replied_at: MAIL_AT,
  time_taken: 225,
});

export const EVALUATED_HISTORY: readonly SessionHistory[] = [
  {
    id: "pdkt-evaluated-1",
    timestamp: MAIL_AT,
    config: SESSION_CONFIG as SessionHistory["config"],
    emails: [],
    evaluationStatus: "completed",
    evaluation: {
      score: 85,
      feedback: "Jawaban relevan dan jelas.",
      typos: ["transkasi"],
      clarityIssues: ["Kalimat pembuka terlalu panjang"],
      contentGaps: ["Belum menyebut kanal pengaduan resmi"],
      scoreBreakdown: {
        recipientDirectionScore: 90,
        normativeResponseScore: 80,
        clarityScore: 85,
        typoScore: 88,
        templateComplianceScore: 82,
      },
      edu: {
        dimensionTips: { clarity: "Pecah kalimat panjang menjadi dua." },
        actionItems: [
          {
            dimension: "normative",
            text: "Sebut kanal pengaduan resmi.",
            example: "Silakan hubungi 157.",
            priorityRank: 1,
          },
        ],
        suggestedRewrite: { body: "Terima kasih, kami cek transaksi Ibu." },
      },
    },
  },
];

/** Riwayat untuk halaman Riwayat: ditelaah, sedang ditelaah, gagal, dan peserta terhapus. */
export const HISTORY_PAGE_SESSIONS: readonly SessionHistory[] = [
  {
    ...EVALUATED_HISTORY[0],
    emails: [{ subject: REPLIED_MAIL.list.subject }],
  },
  {
    id: "pdkt-processing-1",
    timestamp: "2026-09-14T08:00:00.000Z",
    config: SESSION_CONFIG as SessionHistory["config"],
    emails: [{ subject: "Saldo belum kembali" }],
    evaluation: null,
    evaluationStatus: "processing",
  },
  {
    id: "pdkt-failed-1",
    timestamp: "2026-09-13T08:00:00.000Z",
    config: SESSION_CONFIG as SessionHistory["config"],
    emails: [{ subject: "Kartu terblokir" }],
    evaluation: null,
    evaluationStatus: "failed",
    // Bentuk respons API (`mapHistoryRow` membaca kolom snake_case).
    evaluation_status: "failed",
    evaluation_error: "Penilaian AI gagal.",
  } as SessionHistory,
  {
    ...HISTORY_UNAVAILABLE_PARTICIPANT[0],
    // Bentuk respons API: tanpa ini `mapHistoryRow` menganggapnya "processing".
    evaluation_status: "not_started",
  } as SessionHistory,
];

/** Settings tersimpan dengan dua skenario beda kategori, arah, dan cara pembuatan. */
export const COMPANY_SCENARIO = {
  id: "s-company",
  category: "Pembiayaan",
  title: "Pinjaman lunas masih ditagih",
  description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
  isActive: true,
  primaryRecipientType: "reported_company",
  recipientMode: "single",
  recipientEmails: ["pengaduan@finansial.test"],
};

export const OJK_SCENARIO = {
  id: "s-ojk",
  category: "Asuransi",
  title: "Klaim asuransi ditolak",
  description: "Klaim asuransi mobil ditolak tanpa penjelasan.",
  isActive: true,
  primaryRecipientType: "ojk",
  recipientMode: "single",
  recipientEmails: [],
  alwaysUseSampleEmail: true,
  sampleEmailTemplate: {
    subject: "Klaim ditolak",
    body: "Klaim saya ditolak.",
  },
};

export const SAVED_SETTINGS = {
  scenarios: [COMPANY_SCENARIO, OJK_SCENARIO],
  consumerTypes: [],
  enableImageGeneration: false,
  globalConsumerTypeId: "random",
  selectedModel: "gemini-3.8-flash",
  consumerNameMentionPattern: "random",
  writingStyleMode: "training",
};

export const USAGE_SUMMARY_PATH = "/api/v1/ai/usage/summary";

export const USAGE_SUMMARY_MOCK = {
  method: "GET",
  path: USAGE_SUMMARY_PATH,
} as const;

export function usageItem(calls: number, costIdr: number) {
  return {
    calls,
    inputTokens: calls * 600,
    outputTokens: calls * 400,
    totalTokens: calls * 1000,
    costIdr,
    costUsd: costIdr / 16000,
  };
}

/** Ringkasan PDKT dengan item per action, seperti `getAiUsageSummary`. */
export const PDKT_USAGE = {
  totalCalls: 74,
  totalInputTokens: 44400,
  totalOutputTokens: 29600,
  totalTokens: 74000,
  totalCostIdr: 48320,
  simulationCostIdr: 21400,
  reviewCostIdr: 26920,
  periodLabel: "Oktober 2026",
  breakdown: {
    simulation: usageItem(30, 21400),
    review: usageItem(44, 26920),
    uncategorized: usageItem(0, 0),
  },
  breakdownItems: [
    {
      key: "pdkt_create_email",
      label: "Create Email",
      category: "simulation",
      ...usageItem(30, 21400),
    },
    {
      key: "pdkt_review",
      label: "Penilaian AI",
      category: "review",
      ...usageItem(44, 26920),
    },
  ],
};

export function pdktMocks(
  history: readonly SessionHistory[],
  mailbox: readonly ReturnType<typeof mailboxItem>[] = [],
): readonly ApiMock[] {
  return [
    ...mailbox.map(({ detail }) => ({
      method: "GET" as const,
      path: `/api/v1/pdkt/mailbox/${detail.id}`,
      body: { success: true, data: detail },
    })),
    {
      method: "GET",
      path: "/api/v1/pdkt/settings",
      body: { success: true, data: null },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/scenarios",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/consumer-types",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/history",
      body: { success: true, data: history },
    },
    {
      method: "GET",
      path: "/api/v1/pdkt/mailbox",
      body: { success: true, data: mailbox.map(({ list }) => list) },
    },
    {
      method: "GET",
      path: "/api/v1/ai/usage/summary",
      body: {
        success: true,
        data: {
          totalCalls: 10,
          totalTokens: 8000,
          totalCostIdr: 50000,
          simulationCostIdr: 30000,
          reviewCostIdr: 20000,
          periodLabel: "Mei 2026",
          breakdown: {
            simulation: {
              calls: 6,
              inputTokens: 3000,
              outputTokens: 2000,
              totalTokens: 5000,
              costIdr: 30000,
              costUsd: 2,
            },
            review: {
              calls: 4,
              inputTokens: 2000,
              outputTokens: 1000,
              totalTokens: 3000,
              costIdr: 20000,
              costUsd: 1.3,
            },
            uncategorized: {
              calls: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costIdr: 0,
              costUsd: 0,
            },
          },
          breakdownItems: [],
        },
      },
    },
  ];
}

/** Buka Pengaturan PDKT dengan SAVED_SETTINGS dan POST settings yang dimock. */
export async function openScenarioSettings(page: Page) {
  const audit = await openHermeticShell(page, {
    path: "/pdkt",
    apiMocks: [
      {
        method: "GET",
        path: "/api/v1/pdkt/settings",
        body: { success: true, data: SAVED_SETTINGS },
        headers: { "x-settings-version": "absent" },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/settings",
        body: { success: true, data: null },
        headers: { "x-settings-version": "2026-10-13T05:00:00.000Z" },
      },
      ...pdktMocks([]).filter((mock) => mock.path !== "/api/v1/pdkt/settings"),
    ],
  });
  await waitForMockedApi(audit, ["GET /api/v1/pdkt/settings"]);
  await page
    .getByRole("navigation", { name: "Menu PDKT" })
    .getByRole("button", { name: /^Pengaturan/ })
    .click();
  // Judul dialog berganti saat editor skenario terbuka; hanya satu dialog aktif.
  return { audit, dialog: page.getByRole("dialog") };
}

/**
 * Tab filter "Dibalas" hanya ada di kotak masuk ruang kerja. Baris "Belum
 * dibalas" di landing juga memuat subjek email, jadi subjek bukan penanda.
 */
export function workspaceMarker(page: Page) {
  return page
    .getByRole("group", { name: "Saring email" })
    .getByRole("button", { name: "Dibalas", exact: true });
}

/**
 * Lewati pemilih peserta (bila muncul) sampai ruang kerja tampil. `marker`
 * menggantikan penanda kotak masuk untuk ruang kerja yang gagal dimuat.
 */
export async function enterWorkspace(page: Page, marker?: Locator) {
  const picker = page
    .getByRole("dialog")
    .filter({ hasText: "Pilih peserta latihan" });
  const workspace = marker ?? workspaceMarker(page);
  await expect
    .poll(
      async () => (await picker.isVisible()) || (await workspace.isVisible()),
      {
        timeout: 20000,
      },
    )
    .toBe(true);
  if (await picker.isVisible()) {
    // "Diri sendiri" sudah terpilih secara default.
    await picker.getByRole("button", { name: "Mulai" }).click();
  }
  await expect(workspace).toBeVisible({ timeout: 20000 });
}

/** Buka /pdkt, klik Mulai simulasi, dan tunggu ruang kerja. */
export async function openWorkspace(page: Page, apiMocks: readonly ApiMock[]) {
  const audit = await openHermeticShell(page, { path: "/pdkt", apiMocks });
  await page
    .getByRole("button", { name: /^Mulai simulasi/ })
    .first()
    .click();
  await enterWorkspace(page);
  return audit;
}

/** Ganti respons JSON satu endpoint setelah halaman terbuka (handler terakhir menang). */
export async function overrideJson(
  page: Page,
  url: string | RegExp,
  data: unknown,
) {
  await page.route(url, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    }),
  );
}

export function stageNav(page: Page) {
  return page.getByRole("navigation", { name: "Tahap latihan" });
}

export function pdktNavigationMocks(
  history: readonly SessionHistory[],
  mailbox: readonly ReturnType<typeof mailboxItem>[] = [],
): readonly ApiMock[] {
  return [
    ...pdktMocks(history, mailbox),
    ...history.map((session) => ({
      method: "GET" as const,
      path: `/api/v1/pdkt/history/eval/${session.id}`,
      body: {
        success: true,
        data: {
          evaluation_status: session.evaluation
            ? "completed"
            : session.evaluationStatus,
          evaluation: session.evaluation,
          evaluation_error: null,
        },
      },
    })),
  ];
}

// Regresi navigasi: API hermetic, satu worker, request atribusi diperiksa di browser.
export const SUBJECT_X = {
  type: "participant" as const,
  participantId: "11111111-1111-4111-8111-111111111111",
  displayName: "Peserta X",
  batchName: "Batch 1",
  team: "Alpha",
};

export const SUBJECT_Y = {
  type: "participant" as const,
  participantId: "22222222-2222-4222-8222-222222222222",
};

export const SUBJECT_MAIL = mailboxItem("subject-review", "replied", {
  history_id: EVALUATED_HISTORY[0].id,
  simulationSubject: SUBJECT_X,
});

export const CREATE_MOCKS: ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/pdkt/consumer-types",
    body: { success: true, data: [SESSION_CONFIG.consumerType] },
  },
  {
    method: "GET",
    path: "/api/v1/pdkt/scenarios",
    body: { success: true, data: [SCENARIO] },
  },
  {
    method: "POST",
    path: "/api/v1/pdkt/generate-identity",
    body: { success: true, data: SESSION_CONFIG.identity },
  },
  {
    method: "POST",
    path: "/api/v1/pdkt/session/create",
    body: {
      success: true,
      data: { id: OPEN_MAIL.list.id, message: OPEN_MAIL.detail.inbound_email },
    },
  },
];

export const picker = (page: Page) =>
  page.getByRole("dialog").filter({ hasText: "Pilih peserta latihan" });

export const hero = (page: Page) =>
  page.getByRole("heading", { name: /Pahami keluhannya/ });

export const reviewHeading = (page: Page) =>
  page.getByRole("heading", { name: "Balasan untuk Rina" });

export async function expectSearch(
  page: Page,
  values: Record<string, string | null>,
) {
  await expect
    .poll(() => {
      const search = new URL(page.url()).searchParams;
      return Object.fromEntries(
        Object.keys(values).map((key) => [key, search.get(key)]),
      );
    })
    .toEqual(values);
}

export async function requestNewEmail(page: Page) {
  const request = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().endsWith("/api/v1/pdkt/session/create"),
  );
  await page
    .getByRole("button", { name: "Email baru", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: new RegExp(SCENARIO.title) })
    .click();
  return (await request).postDataJSON();
}

export const LEGACY_PRACTICE_SUBJECTS = [
  {
    label: "unknown",
    value: {
      type: "unknown",
      participantId: null,
      displayName: null,
      batchName: null,
      team: null,
    },
  },
  { label: "null", value: null },
  { label: "missing", value: undefined },
  {
    label: "participant-deleted",
    value: { ...SUBJECT_X, participantId: null },
  },
] as const;

export async function openSubjectReview(
  page: Page,
  role: string,
  subject: unknown,
  retiredScenario = false,
) {
  const item = mailboxItem("legacy-practice-review", "replied", {
    history_id: EVALUATED_HISTORY[0].id,
    ...(subject === undefined ? {} : { simulationSubject: subject }),
  });
  const history: readonly SessionHistory[] = retiredScenario
    ? [
        {
          ...EVALUATED_HISTORY[0],
          config: {
            identity: SESSION_CONFIG.identity,
            writingStyleMode: "training" as const,
            scenarios: [{ id: "retired" }],
          },
        },
      ]
    : EVALUATED_HISTORY;
  const audit = await openHermeticShell(page, {
    path: "/pdkt?ruang=1",
    auth: { role },
    apiMocks: [
      ...CREATE_MOCKS,
      ...pdktNavigationMocks(history, [item, OPEN_MAIL]),
    ],
  });
  await expect(workspaceMarker(page)).toBeVisible();
  await workspaceMarker(page).click();
  await page
    .getByRole("button", { name: new RegExp(item.list.subject) })
    .click();
  await page.getByRole("button", { name: "Lihat telaah" }).click();
  await expect(reviewHeading(page)).toBeVisible();
  return audit;
}

export async function createPracticeAgain(page: Page, retiredScenario = false) {
  const action = page.getByRole("button", {
    name: retiredScenario
      ? "Buat email baru"
      : "Latihan lagi dengan skenario ini",
    exact: true,
  });
  await expect(action).toBeEnabled();
  await expect(page.getByText(/Latihan lagi tidak tersedia/)).toHaveCount(0);
  if (retiredScenario) await action.click();
  const request = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().endsWith("/api/v1/pdkt/session/create"),
  );
  if (retiredScenario)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(SCENARIO.title) })
      .click();
  else await action.click();
  return (await request).postDataJSON();
}
