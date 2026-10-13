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
import type { SessionHistory } from "../src/routes/pdkt/components/HistoryModal";

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
  sampleEmailTemplate: { subject: "Klaim ditolak", body: "Klaim saya ditolak." },
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

/** Lewati pemilih peserta (bila muncul) sampai ruang kerja tampil. */
async function enterWorkspace(page: Page) {
  const picker = page
    .getByRole("dialog")
    .filter({ hasText: "Pilih peserta latihan" });
  const workspace = workspaceMarker(page);
  await expect
    .poll(async () => (await picker.isVisible()) || (await workspace.isVisible()), {
      timeout: 20000,
    })
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
  await page.getByRole("button", { name: /^Mulai simulasi/ }).first().click();
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
    await assertLocalDevOnlyTarget();
  });

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
    await expect(page.getByText("PDKT · Simulasi email konsumen")).toBeVisible();
    for (const point of [
      "Kasus selalu baru",
      "Tanpa bocoran jawaban",
      "Ditelaah AI",
    ]) {
      await expect(page.getByText(point, { exact: true })).toBeVisible();
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
    await expect(
      page.getByRole("button", { name: "Atur skenario" }),
    ).toBeVisible();

    // Tanpa data: setiap bagian menjelaskan keadaannya, tanpa angka karangan.
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);
    const progress = page.getByRole("region", { name: "Progres latihan" });
    await expect(progress.getByText("Belum ada sesi yang ditelaah")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Belum dibalas" })
        .getByText("Tidak ada email yang menunggu balasan."),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Hasil telaah terbaru" }),
    ).toContainText("Belum ada hasil telaah");

    // Copy landing lama tidak boleh kembali.
    for (const stale of [
      /Latih balasan email/,
      /PDKT — singkatan dari/,
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
        [...EVALUATED_HISTORY, reviewing],
        [NEWER_OPEN_MAIL, OPEN_MAIL, REPLIED_MAIL],
      ),
    });
    await waitForMockedApi(audit, ["/pdkt/history", "/pdkt/mailbox"]);

    const progress = page.getByRole("region", { name: "Progres latihan" });
    await expect(progress.getByTestId("pdkt-stat-waiting")).toContainText("2", {
      timeout: 20000,
    });
    await expect(progress.getByTestId("pdkt-stat-average")).toContainText("85");
    await expect(progress.getByTestId("pdkt-stat-reviewing")).toContainText("1");

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
    await expect(recent).toContainText(SCENARIO.title);
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
    await pause.click();
    await expect(page.getByRole("button", { name: "Putar animasi" })).toBeVisible();
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
        ...pdktMocks([]).filter((mock) => mock.path !== "/api/v1/pdkt/settings"),
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
    await expect(ojkRow).toContainText("Tulis sendiri");

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
    await dialog.getByRole("searchbox", { name: "Cari skenario" }).fill("lunas");
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

    await dialog.getByRole("tab", { name: /^Gaya & AI/ }).click();
    await expect(
      dialog.getByRole("switch", { name: "Gambar lampiran" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("Riwayat membuka modal riwayat dengan empty state", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /^Riwayat/ })
      .first()
      .click();
    await expect(page.getByText("Riwayat Simulasi PDKT").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("Belum Ada Riwayat").first()).toBeVisible();

    expectHermetic(audit);
  });

  test("Pemakaian AI membuka modal usage", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /^Pemakaian AI/ })
      .first()
      .click();

    const usageDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Penilaian AI" });
    await expect(usageDialog).toBeVisible({ timeout: 20000 });
    await expect(usageDialog.getByText("Simulasi").first()).toBeVisible();

    await waitForMockedApi(audit, ["/ai/usage/summary"]);
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
  test("kartu riwayat menandai peserta yang record-nya tidak tersedia", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(HISTORY_UNAVAILABLE_PARTICIPANT),
    });

    await page
      .getByRole("button", { name: /^Riwayat/ })
      .first()
      .click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "Riwayat Simulasi PDKT" });
    await expect(dialog).toBeVisible({ timeout: 20000 });

    await expect(dialog.getByText(/Target: Andi/)).toBeVisible();
    await expect(
      dialog.getByText(/record peserta tidak lagi tersedia/),
    ).toBeVisible();

    expectHermetic(audit);
  });

  test("tombol Mulai simulasi PDKT memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    const start = page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .first();
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
    await page.getByRole("button", { name: /^Mulai simulasi/ }).first().click();
    await enterWorkspace(page);
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);

    // Isi email tampil; penerima (arah balasan) tidak.
    const main = page.locator("main").first();
    await expect(
      main.getByText(OPEN_MAIL.detail.inbound_email.body).first(),
    ).toBeVisible({ timeout: 20000 });
    await expect(main.getByText(/Kepada:/)).toHaveCount(0);
    await expect(main.getByText(OPEN_MAIL.detail.inbound_email.to)).toHaveCount(0);
    await expect(main.getByText("konsumen@ojk.go.id")).toHaveCount(0);
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
    for (const section of ["Kasusnya", "Arah balasan", "Kunci jawaban"]) {
      await expect(
        dialog.getByRole("region", { name: section }),
      ).toBeVisible();
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
      .getByRole("radio", { name: /Tembusan, tapi minta bantuan OJK/ })
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
    await expect(row).toContainText("Tembusan, tapi minta bantuan OJK");

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

    await dialog.getByLabel(/^Judul skenario/).fill("Klaim ditolak tanpa alasan");
    await dialog.getByLabel(/^Kategori/).selectOption("Asuransi");
    const mode = dialog.getByRole("radiogroup", { name: "Isi email dibuat oleh" });
    await mode.getByRole("radio", { name: "Saya tulis sendiri" }).click();
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
    await expect(row).toContainText("Tulis sendiri");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();
    expectHermetic(audit);
  });

  test("skenario dihapus dari editor setelah konfirmasi", async ({ page }) => {
    const { audit, dialog } = await openScenarioSettings(page);
    await dialog
      .getByRole("button", { name: `Ubah ${OJK_SCENARIO.title}` })
      .click({ timeout: 20000 });
    page.once("dialog", (confirm) => void confirm.accept());
    await dialog.getByRole("button", { name: "Hapus skenario" }).click();

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
    await expect(page.getByRole("button", { name: "Baru" })).toBeVisible();
    const filters = page.getByRole("group", { name: "Saring email" });
    await expect(filters.getByRole("button")).toHaveText([
      "Semua",
      "Belum dibalas · 1",
      "Dibalas",
    ]);
    await expect(page.getByPlaceholder("Cari pengirim atau subjek")).toBeVisible();

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
    // Data peserta dan pelaksana pindah dari panel baca ke header ruang kerja.
    await expect(page.getByText("Pelaksana: Siti Aminah (Trainer)")).toBeVisible();
    await expect(reading.getByRole("button", { name: "Lampiran 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus email ini" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Tulis balasan" })).toBeVisible();

    // Baris yang sudah dibalas menampilkan skor; memilih filter tidak membuka
    // Telaah dengan sendirinya.
    await filters.getByRole("button", { name: "Dibalas", exact: true }).click();
    const repliedRow = page.getByRole("button", {
      name: new RegExp(REPLIED_MAIL.list.subject),
    });
    await expect(repliedRow).toContainText("Skor 85");
    await expect(page.getByText(/Pilih email dari kotak masuk/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Balasan untuk/ })).toHaveCount(0);
    expectHermetic(audit);
  });

  test("tahap Tanggapi: tulis, konfirmasi, kirim, lalu Telaah menunggu penilaian", async ({
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
    await expect(page.getByRole("heading", { name: "Kotak masuk" })).toHaveCount(0);
    const email = page.getByRole("region", { name: "Email konsumen" });
    await expect(email).toContainText(OPEN_MAIL.detail.inbound_email.body);
    const compose = page.getByRole("region", { name: "Tulis balasan" });
    await expect(compose).toContainText(`Re: ${OPEN_MAIL.list.subject}`);

    const replyText = "Kami akan cek transaksi Ibu hari ini.";
    await compose.getByLabel("Balasan Anda").fill(replyText);
    await expect(compose).toContainText("7 kata");

    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const confirm = page.getByRole("dialog", { name: "Kirim balasan sekarang?" });
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

    await compose.getByRole("button", { name: "Kirim balasan" }).click();
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/pdkt/mailbox/reply"),
    );
    await page
      .getByRole("dialog", { name: "Kirim balasan sekarang?" })
      .getByRole("button", { name: "Kirim dan nilai" })
      .click();
    const body = (await sent).postDataJSON();
    expect(body.mailboxId).toBe(OPEN_MAIL.list.id);
    expect(body.reply.body).toBe(replyText);

    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang dinilai AI" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tahap Telaah: skor, rincian, catatan bernomor, dan contoh balasan", async ({
    page,
  }) => {
    const reply = "Terima kasih, kami cek transaksinya.";
    const matchedQuote = "kami cek transaksinya";
    const start = reply.indexOf(matchedQuote);
    const base = EVALUATED_HISTORY[0].evaluation as Record<string, unknown>;
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...base,
          scoreBreakdown: {
            recipientDirectionScore: 90,
            normativeResponseScore: 70,
            clarityScore: 85,
            typoScore: 88,
            templateComplianceScore: 82,
          },
          edu: {
            dimensionTips: { normative: "Tuliskan batas waktu tindak lanjut." },
            actionItems: [
              {
                dimension: "normative",
                text: "Sebut kanal pengaduan resmi.",
                example: "Silakan hubungi 157.",
                priorityRank: 1,
              },
              {
                dimension: "clarity",
                text: "Pecah kalimat pembuka.",
                priorityRank: 2,
              },
            ],
            suggestedRewrite: { body: "Terima kasih, kami cek transaksi Ibu." },
          },
          expectedAnswerAlignment: {
            category: "Hampir sesuai",
            reason: "Solusi benar tetapi tanpa batas waktu.",
          },
          annotations: [
            {
              quote: matchedQuote,
              dimension: "normative",
              note: "Sebutkan kapan konsumen akan menerima kabar.",
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
    const audit = await openWorkspace(page, pdktMocks(history, [REPLIED_MAIL]));

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);

    await expect(
      page.getByRole("heading", { name: "Balasan untuk Rina" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Kotak masuk" })).toHaveCount(0);
    await expect(stageNav(page).locator('[aria-current="step"]')).toHaveText(
      /Telaah/,
    );

    const summary = page.getByRole("region", { name: "Ringkasan skor" });
    await expect(summary.getByTestId("pdkt-review-score")).toHaveText("85");
    await expect(summary).toContainText("Perbaiki ini dulu");
    await expect(summary).toContainText("Sebut kanal pengaduan resmi.");
    await expect(summary).toContainText("Silakan hubungi 157.");
    await expect(summary).toContainText("Berdampak ke: Kualitas OJK");
    await expect(summary).toContainText("Pecah kalimat pembuka.");
    await expect(summary).toContainText("Hampir sesuai");
    await expect(summary).toContainText("3 menit 45 detik");

    const breakdown = page.getByRole("region", { name: "Rincian skor" });
    const rows = breakdown.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText("Arah Penerima");
    await expect(rows.nth(0)).toContainText("90");
    await expect(breakdown.getByText("Perlu perbaikan")).toHaveCount(1);
    await expect(rows.nth(1)).toContainText("Perlu perbaikan");
    await expect(rows.nth(1)).toContainText("Tuliskan batas waktu tindak lanjut.");

    const answer = page.getByRole("region", { name: "Balasan Anda" });
    const marks = answer.locator("mark");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText(`${matchedQuote}1`);
    await expect(answer).toContainText("Terima kasih,");

    const fixes = page.getByRole("region", { name: "Yang perlu diperbaiki" });
    const notes = fixes.getByRole("listitem");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toContainText(
      "Sebutkan kapan konsumen akan menerima kabar.",
    );
    await expect(notes.nth(1)).toContainText("Tidak ditandai di balasan");

    const other = page.getByRole("region", { name: "Temuan lain" });
    await expect(other).toContainText("transkasi");
    await expect(other).toContainText("Kalimat pembuka terlalu panjang");
    await expect(other).toContainText("Belum menyebut kanal pengaduan resmi");
    await expect(page.getByRole("region", { name: "Catatan AI" })).toContainText(
      "Jawaban relevan dan jelas.",
    );

    // Teks abu di kotak oranye "Perbaiki ini dulu" dan label rincian tetap terbaca.
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      for (const region of [summary, breakdown]) {
        const low = await findLowContrastText(region, {
          selector: "span, p, dt, dd, q",
          leafOnly: true,
        });
        expect(low, `${theme}: ${low.join("\n")}`).toEqual([]);
      }
    }
    await setDocumentTheme(page, "light");

    const rewrite = page.getByText("Terima kasih, kami cek transaksi Ibu.");
    await expect(rewrite).toBeHidden();
    await page.getByText("Lihat contoh balasan yang lebih baik").click();
    await expect(rewrite).toBeVisible();

    // Kembali ke kotak masuk tidak membuka ulang email yang sama.
    await page.getByRole("button", { name: "Kembali ke kotak masuk" }).click();
    await expect(
      page.getByRole("heading", { name: "Kotak masuk", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balasan untuk Rina" })).toHaveCount(0);
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

    await expect(page.getByText("Model AI sedang sibuk.")).toBeVisible({
      timeout: 20000,
    });
    const retry = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/pdkt/history/retry-eval"),
    );
    await page.getByRole("button", { name: "Coba lagi" }).click();
    expect((await retry).postDataJSON()).toEqual({
      historyId: "pdkt-evaluated-1",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Sedang dinilai AI" }),
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
    const offenders = (await findTextBelowFloor(page.locator("main").first())).map(
      (o) => `[pahami + lampiran] ${o}`,
    );

    await page.getByRole("button", { name: "Tulis balasan" }).click();
    await expect(page.getByLabel("Balasan Anda")).toBeVisible();
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[tanggapi] ${o}`,
      ),
    );
    await page.getByRole("button", { name: "Kotak masuk" }).click();

    await workspaceMarker(page).click();
    await page
      .getByRole("button", { name: new RegExp(REPLIED_MAIL.list.subject) })
      .click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    await expect(page.getByText("Sebut kanal pengaduan resmi.").first()).toBeVisible({
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
