import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Telefun — riwayat (hermetic).
 *
 * Modul terakhir tanpa E2E (plan 025 Wave 3, spec #13). Landing Telefun
 * mengambil `/api/v1/telefun/settings` dan `/sessions` saat load, jadi
 * keduanya selalu di-mock.
 *
 * PENTING: `/api/v1/telefun/sessions` mengembalikan BARIS DB (snake_case) yang
 * baru dipetakan ke `CallRecord` oleh `mapTelefunSessionRow`. Memakai nama
 * camelCase di fixture membuat baris ter-render KOSONG tanpa error apa pun —
 * karena itu fixture di sini memakai nama kolom yang sebenarnya.
 */

type TelefunRow = {
  id: string;
  created_at?: string;
  consumer_name?: string;
  scenario_title?: string;
  duration_seconds?: number;
  score?: number | null;
  scoring_status?: "pending" | "processing" | "completed" | "failed";
  scoring_retryable?: boolean;
  simulationSubject?: unknown;
  voice_assessment?: unknown;
  messages?: unknown;
};

const BASE_ROW: TelefunRow = {
  id: "telefun-history-1",
  created_at: "2026-09-10T00:00:00.000Z",
  consumer_name: "Andi",
  scenario_title: "Skenario Telefun",
  duration_seconds: 300,
};

/** Peserta yang record hidupnya sudah tidak tersedia. */
const UNAVAILABLE_PARTICIPANT_ROW: TelefunRow = {
  ...BASE_ROW,
  simulationSubject: {
    type: "participant",
    participantId: null,
    displayName: "Andi",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
};

/** Sesi selesai dengan penilaian suara lengkap, untuk membuka modal review. */
const aspect = (score: number, verdict: string) => ({
  score,
  verdict,
  feedback: `Umpan balik ${verdict.toLowerCase()} untuk aspek ini.`,
});
const REVIEWED_ROW: TelefunRow = {
  ...BASE_ROW,
  id: "telefun-reviewed-1",
  score: 8,
  scoring_status: "completed",
  voice_assessment: {
    overallScore: 8,
    speakingRate: { ...aspect(8, "Baik"), wordsPerMinute: 135 },
    intonation: aspect(7, "Cukup"),
    articulation: aspect(8, "Baik"),
    fillerWords: { ...aspect(6, "Cukup"), count: 4, examples: ["eee", "anu"] },
    emotionalTone: { ...aspect(8, "Baik"), dominant: "tenang" },
    transcript: "",
    highlights: ["Menyapa pelanggan dengan nama"],
    strengths: ["Intonasi stabil"],
    holdManagement: {
      status: "within_limit",
      score: 9,
      verdict: "Baik",
      feedback: "Hold dipakai sekali dan sesuai batas.",
      holdCount: 1,
      totalDurationMs: 20000,
      longestDurationMs: 20000,
      exceededCount: 0,
    },
  },
  messages: [
    { speaker: "agent", text: "Selamat pagi, dengan Andi?", startMs: 0 },
    { speaker: "consumer", text: "Iya, saya mau tanya tagihan.", startMs: 2400 },
  ],
};

function telefunMocks(history: readonly TelefunRow[]): readonly ApiMock[] {
  return [
    {
      // Diambil saat modal riwayat dibuka (bukan saat landing dimuat).
      method: "GET",
      path: "/api/v1/telefun/settings",
      body: { success: true, data: {} },
    },
    {
      method: "GET",
      path: "/api/v1/telefun/sessions",
      body: { success: true, data: history },
    },
  ];
}

async function openHistory(
  page: Page,
  history: readonly TelefunRow[],
  extraMocks: readonly ApiMock[] = [],
) {
  const audit = await openHermeticShell(page, {
    path: "/telefun",
    apiMocks: [...telefunMocks(history), ...extraMocks],
  });
  await page
    .getByRole("button", { name: /^Riwayat/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 20000 });
  return { audit, dialog };
}

test.describe("Telefun (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test(`landing Telefun dirender tanpa menyentuh backend, teks minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/telefun",
      apiMocks: telefunMocks([]),
    });
    await expect(
      page.getByText("Lihat alur panggilan sebelum memilih skenario latihan."),
    ).toBeVisible({ timeout: 20000 });

    // Mockup telepon (aria-hidden) meniru layar ponsel pada skala kecil,
    // termasuk huruf keypad; ia ilustrasi, bukan teks UI yang dibaca.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="telefun-motion-frame"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test(`teks riwayat dan review Telefun minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    // Tanpa rekaman: modal menampilkan status "belum tersedia", tidak memuat audio.
    const { audit, dialog } = await openHistory(page, [REVIEWED_ROW], [
      {
        method: "GET",
        path: `/api/v1/telefun/recording/${REVIEWED_ROW.id}`,
        body: { success: true, data: { url: null } },
      },
    ]);
    await expect(dialog.getByText("Skenario Telefun")).toBeVisible();
    const history = await findTextBelowFloor(dialog);

    await dialog
      .getByRole("button", { name: "Lihat detail Skenario Telefun" })
      .click();
    const review = page.getByRole("dialog").last();
    const tabs = review.getByRole("tablist", { name: "Bagian detail sesi" });
    await expect(tabs).toBeVisible({ timeout: 20000 });
    const details = await findTextBelowFloor(review);

    await tabs.getByRole("tab").nth(1).click();
    await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const assessment = await findTextBelowFloor(review);

    const offenders = [...new Set([...history, ...details, ...assessment])];
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("teks sumbu radar komunikasi memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [REVIEWED_ROW], [
      {
        method: "GET",
        path: `/api/v1/telefun/recording/${REVIEWED_ROW.id}`,
        body: { success: true, data: { url: null } },
      },
    ]);
    await dialog
      .getByRole("button", { name: "Lihat detail Skenario Telefun" })
      .click();
    const review = page.getByRole("dialog").last();
    const tabs = review.getByRole("tablist", { name: "Bagian detail sesi" });
    await expect(tabs).toBeVisible({ timeout: 20000 });
    await tabs.getByRole("tab").nth(1).click();

    // Radar dimuat lazy; tunggu label sumbu sudutnya benar-benar tergambar.
    const radar = review.locator(".recharts-wrapper").first();
    await expect(radar.locator("svg text").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(radar.getByText("Speaking Rate")).toBeVisible();

    await expect(
      review.locator(".recharts-legend-wrapper span").first(),
    ).toBeVisible();
    const offenders: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const found = [
        ...(await findLowContrastText(radar)),
        ...(await findLowContrastText(review, {
          selector: ".recharts-legend-wrapper span",
          leafOnly: true,
        })),
      ];
      offenders.push(...new Set(found.map((o) => `[${theme}] ${o}`)));
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("teks aksen modul di modal review memenuhi kontras 4.5:1 di tema terang dan gelap", async ({
    page,
  }) => {
    // url null -> modal menampilkan galat rekaman beserta aksi aksen "Coba Lagi".
    const { audit, dialog } = await openHistory(page, [REVIEWED_ROW], [
      {
        method: "GET",
        path: `/api/v1/telefun/recording/${REVIEWED_ROW.id}`,
        body: { success: true, data: { url: null } },
      },
    ]);
    await dialog
      .getByRole("button", { name: "Lihat detail Skenario Telefun" })
      .click();
    const review = page.getByRole("dialog").last();
    const tabs = review.getByRole("tablist", { name: "Bagian detail sesi" });
    await expect(tabs).toBeVisible({ timeout: 20000 });
    await expect(tabs.getByRole("tab", { name: "Detail Sesi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const retry = review.getByRole("button", { name: "Coba Lagi" });
    await expect(retry).toBeVisible({ timeout: 20000 });

    const offenders: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const found = [
        // Label tab aktif (aksen modul).
        ...(await findLowContrastText(tabs, {
          selector: '[role="tab"][aria-selected="true"]',
        })),
        // Aksi teks aksen; root = pembungkusnya supaya hanya tombol ini dipindai.
        ...(await findLowContrastText(retry.locator(".."), {
          selector: "button",
          leafOnly: true,
        })),
      ];
      offenders.push(...found.map((o) => `[${theme}] ${o}`));
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("baris riwayat menampilkan data sesi yang sebenarnya", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [BASE_ROW]);

    // Membuktikan field snake_case benar-benar terpetakan, bukan baris kosong.
    await expect(dialog.getByText("Skenario Telefun")).toBeVisible();
    await expect(dialog.getByText("Andi")).toBeVisible();

    expectHermetic(audit);
  });

  test("kartu riwayat menandai peserta yang record-nya tidak tersedia", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [
      UNAVAILABLE_PARTICIPANT_ROW,
    ]);

    await expect(
      dialog.getByText("Target: Andi (record peserta tidak lagi tersedia)"),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("ekspor CSV riwayat memuat penanda peserta tidak tersedia", async ({
    page,
  }) => {
    const { audit } = await openHistory(page, [UNAVAILABLE_PARTICIPANT_ROW]);

    // File yang benar-benar diunduh, bukan string yang dirender.
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Ekspor riwayat panggilan ke CSV" })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^telefun_history_\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    const csv = readFileSync(filePath as string, "utf8");
    expect(csv).toContain("record peserta tidak lagi tersedia");
    // Kolom konsumen ikut terbukti karena field-nya benar.
    expect(csv).toContain("Skenario Telefun");
    expect(csv).toContain("Andi");

    expectHermetic(audit);
  });

  test("menu sekunder baris menyediakan unduh rekaman dan hapus riwayat", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [BASE_ROW]);

    // Sebelum menu dibuka, aksinya tidak berada di permukaan baris.
    await expect(
      page.getByRole("menuitem", { name: "Unduh rekaman" }),
    ).toHaveCount(0);

    await dialog
      .getByRole("button", { name: /^Aksi lainnya untuk/ })
      .first()
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Unduh rekaman" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Hapus riwayat" }),
    ).toBeVisible();

    expectHermetic(audit);
  });

  test("kontrol baris dan menu sekunder memenuhi target sentuh 44px", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [BASE_ROW]);

    // Diukur dari LAYOUT box (`offsetHeight`), bukan `getBoundingClientRect()`:
    // animasi masuk dialog memakai transform scale, sehingga rect terukur
    // 44 x 0.95 = 41,8px dan gagal palsu. `offsetHeight` tidak terpengaruh
    // transform dan memang ukuran kotak yang dimaksud aturan 44px.
    const heightOf = (locator: ReturnType<typeof dialog.getByRole>) =>
      locator.evaluate((el) => (el as HTMLElement).offsetHeight);

    const controls: Array<[string, ReturnType<typeof dialog.getByRole>]> = [
      [
        "Lihat detail",
        dialog.getByRole("button", { name: /^Lihat detail/ }).first(),
      ],
      [
        "Aksi lainnya",
        dialog.getByRole("button", { name: /^Aksi lainnya untuk/ }).first(),
      ],
    ];
    for (const [label, control] of controls) {
      expect(await heightOf(control), label).toBeGreaterThanOrEqual(44);
    }

    await dialog
      .getByRole("button", { name: /^Aksi lainnya untuk/ })
      .first()
      .click();
    for (const name of ["Unduh rekaman", "Hapus riwayat"]) {
      const item = page.getByRole("menuitem", { name });
      await expect(item).toBeVisible();
      expect(
        await item.evaluate((el) => (el as HTMLElement).offsetHeight),
        name,
      ).toBeGreaterThanOrEqual(44);
    }

    // Stacking dibuktikan lewat hit-test: titik tengah menu harus benar-benar
    // mengenai menu, bukan elemen lain yang menutupinya. Ini menguji hasilnya,
    // bukan nama class `z-[210]`.
    const hit = await page.evaluate(() => {
      const menu = document.querySelector("[role=menu]");
      if (!menu) return null;
      const rect = menu.getBoundingClientRect();
      const el = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return el ? menu.contains(el) : false;
    });
    expect(hit, "menu tertutup elemen lain").toBe(true);

    expectHermetic(audit);
  });
});

