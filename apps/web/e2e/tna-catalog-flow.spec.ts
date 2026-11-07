import { expect, test, type Page } from "@playwright/test";
import type { TnaCatalogProgram, TnaPlanDetail } from "@trainers/types";
import { waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna, planDetail, program } from "./helpers/tnaHarness";

// TNA phase 5 T3 (plans/markdown/tna-phase-5.md D26, K33, K34, K36, P-2,
// P-3): program catalog page and the program row on plan detail. Hermetic:
// every API call is mocked.
test.beforeAll(() => assertLocalDevOnlyTarget());

const ok = (data: unknown) => ({ success: true, data });
const inactiveId = "00000000-0000-4000-8000-0000000000c1";
const catalog: TnaCatalogProgram[] = [
  {
    ...program,
    trigger_clusters: ["kurang_teliti_verifikasi_data", "salah_jawaban"],
    service_types: ["call", "chat"],
    suggested_modules: ["ketik", "pdkt"],
    plan_count: 2,
  },
  {
    ...program,
    id: inactiveId,
    code: "email-lama",
    name: "Penanganan Email Lama",
    description: "Program lama untuk layanan email.",
    gap_type: "proses",
    trigger_clusters: [],
    service_types: [],
    suggested_modules: [],
    is_active: false,
    plan_count: 0,
  },
];
const catalogMocks = (overrides: Partial<Record<string, unknown>> = {}) => [
  {
    method: "GET" as const,
    path: "/api/v1/tna/programs?include_inactive=1",
    body: overrides.catalog ?? ok(catalog),
  },
  {
    method: "GET" as const,
    path: "/api/v1/tna/programs/coverage",
    body:
      overrides.coverage ??
      ok({ uncovered_clusters: ["hold_waktu_tunggu", "proses_ideb_slik"] }),
  },
  {
    method: "POST" as const,
    path: "/api/v1/tna/programs",
    status: (overrides.createStatus as number) ?? 201,
    body: overrides.create ?? ok(catalog[0]),
  },
  {
    method: "PATCH" as const,
    path: `/api/v1/tna/programs/${program.id}`,
    body: ok(catalog[0]),
  },
  {
    method: "POST" as const,
    path: `/api/v1/tna/programs/${program.id}/active`,
    status: (overrides.activeStatus as number) ?? 200,
    body: overrides.active ?? ok({ ...catalog[0], is_active: false }),
  },
];

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

// useThemeMode reads localStorage "theme" on load, so switch and reload.
async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Program", exact: true }),
  ).toBeVisible({ timeout: 20000 });
}

for (const width of [1440, 390]) {
  test(`katalog ${width}: tab, klaster tanpa program, program aktif dan nonaktif`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const audit = await openTna(page, "/tna", catalogMocks());
    await page.getByRole("link", { name: "Katalog program" }).click();
    await expect(page).toHaveURL(/\/tna\/katalog$/);
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Katalog program");

    const coverage = page.getByRole("region", {
      name: "Klaster tanpa program",
    });
    await expect(
      coverage
        .getByRole("listitem")
        .filter({ hasText: "Durasi hold/waktu tunggu" }),
    ).toBeVisible();
    await expect(coverage.getByText("Proses iDeb SLIK")).toBeVisible();
    await expect(coverage.getByText("Lainnya")).toHaveCount(0);

    const rows = page.getByRole("list", { name: "Daftar program" });
    const active = rows
      .getByRole("listitem")
      .filter({ hasText: "Ketelitian dan Verifikasi Data" });
    await expect(active).toContainText("verifikasi · Keterampilan · Aktif");
    await expect(active).toContainText(
      "Kurang teliti verifikasi data, Salah jawaban",
    );
    await expect(active).toContainText("Call, Chat");
    await expect(active).toContainText("KETIK, PDKT");
    await expect(active).toContainText("2 rencana");
    const inactive = rows
      .getByRole("listitem")
      .filter({ hasText: "Penanganan Email Lama" });
    await expect(inactive).toContainText("email-lama · Proses · Nonaktif");
    await expect(inactive).toContainText("Semua layanan");
    await expect(inactive).toContainText("Tanpa latihan");
    await expect(
      inactive.getByRole("button", { name: "Aktifkan Penanganan Email Lama" }),
    ).toBeVisible();
    // Active programs are listed before inactive ones.
    await expect(rows.getByRole("listitem").first()).toContainText(
      "Ketelitian dan Verifikasi Data",
    );
    await noHorizontalScroll(page);
    const tag = width === 390 ? "mobile" : "desktop";
    await page.screenshot({
      path: testInfo.outputPath(`tna-phase-5-${tag}-katalog.png`),
      fullPage: true,
    });
    await setTheme(page, "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: testInfo.outputPath(`tna-phase-5-${tag}-katalog-gelap.png`),
      fullPage: true,
    });
    await setTheme(page, "light");
    await waitForMockedApi(audit, [
      "GET /api/v1/tna/programs?include_inactive=1",
      "GET /api/v1/tna/programs/coverage",
    ]);
  });
}

