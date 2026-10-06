import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Workspace Profiler (plan `profiler-workspace-redesign.md`, tahap 1).
 *
 * Kontrak yang dibuktikan, semuanya hermetic lewat `profilerMocks.ts`:
 *   - satu navigasi tim → batch di panel kiri, tanpa navigator/hierarki ganda;
 *   - batch aktif ada di URL (`?batch=`), tahan refresh dan tombol back;
 *   - batch aktif langsung menampilkan peserta + pencarian + baris ulang tahun;
 *   - tampilan lain berupa tautan ke route yang sudah ada dengan `?batch=`;
 *   - aksi tulis hilang untuk peran hanya-baca;
 *   - viewport sempit memakai sheet "Pilih batch" tanpa overflow horizontal.
 */

const LEADER_APPROVED_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: {
      success: true,
      data: { ktp: { status: "approved", module: "ktp", created_at: null } },
    },
  },
  ...PROFILER_MOCKS.filter((mock) => mock.path !== "/api/v1/me/access-status"),
];

function batchNav(page: Page) {
  return page.getByRole("navigation", { name: "Daftar tim dan batch" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Workspace Profiler (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("tanpa batch: satu navigasi dan ringkasan batch tahun aktif", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });

    const nav = batchNav(page);
    await expect(nav).toBeVisible({ timeout: 20000 });
    await expect(
      nav.getByRole("button", { name: /^Batch Pagi/ }),
    ).toBeVisible();
    await expect(nav.getByRole("button", { name: /^Tim Email/ })).toBeVisible();

    const overview = page.getByRole("region", { name: /Batch tahun 2026/ });
    await expect(overview).toBeVisible();
    await expect(
      overview.getByRole("button", { name: /Batch Pagi.*2 peserta/ }),
    ).toBeVisible();

    // Navigator tengah dan panel hierarki lama tidak lagi tampil berdampingan.
    await expect(page.getByText("Hierarki data")).toHaveCount(0);
    await expect(page.getByText("Pilih tahun data")).toHaveCount(0);

    await waitForMockedApi(audit, [
      "/profiler/years",
      "/profiler/folders",
      "/profiler/counts",
    ]);
    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("memilih batch menampilkan peserta, tersimpan di URL, dan back kembali ke ringkasan", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });

    await batchNav(page)
      .getByRole("button", { name: /^Batch Pagi/ })
      .click({ timeout: 20000 });

    await expect(page).toHaveURL(/[?&]batch=Batch(%20|\+)Pagi/);
    const workspace = page.getByRole("region", { name: "Batch Pagi" });
    await expect(
      workspace.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible();
    await expect(workspace.getByText("Rina Kartika").first()).toBeVisible();
    await expect(workspace.getByText("Dimas Prasetyo").first()).toBeVisible();

    // Baris ulang tahun hanya satu baris dan membuka modal yang sudah ada.
    const birthdayButton = workspace.getByRole("button", {
      name: /Ulang tahun.*Rina Kartika.*hari ini/i,
    });
    await expect(birthdayButton).toBeVisible();
    await birthdayButton.click();
    await expect(page.getByRole("dialog").getByText("HARI INI")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible({ timeout: 20000 });

    await page.goBack();
    await expect(page).not.toHaveURL(/batch=/);
    await expect(
      page.getByRole("region", { name: /Batch tahun 2026/ }),
    ).toBeVisible({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("deep link batch: pencarian peserta dan tautan tampilan lain membawa ?batch=", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: PROFILER_MOCKS,
    });

    const workspace = page.getByRole("region", { name: "Batch Pagi" });
    await expect(workspace.getByText("Rina Kartika").first()).toBeVisible({
      timeout: 20000,
    });

    await workspace
      .getByRole("searchbox", { name: "Cari peserta" })
      .fill("dim");
    await expect(workspace.getByText("Dimas Prasetyo").first()).toBeVisible();
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toHaveCount(0);

    const views = workspace.getByRole("navigation", {
      name: "Tampilan batch",
    });
    const BATCH_QS = "batch=Batch(%20|\\+)Pagi";
    for (const [name, href] of [
      ["Peserta", `^/profiler\\?${BATCH_QS}$`],
      ["Statistik", `^/profiler\\?${BATCH_QS}&view=statistik$`],
      ["Slide", `^/profiler\\?${BATCH_QS}&view=slide$`],
      ["Ekspor", `^/profiler\\?${BATCH_QS}&view=ekspor$`],
      ["Tabel lengkap", `^/profiler/table\\?${BATCH_QS}$`],
    ] as const) {
      await expect(views.getByRole("link", { name })).toHaveAttribute(
        "href",
        new RegExp(href),
      );
    }
    await expect(views.getByRole("link", { name: "Peserta" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Satu tombol tambah peserta dengan tiga cara.
    await workspace.getByRole("button", { name: "Tambah peserta" }).click();
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: /Pilih dari daftar/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Input manual/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: /Impor Excel/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("batch tak dikenal kembali ke ringkasan; tim tanpa batch bisa dibuka langsung", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Tidak%20Ada",
      waitForUrl: /\/profiler/,
      apiMocks: PROFILER_MOCKS,
    });

    await expect(
      page.getByRole("region", { name: /Batch tahun 2026/ }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/batch=/);

    await batchNav(page)
      .getByRole("button", { name: /^Tim Email/ })
      .click();
    await expect(page).toHaveURL(/[?&]batch=Tim(%20|\+)Email/);
    await expect(
      page.getByText("Folder ini belum memiliki peserta"),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("peran hanya-baca tidak melihat aksi tulis", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: LEADER_APPROVED_MOCKS,
      auth: { role: "leader" },
    });

    const workspace = page.getByRole("region", { name: "Batch Pagi" });
    await expect(workspace.getByText("Rina Kartika").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByRole("button", { name: "Tambah peserta" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Aksi / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tim baru" })).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("tab Statistik, Slide, Ekspor dirender di workspace tanpa memuat ulang peserta", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: PROFILER_MOCKS,
    });
    const workspace = page.getByRole("region", { name: "Batch Pagi" });
    const views = workspace.getByRole("navigation", { name: "Tampilan batch" });
    await expect(workspace.getByText("Rina Kartika").first()).toBeVisible({
      timeout: 20000,
    });
    // StrictMode dev bisa memicu fetch ganda saat mount; yang dibuktikan adalah
    // tidak ada fetch TAMBAHAN saat berpindah tab.
    const pesertaFetchCount = () =>
      audit.mockedApi.filter((entry) =>
        entry.includes("/profiler/peserta/batch/"),
      ).length;
    const fetchesBeforeTabs = pesertaFetchCount();
    expect(fetchesBeforeTabs).toBeGreaterThan(0);

    // Statistik
    await views.getByRole("link", { name: "Statistik" }).click();
    await expect(page).toHaveURL(/[?&]view=statistik/);
    await expect(
      views.getByRole("link", { name: "Statistik" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      workspace.getByRole("heading", { name: "Distribusi jabatan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      workspace.getByRole("heading", { name: "Tingkat pendidikan" }),
    ).toBeVisible();

    // Slide: navigasi peserta tersimpan di URL dan tahan reload.
    await views.getByRole("link", { name: "Slide" }).click();
    await expect(page).toHaveURL(/[?&]view=slide/);
    await expect(workspace.getByText("Rina Kartika").first()).toBeVisible({
      timeout: 20000,
    });
    await workspace.getByRole("button", { name: "Peserta berikutnya" }).click();
    await expect(page).toHaveURL(
      /[?&]participant=55555555-5555-5555-5555-555555555552/,
    );
    await expect(workspace.getByText("Dimas Prasetyo").first()).toBeVisible();

    // Ekspor: Excel diunduh dari data peserta yang sudah ada.
    await views.getByRole("link", { name: "Ekspor" }).click();
    await expect(page).toHaveURL(/[?&]view=ekspor/);
    const downloadPromise = page.waitForEvent("download");
    await workspace
      .getByRole("button", { name: "Unduh Excel (.xlsx)" })
      .click({ timeout: 20000 });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Batch Pagi_peserta.xlsx");

    // Ketiga tab memakai data peserta yang sudah dimuat workspace.
    expect(pesertaFetchCount()).toBe(fetchesBeforeTabs);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("slide deep link: participant di URL dibuka langsung dan tahan reload", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=slide&participant=55555555-5555-5555-5555-555555555552",
      waitForUrl: /\/profiler/,
      apiMocks: PROFILER_MOCKS,
    });
    const workspace = page.getByRole("region", { name: "Batch Pagi" });
    await expect(
      workspace.getByRole("button", { name: "Peserta berikutnya" }),
    ).toBeDisabled({ timeout: 20000 });
    await expect(workspace.getByText("Dimas Prasetyo").first()).toBeVisible();

    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Batch Pagi" })
        .getByRole("button", { name: "Peserta berikutnya" }),
    ).toBeDisabled({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  for (const [legacy, expected] of [
    [
      "/profiler/analytics?batch=Batch%20Pagi",
      /\/profiler\?batch=Batch(%20|\+)Pagi&view=statistik$/,
    ],
    [
      "/profiler/slides?batch=Batch%20Pagi&participant=55555555-5555-5555-5555-555555555552",
      /\/profiler\?batch=Batch(%20|\+)Pagi&view=slide&participant=55555555-5555-5555-5555-555555555552$/,
    ],
    [
      "/profiler/export?batch=Batch%20Pagi",
      /\/profiler\?batch=Batch(%20|\+)Pagi&view=ekspor$/,
    ],
  ] as const) {
    test(`deep link lama ${legacy.split("?")[0]} diarahkan ke tab workspace`, async ({
      page,
    }) => {
      const audit = await openHermeticShell(page, {
        path: legacy,
        waitForUrl: /\/profiler/,
        apiMocks: PROFILER_MOCKS,
      });
      await expect(page).toHaveURL(expected, { timeout: 20000 });
      await expect(
        page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
      ).toBeVisible({ timeout: 20000 });

      console.log("[audit]", formatAudit(audit));
      expectHermetic(audit);
    });
  }

  for (const view of ["statistik", "slide", "ekspor"]) {
    test(`viewport 375px tab ${view}: tanpa overflow horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      const audit = await openHermeticShell(page, {
        path: `/profiler?batch=Batch%20Pagi&view=${view}`,
        waitForUrl: /\/profiler/,
        apiMocks: PROFILER_MOCKS,
      });
      await expect(
        page
          .getByRole("navigation", { name: "Tampilan batch" })
          .getByRole("link", { name: /./ })
          .and(page.locator('[aria-current="page"]')),
      ).toHaveAttribute("href", new RegExp(`view=${view}`), { timeout: 20000 });
      await page.waitForTimeout(1000);
      await expectNoHorizontalOverflow(page);

      console.log("[audit]", formatAudit(audit));
      expectHermetic(audit);
    });
  }

  for (const width of [320, 375, 768]) {
    test(`viewport ${width}px: sheet "Pilih batch" dan tanpa overflow horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      const audit = await openHermeticShell(page, {
        path: "/profiler?batch=Batch%20Pagi",
        waitForUrl: /\/profiler/,
        apiMocks: PROFILER_MOCKS,
      });

      await expect(
        page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
      ).toBeVisible({ timeout: 20000 });
      await expectNoHorizontalOverflow(page);

      if (width < 768) {
        await page.getByRole("button", { name: "Pilih batch" }).click();
        const sheet = page.getByRole("dialog");
        await sheet.getByRole("button", { name: /^Tim Email/ }).click();
        await expect(page).toHaveURL(/[?&]batch=Tim(%20|\+)Email/);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }

      console.log("[audit]", formatAudit(audit));
      expectHermetic(audit);
    });
  }
});
