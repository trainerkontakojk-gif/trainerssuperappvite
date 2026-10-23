import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { E2E_SUPABASE_URL } from "./helpers/e2eTargets";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import { findTargetsBelow } from "./helpers/touchTarget";
import type { SessionHistory } from "../src/routes/pdkt/utils/sessionHistory";

/**
 * PDKT — landing + modal workspace (hermetic).
 *
 * Modul terbesar tanpa E2E (plan 025 Wave 3, spec #10–#12). Semua `/api` dimock;
 * mutasi data nyata tetap milik spec backend loopback.
 *
 * Fixture memakai `data: null` / `[]`, yaitu keadaan pengguna baru tanpa
 * settings tersimpan — bentuk yang sama dengan yang diasumsikan unit test
 * `pdkt-landing` (`useApi` mengembalikan `data: null`). Handler asli juga
 * membalas `null` saat `readPdktSettings` tidak menemukan settings.
 */

/** Riwayat dengan peserta yang record-nya sudah tidak ada (`participantId` null). */
const HISTORY_UNAVAILABLE_PARTICIPANT: readonly SessionHistory[] = [
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
const MAIL_AT = "2026-09-15T08:00:00.000Z";
const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SCENARIO = {
  id: "s1",
  category: "Transaksi",
  title: "Keluhan transaksi gagal",
  description: "Konsumen melaporkan transaksi yang gagal.",
  isActive: true,
};
const SESSION_CONFIG = {
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
function mailboxItem(
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
const OPEN_MAIL = mailboxItem("mail-open", "open", {
  created_by_user: {
    id: "trainer-1",
    full_name: "Siti Aminah",
    role: "Trainer",
    is_current_user: false,
  },
});
/** Email terbuka yang lebih baru; API mengurutkannya lebih dulu. */
const NEWER_OPEN_MAIL = mailboxItem("mail-newer", "open", {
  created_at: "2026-09-16T08:00:00.000Z",
  last_activity_at: "2026-09-16T08:00:00.000Z",
});
const REPLIED_MAIL = mailboxItem("mail-replied", "replied", {
  history_id: "pdkt-evaluated-1",
  replied_at: MAIL_AT,
  time_taken: 225,
});
const EVALUATED_HISTORY: readonly SessionHistory[] = [
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
const HISTORY_PAGE_SESSIONS: readonly SessionHistory[] = [
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
const COMPANY_SCENARIO = {
  id: "s-company",
  category: "Pembiayaan",
  title: "Pinjaman lunas masih ditagih",
  description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
  isActive: true,
  primaryRecipientType: "reported_company",
  recipientMode: "single",
  recipientEmails: ["pengaduan@finansial.test"],
};
const OJK_SCENARIO = {
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
const SAVED_SETTINGS = {
  scenarios: [COMPANY_SCENARIO, OJK_SCENARIO],
  consumerTypes: [],
  enableImageGeneration: false,
  globalConsumerTypeId: "random",
  selectedModel: "gemini-3.8-flash",
  consumerNameMentionPattern: "random",
  writingStyleMode: "training",
};

const USAGE_SUMMARY_PATH = "/api/v1/ai/usage/summary";

const USAGE_SUMMARY_MOCK = {
  method: "GET",
  path: USAGE_SUMMARY_PATH,
} as const;

function usageItem(calls: number, costIdr: number) {
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
const PDKT_USAGE = {
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

function pdktMocks(
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
async function openScenarioSettings(page: Page) {
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
function workspaceMarker(page: Page) {
  return page
    .getByRole("group", { name: "Saring email" })
    .getByRole("button", { name: "Dibalas", exact: true });
}

/**
 * Lewati pemilih peserta (bila muncul) sampai ruang kerja tampil. `marker`
 * menggantikan penanda kotak masuk untuk ruang kerja yang gagal dimuat.
 */
async function enterWorkspace(page: Page, marker?: Locator) {
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
async function openWorkspace(page: Page, apiMocks: readonly ApiMock[]) {
  const audit = await openHermeticShell(page, { path: "/pdkt", apiMocks });
  await page
    .getByRole("button", { name: /^Mulai simulasi/ })
    .first()
    .click();
  await enterWorkspace(page);
  return audit;
}

/** Ganti respons JSON satu endpoint setelah halaman terbuka (handler terakhir menang). */
async function overrideJson(page: Page, url: string | RegExp, data: unknown) {
  await page.route(url, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    }),
  );
}

function stageNav(page: Page) {
  return page.getByRole("navigation", { name: "Tahap latihan" });
}

test.describe("PDKT (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  for (const surface of [
    "landing",
    "kotak masuk",
    "Pahami",
    "Tanggapi",
    "buat email",
    "lampiran",
    "konsumen",
    "skenario",
    "editor",
    "penerima",
    "landing gagal",
    "editor konsumen",
    "lampiran skenario",
  ] as const) {
    test(`touch target 44px: ${surface}`, async ({ page }) => {
      test.setTimeout(90000);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        let root = page.locator("main").first();
        let audit;
        const extraFindings: Awaited<ReturnType<typeof findTargetsBelow>> = [];
        const capture = async () => {
          for (const theme of ["light", "dark"] as const) {
            await setDocumentTheme(page, theme);
            await page.screenshot({
              path: `../../plans/artifacts/pdkt-touch-target-dan-error-backend/${surface}-${width}-${theme}.png`,
              fullPage: true,
            });
          }
        };
        if (
          [
            "konsumen",
            "skenario",
            "editor",
            "penerima",
            "editor konsumen",
            "lampiran skenario",
          ].includes(surface)
        ) {
          const settings = await openScenarioSettings(page);
          audit = settings.audit;
          root = settings.dialog;
          await expect(root).toBeVisible({ timeout: 20000 });
          if (surface === "konsumen" || surface === "editor konsumen") {
            await root.getByRole("tab", { name: /^Karakter konsumen/ }).click();
            if (surface === "editor konsumen") {
              await root
                .getByRole("button", { name: "Karakter baru", exact: true })
                .click();
              await expect(root.getByLabel("Nama karakter")).toBeVisible();
              extraFindings.push(...(await findTargetsBelow(page, root)));
              await root.getByLabel("Nama karakter").fill("Konsumen uji");
              await root
                .getByLabel("Deskripsi karakter")
                .fill("Tenang dan sopan.");
              await root
                .getByRole("button", { name: "Simpan", exact: true })
                .first()
                .click();
              await expect(
                root.getByRole("button", { name: "Hapus Konsumen uji" }),
              ).toBeVisible();
            }
          } else if (
            surface === "editor" ||
            surface === "penerima" ||
            surface === "lampiran skenario"
          ) {
            await root
              .getByRole("button", { name: `Ubah ${COMPANY_SCENARIO.title}` })
              .click();
            await expect(
              root.getByRole("heading", { name: "Ubah skenario" }),
            ).toBeVisible();
            if (surface === "penerima") {
              await root.getByRole("button", { name: "Tambah email" }).click();
            } else if (surface === "lampiran skenario") {
              await root.locator("summary").click();
              const fileChooserEvent = page.waitForEvent("filechooser");
              await root
                .getByText("Pilih gambar atau PDF", { exact: true })
                .click();
              const fileChooser = await fileChooserEvent;
              await fileChooser.setFiles({
                name: "lampiran.png",
                mimeType: "image/png",
                buffer: Buffer.from(PIXEL_PNG.split(",")[1], "base64"),
              });
              await expect(
                root.getByRole("button", { name: "Hapus lampiran 1" }),
              ).toBeVisible();
              await expect(
                root.getByRole("heading", { name: "Ubah skenario" }),
              ).toBeInViewport();
              await root
                .getByRole("button", { name: "Hapus lampiran 1" })
                .scrollIntoViewIfNeeded();
              await expect(
                root.getByRole("button", { name: "Hapus lampiran 1" }),
              ).toBeInViewport();
              await expect(
                root.getByRole("heading", { name: "Ubah skenario" }),
              ).toBeInViewport();
            }
          }
        } else if (surface === "landing" || surface === "landing gagal") {
          audit = await openHermeticShell(page, {
            path: "/pdkt",
            apiMocks: [
              ...(surface === "landing gagal"
                ? [
                    {
                      method: "GET" as const,
                      path: "/api/v1/pdkt/history",
                      status: 500,
                      body: {
                        success: false,
                        error: {
                          code: "DATABASE_ERROR",
                          message: "Gagal memuat riwayat.",
                        },
                      },
                    },
                    {
                      method: "GET" as const,
                      path: "/api/v1/pdkt/mailbox",
                      status: 500,
                      body: {
                        success: false,
                        error: {
                          code: "DATABASE_ERROR",
                          message: "Gagal memuat email.",
                        },
                      },
                    },
                  ]
                : []),
              ...pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
            ],
          });
          await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);
          await expect(
            page.getByRole("region", { name: "Belum dibalas" }),
          ).toBeVisible({ timeout: 20000 });
        } else {
          audit = await openWorkspace(page, [
            {
              method: "GET",
              path: "/api/v1/pdkt/settings",
              body: { success: true, data: SAVED_SETTINGS },
              headers: { "x-settings-version": "absent" },
            },
            ...pdktMocks([], [OPEN_MAIL]).filter(
              (mock) => mock.path !== "/api/v1/pdkt/settings",
            ),
          ]);
          root = page.locator("main main");
          if (surface !== "kotak masuk" && surface !== "buat email") {
            if (width === 390)
              await page
                .getByRole("button", {
                  name: new RegExp(OPEN_MAIL.list.subject),
                })
                .click();
            await waitForMockedApi(audit, [
              `/pdkt/mailbox/${OPEN_MAIL.list.id}`,
            ]);
          }
          if (surface === "Tanggapi") {
            await page.getByRole("button", { name: "Tulis balasan" }).click();
            await expect(page.getByLabel("Balasan Anda")).toBeVisible();
          } else if (surface === "buat email") {
            await page
              .getByRole("button", { name: "Email baru", exact: true })
              .click();
            root = page.getByRole("dialog", { name: "Buat email baru" });
            await expect(root).toBeVisible();
          } else if (surface === "lampiran") {
            await page
              .getByRole("button", { name: "Lampiran 1", exact: true })
              .click();
            root = page.getByRole("dialog");
            await expect(root).toBeVisible();
          } else if (surface === "kotak masuk") {
            await capture();
            await page.getByRole("button", { name: "Menu lainnya" }).click();
            await expect(
              page.getByRole("menuitem", { name: "Pilih beberapa" }),
            ).toBeVisible();
            expect(
              await findTargetsBelow(page, page.getByRole("menu")),
              `${width}px menu`,
            ).toEqual([]);
            await page
              .getByRole("menuitem", { name: "Pilih beberapa" })
              .click();
            await expect(page.getByRole("checkbox")).toBeVisible();
            await page.getByRole("checkbox").check();
          }
        }
        if (surface === "landing" || surface === "skenario") await capture();
        expect(
          [...extraFindings, ...(await findTargetsBelow(page, root))],
          `${width}px ${surface}`,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${width}px overflow`,
        ).toBe(true);
        expectHermetic(audit);
      }
    });
  }

  test("landing PDKT menampilkan hero, aksi, dan keadaan kosong", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami keluhannya\.\s*Balas dengan tepat\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    // Kepanjangan PDKT dijelaskan di paragraf hero; pill "PDKT · …" tidak ada lagi.
    const intro = page.getByTestId("pdkt-hero-intro");
    await expect(intro).toContainText(
      "PDKT (Paham Dulu Kasih Tanggapan) adalah latihan membalas email konsumen.",
    );
    await expect(intro).toContainText(
      "Baca emailnya sampai paham, tulis balasan dengan kata-kata Anda sendiri, lalu AI menelaah balasan itu dan menunjukkan bagian yang perlu diperbaiki.",
    );
    await expect(page.getByText("PDKT · Simulasi email konsumen")).toHaveCount(
      0,
    );
    // Daftar centang "janji" di hero dihapus: salah satunya tidak benar untuk
    // skenario email tetap.
    for (const point of [
      "Kasus selalu baru",
      "Tanpa bocoran jawaban",
      "Ditelaah AI",
    ]) {
      await expect(page.getByText(point, { exact: true })).toHaveCount(0);
    }
    const nav = page.getByRole("navigation", { name: "Menu PDKT" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        nav.getByRole("button", { name: new RegExp(`^${label}`) }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    // "Atur skenario" sama dengan "Pengaturan" di menu; hanya satu yang tersisa.
    await expect(
      page.getByRole("button", { name: "Atur skenario" }),
    ).toHaveCount(0);

    // Pengguna baru: satu blok penjelasan, bukan deretan bagian kosong.
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);
    const start = page.getByRole("region", { name: "Belum ada latihan" });
    await expect(start).toBeVisible();
    await expect(start).toContainText(
      "Setelah balasan pertama Anda ditelaah, halaman ini menampilkan email yang belum dibalas, skor rata-rata, aspek yang perlu dilatih, dan hasil telaah terbaru.",
    );
    for (const section of [
      "Progres latihan",
      "Belum dibalas",
      "Fokus berikutnya",
      "Hasil telaah terbaru",
    ]) {
      await expect(page.getByRole("region", { name: section })).toHaveCount(0);
    }
    await start.getByRole("button", { name: "Buka kotak masuk" }).click();
    await enterWorkspace(page);

    // Copy landing lama tidak boleh kembali.
    for (const stale of [
      /Latih balasan email/,
      /PDKT — singkatan dari/,
      /tanpa petunjuk jawaban/,
      /Mulai latihan/,
      /Daftar email masuk/,
      /Pemakaian bulan ini/,
    ]) {
      await expect(page.getByText(stale)).toHaveCount(0);
    }

    await waitForMockedApi(audit, [
      "/pdkt/settings",
      "/pdkt/scenarios",
      "/pdkt/consumer-types",
    ]);
    expectHermetic(audit);
  });

  test("landing PDKT merangkum progres dan membuka email yang belum dibalas", async ({
    page,
  }) => {
    const reviewing = {
      ...EVALUATED_HISTORY[0],
      id: "pdkt-processing-1",
      evaluation: null,
      evaluationStatus: "processing",
    } as SessionHistory;
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      // Urutan API mengikuti aktivitas terbaru; email terlama tampil paling atas.
      apiMocks: pdktMocks(
        [
          {
            ...EVALUATED_HISTORY[0],
            // Public history derives the subject from the replay email, not
            // from the evaluator's private scenario snapshot.
            emails: [REPLIED_MAIL.detail.inbound_email],
          },
          reviewing,
        ],
        [NEWER_OPEN_MAIL, OPEN_MAIL, REPLIED_MAIL],
      ),
    });
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);

    // Ringkasan progres berupa satu baris kalimat, bukan kartu statistik.
    const progress = page.getByRole("region", { name: "Progres latihan" });
    const summary = progress.getByTestId("pdkt-progress-summary");
    await expect(summary).toContainText("2 email belum dibalas", {
      timeout: 20000,
    });
    await expect(summary).toContainText("85 rata-rata skor dari sesi terakhir");
    await expect(summary).toContainText("1 sedang ditelaah AI");
    await expect(page.getByTestId(/^pdkt-stat-/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Belum ada latihan" }),
    ).toHaveCount(0);

    const unreplied = page.getByRole("region", { name: "Belum dibalas" });
    const rows = unreplied.getByRole("button", { name: /Transaksi gagal/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(OPEN_MAIL.list.subject);
    await expect(rows.nth(1)).toContainText(NEWER_OPEN_MAIL.list.subject);

    // Aspek terendah EVALUATED_HISTORY adalah Kualitas OJK (80).
    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Kualitas OJK");
    await expect(focus).toContainText("80");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    await expect(recent.getByRole("row")).toHaveCount(2); // header + 1 sesi
    await expect(recent).toContainText(REPLIED_MAIL.list.subject);
    await expect(recent).toContainText("85");

    // Membuka email terlama: kotak masuk terbuka dengan email itu terpilih,
    // bukan email pertama yang dipilih otomatis.
    await rows.nth(0).click();
    await enterWorkspace(page);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    expect(
      audit.mockedApi.some((entry) =>
        entry.endsWith(`/pdkt/mailbox/${NEWER_OPEN_MAIL.list.id}`),
      ),
      "email lain tidak boleh dibuka lebih dulu",
    ).toBe(false);
    expectHermetic(audit);
  });

  test("animasi tahap PDKT bisa dijeda", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible({ timeout: 20000 });
    // Tombol jeda 44px harus muat di bar judulnya (h-11 hanya 38,5px di root
    // 14px), bukan menonjol keluar bar.
    // Ukuran layout (offset*), bukan boundingBox: animasi masuk halaman memakai
    // transform sehingga posisi visual bisa bergeser selama diukur.
    const fit = await pause.evaluate((button: HTMLElement) => ({
      button: button.offsetHeight,
      bar: (button.parentElement as HTMLElement).offsetHeight,
      top: button.offsetTop - (button.parentElement as HTMLElement).offsetTop,
    }));
    expect(fit.button).toBeGreaterThanOrEqual(44);
    expect(fit.bar).toBeGreaterThanOrEqual(fit.button);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Putar animasi" }),
    ).toBeVisible();
    await expect(page.getByTestId("pdkt-stage-demo")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expectHermetic(audit);
  });

  test("Pengaturan memakai menu, daftar skenario, dan penanda perubahan baru", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/settings",
          body: { success: true, data: SAVED_SETTINGS },
          headers: { "x-settings-version": "absent" },
        },
        ...pdktMocks([]).filter(
          (mock) => mock.path !== "/api/v1/pdkt/settings",
        ),
      ],
    });
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/settings"]);

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pengaturan PDKT" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(
      dialog.getByText("Berlaku untuk sesi yang Anda mulai berikutnya."),
    ).toBeVisible();
    for (const tab of [
      /^Skenario/,
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Gaya & AI/,
    ]) {
      await expect(dialog.getByRole("tab", { name: tab })).toBeVisible();
    }

    const companyRow = dialog.getByRole("listitem").filter({
      hasText: COMPANY_SCENARIO.title,
    });
    await expect(companyRow).toContainText("Pembiayaan");
    await expect(companyRow).toContainText("Hanya tembusan ke OJK");
    await expect(companyRow).toContainText("Dibuat AI");
    const ojkRow = dialog.getByRole("listitem").filter({
      hasText: OJK_SCENARIO.title,
    });
    await expect(ojkRow).toContainText("Langsung ke OJK");
    await expect(ojkRow).toContainText("Email tetap");

    // Filter kategori dan pencarian menyaring daftar tanpa mengubah data.
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Asuransi" })
      .click();
    await expect(companyRow).toHaveCount(0);
    await expect(ojkRow).toBeVisible();
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Semua" })
      .click();
    await dialog
      .getByRole("searchbox", { name: "Cari skenario" })
      .fill("lunas");
    await expect(ojkRow).toHaveCount(0);
    await expect(companyRow).toBeVisible();

    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);
    const toggle = companyRow.getByRole("switch", {
      name: `Nonaktifkan ${COMPANY_SCENARIO.title}`,
    });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(
      companyRow.getByRole("switch", {
        name: `Aktifkan ${COMPANY_SCENARIO.title}`,
      }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    // Karakter konsumen: daftar baris dengan pilihan "Acak", bukan kartu.
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(dialog).toContainText("Pilih Acak agar peserta");
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Karakter baru" }),
    ).toBeVisible();

    await dialog.getByRole("tab", { name: /^Gaya & AI/ }).click();
    await expect(
      dialog.getByRole("switch", { name: "Gambar lampiran" }),
    ).toBeVisible();

    // Menutup dengan perubahan belum disimpan meminta konfirmasi lewat dialog
    // aplikasi, bukan `window.confirm`.
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Tutup tanpa menyimpan?",
    });
    await expect(discard).toBeVisible();
    await expect(discard).toContainText(
      "Perubahan yang belum disimpan akan hilang.",
    );
    await discard.getByRole("button", { name: "Lanjut mengubah" }).click();
    await expect(discard).toHaveCount(0);
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Tutup tanpa menyimpan?" })
      .getByRole("button", { name: "Buang perubahan" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Pulihkan bawaan meminta konfirmasi sebelum menyimpan", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    const posts = () =>
      audit.mockedApi.filter((call) =>
        call.startsWith("POST /api/v1/pdkt/settings"),
      ).length;

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Pulihkan pengaturan bawaan?",
    });
    await expect(confirm).toContainText("langsung disimpan");
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    expect(posts()).toBe(0);

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    await page
      .getByRole("dialog", { name: "Pulihkan pengaturan bawaan?" })
      .getByRole("button", { name: "Pulihkan bawaan" })
      .click();
    await expect.poll(posts, { timeout: 20000 }).toBe(1);

    expectHermetic(audit);
  });

  test("Riwayat membuka halaman riwayat, bukan modal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Riwayat/ })
      .click();

    await expect(page).toHaveURL(/\/pdkt\/history$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Belum ada sesi latihan")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Mulai simulasi" }),
    ).toHaveAttribute("href", "/pdkt");

    expectHermetic(audit);
  });

  test("Pemakaian AI membuka popover rincian bulan ini", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        { ...USAGE_SUMMARY_MOCK, body: { success: true, data: PDKT_USAGE } },
        ...pdktMocks([]).filter((mock) => mock.path !== USAGE_SUMMARY_PATH),
      ],
    });

    const trigger = page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const popover = page.getByRole("dialog", {
      name: "Pemakaian AI · Oktober 2026",
    });
    await expect(popover).toBeVisible({ timeout: 20000 });
    await expect(popover.getByText(/^Rp\s?48\.320$/)).toBeVisible();
    await expect(popover.getByText("74 permintaan AI")).toBeVisible();

    // Rincian per jenis permintaan memakai bahasa peserta, bukan nama action.
    const rows = popover.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Menelaah balasan");
    await expect(rows.nth(0)).toContainText(/Rp\s?26\.920/);
    await expect(rows.nth(1)).toContainText("Membuat email konsumen");
    await expect(rows.nth(1)).toContainText(/Rp\s?21\.400/);
    await expect(
      popover.getByText("Perkiraan biaya dari pemakaian AI."),
    ).toBeVisible();

    // Popover kecil, bukan modal lama dengan kartu token.
    for (const stale of [
      "Total Tokens",
      "Input Tokens",
      "Pemakaian Bulan Ini",
    ]) {
      await expect(page.getByText(stale)).toHaveCount(0);
    }
    const box = await popover.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(380);

    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await waitForMockedApi(audit, [USAGE_SUMMARY_PATH]);
    expectHermetic(audit);
  });

  test("popover Pemakaian AI muat di layar ponsel dan bisa dicoba lagi saat gagal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          ...USAGE_SUMMARY_MOCK,
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: "Server sedang sibuk." },
          },
        },
        ...pdktMocks([]).filter((mock) => mock.path !== USAGE_SUMMARY_PATH),
      ],
    });

    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click();

    const popover = page.getByRole("dialog", { name: /^Pemakaian AI/ });
    await expect(
      popover.getByText("Data pemakaian belum bisa dimuat."),
    ).toBeVisible({ timeout: 20000 });
    const box = await popover.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(390);

    // Coba lagi meminta ulang ringkasan.
    const before = audit.mockedApi.filter((url) =>
      url.includes(USAGE_SUMMARY_PATH),
    ).length;
    await popover.getByRole("button", { name: "Coba lagi" }).click();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter((url) => url.includes(USAGE_SUMMARY_PATH))
            .length,
      )
      .toBeGreaterThan(before);

    expectHermetic(audit);
  });

  test("Mulai simulasi membuka workspace mailbox", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();

    // Dua jalur produk yang sah, tergantung apakah profil sudah termuat saat
    // diklik: `canPickParticipant` true → picker peserta muncul dulu, false →
    // view langsung berpindah. Keduanya harus berakhir di workspace mailbox.
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    const mailboxEmpty = page.getByText(/Pilih email dari kotak masuk/);

    await expect
      .poll(
        async () =>
          (await picker.isVisible()) || (await mailboxEmpty.isVisible()),
        { timeout: 20000 },
      )
      .toBe(true);

    if (await picker.isVisible()) {
      // "Diri sendiri" sudah terpilih secara default.
      await picker.getByRole("button", { name: "Mulai" }).click();
    }

    await expect(mailboxEmpty).toBeVisible({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
  test("halaman Riwayat merangkum, menyaring, dan mencari sesi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });
    // Ringkasan berupa kalimat, bukan kartu metrik.
    await expect(page.getByTestId("pdkt-history-summary")).toHaveText(
      "4 sesi · 1 ditelaah · rata-rata skor 85",
    );

    const table = page.getByRole("table", { name: "Daftar sesi PDKT" });
    const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(rows).toHaveCount(4);
    const evaluated = rows.filter({ hasText: REPLIED_MAIL.list.subject });
    await expect(evaluated.getByTestId("pdkt-history-score")).toHaveText("85");
    await expect(rows.filter({ hasText: "Saldo belum kembali" })).toContainText(
      "Sedang ditelaah",
    );
    await expect(rows.filter({ hasText: "Kartu terblokir" })).toContainText(
      "Telaah gagal",
    );
    // Peserta yang datanya sudah dihapus: nama snapshot + catatan biasa.
    const removed = rows.filter({ hasText: "Andi" });
    await expect(removed).toContainText("data peserta sudah dihapus");
    await expect(removed).toContainText("Belum ditelaah");
    await expect(page.getByText(/record peserta/)).toHaveCount(0);
    await expect(page.getByText(/Target:|Pelaksana:|Export CSV/)).toHaveCount(
      0,
    );

    // Filter status.
    const filters = page.getByRole("group", { name: "Saring status" });
    await filters.getByRole("button", { name: /^Ditelaah/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(REPLIED_MAIL.list.subject);
    await filters.getByRole("button", { name: /^Semua/ }).click();
    await expect(rows).toHaveCount(4);

    // Pencarian subjek atau peserta.
    const search = page.getByRole("searchbox", { name: "Cari sesi" });
    await search.fill("kartu");
    await expect(rows).toHaveCount(1);
    await search.fill("tidak ada yang cocok");
    await expect(page.getByText("Tidak ada sesi yang cocok.")).toBeVisible();
    await page.getByRole("button", { name: "Reset filter" }).click();
    await expect(search).toHaveValue("");
    await expect(rows).toHaveCount(4);

    await expect(page.getByRole("button", { name: "Unduh CSV" })).toBeVisible();
    expectHermetic(audit);
  });

  test("Riwayat membuka sesi yang ditelaah di tahap Telaah", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });

    const link = page
      .getByRole("table", { name: "Daftar sesi PDKT" })
      .getByRole("link", { name: REPLIED_MAIL.list.subject });
    await expect(link).toHaveAttribute(
      "href",
      "/pdkt?ruang=1&sesi=pdkt-evaluated-1&dari=riwayat",
      {
        timeout: 20000,
      },
    );
    await link.click();

    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
      { timeout: 20000 },
    );
    // Parameter sesi bertahan agar reload membuka telaah yang sama.
    await expectSearch(page, { sesi: "pdkt-evaluated-1", dari: "riwayat" });
    await expect(
      page
        .getByRole("region", { name: "Ringkasan skor" })
        .getByTestId("pdkt-review-score"),
    ).toHaveText("85");

    expectHermetic(audit);
  });

  test("Riwayat menghapus sesi lewat dialog konfirmasi", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "DELETE",
          path: "/api/v1/pdkt/history/pdkt-processing-1",
          body: { success: true, data: null },
        },
        ...pdktMocks(HISTORY_PAGE_SESSIONS),
      ],
    });

    const row = page
      .getByRole("row")
      .filter({ hasText: "Saldo belum kembali" });
    await row
      .getByRole("button", { name: "Hapus sesi Saldo belum kembali" })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Hapus sesi ini?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(1);
    expect(audit.mockedApi.filter((call) => call.startsWith("DELETE"))).toEqual(
      [],
    );

    await row
      .getByRole("button", { name: "Hapus sesi Saldo belum kembali" })
      .click();
    await page
      .getByRole("dialog", { name: "Hapus sesi ini?" })
      .getByRole("button", { name: "Hapus sesi" })
      .click();
    await waitForMockedApi(audit, [
      "DELETE /api/v1/pdkt/history/pdkt-processing-1",
    ]);
    await expect(row).toHaveCount(0);

    expectHermetic(audit);
  });

  test("Riwayat menghapus semua sesi lewat dialog konfirmasi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "DELETE",
          path: "/api/v1/pdkt/history",
          body: { success: true, data: null },
        },
        ...pdktMocks(HISTORY_PAGE_SESSIONS),
      ],
    });

    await page
      .getByRole("button", { name: "Hapus semua riwayat" })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Hapus semua riwayat?" });
    await expect(dialog).toContainText("4 sesi");
    await dialog.getByRole("button", { name: "Hapus semua" }).click();
    await waitForMockedApi(audit, ["DELETE /api/v1/pdkt/history"]);
    await expect(page.getByText("Belum ada sesi latihan")).toBeVisible();
    await expect(page.getByTestId("pdkt-history-summary")).toHaveCount(0);

    expectHermetic(audit);
  });

  test("tautan sesi yang tidak ada lagi memberi tahu dan tetap di landing", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt?sesi=sesi-yang-sudah-dihapus",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });

    await expect(
      page.getByText("Sesi itu tidak ada lagi di riwayat Anda."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/pdkt$/);
    await expect(
      page.getByRole("navigation", { name: "Menu PDKT" }),
    ).toBeVisible();
    await expect(stageNav(page)).toHaveCount(0);

    expectHermetic(audit);
  });

  test("Riwayat yang gagal dimuat bisa dicoba lagi dan muat di ponsel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/history",
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: "Server sedang sibuk." },
          },
        },
        ...pdktMocks([]).filter((mock) => mock.path !== "/api/v1/pdkt/history"),
      ],
    });

    await expect(page.getByText("Riwayat belum bisa dimuat.")).toBeVisible({
      timeout: 20000,
    });
    const before = audit.mockedApi.filter((call) =>
      call.endsWith("/api/v1/pdkt/history?view=list"),
    ).length;
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter((call) =>
            call.endsWith("/api/v1/pdkt/history?view=list"),
          ).length,
      )
      .toBeGreaterThan(before);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    expectHermetic(audit);
  });

  test("tabel Riwayat tidak menggeser layar ponsel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS),
    });
    await expect(page.getByTestId("pdkt-history-summary")).toBeVisible({
      timeout: 20000,
    });
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return Math.max(
        document.documentElement.scrollWidth - window.innerWidth,
        main.scrollWidth - main.clientWidth,
      );
    });
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await findTextBelowFloor(page.locator("main").first())).toEqual([]);
    expectHermetic(audit);
  });

  test("tombol Mulai simulasi PDKT memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    const start = page.getByRole("button", { name: /^Mulai simulasi/ }).first();
    await expect(start).toBeVisible({ timeout: 20000 });

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator(".."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing PDKT minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }).first(),
    ).toBeVisible({ timeout: 20000 });

    // Ilustrasi tiga tahap (aria-hidden) meniru layar kotak masuk pada skala
    // kecil; ia ilustrasi, bukan teks UI yang dibaca.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="pdkt-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("panel email tidak menampilkan penerima email kepada peserta", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([], [OPEN_MAIL]),
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await enterWorkspace(page);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);

    // Isi email tampil; penerima (arah balasan) tidak.
    const main = page.locator("main").first();
    await expect(
      main.getByText(OPEN_MAIL.detail.inbound_email.body).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(main.getByText(/Kepada:/)).toHaveCount(0);
    await expect(main.getByText(OPEN_MAIL.detail.inbound_email.to)).toHaveCount(
      0,
    );
    await expect(main.getByText("konsumen@ojk.go.id")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("menghapus email memakai dialog konfirmasi, bukan window.confirm", async ({
    page,
  }) => {
    const deletePath = `/api/v1/pdkt/mailbox/${OPEN_MAIL.list.id}`;
    const audit = await openWorkspace(page, [
      {
        method: "DELETE",
        path: deletePath,
        body: { success: true, data: null },
      },
      ...pdktMocks([], [OPEN_MAIL]),
    ]);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    const deletes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE") deletes.push(request.url());
    });

    const deleteButton = page.getByRole("button", {
      name: "Hapus email",
      exact: true,
    });
    await deleteButton.click();
    const confirm = page.getByRole("dialog", { name: "Hapus email ini?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    expect(deletes, "Batal tidak boleh menghapus").toEqual([]);

    await deleteButton.click();
    const deleted = page.waitForRequest(
      (request) =>
        request.method() === "DELETE" && request.url().endsWith(deletePath),
    );
    await page
      .getByRole("dialog", { name: "Hapus email ini?" })
      .getByRole("button", { name: "Hapus email" })
      .click();
    await deleted;
    await expect(
      page.getByRole("dialog", { name: "Hapus email ini?" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("kotak masuk yang gagal dimuat menyembunyikan galat server dan bisa kembali", async ({
    page,
  }) => {
    const rawError = "relation pdkt_mailbox_items does not exist";
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/mailbox",
          status: 500,
          body: {
            success: false,
            error: { code: "DATABASE_ERROR", message: rawError },
          },
        },
        ...pdktMocks([]),
      ],
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    const workspaceTitle = page.getByRole("heading", {
      level: 1,
      name: "Simulasi PDKT",
    });
    await enterWorkspace(page, workspaceTitle);

    const problem = page
      .getByRole("alert")
      .filter({ hasText: "Kotak masuk belum bisa dimuat" });
    await expect(problem).toBeVisible({ timeout: 20000 });
    await expect(problem).toContainText(
      "Periksa koneksi Anda, lalu coba lagi.",
    );
    await expect(
      problem.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(page.getByText(rawError)).toHaveCount(0);

    // Bukan jalan buntu: header ruang kerja tetap punya tombol kembali.
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami keluhannya\.\s*Balas dengan tepat\./,
      }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("balasan yang gagal terkirim memakai pesan PDKT, bukan teks server", async ({
    page,
  }) => {
    const rawError = "Email mailbox tidak ditemukan.";
    const audit = await openWorkspace(page, [
      {
        method: "POST",
        path: "/api/v1/pdkt/mailbox/reply",
        status: 404,
        body: {
          success: false,
          error: { code: "NOT_FOUND", message: rawError },
        },
      },
      ...pdktMocks([], [OPEN_MAIL]),
    ]);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await page.getByRole("button", { name: "Tulis balasan" }).click();
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await compose.getByLabel("Balasan Anda").fill("Kami cek transaksi Ibu.");
    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan" })
      .click();

    await expect(
      page.getByText("Email ini sudah dihapus dan tidak bisa dibalas."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(rawError)).toHaveCount(0);
    // Balasan tetap di editor; tidak ada yang hilang.
    await expect(compose.getByLabel("Balasan Anda")).toHaveValue(
      "Kami cek transaksi Ibu.",
    );

    // Balasan gagal tidak memakai AI: popover tidak boleh tertahan "masih dihitung".
    await page.getByRole("button", { name: "Kembali ke email" }).click();
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pemakaian AI/ })
      .click();
    const usage = page.getByRole("dialog", { name: /^Pemakaian AI/ });
    await expect(usage.getByText(/^Rp\s?50\.000$/)).toBeVisible({
      timeout: 20000,
    });
    await expect(usage.getByText(/masih dihitung/)).toHaveCount(0);
    expectHermetic(audit);
  });

  test("dialog Buat email baru tidak menampilkan ringkasan skenario email tetap", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, [
      {
        method: "GET",
        path: "/api/v1/pdkt/settings",
        body: { success: true, data: SAVED_SETTINGS },
        headers: { "x-settings-version": "absent" },
      },
      ...pdktMocks([], [OPEN_MAIL]).filter(
        (mock) => mock.path !== "/api/v1/pdkt/settings",
      ),
    ]);
    await page.getByRole("button", { name: "Email baru", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Buat email baru" });
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Skenario email tetap: judul dan kategori saja. Ringkasannya disalin dari
    // isi email, jadi peserta tidak boleh membacanya sebelum mulai.
    const fixed = dialog.getByRole("button", {
      name: new RegExp(OJK_SCENARIO.title),
    });
    await expect(fixed).toContainText("Asuransi · Email tetap");
    await expect(dialog.getByText(OJK_SCENARIO.description)).toHaveCount(0);

    const generated = dialog.getByRole("button", {
      name: new RegExp(COMPANY_SCENARIO.title),
    });
    await expect(generated).toContainText("Pembiayaan · Dibuat AI");
    await expect(generated).toContainText(COMPANY_SCENARIO.description);
    expectHermetic(audit);
  });

  test("editor skenario satu halaman mengubah kasus, arah balasan, dan kunci jawaban", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: `Ubah ${COMPANY_SCENARIO.title}` })
      .click({ timeout: 20000 });

    // Satu halaman: tiga bagian bernomor tampil bersamaan, tanpa langkah "Lanjut".
    await expect(
      dialog.getByRole("heading", { name: "Ubah skenario" }),
    ).toBeVisible();
    for (const section of ["Kasus", "Arah balasan", "Kunci jawaban"]) {
      await expect(dialog.getByRole("region", { name: section })).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Lanjut" })).toHaveCount(0);

    const title = dialog.getByLabel(/^Judul skenario/);
    await expect(title).toHaveValue(COMPANY_SCENARIO.title);
    await title.fill("Pinjaman lunas tetapi masih ditelepon penagih");

    const direction = dialog.getByRole("radiogroup", { name: "Arah balasan" });
    await expect(
      direction.getByRole("radio", { name: /Hanya tembusan ke OJK/ }),
    ).toBeChecked();
    await direction
      .getByRole("radio", { name: /Tembusan, tetapi meminta bantuan OJK/ })
      .check();
    // Petunjuk kunci jawaban mengikuti arah yang dipilih.
    const answer = dialog.getByRole("region", { name: "Kunci jawaban" });
    await expect(answer).toContainText("bukan sekadar ucapan terima kasih");
    await answer
      .getByRole("textbox", { name: "Kunci jawaban" })
      .fill("Minta bukti pelunasan dan jelaskan tindak lanjut OJK.");

    await dialog.getByRole("button", { name: "Terapkan perubahan" }).click();
    const row = dialog.getByRole("listitem").filter({
      hasText: "Pinjaman lunas tetapi masih ditelepon penagih",
    });
    await expect(row).toContainText("Tembusan, tetapi meminta bantuan OJK");

    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/pdkt/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as {
      settings: { scenarios: Array<Record<string, unknown>> };
    };
    expect(
      saved.settings.scenarios.find((item) => item.id === COMPANY_SCENARIO.id),
    ).toMatchObject({
      title: "Pinjaman lunas tetapi masih ditelepon penagih",
      primaryRecipientType: "reported_company",
      ojkRequestInBody: true,
      expectedAnswer: "Minta bukti pelunasan dan jelaskan tindak lanjut OJK.",
    });
    expectHermetic(audit);
  });

  test("skenario baru divalidasi dan bisa memakai email tulisan sendiri", async ({
    page,
  }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: "Skenario baru" })
      .click({ timeout: 20000 });
    await expect(
      dialog.getByRole("heading", { name: "Skenario baru" }),
    ).toBeVisible();

    // Kosong: tidak tersimpan, pesan muncul, fokus ke isian pertama yang salah.
    await dialog.getByRole("button", { name: "Tambahkan skenario" }).click();
    await expect(dialog.getByText("Judul skenario wajib diisi.")).toBeVisible();
    await expect(dialog.getByLabel(/^Judul skenario/)).toBeFocused();

    await dialog
      .getByLabel(/^Judul skenario/)
      .fill("Klaim ditolak tanpa alasan");
    await dialog.getByLabel(/^Kategori/).selectOption("Asuransi");
    const mode = dialog.getByRole("radiogroup", {
      name: "Isi email dibuat oleh",
    });
    await mode
      .getByRole("radio", { name: "Ditulis sendiri (email tetap)" })
      .click();
    // Mode tulis sendiri mengganti ringkasan dengan isi email.
    await expect(dialog.getByLabel(/^Ringkasan masalah/)).toHaveCount(0);
    await dialog
      .getByRole("textbox", { name: /^Subjek email/ })
      .fill("Klaim saya ditolak");
    await dialog
      .getByRole("textbox", { name: /^Isi email/ })
      .fill("Selamat siang, klaim mobil saya ditolak tanpa penjelasan.");

    await dialog.getByRole("button", { name: "Tambahkan skenario" }).click();
    const row = dialog.getByRole("listitem").filter({
      hasText: "Klaim ditolak tanpa alasan",
    });
    await expect(row).toContainText("Asuransi");
    await expect(row).toContainText("Email tetap");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();
    expectHermetic(audit);
  });

  test("skenario dihapus dari editor setelah konfirmasi", async ({ page }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: `Ubah ${OJK_SCENARIO.title}` })
      .click({ timeout: 20000 });
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });
    await dialog.getByRole("button", { name: "Hapus skenario" }).click();
    const confirmDelete = page.getByRole("dialog", {
      name: "Hapus skenario ini?",
    });
    await expect(confirmDelete).toBeVisible();
    await expect(confirmDelete).toContainText(
      "Perubahan berlaku setelah Anda memilih Simpan.",
    );
    await confirmDelete.getByRole("button", { name: "Hapus skenario" }).click();
    await expect(confirmDelete).toHaveCount(0);

    await expect(
      dialog.getByRole("heading", { name: "Skenario", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("listitem").filter({ hasText: OJK_SCENARIO.title }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("listitem").filter({ hasText: COMPANY_SCENARIO.title }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap Pahami: kotak masuk, navigasi tahap, dan panel baca", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
    );

    await expect(
      page.getByRole("heading", { name: "Kotak masuk", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Email baru", exact: true }),
    ).toBeVisible();
    const filters = page.getByRole("group", { name: "Saring email" });
    await expect(filters.getByRole("button")).toHaveText([
      "Semua",
      "Belum dibalas · 1",
      "Dibalas",
    ]);
    await expect(
      page.getByPlaceholder("Cari pengirim atau subjek"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Menu lainnya" }).click();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Riwayat",
      "Pengaturan",
      "Pilih beberapa",
    ]);
    await page.keyboard.press("Escape");

    // Filter bawaan "Belum dibalas" memilih email terbuka: tahap Pahami.
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    const nav = stageNav(page);
    await expect(nav.locator('[aria-current="step"]')).toHaveText(/Pahami/);
    await expect(nav).toContainText("Telaah terbuka setelah balasan dikirim");
    await expect(nav.getByRole("button", { name: /Telaah/ })).toHaveCount(0);

    const reading = page.getByRole("article");
    await expect(
      reading.getByRole("heading", { name: OPEN_MAIL.list.subject }),
    ).toBeVisible({ timeout: 20000 });
    await expect(reading).toContainText(OPEN_MAIL.detail.inbound_email.body);
    await expect(reading).toContainText("rina@local.test");
    await expect(reading.getByText("Lampiran (1)")).toBeVisible();
    // Header menjelaskan pembuat email, bukan peserta yang membalas nanti.
    await expect(
      page.getByText("Pembuat email: Siti Aminah · Trainer"),
    ).toBeVisible();
    await expect(
      reading.getByRole("button", { name: "Lampiran 1" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toBeVisible();

    // Baris yang sudah dibalas menampilkan skor; memilih filter tidak membuka
    // Telaah dengan sendirinya.
    await filters.getByRole("button", { name: "Dibalas", exact: true }).click();
    const repliedRow = page.getByRole("button", {
      name: new RegExp(REPLIED_MAIL.list.subject),
    });
    await expect(repliedRow).toContainText("Skor 85");
    await expect(page.getByText(/Pilih email dari kotak masuk/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Balasan untuk/ }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("lampiran yang tersimpan di Storage tampil sebagai tautan, gambar dan PDF", async ({
    page,
  }) => {
    const storage = `${E2E_SUPABASE_URL}/storage/v1/object/public/scenario-attachments`;
    const imageUrl = `${storage}/${"a".repeat(64)}.png`;
    const pdfUrl = `${storage}/${"b".repeat(64)}.pdf`;
    const mail = structuredClone(OPEN_MAIL);
    mail.detail.inbound_email.attachments = [imageUrl, pdfUrl];
    mail.detail.emails_thread = [mail.detail.inbound_email];
    await page.addInitScript(() => {
      (window as unknown as { openedUrls: string[] }).openedUrls = [];
      window.open = ((url?: string | URL) => {
        (window as unknown as { openedUrls: string[] }).openedUrls.push(
          String(url),
        );
        return null;
      }) as typeof window.open;
    });
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(EVALUATED_HISTORY, [mail]),
    });
    const served: string[] = [];
    await page.route(`${storage}/**`, (route) => {
      served.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(PIXEL_PNG.split(",")[1], "base64"),
      });
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await enterWorkspace(page);

    const reading = page.getByRole("article");
    await expect(reading.getByText("Lampiran (2)")).toBeVisible({
      timeout: 20000,
    });
    const image = reading.getByRole("button", {
      name: "Lampiran 1",
      exact: true,
    });
    await expect(image.locator("img")).toHaveAttribute("src", imageUrl);
    await expect
      .poll(() => image.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
    await image.click();
    await expect(
      page.getByRole("dialog", { name: "Pratinjau lampiran" }).locator("img"),
    ).toHaveAttribute("src", imageUrl);
    await page.getByRole("button", { name: "Tutup pratinjau lampiran" }).click();

    await reading.getByRole("button", { name: "Lampiran 2 (PDF)" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { openedUrls: string[] }).openedUrls,
        ),
      )
      .toEqual([pdfUrl]);
    expect(served).toContain(imageUrl);
    expectHermetic(audit);
  });

  test("tahap Tanggapi: tulis, konfirmasi, kirim, lalu kembali ke kotak masuk", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, [
      ...pdktMocks([], [OPEN_MAIL]),
      {
        method: "POST",
        path: "/api/v1/pdkt/mailbox/reply",
        body: { success: true, data: { historyId: "pdkt-new-1" } },
      },
    ]);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await page.getByRole("button", { name: "Tulis balasan" }).click();

    // Layar fokus: daftar email disembunyikan, email konsumen tetap terlihat.
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Tanggapi/,
    );
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toHaveCount(0);
    const email = page.getByRole("region", { name: "Email konsumen" });
    await expect(email).toContainText(OPEN_MAIL.detail.inbound_email.body);
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await expect(compose).toContainText(`Re: ${OPEN_MAIL.list.subject}`);

    const replyText = "Kami akan cek transaksi Ibu hari ini.";
    await compose.getByLabel("Balasan Anda").fill(replyText);
    await expect(compose).toContainText("7 kata");

    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Kirim balasan sekarang?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Periksa lagi" }).click();
    await expect(confirm).toHaveCount(0);

    // Setelah terkirim, server melaporkan email sudah dibalas dan sedang dinilai.
    const replied = mailboxItem(OPEN_MAIL.list.id, "replied", {
      history_id: "pdkt-new-1",
    });
    await overrideJson(page, "**/api/v1/pdkt/mailbox", [replied.list]);
    await overrideJson(
      page,
      `**/api/v1/pdkt/mailbox/${OPEN_MAIL.list.id}`,
      replied.detail,
    );
    await overrideJson(page, "**/api/v1/pdkt/history", [
      {
        id: "pdkt-new-1",
        timestamp: MAIL_AT,
        config: SESSION_CONFIG,
        emails: [],
        evaluation: null,
        evaluation_status: "processing",
      },
    ]);
    await overrideJson(page, /\/api\/v1\/pdkt\/history\/eval\//, {
      evaluation_status: "processing",
      evaluation: null,
      evaluation_error: null,
    });

    // Tab Dibalas tidak boleh aktif sesaat pun selama kembali ke kotak masuk.
    await page.evaluate(() => {
      const w = window as Window & { sawRepliedTab?: boolean };
      w.sawRepliedTab = false;
      new MutationObserver(() => {
        for (const button of document.querySelectorAll(
          'button[aria-pressed="true"]',
        )) {
          if (button.textContent?.trim() === "Dibalas") w.sawRepliedTab = true;
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-pressed"],
      });
    });
    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/pdkt/mailbox/reply"),
    );
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim balasan" })
      .click();
    const body = (await sent).postDataJSON();
    expect(body.mailboxId).toBe(OPEN_MAIL.list.id);
    expect(body.reply.body).toBe(replyText);

    await expectSearch(page, { ruang: "1", email: null, tahap: null });
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Belum dibalas/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(
      page.getByText(
        "Balasan terkirim dan sedang ditelaah AI. Buka dari tab Dibalas kapan saja.",
      ),
    ).toBeVisible();
    await expect(reviewHeading(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as Window & { sawRepliedTab?: boolean }).sawRepliedTab,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(replied.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();

    // Penilaian selesai saat agent kembali ke daftar tanpa seleksi.
    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await page.getByRole("button", { name: /^Belum dibalas/ }).click();
    await expectSearch(page, { ruang: "1", email: null, tahap: null });
    await overrideJson(page, "**/api/v1/ai/usage/summary**", PDKT_USAGE);
    await overrideJson(page, "**/api/v1/pdkt/history", [
      { ...EVALUATED_HISTORY[0], id: "pdkt-new-1" },
    ]);
    await overrideJson(page, /\/api\/v1\/pdkt\/history\/eval\//, {
      evaluation_status: "completed",
      evaluation: EVALUATED_HISTORY[0].evaluation,
      evaluation_error: null,
    });
    await expect(page.getByText(/^Pemakaian AI:/)).toBeVisible({
      timeout: 15000,
    });
    await expectSearch(page, { email: null });
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(replied.list.subject) }),
    ).toContainText("Skor 85");
    expectHermetic(audit);
  });

  test("tahap Telaah: skor, rincian, catatan bernomor, dan contoh balasan", async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("net::ERR_FAILED")
      )
        runtimeErrors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reply = "Terima kasih, kami cek transaksinya.";
    const matchedQuote = "kami cek transaksinya";
    const start = reply.indexOf(matchedQuote);
    const inboundBody =
      "Saldo terpotong tetapi transaksi gagal.\n\nKapan saldo kembali? Mohon nomor tiket.";
    const consumerPoints = [
      {
        quote: "Kapan saldo kembali?",
        summary: "Waktu pengembalian saldo",
        status: "partial",
        reason: "Belum ada batas waktu.",
        start: inboundBody.indexOf("Kapan"),
        end: inboundBody.indexOf("Kapan") + "Kapan saldo kembali?".length,
        replyQuote: "kami",
        replyEnd: start + 4,
      },
      {
        quote: "Saldo terpotong tetapi transaksi gagal.",
        summary: "Transaksi gagal",
        status: "answered",
        reason: null,
        start: 0,
        end: "Saldo terpotong tetapi transaksi gagal.".length,
        replyQuote: "kami",
        replyEnd: start + 4,
      },
      {
        quote: "Mohon nomor tiket.",
        summary: "Nomor tiket pengaduan",
        status: "unanswered",
        reason: "Nomor tiket belum diberikan.",
        start: inboundBody.indexOf("Mohon"),
        end: inboundBody.length,
        replyQuote: null,
        replyEnd: null,
      },
      {
        quote: "Mohon status laporan.",
        summary: "Status laporan",
        status: "unanswered",
        reason: "Status belum diberikan.",
        start: null,
        end: null,
        replyQuote: null,
        replyEnd: null,
      },
    ];
    const base = EVALUATED_HISTORY[0].evaluation as Record<string, unknown>;
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...base,
          consumerPoints,
          scoreBreakdown: {
            recipientDirectionScore: 90,
            normativeResponseScore: 70,
            clarityScore: 85,
            typoScore: 88,
            templateComplianceScore: 82,
          },
          edu: {
            dimensionTips: {
              normative: "Tuliskan batas waktu tindak lanjut.",
              clarity: "Pecah kalimat panjang meski skor kejelasan tinggi.",
            },
            dimensionExplanations: {
              clarity: {
                reason:
                  "Pembuka jelas tetapi kalimat tindak lanjut terlalu panjang.",
                quote: matchedQuote,
              },
            },
            actionItems: [
              {
                dimension: "normative",
                text: "Sebut kanal pengaduan resmi.",
                example: "Silakan hubungi 157.",
                quote: matchedQuote,
                priorityRank: 1,
              },
              {
                dimension: "clarity",
                text: "Pecah kalimat pembuka.",
                priorityRank: 2,
              },
            ],
            suggestedRewrite: {
              body: "Terima kasih, kami cek transaksi Ibu.",
              highlights: ["transaksi Ibu"],
            },
          },
          expectedAnswerAlignment: {
            category: "Hampir sesuai",
            reason: "Solusi benar tetapi tanpa batas waktu.",
          },
          annotations: [
            {
              quote: matchedQuote,
              dimension: "normative",
              note: "Tambahkan pengantar sebelum masuk ke topik transaksi.",
              kind: "transition",
              example: "Selanjutnya, terkait transaksi Ibu, …",
              start,
              end: start + matchedQuote.length,
            },
            {
              quote: "nomor tiket pengaduan",
              dimension: "clarity",
              note: "Tambahkan nomor tiket supaya konsumen bisa menindaklanjuti.",
              start: null,
              end: null,
            },
          ],
        },
      },
    ] as unknown as SessionHistory[];
    const reviewedMail = {
      ...REPLIED_MAIL,
      detail: {
        ...REPLIED_MAIL.detail,
        inbound_email: {
          ...REPLIED_MAIL.detail.inbound_email,
          body: inboundBody,
        },
      },
    };
    const audit = await openWorkspace(page, pdktMocks(history, [reviewedMail]));

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);

    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Kotak masuk" }),
    ).toHaveCount(0);
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );

    const summary = page.getByRole("region", { name: "Ringkasan skor" });
    await expect(summary.getByTestId("pdkt-review-score")).toHaveText("85");
    await expect(summary).toContainText("Perbaiki ini dulu");
    await expect(summary).toContainText("Sebut kanal pengaduan resmi.");
    await expect(summary).toContainText("Silakan hubungi 157.");
    await expect(summary).toContainText("Aspek: Kualitas OJK");
    await expect(summary).toContainText("Pecah kalimat pembuka.");
    // Langkah perbaikan menunjuk kalimatnya di balasan tanpa perlu menggulir
    // mencari sendiri; langkah tanpa kutipan tidak diberi tautan.
    await expect(summary).toContainText(`Di balasan Anda: “${matchedQuote}”`);
    await expect(
      summary.getByRole("link", { name: "Lihat kalimat ini di balasan" }),
    ).toHaveCount(1);
    await expect(summary).toContainText("Hampir sesuai");
    await expect(summary).toContainText("3 menit 45 detik");

    const breakdown = page.getByRole("region", { name: "Rincian skor" });
    const rows = breakdown.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Arah penerima");
    await expect(rows.nth(0)).toContainText("90");
    await expect(breakdown.getByText("Perlu perbaikan")).toHaveCount(1);
    await expect(rows.nth(1)).toContainText("Perlu perbaikan");
    await expect(rows.nth(1)).toContainText(
      "Tuliskan batas waktu tindak lanjut.",
    );
    await expect(rows.nth(2)).toContainText(
      "Pecah kalimat panjang meski skor kejelasan tinggi.",
    );
    await expect(rows.nth(2)).toContainText(
      "Pembuka jelas tetapi kalimat tindak lanjut terlalu panjang.",
    );
    await expect(rows.nth(2)).toContainText(matchedQuote);
    await expect(rows.nth(0)).toContainText(
      "Alasan penilaian dengan kutipan belum tersedia",
    );
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      expect(
        await findLowContrastText(breakdown, {
          selector: "p, span, blockquote, h3",
          leafOnly: true,
        }),
      ).toEqual([]);
    }
    await breakdown.screenshot({
      path: test.info().outputPath("pdkt-score-explanations.png"),
    });

    const answer = page.getByRole("region", { name: "Balasan Anda" });
    const marks = answer.locator("mark");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText(`${matchedQuote}1`);
    await expect(answer).toContainText("Terima kasih,");

    const fixes = page.getByRole("region", { name: "Catatan pada balasan" });
    const notes = fixes.getByRole("listitem");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toContainText(
      "Tambahkan pengantar sebelum masuk ke topik transaksi.",
    );
    await expect(notes.nth(1)).toContainText("Tidak ditandai di balasan");
    await expect(notes.nth(0)).toContainText("Kalimat penghubung");
    await expect(notes.nth(0)).toContainText(
      "Contoh: “Selanjutnya, terkait transaksi Ibu, …”",
    );

    // Penanda dan catatan saling tertaut; pembaca layar mendengar "catatan 1",
    // bukan angka yang menempel di kata terakhir.
    const markLink = answer.getByRole("link", { name: "Lihat catatan 1" });
    // Lompatan hanya menggulir area Telaah; kerangka aplikasi di atasnya
    // (overflow tersembunyi, tidak bisa digulir balik) tidak boleh bergeser.
    // Layar pendek memaksa lompatan benar-benar menggulir.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 560 });
    const shiftedShell = () =>
      summary.evaluate((el) => {
        const shifted: string[] = [];
        let node: Element | null = el.closest("[data-review-scroll]");
        if (!node) return ["data-review-scroll tidak ada"];
        for (node = node.parentElement; node; node = node.parentElement) {
          if (node.scrollTop !== 0)
            shifted.push(`${node.tagName}.${node.className}`);
        }
        if (window.scrollY !== 0) shifted.push("window");
        return shifted;
      });
    await summary
      .getByRole("link", { name: "Lihat kalimat ini di balasan" })
      .click();
    await expect(markLink).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    await markLink.click();
    await expect(notes.nth(0)).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    await expect(fixes.getByRole("link")).toHaveCount(1);
    await fixes
      .getByRole("link", { name: "Kembali ke kalimat bertanda 1" })
      .click();
    await expect(markLink).toBeFocused();
    expect(await shiftedShell()).toEqual([]);
    if (viewport) await page.setViewportSize(viewport);

    // Email konsumen dan balasan satu permukaan perbandingan; email konsumen
    // tetap terlihat saat catatan panjang digulir.
    const comparison = page.getByRole("region", {
      name: "Perbandingan email",
    });
    await expect(
      comparison.getByRole("region", { name: "Email konsumen" }),
    ).toBeVisible();
    await expect(
      comparison.getByRole("region", { name: "Balasan Anda" }),
    ).toBeVisible();

    // Email konsumen selalu terbuka dan berdampingan dengan balasan; catatan
    // berada di kolom balasan. Di ponsel keduanya bertumpuk, konsumen dulu.
    const consumer = page.getByRole("region", { name: "Email konsumen" });
    await expect(consumer).toContainText(
      "Saldo terpotong tetapi transaksi gagal.",
    );
    const points = page.getByRole("region", {
      name: "Poin konsumen",
      exact: true,
    });
    const pointRows = points.getByRole("listitem");
    await expect(consumer.locator("mark")).toHaveCount(3);
    await expect(pointRows).toHaveCount(4);
    await expect(pointRows.nth(0)).toContainText("Terjawab");
    await expect(pointRows.nth(1)).toContainText("Sebagian");
    await expect(pointRows.nth(2)).toContainText("Belum terjawab");
    await expect(pointRows.nth(3)).toContainText("Tidak ditandai di email");
    await expect(
      points.getByRole("heading", { name: "Poin konsumen", level: 4 }),
    ).toBeVisible();
    // Paragraf email tetap seperti sebelum ditelaah (EmailBody: satu <p> per
    // paragraf, leading-6 = 21px pada root 14px); status tidak hanya
    // dibedakan lewat warna.
    await expect(consumer.locator("p")).toHaveCount(2);
    await expect(consumer.locator("p").first()).toHaveCSS(
      "line-height",
      "21px",
    );
    expect(
      await consumer
        .locator("mark")
        .evaluateAll((els) =>
          els.map((el) => getComputedStyle(el).textDecorationStyle),
        ),
    ).toEqual(["solid", "dashed", "dotted"]);
    const pointListSizes = await points.getByRole("link").evaluateAll((els) =>
      els.map((el) => ({
        width: (el as HTMLElement).offsetWidth,
        height: (el as HTMLElement).offsetHeight,
      })),
    );
    expect(pointListSizes.length).toBeGreaterThan(0);
    expect(
      pointListSizes.filter(({ width, height }) => width < 44 || height < 44),
    ).toEqual([]);
    // Label huruf di dalam teks tidak merenggangkan baris, tetapi area
    // sentuhnya tetap 44px: keempat sudut kotak 44px mengenai link-nya.
    for (const links of [
      consumer.locator("mark a"),
      answer.getByRole("link", { name: /^Lihat poin konsumen/ }),
    ]) {
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index++) {
        const link = links.nth(index);
        await link.scrollIntoViewIfNeeded();
        const fit = await link.evaluate((el) => {
          const text = el.closest("p") as HTMLElement;
          const box = el.getBoundingClientRect();
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const centerHit = document.elementFromPoint(cx, cy);
          // Target yang bersebelahan boleh berbagi area sentuh (pengecualian
          // jarak WCAG 2.5.8); yang tidak boleh adalah sudut jatuh ke teks biasa.
          const misses = [
            [-21, -21],
            [21, -21],
            [-21, 21],
            [21, 21],
          ].filter(([dx, dy]) => {
            const hit = document.elementFromPoint(cx + dx, cy + dy);
            return !hit?.closest("a");
          });
          return {
            height: box.height,
            lineHeight: parseFloat(getComputedStyle(text).lineHeight),
            centerOnSelf: Boolean(centerHit && el.contains(centerHit)),
            misses: misses.length,
          };
        });
        expect(fit.height).toBeLessThanOrEqual(fit.lineHeight);
        expect(fit.centerOnSelf).toBe(true);
        expect(fit.misses).toBe(0);
      }
    }

    const pointMark = consumer.getByRole("link", {
      name: "Lihat poin konsumen A, terjawab",
      exact: true,
    });
    await expect(pointMark).toHaveText("A");
    await pointMark.click();
    await expect(pointRows.nth(0)).toBeFocused();
    await points
      .getByRole("link", {
        name: "Kembali ke poin konsumen A di email",
        exact: true,
      })
      .click();
    await expect(pointMark).toBeFocused();
    const replyPoint = answer.getByRole("link", {
      name: "Lihat poin konsumen A, terjawab",
      exact: true,
    });
    await expect(replyPoint).toHaveText("A");
    await expect(
      answer.getByRole("link", {
        name: "Lihat poin konsumen B, sebagian",
        exact: true,
      }),
    ).toHaveText("B");
    // Titik sisip yang berada di dalam catatan dipindahkan ke akhir, tanpa mark baru.
    await expect(answer.locator("mark a")).toHaveCount(1);
    await expect(marks).toHaveCount(1);
    await replyPoint.click();
    await expect(pointRows.nth(0)).toBeFocused();
    expect(await consumer.evaluate((el) => getComputedStyle(el).position)).toBe(
      "sticky",
    );
    await expect(
      page.getByRole("region", { name: "Telaah lama tanpa penanda" }),
    ).toHaveCount(0);
    const box = async (locator: typeof consumer) => {
      const rect = await locator.boundingBox();
      expect(rect).not.toBeNull();
      return rect as NonNullable<typeof rect>;
    };
    const [consumerBox, answerBox, fixesBox] = await Promise.all([
      box(consumer),
      box(answer),
      box(fixes),
    ]);
    expect(consumerBox.x + consumerBox.width).toBeLessThanOrEqual(answerBox.x);
    expect(Math.abs(consumerBox.y - answerBox.y)).toBeLessThan(2);
    expect(Math.abs(fixesBox.x - answerBox.x)).toBeLessThan(2);
    expect(fixesBox.y).toBeGreaterThan(answerBox.y);

    await page.setViewportSize({ width: 390, height: 844 });
    const [phoneConsumer, phoneAnswer] = await Promise.all([
      box(consumer),
      box(answer),
    ]);
    expect(phoneConsumer.y + phoneConsumer.height).toBeLessThanOrEqual(
      phoneAnswer.y,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await consumer.screenshot({ path: "/tmp/pdkt-telaah-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 800 });

    const other = page.getByRole("region", { name: "Temuan lain" });
    await expect(other).not.toContainText("Ejaan:");
    await expect(other).not.toContainText("transkasi");
    await expect(other).not.toContainText("Kalimat pembuka terlalu panjang");
    await expect(other).toContainText("Isi yang kurang:");
    await expect(other).toContainText("Belum menyebut kanal pengaduan resmi");
    await expect(
      page.getByRole("region", { name: "Catatan AI" }),
    ).toContainText("Jawaban relevan dan jelas.");

    // Teks abu di kotak oranye "Perbaiki ini dulu" dan label rincian tetap terbaca.
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      for (const region of [
        summary,
        breakdown,
        consumer,
        points,
        answer,
        fixes,
      ]) {
        const low = await findLowContrastText(region, {
          selector: "span, p, dt, dd, q, a, strong, mark",
          leafOnly: true,
        });
        expect(low, `${theme}: ${low.join("\n")}`).toEqual([]);
      }
      // Mark berisi tautan anak; scan khusus ini turut mengukur teks kutipannya.
      expect(
        await findLowContrastText(consumer, {
          selector: "mark",
          leafOnly: false,
        }),
      ).toEqual([]);
    }
    for (const region of [consumer, points, answer, fixes]) {
      expect(await findTextBelowFloor(region)).toEqual([]);
    }
    await setDocumentTheme(page, "light");
    await comparison.screenshot({ path: "/tmp/pdkt-telaah-desktop.png" });

    const rewrite = page.getByText("Terima kasih, kami cek transaksi Ibu.");
    await expect(rewrite).toBeHidden();
    await page.getByText("Lihat contoh balasan yang lebih baik").click();
    await expect(rewrite).toBeVisible();
    await expect(page.getByText("Bagian yang disorot hijau")).toBeVisible();

    // Kontrol halaman Telaah minimal 44px (root 14px: min-h-11 hanya 38,5px).
    const heights = await page
      .locator("button:visible, summary:visible")
      .evaluateAll((els) =>
        els
          // Isi tahap Telaah saja; header workspace bersama bukan bagian halaman ini.
          .filter((el) =>
            [...document.querySelectorAll("h2")]
              .find((h) => h.textContent?.includes("Balasan untuk"))
              ?.parentElement?.contains(el),
          )
          .map((el) => [
            el.textContent?.trim(),
            el.getBoundingClientRect().height,
          ]),
      );
    expect(heights.length).toBeGreaterThan(3);
    expect(heights.filter(([, h]) => (h as number) < 44)).toEqual([]);

    expect(runtimeErrors).toEqual([]);

    // Kembali ke kotak masuk tidak membuka ulang email yang sama.
    await page.getByRole("button", { name: "Kembali ke kotak masuk" }).click();
    await expect(
      page.getByRole("heading", { name: "Kotak masuk", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("telaah tanpa consumerPoints mempertahankan email lama dan menyembunyikan temuan kosong", async ({
    page,
  }) => {
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...EVALUATED_HISTORY[0].evaluation,
          annotations: [],
          contentGaps: [],
        },
      },
    ];
    const audit = await openWorkspace(page, [
      ...pdktMocks(history, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "processing",
            evaluation: null,
            evaluation_error: null,
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    const consumer = page.getByRole("region", {
      name: "Email konsumen",
      exact: true,
    });
    await expect(consumer).toContainText(
      REPLIED_MAIL.detail.inbound_email.body,
    );
    await expect(consumer.locator("mark")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Poin konsumen", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", {
        name: "Telaah lama tanpa penanda",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Temuan lain", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Catatan AI", exact: true }),
    ).toContainText("Jawaban relevan dan jelas.");
    // Poin konsumen kosong dinyatakan terbuka dan bisa ditelaah ulang, bukan
    // hilang diam-diam.
    const notice = page.getByRole("region", {
      name: "Telaah tanpa poin konsumen",
      exact: true,
    });
    await expect(notice).toContainText("poin mana yang sudah dan belum");
    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await notice.getByRole("button", { name: "Telaah ulang" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    expectHermetic(audit);
  });

  test("telaah lama tanpa penanda kalimat bisa ditelaah ulang", async ({
    page,
  }) => {
    // EVALUATED_HISTORY dibuat sebelum penanda kalimat ada: tanpa `annotations`.
    const audit = await openWorkspace(page, [
      ...pdktMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "processing",
            evaluation: null,
            evaluation_error: null,
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();

    const notice = page.getByRole("region", {
      name: "Telaah lama tanpa penanda",
    });
    await expect(notice).toBeVisible({ timeout: 20000 });
    await expect(notice).toContainText("belum menandai kalimat");
    const legacyFindings = page.getByRole("region", { name: "Temuan lain" });
    await expect(legacyFindings).toContainText("Ejaan:");
    await expect(legacyFindings).toContainText("Kejelasan:");
    await expect(
      page.getByRole("region", { name: "Poin konsumen", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Catatan pada balasan" }),
    ).toHaveCount(0);

    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await notice.getByRole("button", { name: "Telaah ulang" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap Telaah gagal bisa dicoba lagi", async ({ page }) => {
    const failed = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: null,
        // Bentuk respons API /pdkt/history memakai snake_case.
        evaluation_status: "failed",
        evaluation_error: "Model AI sedang sibuk.",
      },
    ] as unknown as SessionHistory[];
    const audit = await openWorkspace(page, [
      ...pdktMocks(failed, [REPLIED_MAIL]),
      {
        method: "GET",
        path: /\/api\/v1\/pdkt\/history\/eval\//,
        body: {
          success: true,
          data: {
            evaluation_status: "failed",
            evaluation: null,
            evaluation_error: "Model AI sedang sibuk.",
          },
        },
      },
      {
        method: "POST",
        path: "/api/v1/pdkt/history/retry-eval",
        body: { success: true, data: null },
      },
    ]);
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();

    // Galat dari server/AI tidak ditampilkan; peserta melihat pesan tetap.
    await expect(
      page.getByText("AI belum bisa menelaah balasan ini."),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Telaah gagal", { exact: true })).toBeVisible();
    await expect(page.getByText("Model AI sedang sibuk.")).toHaveCount(0);
    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await page.getByRole("button", { name: "Coba lagi" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang ditelaah AI" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test(`teks mailbox, evaluasi, dan lampiran PDKT minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
    );

    // Filter bawaan "Belum dibalas" memilih email terbuka (berlampiran) otomatis.
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await expect(page.getByRole("button", { name: "Lampiran 1" })).toBeVisible({
      timeout: 20000,
    });
    const offenders = (
      await findTextBelowFloor(page.locator("main").first())
    ).map((o) => `[pahami + lampiran] ${o}`);

    await page.getByRole("button", { name: "Tulis balasan" }).click();
    await expect(page.getByLabel("Balasan Anda")).toBeVisible();
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[tanggapi] ${o}`,
      ),
    );
    await page.getByRole("button", { name: "Kembali ke email" }).click();

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    await expect(
      page.getByText("Sebut kanal pengaduan resmi.").first(),
    ).toBeVisible({
      timeout: 20000,
    });
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[telaah] ${o}`,
      ),
    );

    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

function pdktNavigationMocks(
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
const SUBJECT_X = {
  type: "participant" as const,
  participantId: "11111111-1111-4111-8111-111111111111",
  displayName: "Peserta X",
  batchName: "Batch 1",
  team: "Alpha",
};
const SUBJECT_Y = {
  type: "participant" as const,
  participantId: "22222222-2222-4222-8222-222222222222",
};
const SUBJECT_MAIL = mailboxItem("subject-review", "replied", {
  history_id: EVALUATED_HISTORY[0].id,
  simulationSubject: SUBJECT_X,
});
const CREATE_MOCKS: ApiMock[] = [
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
const picker = (page: Page) =>
  page.getByRole("dialog").filter({ hasText: "Pilih peserta latihan" });
const hero = (page: Page) =>
  page.getByRole("heading", { name: /Pahami keluhannya/ });
const reviewHeading = (page: Page) =>
  page.getByRole("heading", { name: "Balasan untuk Rina" });
async function expectSearch(page: Page, values: Record<string, string | null>) {
  await expect
    .poll(() => {
      const search = new URL(page.url()).searchParams;
      return Object.fromEntries(
        Object.keys(values).map((key) => [key, search.get(key)]),
      );
    })
    .toEqual(values);
}
async function requestNewEmail(page: Page) {
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

test.describe("PDKT pilihan model AI (hermetic)", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  test("hanya Gemini 3.8 Flash dan 3.5 Flash Lite; Flash Lite lama tetap Flash Lite", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/pdkt/settings",
          body: {
            success: true,
            data: { ...SAVED_SETTINGS, selectedModel: "gemini-3.1-flash-lite" },
          },
          headers: { "x-settings-version": "absent" },
        },
        ...pdktMocks([]).filter(
          (mock) => mock.path !== "/api/v1/pdkt/settings",
        ),
      ],
    });
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/settings"]);
    await page
      .getByRole("navigation", { name: "Menu PDKT" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pengaturan PDKT" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await dialog.getByRole("tab", { name: /^Gaya & AI/ }).click();
    const models = dialog
      .getByRole("radiogroup", { name: "Model AI" })
      .getByRole("radio");
    await expect(models).toHaveCount(2);
    await expect(
      models.filter({ hasText: "Gemini 3.8 Flash" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      models.filter({ hasText: "Gemini 3.5 Flash Lite" }),
    ).toHaveAttribute("aria-checked", "true");
    expectHermetic(audit);
  });
});

test.describe("PDKT navigation acceptance", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  test("email dibalas dibuka sebagai email dengan tombol Lihat telaah", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    const article = page.getByRole("article");
    await expect(article).toContainText(REPLIED_MAIL.detail.inbound_email.body);
    await expect(reviewHeading(page)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Ringkasan skor" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Lihat telaah" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Telaah siap" }),
    ).toBeVisible();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Pahami/,
    );
    await expect(stageNav(page)).toContainText("Tanggapi (selesai)");
    await expect(
      stageNav(page).getByRole("button", { name: "Telaah", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Telaah terbuka setelah balasan dikirim"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Detail email" }),
    ).not.toContainText("Terima kasih, kami cek transaksinya.");
    await expect(
      page.getByRole("region", { name: "Detail email" }),
    ).not.toContainText("Skor 85");
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const reviewButton = page.getByRole("button", { name: "Lihat telaah" });
      await expect(reviewButton).toBeVisible();
      expect(
        await reviewButton.evaluate(
          (element) => (element as HTMLElement).offsetHeight,
        ),
      ).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`dibalas-${width}.png`),
      });
    }
    // Footer menghormati izin hapus, tanpa mengubah panel baca.
    await overrideJson(page, `**/api/v1/pdkt/mailbox/${REPLIED_MAIL.list.id}`, {
      ...REPLIED_MAIL.detail,
      permissions: { can_delete: false },
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Lihat telaah" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hapus email", exact: true }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("Lihat telaah membuka Telaah, Back dan tahap Pahami kembali ke email", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: "telaah" });
    await expect(reviewHeading(page)).toBeVisible();
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await page.goBack();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    await expect(page.getByRole("article")).toBeVisible();
    await stageNav(page)
      .getByRole("button", { name: "Telaah", exact: true })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, tahap: null });
    await expect(page.getByRole("article")).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap=telaah diabaikan untuk email terbuka", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: `/pdkt?ruang=1&email=${OPEN_MAIL.list.id}&tahap=telaah`,
      apiMocks: pdktNavigationMocks([], [OPEN_MAIL]),
    });
    await expect(page.getByRole("article")).toBeVisible({ timeout: 20000 });
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Pahami/,
    );
    await expect(
      page.getByRole("button", { name: "Tulis balasan" }),
    ).toBeVisible();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    expectHermetic(audit);
  });

  test("refresh pada email dibalas memilih tab Dibalas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    const audit = await openHermeticShell(page, {
      path: `/pdkt?ruang=1&email=${REPLIED_MAIL.list.id}`,
      apiMocks: pdktNavigationMocks(EVALUATED_HISTORY, [
        OPEN_MAIL,
        REPLIED_MAIL,
      ]),
    });
    await expect(page.getByRole("article")).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /^Dibalas/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) }),
    ).toHaveAttribute("aria-current", "true");
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    expectHermetic(audit);
  });

  test("AC1 kotak masuk menambah history dan Back kembali ke landing", async ({
    page,
  }) => {
    const audit = await openWorkspace(page, pdktNavigationMocks([]));
    await expectSearch(page, { ruang: "1" });
    await page.goBack();
    await expect(hero(page)).toBeVisible();
    expectHermetic(audit);
  });

  for (const width of [390, 1280]) {
    test(`AC2 detail email Back kembali ke daftar pada ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const audit = await openWorkspace(
        page,
        pdktNavigationMocks([], [OPEN_MAIL, NEWER_OPEN_MAIL]),
      );
      await page
        .getByRole("button", { name: new RegExp(NEWER_OPEN_MAIL.list.subject) })
        .click();
      await expectSearch(page, { email: NEWER_OPEN_MAIL.list.id });
      await page.goBack();
      await expectSearch(page, { ruang: "1", email: null });
      await expect(workspaceMarker(page)).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
      expectHermetic(audit);
    });
  }

  for (const item of [OPEN_MAIL, SUBJECT_MAIL]) {
    test(`AC3 refresh mempertahankan email ${item.list.status}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const audit = await openWorkspace(
        page,
        pdktNavigationMocks(EVALUATED_HISTORY, [item]),
      );
      if (item.list.status === "replied") await workspaceMarker(page).click();
      await page
        .getByRole("button", { name: new RegExp(item.list.subject) })
        .click();
      await expectSearch(page, { ruang: "1", email: item.list.id });
      await expect(page.getByRole("article")).toBeVisible();
      await page.reload();
      await expectSearch(page, { ruang: "1", email: item.list.id });
      await expect(page.getByRole("article")).toContainText(item.list.subject);
      await expect(hero(page)).toHaveCount(0);
      expectHermetic(audit);
    });
  }

  test("AC4 Riwayat ke Telaah tanpa hero, refresh dan kedua aksi kembali", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });
    await page.evaluate(() => {
      (window as Window & { sawPdktHero?: boolean }).sawPdktHero = false;
      new MutationObserver(() => {
        if (document.getElementById("pdkt-hero-title"))
          (window as Window & { sawPdktHero?: boolean }).sawPdktHero = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    const link = () =>
      page
        .getByRole("table")
        .getByRole("link", { name: REPLIED_MAIL.list.subject });
    await link().click();
    await expect(reviewHeading(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as Window & { sawPdktHero?: boolean }).sawPdktHero,
      ),
    ).toBe(false);
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    await link().click();
    await page
      .locator("main header")
      .getByRole("button", { name: "Riwayat", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    expectHermetic(audit);
  });

  test("Telaah dari Riwayat tetap menyediakan Riwayat setelah Pahami dan Lihat telaah", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks(HISTORY_PAGE_SESSIONS, [REPLIED_MAIL]),
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: REPLIED_MAIL.list.subject })
      .click();
    await expect(reviewHeading(page)).toBeVisible();

    await stageNav(page)
      .getByRole("button", { name: /Pahami/ })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    await expectSearch(page, { email: REPLIED_MAIL.list.id, dari: "riwayat" });

    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, {
      email: REPLIED_MAIL.list.id,
      tahap: "telaah",
      dari: "riwayat",
    });
    await page
      .locator("main header")
      .getByRole("button", { name: "Riwayat", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pdkt\/history$/);
    expectHermetic(audit);
  });

  test("AC5 peserta ruang kerja bertahan setelah Riwayat dan Back", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([], [OPEN_MAIL]),
        {
          method: "GET",
          path: "/api/v1/profiler/peserta/options",
          body: {
            success: true,
            data: [
              {
                id: SUBJECT_X.participantId,
                nama: "Peserta X",
                batch_name: "Batch 1",
                tim: "Alpha",
              },
            ],
          },
        },
      ],
    });
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await picker(page)
      .getByRole("radio", { name: /Peserta resmi/ })
      .check();
    await picker(page)
      .getByLabel("Cari peserta (min. 2 huruf)")
      .fill("Peserta");
    await picker(page)
      .getByRole("button", { name: /Peserta X/ })
      .click();
    await picker(page)
      .getByRole("button", { name: "Mulai", exact: true })
      .click();
    await expect(workspaceMarker(page)).toBeVisible();
    await page.getByRole("button", { name: "Menu lainnya" }).click();
    await page.getByRole("menuitem", { name: "Riwayat", exact: true }).click();
    await page.goBack();
    await expect(workspaceMarker(page)).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await page.reload();
    await expect(workspaceMarker(page)).toBeVisible();
    expect((await requestNewEmail(page)).simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  test("AC6 latihan lagi memakai peserta email X meski ruang kerja Y", async ({
    page,
  }) => {
    await page.addInitScript(
      (subject) =>
        sessionStorage.setItem("pdkt_subject_user-1", JSON.stringify(subject)),
      SUBJECT_Y,
    );
    const audit = await openHermeticShell(page, {
      path: "/pdkt?ruang=1",
      apiMocks: [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks(EVALUATED_HISTORY, [SUBJECT_MAIL, OPEN_MAIL]),
      ],
    });
    await expect(workspaceMarker(page)).toBeVisible();
    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(SUBJECT_MAIL.list.subject) })
      .click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/api/v1/pdkt/session/create"),
    );
    await page
      .getByRole("button", { name: "Latihan lagi dengan skenario ini" })
      .click();
    expect((await request).postDataJSON().simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const subject of [
    { ...SUBJECT_X, participantId: null },
    {
      type: "unknown",
      participantId: null,
      displayName: null,
      batchName: null,
      team: null,
    },
  ]) {
    test(`AC6 atribusi ${subject.type} tanpa ID tidak menjadi self`, async ({
      page,
    }) => {
      const item = mailboxItem("unavailable", "replied", {
        history_id: EVALUATED_HISTORY[0].id,
        simulationSubject: subject,
      });
      const audit = await openWorkspace(page, [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks(EVALUATED_HISTORY, [item]),
      ]);
      await workspaceMarker(page).click();
      await page
        .getByRole("button", { name: new RegExp(item.list.subject) })
        .click();
      await page.getByRole("button", { name: "Lihat telaah" }).click();
      await expect(
        page.getByRole("button", { name: "Latihan lagi dengan skenario ini" }),
      ).toBeDisabled();
      await expect(page.getByText(/Latihan lagi tidak tersedia/)).toBeVisible();
      expectHermetic(audit);
    });
  }

  test("AC7 Belum dibalas melewati picker, Mulai simulasi tetap memilih", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktNavigationMocks([], [OPEN_MAIL]),
    });
    await page
      .getByRole("region", { name: "Belum dibalas" })
      .getByRole("button", { name: new RegExp(OPEN_MAIL.list.subject) })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    await expect(picker(page)).toHaveCount(0);
    await page
      .getByRole("button", { name: "Kembali ke halaman awal PDKT" })
      .click();
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first()
      .click();
    await expect(picker(page)).toBeVisible();
    expectHermetic(audit);
  });

  test("AC8 Tanggapi kembali ke email dengan label yang sesuai", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks([], [OPEN_MAIL]),
    );
    await page.getByRole("button", { name: "Tulis balasan" }).click();
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Tanggapi/,
    );
    if (process.env.PDKT_FLOW_CAPTURE === "1") {
      await page.screenshot({
        path: test.info().outputPath("pdkt-tanggapi-desktop.png"),
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const back = page
      .locator("main header")
      .getByRole("button", { name: "Kembali ke email" });
    await expect(back).toBeVisible();
    expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (process.env.PDKT_FLOW_CAPTURE === "1") {
      await page.screenshot({
        path: test.info().outputPath("pdkt-tanggapi-mobile.png"),
      });
    }
    await page
      .locator("main header")
      .getByRole("button", { name: "Kembali ke email" })
      .click();
    await expect(page.getByRole("article")).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expectHermetic(audit);
  });

  test("AC9 breadcrumb PDKT bertaut dan Riwayat aktif", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: pdktNavigationMocks([]),
    });
    const crumbs = page.getByRole("navigation", { name: /breadcrumb/i });
    await expect(
      crumbs.getByRole("link", { name: "PDKT", exact: true }),
    ).toHaveAttribute("href", "/pdkt");
    await expect(crumbs).toContainText("Riwayat");
    expectHermetic(audit);
  });

  test("AC10 route simulation redirect ke landing", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt/simulation",
      waitForUrl: /\/pdkt$/,
      apiMocks: pdktNavigationMocks([]),
    });
    await expect(hero(page)).toBeVisible();
    expectHermetic(audit);
  });
});

