import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Beranda agent — hermetic.
 *
 * Kontrak (rencana `plans/markdown/shell-beranda-redesign.md`, hasil D):
 * aksi utama "Lanjutkan KETIK"; tanpa panel tren dan "Perlu tindakan";
 * Fase 4 menambah QA pribadi, kuota dan riwayat Telefun. Endpoint SIDAK/admin
 * dan home/attention tetap terlarang; hanya home/agent-summary yang dibuka.
 * Guard fail-closed membuktikan tidak ada permintaan di luar allowlist.
 */

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

const KETIK_HISTORY = [
  {
    id: "k1",
    date: minutesAgo(60),
    scenarioTitle: "Keluhan tagihan kartu kredit",
    consumerName: "Budi",
    finalScore: 86,
    reviewStatus: "completed",
  },
  {
    id: "k2",
    date: minutesAgo(10),
    scenarioTitle: "Pengaduan asuransi",
    consumerName: "Sari",
    reviewStatus: "pending",
  },
];

const ketikPage = (items: typeof KETIK_HISTORY) => ({
  items,
  nextCursor: null,
  total: items.length,
  counts: {
    all: items.length,
    completed: items.filter((item) => item.reviewStatus === "completed").length,
    running: items.filter((item) => item.reviewStatus === "pending").length,
    failed: 0,
    not_started: 0,
  },
  reviewedCount: items.filter((item) => typeof item.finalScore === "number")
    .length,
  averageScore: items.length ? 86 : null,
});

const PDKT_HISTORY = [
  {
    id: "p1",
    timestamp: minutesAgo(30),
    config: { scenarios: [{ title: "Restrukturisasi kredit" }] },
    emails: [],
    evaluation: { score: 78 },
    evaluation_status: "completed",
  },
];

function mocks(
  ketik: { status?: number; body: unknown },
  pdkt: { status?: number; body: unknown },
): ApiMock[] {
  return [
    { method: "GET", path: "/api/v1/ketik/history", ...ketik },
    { method: "GET", path: "/api/v1/pdkt/history", ...pdkt },
    { method: "GET", path: "/api/v1/telefun/sessions", ...ok([]) },
    {
      method: "GET",
      path: "/api/v1/home/agent-summary",
      ...ok({ linked: false, qa: null }),
    },
    {
      method: "GET",
      path: "/api/v1/me/practice-quota",
      ...ok([
        {
          module: "ketik",
          limit: 5,
          used: 2,
          source: "role",
          ends_on: null,
          resets_at: "2026-10-21T00:00:00+07:00",
        },
        {
          module: "pdkt",
          limit: null,
          used: 0,
          source: "role",
          ends_on: null,
          resets_at: "2026-10-21T00:00:00+07:00",
        },
        {
          module: "telefun",
          limit: 1,
          used: 1,
          source: "role",
          ends_on: null,
          resets_at: "2026-10-21T00:00:00+07:00",
        },
      ]),
    },
  ];
}

const ok = (data: unknown) => ({ body: { success: true, data } });

function history(page: Page) {
  return page.getByRole("region", { name: "Riwayat sesi" });
}