// Status scoring: label harus menyatakan keadaan sebenarnya, dan skor tidak
// boleh muncul sebelum benar-benar ada.
const SCORING_STATES: ReadonlyArray<{
  name: string;
  patch: Partial<TelefunRow>;
  label: string;
}> = [
  {
    name: "pending",
    patch: { scoring_status: "pending" },
    label: "Menunggu analisis",
  },
  {
    name: "processing",
    patch: { scoring_status: "processing" },
    label: "Sedang dianalisis",
  },
  {
    name: "failed-retryable",
    patch: { scoring_status: "failed", scoring_retryable: true },
    label: "Analisis gagal, akan dicoba lagi otomatis",
  },
  {
    name: "failed-permanent",
    patch: { scoring_status: "failed", scoring_retryable: false },
    label: "Analisis gagal, coba lagi",
  },
  {
    name: "completed-scored",
    patch: { scoring_status: "completed", score: 9 },
    label: "Feedback siap",
  },
];

test.describe("Telefun — kejujuran status scoring", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  for (const state of SCORING_STATES) {
    test(`status "${state.name}" tampil jujur di daftar riwayat`, async ({
      page,
    }) => {
      const { audit, dialog } = await openHistory(page, [
        { ...BASE_ROW, id: `telefun-${state.name}`, ...state.patch },
      ]);

      await expect(dialog.getByText(state.label)).toBeVisible();
      expectHermetic(audit);
    });
  }

  test("sesi selesai tanpa skor tidak mengaku feedback siap", async ({
    page,
  }) => {
    const { audit, dialog } = await openHistory(page, [
      {
        ...BASE_ROW,
        id: "telefun-completed-unscored",
        scoring_status: "completed",
      },
    ]);

    await expect(dialog.getByText("Skenario Telefun")).toBeVisible();
    await expect(dialog.getByText("Feedback siap")).toHaveCount(0);
    for (const other of SCORING_STATES) {
      await expect(dialog.getByText(other.label)).toHaveCount(0);
    }

    expectHermetic(audit);
  });
});