test.describe("PDKT navigation boundaries", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));
  test("replay tanpa mailbox mempertahankan sesi dan peserta setelah refresh", async ({
    page,
  }) => {
    const session = {
      ...EVALUATED_HISTORY[0],
      simulationSubject: SUBJECT_X,
      emails: [
        SUBJECT_MAIL.detail.inbound_email,
        ...SUBJECT_MAIL.detail.emails_thread,
      ],
    } as unknown as SessionHistory;
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([session], [OPEN_MAIL]),
      ],
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: `Re: ${SUBJECT_MAIL.list.subject}` })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, {
      sesi: session.id,
      ruang: "1",
      dari: "riwayat",
      email: null,
    });
    await page.reload();
    await expect(reviewHeading(page)).toBeVisible();
    await expectSearch(page, { sesi: session.id, email: null });
    await expect(page.locator("main header").last()).toContainText("Peserta X");
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/api/v1/pdkt/session/create"),
    );
    await page
      .getByRole("button", { name: "Latihan lagi dengan skenario ini" })
      .click();
    expect((await request).postDataJSON().simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const state of ["corrupt", "blocked", "other-account"] as const) {
    test(`storage ${state} kembali aman ke self untuk email baru`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ state, subject }) => {
          if (state === "blocked")
            Object.defineProperty(window, "sessionStorage", {
              get() {
                throw new DOMException("Blocked", "SecurityError");
              },
            });
          else
            sessionStorage.setItem(
              state === "other-account"
                ? "pdkt_subject_other-user"
                : "pdkt_subject_user-1",
              state === "corrupt" ? "{broken" : JSON.stringify(subject),
            );
        },
        { state, subject: SUBJECT_Y },
      );
      const audit = await openHermeticShell(page, {
        path: "/pdkt?ruang=1",
        apiMocks: [...CREATE_MOCKS, ...pdktNavigationMocks([], [OPEN_MAIL])],
      });
      await expect(workspaceMarker(page)).toBeVisible();
      expect((await requestNewEmail(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }
});

