import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Profiler tahap 3 (plans/markdown/profiler-phase3-add-import-teams.md):
 * Tambah peserta dan Impor terbuka di area utama workspace, Impor punya
 * langkah Periksa dengan alasan per baris sebelum menyimpan, Kelola daftar
 * tim menjadi dialog, dan rute lama dialihkan.
 */

const RINA = {
  id: "55555555-5555-5555-5555-555555555551",
  batch_name: "Batch Pagi",
  nomor_urut: 1,
  nama: "Rina Kartika",
  tim: "Tim Call",
  jabatan: "cca",
  nik_ojk: "OJK-001",
};

const TEAMS = [
  { id: TEAM_ID, nama: "Tim Call" },
  { id: "77777777-7777-7777-7777-777777777771", nama: "Tim Email" },
  { id: "77777777-7777-7777-7777-777777777772", nama: "Tim Chat" },
];

const MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
    body: { success: true, data: [RINA] },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/teams",
    body: { success: true, data: TEAMS },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/teams",
    body: {
      success: true,
      data: { id: "77777777-7777-7777-7777-777777777773", nama: "Tim Sosmed" },
    },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/peserta/bulk",
    body: { success: true, data: [] },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/peserta",
    body: { success: true, data: { ...RINA, id: "created", nama: "Andi" } },
  },
  ...PROFILER_MOCKS,
];

const LEADER_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: {
      success: true,
      data: { ktp: { status: "approved", module: "ktp", created_at: null } },
    },
  },
  ...MOCKS.filter((mock) => mock.path !== "/api/v1/me/access-status"),
];

function collectWrites(page: Page) {
  const writes: Array<{ method: string; path: string; body: any }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/") || request.method() === "GET") return;
    writes.push({
      method: request.method(),
      path: url.pathname,
      body: request.postDataJSON(),
    });
  });
  return writes;
}

const csv = (rows: string[][]) =>
  Buffer.from(rows.map((row) => row.join(",")).join("\n"), "utf8");

const IMPORT_HEADER = [
  "Nama Lengkap",
  "Tim",
  "Jabatan",
  "NIK OJK",
  "Tanggal Lahir",
];

const libraryOf = (page: Page) =>
  page.getByRole("navigation", { name: "Daftar tim dan folder" });

