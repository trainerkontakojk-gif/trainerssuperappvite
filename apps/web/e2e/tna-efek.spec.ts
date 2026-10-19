import { expect, test } from "@playwright/test";
import type { EfekProgram, EfekSession } from "@trainers/types";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ids, openTna } from "./helpers/tnaHarness";

// EFEK phase 1 screens (plans/markdown/efek.md): TNA tab, session form, import.
test.beforeAll(() => assertLocalDevOnlyTarget());

const ok = (data: unknown) => ({ success: true, data });
const programs: EfekProgram[] = [
  { code: "ketik", name: "KETIK", default_service_type: "chat", sort_order: 1 },
  { code: "pdkt", name: "PDKT", default_service_type: "email", sort_order: 2 },
  {
    code: "telefun",
    name: "Telefun",
    default_service_type: "call",
    sort_order: 3,
  },
  {
    code: "ceriwis",
    name: "CERIWIS",
    default_service_type: "cso",
    sort_order: 4,
  },
];
const sessionId = "8f3a2b1c-0d4e-4f5a-8b6c-7d8e9f0a1b2c";
const sessions: EfekSession[] = [
  {
    id: sessionId,
    program_code: "ketik",
    title: "Level Up Week Mei",
    service_type: "chat",
    start_date: "2026-05-12",
    end_date: "2026-05-16",
    participant_count: 2,
    updated_at: "2026-10-19T10:00:00.000Z",
  },
  {
    id: "9a4b3c2d-1e5f-4a6b-9c7d-8e9f0a1b2c3d",
    program_code: "pdkt",
    title: "Level Up Week Juli",
    service_type: "email",
    start_date: "2026-07-14",
    end_date: "2026-07-14",
    participant_count: 4,
    updated_at: "2026-10-19T10:00:00.000Z",
  },
];
const efekMocks = [
  {
    method: "GET" as const,
    path: "/api/v1/tna/efek/programs",
    body: ok(programs),
  },
  {
    method: "GET" as const,
    path: "/api/v1/tna/efek/sessions",
    body: ok({ items: sessions }),
  },
  {
    method: "GET" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({
      ...sessions[0],
      participants: [
        { peserta_id: ids.ana, nama: "Ana Contoh", tim: "Tim A" },
        { peserta_id: ids.budi, nama: "Budi Contoh", tim: "Tim A" },
      ],
    }),
  },
  {
    method: "POST" as const,
    path: "/api/v1/tna/efek/sessions",
    status: 201,
    body: ok({ id: sessionId }),
  },
  {
    method: "PUT" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({ id: sessionId }),
  },
  {
    method: "DELETE" as const,
    path: `/api/v1/tna/efek/sessions/${sessionId}`,
    body: ok({ id: sessionId }),
  },
];

test("trainer membuka EFEK dari TNA dan membuat sesi CERIWIS yang diukur dari CSO", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna", efekMocks);
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

  await page.getByRole("link", { name: "Level Up Week Mei" }).click();
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

test("leader tidak bisa membuka EFEK", async ({ page }) => {
  await openTna(page, "/tna/efek", efekMocks, "leader");
  await expect(page).not.toHaveURL(/\/tna\/efek/);
  await expect(page.getByRole("heading", { name: /EFEK/ })).toHaveCount(0);
});