const LEGACY_PRACTICE_SUBJECTS = [
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

async function openSubjectReview(
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

async function createPracticeAgain(page: Page, retiredScenario = false) {
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

test.describe("PDKT practice again subject policy", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  for (const subject of [
    ...LEGACY_PRACTICE_SUBJECTS,
    {
      label: "self",
      value: {
        type: "self",
        participantId: null,
        displayName: "Agent",
        batchName: null,
        team: null,
      },
    },
    { label: "participant-known", value: SUBJECT_X },
  ]) {
    test(`agent legacy langsung ${subject.label} membuat sesi self`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "agent", subject.value);
      expect((await createPracticeAgain(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }

  for (const subject of LEGACY_PRACTICE_SUBJECTS.filter(
    (subject) => subject.label !== "missing",
  )) {
    test(`agent legacy pemilih skenario ${subject.label} membuat sesi self`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "agent", subject.value, true);
      expect((await createPracticeAgain(page, true)).simulationSubject).toEqual(
        { type: "self" },
      );
      expectHermetic(audit);
    });
  }

  for (const role of ["trainer", "admin"] as const) {
    test(`${role} latihan ulang snapshot self tetap self`, async ({ page }) => {
      const audit = await openSubjectReview(page, role, {
        type: "self",
        participantId: null,
        displayName: "Pelaksana",
        batchName: null,
        team: null,
      });
      expect((await createPracticeAgain(page)).simulationSubject).toEqual({
        type: "self",
      });
      expectHermetic(audit);
    });
  }

  test("admin latihan ulang tetap memakai peserta snapshot", async ({
    page,
  }) => {
    const audit = await openSubjectReview(page, "admin", SUBJECT_X);
    expect((await createPracticeAgain(page)).simulationSubject).toEqual({
      type: "participant",
      participantId: SUBJECT_X.participantId,
    });
    expectHermetic(audit);
  });

  for (const subject of LEGACY_PRACTICE_SUBJECTS.filter(
    (subject) =>
      subject.label === "unknown" || subject.label === "participant-deleted",
  )) {
    test(`admin latihan ulang ${subject.label} tetap diblokir`, async ({
      page,
    }) => {
      const audit = await openSubjectReview(page, "admin", subject.value);
      await expect(
        page.getByRole("button", { name: "Latihan lagi dengan skenario ini" }),
      ).toBeDisabled();
      await expect(page.getByText(/Latihan lagi tidak tersedia/)).toBeVisible();
      expectHermetic(audit);
    });
  }
});

/**
 * Performa: riwayat PDKT memuat semua sesi lengkap (email + lampiran), jadi
 * setiap muat ulang yang tidak perlu menghabiskan egress Supabase. Baris
 * riwayat hanya bertambah saat membalas email.
 */
test.describe("PDKT tidak memuat ulang riwayat tanpa perlu (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("menyimpan Pengaturan tidak memuat ulang riwayat", async ({ page }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    const count = (call: string) =>
      audit.mockedApi.filter((entry) => entry === call).length;
    await waitForMockedApi(audit, ["GET /api/v1/pdkt/history"]);
    const before = count("GET /api/v1/pdkt/history");

    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    await page
      .getByRole("dialog", { name: "Pulihkan pengaturan bawaan?" })
      .getByRole("button", { name: "Pulihkan bawaan" })
      .click();
    await expect
      .poll(() => count("POST /api/v1/pdkt/settings"), { timeout: 20000 })
      .toBe(1);
    await page.waitForTimeout(1500);

    expect(count("GET /api/v1/pdkt/history")).toBe(before);
    expectHermetic(audit);
  });

  test("telaah selesai milik orang lain tidak memuat ulang kotak masuk dan riwayat", async ({
    page,
  }) => {
    const OTHER_HISTORY_ID = "pdkt-other-user-1";
    const othersReply = mailboxItem("mail-others", "replied", {
      user_id: "trainer-1",
      history_id: OTHER_HISTORY_ID,
      replied_at: MAIL_AT,
      created_by_user: {
        id: "trainer-1",
        full_name: "Siti Aminah",
        role: "Trainer",
        is_current_user: false,
      },
    });
    const evalCall = `GET /api/v1/pdkt/history/eval/${OTHER_HISTORY_ID}`;
    const audit = await openWorkspace(page, [
      {
        method: "GET",
        path: `/api/v1/pdkt/history/eval/${OTHER_HISTORY_ID}`,
        body: {
          success: true,
          data: {
            evaluation_status: "completed",
            evaluation: EVALUATED_HISTORY[0].evaluation,
            evaluation_error: null,
          },
        },
      },
      ...pdktMocks([], [othersReply]),
    ]);
    await waitForMockedApi(audit, [evalCall]);
    await page.waitForTimeout(2000);

    const afterEval = audit.mockedApi.slice(
      audit.mockedApi.indexOf(evalCall) + 1,
    );
    expect(afterEval).not.toContain("GET /api/v1/pdkt/mailbox");
    expect(afterEval).not.toContain("GET /api/v1/pdkt/history");
    expectHermetic(audit);
  });
});

