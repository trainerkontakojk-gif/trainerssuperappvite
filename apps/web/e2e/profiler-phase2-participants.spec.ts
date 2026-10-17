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
 * Profiler tahap 2 (plans/markdown/profiler-phase2-participants.md):
 * satu daftar peserta di tab Peserta (Kartu/Tabel), profil dan edit peserta
 * di area utama workspace, Pilih banyak / Pindah folder / Atur urutan di tab
 * Peserta, dan /profiler/table menjadi pengalih ke mode Tabel.
 */

const RINA_ID = "55555555-5555-5555-5555-555555555551";
const DIMAS_ID = "55555555-5555-5555-5555-555555555552";

const PESERTA = [
  {
    id: RINA_ID,
    batch_name: "Batch Pagi",
    nomor_urut: 1,
    nama: "Rina Kartika",
    tim: "Tim Call",
    jabatan: "cca",
    nik_ojk: "OJK-001",
    email_ojk: "rina@ojk.go.id",
    tgl_lahir: "1995-10-17",
    bergabung_date: "2026-03-02",
    no_ktp: "3273012108960002",
    nomor_rekening: "1234567890",
    nama_bank: "BNI",
  },
  {
    id: DIMAS_ID,
    batch_name: "Batch Pagi",
    nomor_urut: 2,
    nama: "Dimas Prasetyo",
    tim: "Tim Chat",
    jabatan: "team_leader",
    nik_ojk: "OJK-002",
    email_ojk: "dimas@ojk.go.id",
    tgl_lahir: "1998-10-20",
    bergabung_date: "2026-03-02",
  },
];

const MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
    body: { success: true, data: PESERTA },
  },
  {
    method: "GET",
    path: "/api/v1/profiler/teams",
    body: { success: true, data: [{ id: TEAM_ID, nama: "Tim Call" }] },
  },
  {
    method: "PUT",
    path: `/api/v1/profiler/peserta/${RINA_ID}`,
    body: { success: true, data: { ...PESERTA[0], nama: "Rina Kartika Dewi" } },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/peserta/move",
    body: { success: true, data: { moved: 1 } },
  },
  {
    method: "POST",
    path: "/api/v1/profiler/peserta/bulk-reorder",
    body: { success: true, data: null },
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
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
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

const workspaceOf = (page: Page) =>
  page.getByRole("region", { name: "Batch Pagi" });

test.describe("Profiler tahap 2: satu daftar peserta", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("mode Kartu/Tabel tersimpan di URL dan tabel memuat kolom utama", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    const workspace = workspaceOf(page);
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toBeVisible({ timeout: 20000 });

    await workspace.getByRole("radio", { name: "Tabel" }).click();
    await expect(page).toHaveURL(/[?&]layout=tabel/);
    const table = workspace.getByRole("table", { name: "Daftar peserta" });
    for (const column of [
      "No",
      "Nama",
      "Jabatan",
      "Tim",
      "NIK OJK",
      "Tanggal lahir",
      "Bergabung di 157",
    ]) {
      await expect(
        table.getByRole("columnheader", { name: column, exact: true }),
      ).toBeVisible();
    }
    const rinaRow = table.getByRole("row", { name: /Rina Kartika/ });
    await expect(rinaRow).toContainText("CCA");
    await expect(rinaRow).toContainText("OJK-001");

    await workspace.getByRole("radio", { name: "Kartu" }).click();
    await expect(page).not.toHaveURL(/layout=/);
    await expect(table).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("/profiler/table diarahkan ke tab Peserta mode Tabel", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/table?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    await expect(page).toHaveURL(
      /\/profiler\?batch=Batch(%20|\+)Pagi&layout=tabel$/,
    );
    await expect(
      workspaceOf(page).getByRole("table", { name: "Daftar peserta" }),
    ).toBeVisible({ timeout: 20000 });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("pencarian NIK/email dan filter tim menyaring daftar", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    const workspace = workspaceOf(page);
    const search = workspace.getByRole("searchbox", { name: "Cari peserta" });
    await search.fill("OJK-002", { timeout: 20000 });
    await expect(
      workspace.getByRole("button", { name: "Buka profil Dimas Prasetyo" }),
    ).toBeVisible();
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toHaveCount(0);

    await search.fill("rina@ojk");
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toBeVisible();
    await search.fill("");

    await workspace.getByRole("button", { name: "Tim Chat" }).click();
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toHaveCount(0);
    await workspace.getByRole("button", { name: "Semua tim" }).click();
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("profil peserta terbuka di area utama dengan navigasi sebelumnya/berikutnya", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    await workspaceOf(page)
      .getByRole("button", { name: "Buka profil Rina Kartika" })
      .click({ timeout: 20000 });

    await expect(page).toHaveURL(new RegExp(`[?&]participant=${RINA_ID}`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Rina Kartika" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("1 dari 2")).toBeVisible();
    // Data sensitif tetap tampil di profil (keputusan Fajar).
    await expect(page.getByText("3273012108960002")).toBeVisible();

    await page.getByRole("button", { name: "Peserta berikutnya" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]participant=${DIMAS_ID}`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Dimas Prasetyo" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Kembali ke Batch Pagi" }).click();
    await expect(page).not.toHaveURL(/participant=/);
    await expect(
      workspaceOf(page).getByRole("button", {
        name: "Buka profil Rina Kartika",
      }),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("edit peserta di area utama menyimpan lalu kembali ke profil", async ({
    page,
  }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: `/profiler?batch=Batch%20Pagi&participant=${RINA_ID}`,
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });

    await page
      .getByRole("button", { name: "Edit", exact: true })
      .click({ timeout: 20000 });
    await expect(page).toHaveURL(/[?&]edit=1/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Edit Rina Kartika" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel("Nama lengkap *").fill("Rina Kartika Dewi");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Rina Kartika Dewi" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/edit=/);
    expect(writes).toContainEqual(
      expect.objectContaining({
        method: "PUT",
        path: `/api/v1/profiler/peserta/${RINA_ID}`,
        body: expect.objectContaining({ nama: "Rina Kartika Dewi" }),
      }),
    );

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("pilih banyak lalu pindah folder dari tab Peserta", async ({ page }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    const workspace = workspaceOf(page);
    await workspace
      .getByRole("button", { name: "Pilih banyak" })
      .click({ timeout: 20000 });
    await workspace.getByRole("button", { name: "Pilih Rina Kartika" }).click();
    await page.getByRole("button", { name: "Pindah folder" }).click();

    const dialog = page.getByRole("dialog", { name: "Pindah folder" });
    await dialog.getByRole("button", { name: "Tim Email" }).click();
    await dialog.getByRole("button", { name: "Konfirmasi pemindahan" }).click();

    await expect(
      workspace.getByText("1 peserta", { exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByRole("button", { name: "Buka profil Rina Kartika" }),
    ).toHaveCount(0);
    expect(writes).toContainEqual({
      method: "POST",
      path: "/api/v1/profiler/peserta/move",
      body: { peserta_ids: [RINA_ID], target_batch_name: "Tim Email" },
    });

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("atur urutan dari tab Peserta menyimpan urutan baru", async ({
    page,
  }) => {
    const writes = collectWrites(page);
    const audit = await openHermeticShell(page, {
      path: "/profiler?batch=Batch%20Pagi",
      waitForUrl: /\/profiler/,
      apiMocks: MOCKS,
    });
    const workspace = workspaceOf(page);
    await workspace
      .getByRole("button", { name: "Atur urutan" })
      .click({ timeout: 20000 });
    await workspace
      .getByRole("button", { name: "Pindahkan Dimas Prasetyo ke atas" })
      .click();
    await workspace.getByRole("button", { name: "Simpan urutan" }).click();

    await expect
      .poll(() =>
        writes.filter((write) => write.path.endsWith("/bulk-reorder")),
      )
      .toEqual([
        {
          method: "POST",
          path: "/api/v1/profiler/peserta/bulk-reorder",
          body: {
            updates: [
              { id: DIMAS_ID, nomor_urut: 1 },
              { id: RINA_ID, nomor_urut: 2 },
            ],
          },
        },
      ]);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("peran hanya-baca melihat profil tanpa aksi ubah", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: `/profiler?batch=Batch%20Pagi&participant=${RINA_ID}`,
      waitForUrl: /\/profiler/,
      apiMocks: LEADER_MOCKS,
      auth: { role: "leader" },
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Rina Kartika" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Pindah folder" }),
    ).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