test("tambah program: validasi di klien, body terkirim, kode ganda ditampilkan", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openTna(
    page,
    "/tna/katalog",
    catalogMocks({
      createStatus: 409,
      create: {
        success: false,
        error: {
          code: "TNA_PROGRAM_CODE_EXISTS",
          message: "Kode program sudah dipakai. Pilih kode lain.",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Tambah program" }).click();
  const form = page.getByRole("form", { name: "Program baru" });
  await form.getByLabel("Kode").fill("Kode Salah");
  await form
    .getByLabel("Nama", { exact: true })
    .fill("Penanganan Hold Telepon");
  await form
    .getByLabel("Deskripsi")
    .fill("Latihan mengelola hold dan waktu tunggu di telepon.");
  await form.getByLabel("Jenis gap").selectOption("perilaku");
  const clusters = form.getByRole("group", { name: "Klaster pemicu" });
  await clusters.getByLabel("Durasi hold/waktu tunggu").check();
  await clusters.getByLabel("Komunikasi layanan telepon").check();
  await form
    .getByRole("group", { name: "Layanan" })
    .getByLabel("Call", { exact: true })
    .check();
  await form
    .getByRole("group", { name: "Latihan simulasi" })
    .getByLabel("Telefun")
    .check();

  let posted = false;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/tna/programs"))
      posted = true;
  });
  await form.getByRole("button", { name: "Simpan program" }).click();
  await expect(form.getByRole("alert")).toContainText("Kode");
  expect(posted, "invalid code never reaches the API").toBe(false);

  await form.getByLabel("Kode").fill("hold-telepon");
  await noHorizontalScroll(page);
  await form.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("tna-phase-5-mobile-form.png"),
    fullPage: true,
  });
  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/programs"),
  );
  await form.getByRole("button", { name: "Simpan program" }).click();
  expect((await create).postDataJSON()).toEqual({
    code: "hold-telepon",
    name: "Penanganan Hold Telepon",
    description: "Latihan mengelola hold dan waktu tunggu di telepon.",
    gap_type: "perilaku",
    trigger_clusters: ["hold_waktu_tunggu", "komunikasi_layanan"],
    service_types: ["call"],
    suggested_modules: ["telefun"],
  });
  await expect(
    page.getByText("Kode program sudah dipakai. Pilih kode lain."),
  ).toBeVisible();
  // A duplicate code is not a stale revision: the form stays open to fix it.
  await expect(form).toBeVisible();
  await expect(page.getByRole("button", { name: "Muat ulang" })).toHaveCount(0);
});