test.describe("Profiler tahap 3: tambah, impor, dan tim di workspace", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("Isi manual membuka form di workspace lalu kembali ke folder setelah simpan", async ({
    page,
  }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    await page
      .getByRole("button", { name: "Tambah peserta" })
      .click({ timeout: 20000 });
    const menu = page.getByRole("menu");
    for (const item of [
      "Pilih dari folder lain",
      "Isi manual",
      "Impor dari Excel",
      "Kelola daftar tim",
    ]) {
      await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
    }
    await menu.getByRole("menuitem", { name: "Isi manual" }).click();

    await expect(page).toHaveURL(/\/profiler\?.*view=tambah/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tambah peserta" }),
    ).toBeVisible();
    await expect(libraryOf(page).getByText("Tim Call")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Folder tujuan" }),
    ).toHaveText(/Batch Pagi/);
    // Hapus tim hanya lewat Kelola daftar tim.
    await expect(page.getByRole("button", { name: /^Hapus tim/ })).toHaveCount(
      0,
    );

    await page.getByLabel("Nama lengkap *").fill("Andi");
    await page.getByRole("button", { name: "Simpan peserta" }).first().click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/profiler/peserta",
      body: { nama: "Andi", batch_name: "Batch Pagi" },
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/view=/);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("impor: periksa per baris dulu, lalu simpan hanya baris yang siap", async ({
    page,
  }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=impor",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    const steps = page.getByRole("list", { name: "Langkah impor" });
    await expect(steps).toBeVisible({ timeout: 20000 });
    await expect(libraryOf(page).getByText("Tim Call")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Impor peserta dari Excel" }),
    ).toBeVisible();

    await page.getByLabel("Pilih file").setInputFiles({
      name: "peserta-batch-pagi.csv",
      mimeType: "text/csv",
      buffer: csv([
        IMPORT_HEADER,
        ["Andi Saputra", "Tim Call", "CCA", "OJK-010", "1999-01-02"],
        ["Maya Putri", "Tim Call", "cca", "OJK-011", ""],
        ["Rina Kartika", "Tim Call", "CCA", "OJK-001", ""],
        ["", "Tim Call", "Agent", "OJK-012", ""],
        ["Bayu", "Tim Call", "CCA", "OJK-013", "02/01/1999"],
      ]),
    });

    await expect(steps.getByText("Periksa")).toHaveAttribute(
      "aria-current",
      "step",
    );
    const review = page.getByRole("table", { name: "Hasil pemeriksaan" });
    await expect(review.getByRole("row")).toHaveCount(6);
    await expect(
      review.getByRole("row", { name: /Andi Saputra/ }),
    ).toContainText("Siap");
    await expect(
      review.getByRole("row", { name: /Rina Kartika/ }),
    ).toContainText("Sudah ada di Batch Pagi");
    await expect(review.getByRole("row", { name: /OJK-012/ })).toContainText(
      'Kolom Nama kosong, jabatan "Agent" tidak dikenal',
    );
    await expect(review.getByRole("row", { name: /Bayu/ })).toContainText(
      "Tanggal lahir harus berformat TTTT-BB-HH",
    );
    await expect(page.getByText("2 siap disimpan")).toBeVisible();
    await expect(page.getByText("1 duplikat, dilewati")).toBeVisible();
    await expect(page.getByText("2 perlu diperbaiki")).toBeVisible();
    // Belum ada yang tersimpan sebelum dikonfirmasi.
    expect(writes).toHaveLength(0);

    await page.getByRole("button", { name: "Simpan 2 peserta" }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].path).toBe("/api/v1/profiler/peserta/bulk");
    expect(writes[0].body.items).toHaveLength(2);
    expect(writes[0].body.items[0]).toMatchObject({
      nama: "Andi Saputra",
      jabatan: "cca",
      batch_name: "Batch Pagi",
      tgl_lahir: "1999-01-02",
    });

    await expect(steps.getByText("Selesai")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(
      page.getByText("2 peserta disimpan ke Batch Pagi."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Lihat peserta" }).click();
    await expect(page).not.toHaveURL(/view=/);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("impor: kolom yang tidak cocok dengan template ditolak tanpa menyimpan", async ({
    page,
  }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=impor",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    await page.getByLabel("Pilih file").setInputFiles(
      {
        name: "salah.csv",
        mimeType: "text/csv",
        buffer: csv([
          ["Name", "Team"],
          ["Andi", "Tim Call"],
        ]),
      },
      { timeout: 20000 },
    );
    await expect(
      page.getByText(/Kolom di file tidak cocok dengan template/),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Langkah impor" })
        .getByText("Unggah file"),
    ).toHaveAttribute("aria-current", "step");
    expect(writes).toHaveLength(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("Kelola daftar tim jadi dialog di atas workspace", async ({ page }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    await page
      .getByRole("button", { name: "Tambah peserta" })
      .click({ timeout: 20000 });
    await page.getByRole("menuitem", { name: "Kelola daftar tim" }).click();
    await expect(page).toHaveURL(/[?&]tim=1/);
    const dialog = page.getByRole("dialog", { name: "Kelola daftar tim" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("6 tim tersedia untuk dipilih."),
    ).toBeVisible();

    await dialog.getByLabel("Nama tim baru").fill("Tim Sosmed");
    await dialog.getByRole("button", { name: "Tambah" }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/profiler/teams",
      body: { nama: "Tim Sosmed" },
    });
    await expect(
      dialog.getByText("7 tim tersedia untuk dipilih."),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Selesai" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/tim=1/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("rute lama tambah, impor, dan tim dialihkan ke workspace", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/add?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    await expect(page).toHaveURL(/\/profiler\?.*view=tambah/, {
      timeout: 20000,
    });
    await expect(page).toHaveURL(/batch=Batch(%20|\+)Pagi/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tambah peserta" }),
    ).toBeVisible();

    await page.goto("/profiler/import?batch=Batch%20Pagi");
    await expect(page).toHaveURL(/\/profiler\?.*view=impor/);
    await expect(page.getByRole("list", { name: "Langkah impor" })).toBeVisible(
      { timeout: 20000 },
    );

    await page.goto("/profiler/teams");
    await expect(page).toHaveURL(/\/profiler\?tim=1/);
    await expect(
      page.getByRole("dialog", { name: "Kelola daftar tim" }),
    ).toBeVisible({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("leader: tanpa form tambah/impor, daftar tim hanya dibaca", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi&view=tambah",
      waitForUrl: /\/profiler/,
      apiMocks: LEADER_MOCKS,
      auth: { role: "leader" },
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Tambah peserta" }),
    ).toHaveCount(0);

    await page.goto("/profiler?tim=1");
    const dialog = page.getByRole("dialog", { name: "Kelola daftar tim" });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByLabel("Nama tim baru")).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: /^Hapus tim/ }),
    ).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
