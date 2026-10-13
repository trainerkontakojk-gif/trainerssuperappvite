import { expect, test } from "@playwright/test";
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
const OPEN_MAIL = mailboxItem("mail-open", "open");
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
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    const workspace = page.getByRole("button", { name: "Terbalas" });
    await expect
      .poll(async () => (await picker.isVisible()) || (await workspace.isVisible()), {
        timeout: 20000,
      })
      .toBe(true);
    if (await picker.isVisible()) {
      await picker.getByRole("button", { name: "Mulai" }).click();
    }
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
    const mailboxEmpty = page.getByText(/Pilih email atau buat simulasi baru/);

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
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    // Baris "Belum dibalas" di landing juga memuat subjek email, jadi penanda
    // workspace adalah tab filter kotak masuk.
    const workspace = page.getByRole("button", { name: "Terbalas" });
    await expect
      .poll(
        async () => (await picker.isVisible()) || (await workspace.isVisible()),
        { timeout: 20000 },
      )
      .toBe(true);
    if (await picker.isVisible()) {
      await picker.getByRole("button", { name: "Mulai" }).click();
    }
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

  test("editor skenario menyimpan arah balasan tembusan yang meminta bantuan OJK", async ({
    page,
  }) => {
    const companyScenario = COMPANY_SCENARIO;
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

    await page.getByRole("button", { name: /^Pengaturan/ }).first().click();
    // Judul dialog berganti saat wizard skenario terbuka; hanya satu dialog aktif.
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: `Ubah ${companyScenario.title}` })
      .click({ timeout: 20000 });
    await dialog.getByRole("button", { name: "Lanjut" }).click();
    await dialog.getByRole("button", { name: "Lanjut" }).click();

    const direction = dialog.getByRole("radiogroup", { name: "Arah balasan" });
    await expect(direction).toBeVisible();
    await expect(
      direction.getByRole("radio", { name: /Hanya tembusan ke OJK/ }),
    ).toBeChecked();
    await direction
      .getByRole("radio", { name: /Tembusan, tapi minta bantuan OJK/ })
      .check();

    await dialog.getByRole("button", { name: "Simpan Skenario" }).click();
    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/pdkt/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as {
      settings: { scenarios: Array<Record<string, unknown>> };
    };
    const scenario = saved.settings.scenarios.find(
      (item) => item.id === companyScenario.id,
    );
    expect(scenario).toMatchObject({
      primaryRecipientType: "reported_company",
      ojkRequestInBody: true,
    });
    expectHermetic(audit);
  });

  test("panel telaah menandai kalimat balasan yang dikomentari AI", async ({
    page,
  }) => {
    const reply = "Terima kasih, kami cek transaksinya.";
    const matchedQuote = "kami cek transaksinya";
    const start = reply.indexOf(matchedQuote);
    const history = [
      {
        ...EVALUATED_HISTORY[0],
        evaluation: {
          ...EVALUATED_HISTORY[0].evaluation,
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
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(history, [REPLIED_MAIL]),
    });
    await page.getByRole("button", { name: /^Mulai simulasi/ }).first().click();
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    const terbalas = page.getByRole("button", { name: "Terbalas" });
    await expect
      .poll(async () => (await picker.isVisible()) || (await terbalas.isVisible()), {
        timeout: 20000,
      })
      .toBe(true);
    if (await picker.isVisible()) {
      await picker.getByRole("button", { name: "Mulai" }).click();
    }
    await terbalas.click();
    await page.getByText(REPLIED_MAIL.list.subject).first().click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);

    const card = page.getByRole("region", { name: "Catatan di balasan Anda" });
    await expect(card).toBeVisible({ timeout: 20000 });
    const marks = card.locator("mark");
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText(`${matchedQuote}1`);
    await expect(card).toContainText("Terima kasih,");

    const notes = card.getByRole("listitem");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toContainText("1");
    await expect(notes.nth(0)).toContainText(
      "Sebutkan kapan konsumen akan menerima kabar.",
    );
    await expect(notes.nth(1)).toContainText(
      "Tambahkan nomor tiket supaya konsumen bisa menindaklanjuti.",
    );
    await expect(notes.nth(1)).toContainText("Tidak ditandai di balasan");
    expectHermetic(audit);
  });

  test(`teks mailbox, evaluasi, dan lampiran PDKT minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks(EVALUATED_HISTORY, [OPEN_MAIL, REPLIED_MAIL]),
    });
    await page.getByRole("button", { name: /^Mulai simulasi/ }).first().click();
    const picker = page
      .getByRole("dialog")
      .filter({ hasText: "Pilih peserta latihan" });
    const workspace = page.getByRole("button", { name: "Terbalas" });
    await expect
      .poll(async () => (await picker.isVisible()) || (await workspace.isVisible()), {
        timeout: 20000,
      })
      .toBe(true);
    if (await picker.isVisible()) {
      await picker.getByRole("button", { name: "Mulai" }).click();
    }
    await expect(
      page.locator("main").first().getByText(OPEN_MAIL.list.subject).first(),
    ).toBeVisible({ timeout: 20000 });

    // Filter default "Belum Dibalas" memilih email terbuka (berlampiran) otomatis.
    await waitForMockedApi(audit, [`/pdkt/mailbox/${OPEN_MAIL.list.id}`]);
    await expect(
      page.getByRole("button", { name: "Attachment 1" }),
    ).toBeVisible({ timeout: 20000 });
    const offenders = (await findTextBelowFloor(page.locator("main").first())).map(
      (o) => `[mailbox + lampiran] ${o}`,
    );

    await page.getByRole("button", { name: "Terbalas" }).click();
    await page.getByText(REPLIED_MAIL.list.subject).first().click();
    await waitForMockedApi(audit, [`/pdkt/mailbox/${REPLIED_MAIL.list.id}`]);
    await expect(page.getByText("Sebut kanal pengaduan resmi.").first()).toBeVisible({
      timeout: 20000,
    });
    offenders.push(
      ...(await findTextBelowFloor(page.locator("main").first())).map(
        (o) => `[terbalas + evaluasi] ${o}`,
      ),
    );

    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