test.describe("PDKT riwayat ringkas", () => {
  test.beforeAll(() => assertLocalDevOnlyTarget(APP_ORIGIN));

  /** Bentuk `GET /pdkt/history?view=list`: hanya yang ditampilkan daftar. */
  function summaryOf(session: SessionHistory) {
    const emails = (session.emails ?? []) as Array<{ subject?: string }>;
    const scenario = (
      session.config as { scenarios?: Array<{ id?: string; title?: string }> }
    )?.scenarios?.[0];
    return {
      id: session.id,
      timestamp: session.timestamp,
      detail: "summary",
      evaluation_status: session.evaluationStatus,
      evaluation:
        typeof session.evaluation?.score === "number"
          ? { score: session.evaluation.score }
          : null,
      config: { scenarios: [{ id: scenario?.id, title: scenario?.title }] },
      emails: [{ subject: emails.at(-1)?.subject }],
      simulationSubject: session.simulationSubject ?? null,
    } as unknown as SessionHistory;
  }

  test("landing dan halaman Riwayat hanya memuat riwayat versi ringkas", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(HISTORY_PAGE_SESSIONS.map(summaryOf)),
    });
    await waitForMockedApi(audit, ["/api/v1/pdkt/history?view=list"]);
    await page.goto("/pdkt/history");
    await expect(page.getByTestId("pdkt-history-summary")).toBeVisible();
    await expect(
      page.getByRole("table").getByText(REPLIED_MAIL.list.subject),
    ).toBeVisible();
    const historyCalls = audit.mockedApi.filter((entry) =>
      entry.startsWith("GET /api/v1/pdkt/history"),
    );
    expect(historyCalls.length).toBeGreaterThanOrEqual(2);
    expect(historyCalls).toEqual(
      historyCalls.map(() => "GET /api/v1/pdkt/history?view=list"),
    );
    expectHermetic(audit);
  });

  test("Telaah dari riwayat ringkas memuat hasil lengkap lebih dulu", async ({
    page,
  }) => {
    const audit = await openWorkspace(
      page,
      pdktNavigationMocks(EVALUATED_HISTORY, [REPLIED_MAIL]).map((mock) =>
        mock.path === "/api/v1/pdkt/history"
          ? {
              ...mock,
              body: { success: true, data: EVALUATED_HISTORY.map(summaryOf) },
            }
          : mock,
      ),
    );
    await page.getByRole("button", { name: /^Dibalas/ }).click();
    const row = page.getByRole("button", {
      name: new RegExp(REPLIED_MAIL.list.subject),
    });
    await expect(row).toContainText("Skor 85");
    await row.click();
    await page.getByRole("button", { name: "Lihat telaah" }).click();
    await expect(reviewHeading(page)).toBeVisible();
    await expect(page.getByText("Jawaban relevan dan jelas.")).toBeVisible();
    expect(audit.mockedApi).toContain(
      `GET /api/v1/pdkt/history/eval/${EVALUATED_HISTORY[0].id}`,
    );
    expectHermetic(audit);
  });

  test("membuka sesi dari riwayat ringkas memuat sesi lengkapnya", async ({
    page,
  }) => {
    const session = {
      ...EVALUATED_HISTORY[0],
      simulationSubject: SUBJECT_X,
      emails: [
        SUBJECT_MAIL.detail.inbound_email,
        ...SUBJECT_MAIL.detail.emails_thread,
      ],
    } as unknown as SessionHistory;
    const audit = await openHermeticShell(page, {
      path: "/pdkt/history",
      apiMocks: [
        {
          method: "GET",
          path: `/api/v1/pdkt/history/${session.id}`,
          body: { success: true, data: session },
        },
        ...CREATE_MOCKS,
        ...pdktNavigationMocks([summaryOf(session)], [OPEN_MAIL]),
      ],
    });
    await page
      .getByRole("table")
      .getByRole("link", { name: `Re: ${SUBJECT_MAIL.list.subject}` })
      .click();
    await expect(reviewHeading(page)).toBeVisible();
    await expect(page.getByText("Jawaban relevan dan jelas.")).toBeVisible();
    expect(audit.mockedApi).toContain(
      `GET /api/v1/pdkt/history/${session.id}`,
    );
    expectHermetic(audit);
  });
});