test.describe("Beranda agent", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("aksi utama, latihan yang diizinkan, tanpa tren staff dan perlu tindakan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok(ketikPage(KETIK_HISTORY)), ok(PDKT_HISTORY)),
    });
    const main = page.getByRole("region", { name: "Konten halaman" });
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20000,
    });
    await expect(
      main.getByRole("link", { name: "Lanjutkan KETIK", exact: true }),
    ).toHaveAttribute("href", "/ketik");

    const practice = page.getByRole("region", { name: "Latihan" });
    await expect(
      practice.getByRole("link", { name: /^KETIK/ }),
    ).toHaveAttribute("href", "/ketik");
    await expect(practice.getByRole("link", { name: /^PDKT/ })).toHaveAttribute(
      "href",
      "/pdkt",
    );
    await expect(
      practice.getByRole("link", { name: /^TELEFUN/i }),
    ).toHaveAttribute("href", "/telefun");
    await expect(practice.getByRole("link")).toHaveCount(3);

    for (const absent of ["Tren temuan QA", "Perlu tindakan"]) {
      await expect(main.getByRole("heading", { name: absent })).toHaveCount(0);
    }
    await expect(history(page).getByRole("row")).toHaveCount(4);
    expectHermetic(audit);
  });

  test("riwayat: gabungan terbaru dulu, skor atau status ulasan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok(ketikPage(KETIK_HISTORY)), ok(PDKT_HISTORY)),
    });
    const rows = history(page).getByRole("row");
    // Baris pertama adalah kepala tabel.
    await expect(rows).toHaveCount(4, { timeout: 20000 });
    await expect(rows.nth(1)).toContainText("KETIK");
    await expect(rows.nth(1)).toContainText("Pengaduan asuransi");
    await expect(rows.nth(1)).toContainText("Menunggu ulasan");
    await expect(rows.nth(2)).toContainText("PDKT");
    await expect(rows.nth(2)).toContainText("Restrukturisasi kredit");
    await expect(rows.nth(2)).toContainText("78");
    await expect(rows.nth(3)).toContainText("Keluhan tagihan kartu kredit");
    await expect(rows.nth(3)).toContainText("86");
    expectHermetic(audit);
  });

  for (const width of [390, 1280])
    test(`QA pribadi, kuota dan Telefun tampil tanpa membuka data staff (${width}px)`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({
        colorScheme: width === 390 ? "dark" : "light",
        reducedMotion: "reduce",
      });
      const qa = {
        linked: true,
        qa: {
          serviceType: "chat",
          periodLabel: "Mar 2018",
          score: 40,
          target: 95,
          gapToTarget: 55,
          previousLabel: "Feb 2018",
          delta: -47.5,
          trend: [
            { periodLabel: "Feb 2018", score: 87.5 },
            { periodLabel: "Mar 2018", score: 40 },
          ],
          topParameters: [
            { name: "Akurasi A", count: 5 },
            { name: "Bahasa B", count: 4 },
            { name: "Catatan C", count: 3 },
          ],
          recommendation: "Biasakan checklist verifikasi data pelanggan.",
        },
      };
      const audit = await openHermeticShell(page, {
        path: "/dashboard",
        auth: { role: "agent" },
        apiMocks: [
          { method: "GET", path: "/api/v1/home/agent-summary", ...ok(qa) },
          {
            method: "GET",
            path: "/api/v1/telefun/sessions",
            ...ok([
              {
                id: "t1",
                created_at: minutesAgo(1),
                scenario_title: "Telefun uji",
                score: 7.6,
                scoring_status: "completed",
              },
            ]),
          },
          ...mocks(ok(ketikPage(KETIK_HISTORY)), ok(PDKT_HISTORY)),
        ],
      });
      const section = page.getByRole("region", { name: "Skor QA saya" });
      await expect(section).toContainText(
        "Skor QA Mar 2018 40,0, 55,0 poin di bawah target 95.",
      );
      await expect(section).toContainText("Turun 47,5 dari Feb 2018.");
      await expect(
        section.getByRole("table", { name: "Tren skor QA" }),
      ).toContainText("87,5");
      await expect(section).toContainText("Akurasi A");
      await expect(section).toContainText(qa.qa.recommendation);
      await expect(section.getByRole("listitem")).toHaveCount(3);
      const practice = page.getByRole("region", { name: "Latihan" });
      await expect(practice).toContainText("Sisa hari ini 3 dari 5");
      await expect(practice).toContainText("Tanpa batas harian");
      await expect(practice).toContainText(
        "Jatah Telefun hari ini sudah habis",
      );
      await expect(practice).toContainText("00.00 WIB");
      await expect(history(page).getByRole("row").nth(1)).toContainText(
        "Telefun uji",
      );
      await expect(history(page).getByRole("row").nth(1)).toContainText(
        "7,6 / 10",
      );
      // Dev StrictMode replays mount effects (main.tsx). Still one shared
      // lookup per mount, not three independent module lookups.
      const quotaCalls = audit.mockedApi.filter(
        (p) => p === "GET /api/v1/me/practice-quota",
      ).length;
      expect(quotaCalls).toBeGreaterThanOrEqual(1);
      expect(quotaCalls).toBeLessThanOrEqual(2);
      expect(await findTextBelowFloor(section)).toEqual([]);
      expect(await findTextBelowFloor(practice)).toEqual([]);
      await section.screenshot({
        path: testInfo.outputPath(`agent-qa-${width}.png`),
      });
      await practice.screenshot({
        path: testInfo.outputPath(`agent-practice-${width}.png`),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expectHermetic(audit);
    });

  for (const delta of [null, 0, 2])
    test(`QA tanpa temuan: target dan perubahan ${delta}`, async ({ page }) => {
      const audit = await openHermeticShell(page, {
        path: "/dashboard",
        auth: { role: "agent" },
        apiMocks: [
          {
            method: "GET",
            path: "/api/v1/home/agent-summary",
            ...ok({
              linked: true,
              qa: {
                serviceType: "chat",
                periodLabel: "Mar 2018",
                score: 100,
                target: 95,
                gapToTarget: null,
                previousLabel: delta === null ? null : "Feb 2018",
                delta,
                trend: [{ periodLabel: "Mar 2018", score: 100 }],
                topParameters: [],
                recommendation: null,
              },
            }),
          },
          ...mocks(ok(ketikPage([])), ok([])),
        ],
      });
      const section = page.getByRole("region", { name: "Skor QA saya" });
      await expect(section).toContainText("sudah mencapai target 95");
      await expect(section).toContainText("Tidak ada temuan di Mar 2018.");
      await expect(section).toContainText(
        delta === null
          ? "Belum ada periode pembanding"
          : delta === 0
            ? "Sama dengan Feb 2018."
            : "Naik 2,0 dari Feb 2018.",
      );
      expectHermetic(audit);
    });

  test("akun tertaut tanpa audit dibedakan dari akun belum tertaut", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/home/agent-summary",
          ...ok({ linked: true, qa: null }),
        },
        ...mocks(ok(ketikPage([])), ok([])),
      ],
    });
    await expect(
      page.getByRole("region", { name: "Skor QA saya" }),
    ).toContainText("Belum ada audit QA");
    await expect(
      page.getByRole("region", { name: "Latihan" }).getByRole("link"),
    ).toHaveCount(3);
    expectHermetic(audit);
  });

  test("QA dan kuota gagal tetap mempertahankan latihan, retry QA pulih", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/home/agent-summary",
          status: 503,
          body: {
            success: false,
            error: { message: "Ringkasan QA belum dapat dimuat." },
          },
        },
        {
          method: "GET",
          path: "/api/v1/me/practice-quota",
          status: 503,
          body: {
            success: false,
            error: { message: "Kuota belum dapat dimuat." },
          },
        },
        ...mocks(ok(ketikPage(KETIK_HISTORY)), ok(PDKT_HISTORY)),
      ],
    });
    const section = page.getByRole("region", { name: "Skor QA saya" });
    await expect(section).toContainText("Ringkasan QA belum dapat dimuat");
    await expect(page.getByRole("region", { name: "Latihan" })).toContainText(
      "Kuota latihan belum dapat dimuat",
    );
    await expect(
      page.getByRole("region", { name: "Latihan" }).getByRole("link"),
    ).toHaveCount(3);
    await page.route("**/api/v1/home/agent-summary", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { linked: false, qa: null },
        }),
      }),
    );
    const retry = section.getByRole("button", { name: "Coba lagi" });
    await retry.focus();
    await expect(retry).toBeFocused();
    expect(
      await retry.evaluate((el) => (el as HTMLElement).offsetHeight),
    ).toBeGreaterThanOrEqual(44);
    await retry.press("Enter");
    await expect(section).toContainText("Data QA Anda belum tersambung");
    expectHermetic(audit);
  });

  test("riwayat dibatasi lima terbaru dan Telefun gagal tetap dijelaskan", async ({
    page,
  }) => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...KETIK_HISTORY[0],
      id: `many-${i}`,
      scenarioTitle: `Skenario ${i}`,
      date: minutesAgo(i + 1),
    }));
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/telefun/sessions",
          status: 503,
          body: { success: false, error: { message: "Unavailable" } },
        },
        ...mocks(ok(ketikPage(many)), ok(PDKT_HISTORY)),
      ],
    });
    await expect(history(page).getByRole("row")).toHaveCount(6);
    await expect(history(page).getByRole("row").nth(1)).toContainText(
      "Skenario 0",
    );
    await expect(history(page).getByRole("row").nth(5)).toContainText(
      "Skenario 4",
    );
    await expect(history(page)).toContainText(
      "Riwayat Telefun belum dapat dimuat",
    );
    expectHermetic(audit);
  });

  test("semua riwayat gagal menampilkan error dan retry, bukan keadaan kosong", async ({
    page,
  }) => {
    const failed = {
      status: 503,
      body: { success: false, error: { message: "Unavailable" } },
    };
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: [
        { method: "GET", path: "/api/v1/telefun/sessions", ...failed },
        ...mocks(failed, failed),
      ],
    });
    await expect(history(page)).toContainText(
      "Riwayat sesi belum dapat dimuat",
    );
    await expect(
      history(page).getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Latihan" }).getByRole("link"),
    ).toHaveCount(3);
    expectHermetic(audit);
  });

  test("riwayat kosong", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(ok(ketikPage([])), ok([])),
    });
    await expect(history(page).getByText("Belum ada sesi latihan")).toBeVisible(
      { timeout: 20000 },
    );
    expectHermetic(audit);
  });

  test("satu riwayat gagal: sesi lain tetap tampil dengan catatan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard",
      auth: { role: "agent" },
      apiMocks: mocks(
        {
          status: 500,
          body: {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "boom" },
          },
        },
        ok(PDKT_HISTORY),
      ),
    });
    const section = history(page);
    await expect(section.getByRole("row")).toHaveCount(2, { timeout: 20000 });
    await expect(
      section.getByText("Riwayat KETIK belum dapat dimuat"),
    ).toBeVisible();
    expectHermetic(audit);
  });
});
