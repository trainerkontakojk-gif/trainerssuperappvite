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
      scenario_snapshot: SCENARIO,
      config_snapshot: SESSION_CONFIG,
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

  test("landing PDKT menampilkan intro dan aksi workspace", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(page.getByText(/Paham Dulu, Kasih Tanggapan/)).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(/Latih balasan email\. Pahami dulu, baru tanggapi\./),
    ).toBeVisible();
    await expect(page.getByText(/PDKT — singkatan dari/)).toBeVisible();
    await expect(page.getByText(/Mulai latihan/)).toBeVisible();
    await expect(page.getByText(/Daftar email masuk/)).toBeVisible();

    // Copy grid lama tidak boleh kembali.
    for (const stale of [
      "Tentang PDKT",
      "Riwayat Sesi",
      "Pilih skenario dan mulai simulasi email",
    ]) {
      await expect(page.getByText(stale, { exact: true })).toHaveCount(0);
    }

    // Urutan aksi diukur dari posisi nyatanya di browser (kolom atas→bawah),
    // bukan dari urutan DOM yang diasumsikan.
    const labels = [
      "Mulai simulasi",
      "Pengaturan",
      "Riwayat",
      /pemakaian bulan ini/i,
    ] as const;
    const positions: number[] = [];
    for (const label of labels) {
      const button = page
        .getByRole("button", {
          name: typeof label === "string" ? new RegExp(`^${label}`) : label,
        })
        .first();
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, `tombol ${label} tidak punya kotak`).not.toBeNull();
      positions.push(box!.y);
    }
    for (let index = 1; index < positions.length; index += 1) {
      expect(
        positions[index],
        `aksi ke-${index + 1} tidak berada di bawah aksi ke-${index}`,
      ).toBeGreaterThan(positions[index - 1]);
    }

    await waitForMockedApi(audit, [
      "/pdkt/settings",
      "/pdkt/scenarios",
      "/pdkt/consumer-types",
      "/pdkt/history",
    ]);
    expectHermetic(audit);
  });

  test("Pengaturan membuka modal pengaturan simulasi", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /^Pengaturan/ })
      .first()
      .click();
    await expect(page.getByText("Pengaturan Simulasi").first()).toBeVisible({
      timeout: 20000,
    });

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

  test("Pemakaian bulan ini membuka modal usage", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });

    await page
      .getByRole("button", { name: /pemakaian bulan ini/i })
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

  test(`teks landing PDKT minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/pdkt",
      apiMocks: pdktMocks([]),
    });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }).first(),
    ).toBeVisible({ timeout: 20000 });

    // Mockup email (aria-hidden) meniru layar kotak masuk pada skala kecil;
    // ia ilustrasi, bukan teks UI yang dibaca.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="pdkt-motion-frame"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
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
    const openSubject = page.getByText(OPEN_MAIL.list.subject).first();
    await expect
      .poll(async () => (await picker.isVisible()) || (await openSubject.isVisible()), {
        timeout: 20000,
      })
      .toBe(true);
    if (await picker.isVisible()) {
      await picker.getByRole("button", { name: "Mulai" }).click();
    }
    await expect(openSubject).toBeVisible({ timeout: 20000 });

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