test("ubah program: form terisi tanpa kode, PATCH membawa revisi", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const audit = await openTna(page, "/tna/katalog", catalogMocks());
  await page
    .getByRole("button", { name: "Ubah Ketelitian dan Verifikasi Data" })
    .click();
  const form = page.getByRole("form", {
    name: "Ubah Ketelitian dan Verifikasi Data",
  });
  await expect(form.getByLabel("Kode")).toHaveCount(0);
  await expect(form.getByLabel("Nama", { exact: true })).toHaveValue(
    "Ketelitian dan Verifikasi Data",
  );
  await expect(
    form
      .getByRole("group", { name: "Klaster pemicu" })
      .getByLabel("Salah jawaban"),
  ).toBeChecked();
  await expect(
    form.getByRole("group", { name: "Latihan simulasi" }).getByLabel("PDKT"),
  ).toBeChecked();
  await form
    .getByLabel("Nama", { exact: true })
    .fill("Ketelitian Data Nasabah");
  await form
    .getByRole("group", { name: "Latihan simulasi" })
    .getByLabel("PDKT")
    .uncheck();
  const patch = page.waitForRequest((r) => r.method() === "PATCH");
  await form.getByRole("button", { name: "Simpan program" }).click();
  expect((await patch).postDataJSON()).toEqual({
    expected_updated_at: program.updated_at,
    name: "Ketelitian Data Nasabah",
    description: program.description,
    gap_type: "skill",
    // Ids follow the registry order, whatever order the row had.
    trigger_clusters: ["salah_jawaban", "kurang_teliti_verifikasi_data"],
    service_types: ["call", "chat"],
    suggested_modules: ["ketik"],
  });
  await expect(page.getByRole("status")).toContainText("Program disimpan");
  await expect(form).toHaveCount(0);
  await waitForMockedApi(audit, [`PATCH /api/v1/tna/programs/${program.id}`]);
});

test("nonaktifkan: konfirmasi menyebut jumlah rencana; revisi basi minta muat ulang", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTna(
    page,
    "/tna/katalog",
    catalogMocks({
      activeStatus: 409,
      active: {
        success: false,
        error: {
          code: "TNA_PROGRAM_STALE",
          message: "Program sudah berubah, muat ulang sebelum menyimpan.",
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Nonaktifkan Ketelitian dan Verifikasi Data" })
    .click();
  const confirm = page.getByRole("group", {
    name: "Konfirmasi nonaktifkan Ketelitian dan Verifikasi Data",
  });
  await expect(confirm).toContainText("Dipakai 2 rencana");
  await expect(confirm).toContainText("tetap berjalan");
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/active"),
  );
  await confirm
    .getByRole("button", { name: "Nonaktifkan", exact: true })
    .click();
  expect((await request).postDataJSON()).toEqual({
    active: false,
    expected_updated_at: program.updated_at,
  });
  await expect(
    page.getByText("Program sudah berubah, muat ulang"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();
});

test("katalog gagal dimuat: pesan jelas dan Coba lagi", async ({ page }) => {
  await openTna(
    page,
    "/tna/katalog",
    catalogMocks({
      catalog: {
        success: false,
        error: {
          code: "TNA_PROGRAMS_UNAVAILABLE",
          message: "Katalog program belum dapat dimuat. Silakan coba lagi.",
        },
      },
    }),
  );
  await expect(
    page.getByText("Katalog program belum dapat dimuat", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});

test("detail rencana menampilkan program; rencana aktif memakai salinan saat aktivasi", async ({
  page,
}) => {
  const frozen: TnaPlanDetail = {
    ...planDetail("aktif"),
    program: {
      code: "verifikasi",
      name: "Verifikasi Data (nama saat aktivasi)",
      gap_type: "skill",
      source: "snapshot",
    },
  };
  await openTna(page, `/tna/rencana/${ids.plan}`, [
    {
      method: "GET",
      path: `/api/v1/tna/plans/${ids.plan}`,
      body: ok(frozen),
    },
  ]);
  await expect(
    page.getByText("Program: Verifikasi Data (nama saat aktivasi)"),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("dibekukan saat aktivasi")).toBeVisible();

  await openTna(page, `/tna/rencana/${ids.plan}`);
  await expect(
    page.getByText("Program: Ketelitian dan Verifikasi Data"),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("dibekukan saat aktivasi")).toHaveCount(0);
});
