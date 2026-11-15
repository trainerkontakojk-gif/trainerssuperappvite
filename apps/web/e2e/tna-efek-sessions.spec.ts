import { expect, test } from "@playwright/test";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna } from "./helpers/tnaHarness";
import {
  ok,
  programs,
  sessionId,
  summary,
  programReport,
  efekMocks,
} from "./helpers/tnaEfekHarness";

// EFEK screens (plans/markdown/efek.md): TNA tab, report, session form, import.
test.beforeAll(() => assertLocalDevOnlyTarget());

test("trainer membuka EFEK dari TNA dan membuat sesi CERIWIS yang diukur dari CSO", async ({
  page,
}) => {
  const audit = await openTna(
    page,
    "/tna",
    efekMocks,
    "trainer",
    /\/tna(?:\?|$)/,
  );
  await page.getByRole("link", { name: "EFEK", exact: true }).first().click();
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await expect(
    page.getByRole("heading", {
      name: "EFEK · Evaluasi Efektivitas dan Kinerja",
    }),
  ).toBeVisible();
  const cards = page.getByRole("region", { name: "Program pelatihan" });
  await expect(cards.getByRole("article")).toHaveCount(4);
  await expect(cards.getByRole("article").nth(0)).toContainText(
    "1 sesi · 2 peserta",
  );
  await expect(cards.getByRole("article").nth(3)).toContainText("CSO");
  await expect(cards.getByRole("article").nth(3)).toContainText(
    "Belum ada sesi pelatihan.",
  );
  const table = page.getByRole("region", { name: "Sesi pelatihan" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await table.getByLabel("Program").selectOption("pdkt");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Level Up Week Juli");
  await expect(table).toContainText("Menunggu November 2026");

  await cards.getByRole("link", { name: "+ Sesi CERIWIS" }).click();
  await expect(page).toHaveURL(/\/tna\/efek\/sesi\/baru\?program=ceriwis/);
  await expect(
    page.getByRole("heading", { name: "Sesi pelatihan baru" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel("Program")).toHaveValue("ceriwis");
  await expect(page.getByLabel("Layanan yang diukur")).toHaveValue("cso");
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  await expect(page.getByRole("alert")).toContainText("minimal 1");
  await page.getByLabel("Nama sesi").fill("Level Up Week September");
  await page.getByLabel("Tanggal mulai").fill("2026-09-15");
  await expect(page.getByLabel("Tanggal selesai")).toHaveValue("2026-09-15");
  await page.getByLabel("Tanggal selesai").fill("2026-09-19");
  await page.getByLabel("Cari peserta").fill("Budi");
  await page.getByRole("button", { name: "Tambah Budi Contoh" }).click();
  const create = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/tna/efek/sessions"),
  );
  await page.getByRole("button", { name: "Simpan sesi" }).click();
  expect((await create).postDataJSON()).toEqual({
    program_code: "ceriwis",
    title: "Level Up Week September",
    service_type: "cso",
    start_date: "2026-09-15",
    end_date: "2026-09-19",
    peserta_ids: [ids.budi],
  });
  await expect(page).toHaveURL(/\/tna\/efek\?program=ceriwis/);
  await waitForMockedApi(audit, [
    "GET /api/v1/tna/efek/programs",
    "POST /api/v1/tna/efek/sessions",
  ]);
  expectHermetic(audit);
});

test("trainer mengubah peserta sesi lalu menghapusnya setelah konfirmasi", async ({
  page,
}) => {
  const audit = await openTna(page, `/tna/efek/sesi/${sessionId}`, efekMocks);
  await expect(page.getByLabel("Nama sesi")).toHaveValue("Level Up Week Mei");
  await expect(page.getByLabel("Layanan yang diukur")).toHaveValue("chat");
  await page.getByRole("button", { name: "Hapus Ana Contoh" }).click();
  const put = page.waitForRequest((r) => r.method() === "PUT");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  expect((await put).postDataJSON()).toMatchObject({
    program_code: "ketik",
    service_type: "chat",
    peserta_ids: [ids.budi],
  });
  await expect(page).toHaveURL(/\/tna\/efek\?program=ketik/);

  await page
    .getByRole("link", { name: "Level Up Week Mei", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus sesi" }).click();
  await expect(page.getByText('Hapus sesi "Level Up Week Mei"?')).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Hapus sesi" }).click();
  const del = page.waitForRequest((r) => r.method() === "DELETE");
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  expect((await del).url()).toContain(`/tna/efek/sessions/${sessionId}`);
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await waitForMockedApi(audit, [
    "PUT /api/v1/tna/efek",
    "DELETE /api/v1/tna/efek",
  ]);
  expectHermetic(audit);
});

test("impor CSV mencocokkan nama, meminta pilihan, dan mengelompokkan sesi", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/impor", [
    {
      method: "POST",
      path: "/api/v1/tna/efek/import/match",
      body: ok({
        items: [
          {
            name: "Ana Contoh",
            status: "cocok",
            candidates: [{ id: ids.ana, nama: "Ana Contoh", tim: "Tim A" }],
          },
          {
            name: "Budi C.",
            status: "pilih",
            candidates: [
              { id: ids.budi, nama: "Budi Contoh", tim: "Tim A" },
              { id: ids.plan, nama: "Budi Cahyono", tim: "Tim B" },
            ],
          },
          { name: "Orang Asing", status: "tidak_ditemukan", candidates: [] },
        ],
      }),
    },
    {
      method: "POST",
      path: "/api/v1/tna/efek/import",
      status: 201,
      body: ok({ session_ids: [sessionId] }),
    },
    ...efekMocks,
  ]);
  const csv = [
    "Program,Nama Sesi,Tanggal Mulai,Nama Peserta",
    "KETIK,Level Up Week Mei,2026-05-12,Ana Contoh",
    "ketik,level up week mei,2026-05-12,Budi C.",
    "Telefun,,Agustus 2026,Orang Asing",
    "Ceriwis,Kelas CSO,15/09/2026,Ana Contoh",
    "Asing,Sesi X,2026-05-01,Siapa",
  ].join("\n");
  const match = page.waitForRequest((r) => r.url().endsWith("/import/match"));
  await page.getByLabel("File daftar peserta").setInputFiles({
    name: "peserta.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  expect((await match).postDataJSON()).toEqual({
    names: ["Ana Contoh", "Budi C.", "Orang Asing"],
  });
  await expect(
    page.getByText("1 baris tidak bisa dibaca dan dilewati"),
  ).toBeVisible();
  await expect(page.getByText('Program "Asing" tidak dikenal.')).toBeVisible();
  await expect(page.getByText("1 cocok", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 perlu dipilih", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 tidak ditemukan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tidak ada di Profiler · dilewati"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Impor 2 peserta ke 2 sesi" }),
  ).toBeVisible();
  await page.getByLabel("Pilih peserta untuk Budi C.").selectOption(ids.budi);
  const commit = page.waitForRequest((r) =>
    r.url().endsWith("/tna/efek/import"),
  );
  await page.getByRole("button", { name: "Impor 3 peserta ke 2 sesi" }).click();
  expect((await commit).postDataJSON()).toEqual({
    sessions: [
      {
        program_code: "ketik",
        title: "Level Up Week Mei",
        service_type: "chat",
        start_date: "2026-05-12",
        end_date: "2026-05-12",
        peserta_ids: [ids.ana, ids.budi],
      },
      {
        program_code: "ceriwis",
        title: "Kelas CSO",
        service_type: "cso",
        start_date: "2026-09-15",
        end_date: "2026-09-15",
        peserta_ids: [ids.ana],
      },
    ],
  });
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await waitForMockedApi(audit, [
    "/import/match",
    "POST /api/v1/tna/efek/import",
  ]);
  expectHermetic(audit);
});

test("CERIWIS labels the baseline as the CSO service average", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek/program/ceriwis", [
    {
      method: "GET",
      path: "/api/v1/tna/efek/report/ceriwis",
      body: ok({
        ...programReport,
        program: summary(programs[3]!, { participants: 2 }),
      }),
    },
    ...efekMocks,
  ]);
  await expect(
    page.locator("figure span").filter({ hasText: /^Rata-rata layanan CSO$/ }),
  ).toHaveCount(2);
  await waitForMockedApi(audit, ["GET /api/v1/tna/efek/report/ceriwis"]);
  expectHermetic(audit);
});

test("leader tidak bisa membuka EFEK", async ({ page }) => {
  await openTna(page, "/tna/efek", efekMocks, "leader");
  await expect(page).not.toHaveURL(/\/tna\/efek/);
  await expect(page.getByRole("heading", { name: /EFEK/ })).toHaveCount(0);
});
