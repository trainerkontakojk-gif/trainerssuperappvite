import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Masa aktif akun dan pilih banyak (hermetic). Kontrak:
 * plans/markdown/kontrol-user-fase-5b.md. Mutasi dibuktikan sampai request
 * terkirim dengan payload yang benar; server diuji di
 * account-controls-api.spec.ts.
 */

const ok = (data: unknown) => ({ success: true, data });
const id = (n: number) =>
  `bbbbbbbb-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const RINA = id(1);
const BUDI = id(2);
const YOGA = id(3);
const DEWI = id(4);
const WULAN = id(5);
const SARI = id(6);
const BUDI_PESERTA = "55555555-5555-5555-5555-555555555571";

/** Asia/Jakarta day `offset` days from today, as YYYY-MM-DD. */
const wibDay = (offset = 0) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const account = (
  userId: string,
  full_name: string,
  role: string,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  id: userId,
  email: `${full_name.split(" ")[0].toLowerCase()}@ojk.test`,
  full_name,
  role,
  status,
  is_deleted: false,
  created_at: "2026-09-01T03:00:00.000Z",
  active_until: null,
  ...extra,
});

const rule = (module: string, role: string, daily_limit: number | null) => ({
  module,
  role,
  daily_limit,
  updated_at: "2026-10-18T03:00:00.000Z",
  updated_by_name: null,
});
const OVERVIEW = {
  rules: ["agent", "leader"].flatMap((role) => [
    rule("ketik", role, 3),
    rule("pdkt", role, 3),
    rule("telefun", role, 0),
  ]),
  overrides: [],
  today: { started: { ketik: 0, pdkt: 0, telefun: 0 }, users_at_limit: 0 },
};

const result = (userId: string, name: string, error: string | null = null) => ({
  user_id: userId,
  name,
  ok: !error,
  error,
});

test.describe("Masa aktif dan pilih banyak (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("halaman pengguna: baris Masa aktif dan dialog ubahnya", async ({
    page,
  }) => {
    const until = wibDay(3);
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: `/api/v1/admin/users/${RINA}`,
        body: ok({
          user: {
            ...account(RINA, "Rina Kartika", "agent", "active", {
              active_until: until,
            }),
            last_sign_in_at: null,
          },
          peserta: null,
          ketik_assignment: null,
          leader_access: [],
          history: [],
          practice_limits: [],
        }),
      },
      {
        method: "PUT",
        path: `/api/v1/admin/users/${RINA}/active-until`,
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: `/dashboard/users/${RINA}`,
      apiMocks: mocks,
    });

    const panel = page.getByRole("region", { name: "Akun" });
    await expect(panel).toContainText(
      `Sampai ${longDay(until)} · 3 hari lagi`,
      {
        timeout: 20000,
      },
    );

    await panel
      .getByRole("button", { name: "Ubah masa aktif Rina Kartika" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Masa aktif Rina Kartika",
    });
    await expect(
      dialog.getByRole("radio", { name: /^Sampai tanggal/ }),
    ).toBeChecked();
    await dialog.getByLabel("Tanggal terakhir").fill("2099-12-31");
    await expect(dialog).toContainText(
      "Mulai 1 Jan 2100 pukul 00.00 WIB akun ini tidak bisa masuk dan semua login-nya diakhiri.",
    );
    const save = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith(`/admin/users/${RINA}/active-until`),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    expect((await save).postDataJSON()).toEqual({ active_until: "2099-12-31" });
    await expect(dialog).toHaveCount(0);

    // Tanpa batas waktu mengirim null.
    await panel
      .getByRole("button", { name: "Ubah masa aktif Rina Kartika" })
      .click();
    await dialog.getByRole("radio", { name: "Tanpa batas waktu" }).check();
    const clear = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith(`/admin/users/${RINA}/active-until`),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    expect((await clear).postDataJSON()).toEqual({ active_until: null });

    expectHermetic(audit);
  });

  const USERS = [
    account(BUDI, "Budi Santoso", "agent", "pending"),
    account(YOGA, "Yoga Pratama", "agent", "pending"),
    account(DEWI, "Dewi Anggraini", "leader", "active"),
    account(WULAN, "Wulan Sari", "trainer", "active"),
    account(SARI, "Sari Lestari", "agent", "active", {
      active_until: wibDay(-2),
    }),
  ];

  const listMocks = (extra: ApiMock[]): ApiMock[] => [
    { method: "GET", path: "/api/v1/admin/users", body: ok(USERS) },
    {
      method: "GET",
      path: "/api/v1/admin/practice-limits",
      body: ok(OVERVIEW),
    },
    ...extra,
  ];

  const row = (page: Page, name: string) =>
    page.getByRole("row", { name: new RegExp(name) });

  test("daftar pengguna: status Masa aktif habis, pilih banyak, dan Setujui massal", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/users",
      apiMocks: listMocks([
        {
          method: "POST",
          path: "/api/v1/admin/users/bulk-peserta-suggestions",
          body: ok([
            {
              user_id: BUDI,
              peserta: {
                id: BUDI_PESERTA,
                nama: "Budi Santoso",
                batch_name: "Batch Oktober B",
                tim: "Tim Email",
              },
            },
            { user_id: YOGA, peserta: null },
          ]),
        },
        {
          method: "POST",
          path: "/api/v1/admin/users/bulk-approve",
          body: ok({
            results: [
              result(BUDI, "Budi Santoso"),
              result(
                YOGA,
                "Yoga Pratama",
                "Akun ini sudah tidak menunggu persetujuan.",
              ),
            ],
          }),
        },
      ]),
    });

    await expect(row(page, "Sari Lestari")).toContainText("Masa aktif habis", {
      timeout: 20000,
    });
    const statusFilter = page.getByRole("group", {
      name: "Filter status pengguna",
    });
    await statusFilter.getByRole("button", { name: /Habis/ }).click();
    await expect(row(page, "Sari Lestari")).toBeVisible();
    await expect(row(page, "Budi Santoso")).toHaveCount(0);

    await statusFilter.getByRole("button", { name: /Menunggu/ }).click();
    const toolbar = page.getByRole("toolbar", {
      name: "Aksi untuk pengguna yang dipilih",
    });
    await expect(toolbar).toHaveCount(0);
    await page
      .getByRole("checkbox", { name: "Pilih semua di halaman ini" })
      .check();
    await expect(toolbar).toContainText("2 dipilih");

    // Mengganti filter mengosongkan pilihan.
    await statusFilter.getByRole("button", { name: /Semua/ }).click();
    await expect(toolbar).toHaveCount(0);
    await row(page, "Budi Santoso").getByRole("checkbox").check();
    await row(page, "Dewi Anggraini").getByRole("checkbox").check();
    // Aksi yang tidak cocok tetap terlihat, dengan alasan.
    await expect(
      toolbar.getByRole("button", { name: "Setujui" }),
    ).toHaveAttribute("title", "Hanya untuk akun yang masih Menunggu.");
    await expect(
      toolbar.getByRole("button", { name: "Tangguhkan" }),
    ).toHaveAttribute("title", "Hanya untuk akun yang aktif.");
    await row(page, "Dewi Anggraini").getByRole("checkbox").uncheck();
    await row(page, "Yoga Pratama").getByRole("checkbox").check();

    await toolbar.getByRole("button", { name: "Setujui" }).click();
    const dialog = page.getByRole("dialog", { name: "Setujui 2 pendaftaran?" });
    await expect(
      dialog.getByRole("checkbox", {
        name: "Tautkan Budi Santoso ke Budi Santoso",
      }),
    ).toBeChecked();
    await expect(dialog).toContainText(
      "Yoga Pratama · tidak ada yang cocok, tautkan nanti",
    );
    await expect(dialog).toContainText(
      "Batas latihan mengikuti aturan agent: KETIK 3 per hari, PDKT 3 per hari, Telefun tidak bisa mulai.",
    );
    await dialog.getByRole("radio", { name: /^Sampai tanggal/ }).check();
    await dialog.getByLabel("Tanggal terakhir").fill("2099-12-31");
    const approve = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/admin/users/bulk-approve"),
    );
    await dialog.getByRole("button", { name: "Setujui 2 akun" }).click();
    expect((await approve).postDataJSON()).toEqual({
      user_ids: [BUDI, YOGA],
      role: "agent",
      active_until: "2099-12-31",
      links: [{ user_id: BUDI, peserta_id: BUDI_PESERTA }],
    });

    const done = page.getByRole("dialog", {
      name: "Selesai: 1 dari 2 disetujui",
    });
    await expect(done).toContainText("Budi Santoso");
    await expect(done).toContainText(
      "Yoga Pratama: Akun ini sudah tidak menunggu persetujuan.",
    );
    await done.getByRole("button", { name: "Tutup" }).click();
    // Yang gagal tetap tercentang supaya bisa dicoba lagi.
    await expect(toolbar).toContainText("1 dipilih");
    await expect(row(page, "Yoga Pratama").getByRole("checkbox")).toBeChecked();

    expectHermetic(audit);
  });

  test("Batas latihan dan Masa aktif untuk banyak orang", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/users",
      apiMocks: listMocks([
        {
          method: "POST",
          path: "/api/v1/admin/users/bulk-practice-limit",
          body: ok({
            results: [
              result(DEWI, "Dewi Anggraini"),
              result(SARI, "Sari Lestari"),
            ],
          }),
        },
        {
          method: "POST",
          path: "/api/v1/admin/users/bulk-active-until",
          body: ok({
            results: [
              result(DEWI, "Dewi Anggraini"),
              result(WULAN, "Wulan Sari"),
              result(SARI, "Sari Lestari"),
            ],
          }),
        },
      ]),
    });

    for (const name of ["Dewi Anggraini", "Wulan Sari", "Sari Lestari"])
      await row(page, name).getByRole("checkbox").check({ timeout: 20000 });
    const toolbar = page.getByRole("toolbar", {
      name: "Aksi untuk pengguna yang dipilih",
    });

    await toolbar.getByRole("button", { name: "Batas latihan" }).click();
    let dialog = page.getByRole("dialog", {
      name: "Batas latihan untuk 3 orang",
    });
    await expect(dialog).toContainText(
      "1 orang dilewati: Wulan Sari (trainer) selalu tanpa batas.",
    );
    await dialog.getByRole("combobox", { name: "Modul" }).click();
    await page.getByRole("option", { name: "Telefun" }).click();
    await dialog.getByRole("radio", { name: /^Batas khusus/ }).check();
    await dialog.getByRole("spinbutton", { name: "Jumlah per hari" }).fill("2");
    await dialog.getByLabel("Berlaku sampai").fill("2099-10-25");
    await dialog
      .getByRole("textbox", { name: "Catatan" })
      .fill("Persiapan sertifikasi");
    const limit = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/admin/users/bulk-practice-limit"),
    );
    await dialog.getByRole("button", { name: "Simpan untuk 2 orang" }).click();
    expect((await limit).postDataJSON()).toEqual({
      user_ids: [DEWI, SARI],
      module: "telefun",
      limit: {
        daily_limit: 2,
        ends_on: "2099-10-25",
        note: "Persiapan sertifikasi",
      },
    });
    let done = page.getByRole("dialog", {
      name: "Selesai: 2 dari 2 diubah batas latihannya",
    });
    await done.getByRole("button", { name: "Tutup" }).click();
    // Semua berhasil: pilihan dikosongkan.
    await expect(toolbar).toHaveCount(0);

    for (const name of ["Dewi Anggraini", "Wulan Sari", "Sari Lestari"])
      await row(page, name).getByRole("checkbox").check();
    await toolbar.getByRole("button", { name: "Masa aktif" }).click();
    dialog = page.getByRole("dialog", { name: "Masa aktif untuk 3 orang" });
    await dialog.getByRole("radio", { name: /^Sampai tanggal/ }).check();
    await dialog.getByLabel("Tanggal terakhir").fill("2099-12-31");
    const until = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/admin/users/bulk-active-until"),
    );
    await dialog.getByRole("button", { name: "Simpan untuk 3 orang" }).click();
    expect((await until).postDataJSON()).toEqual({
      user_ids: [DEWI, WULAN, SARI],
      active_until: "2099-12-31",
    });
    done = page.getByRole("dialog", {
      name: "Selesai: 3 dari 3 diubah masa aktifnya",
    });
    await expect(done).toBeVisible();

    expectHermetic(audit);
  });

  test("akun yang lewat masa aktif keluar dan halaman Masuk menyebut alasannya", async ({
    page,
  }) => {
    const lastDay = wibDay(-1);
    const audit = await openHermeticShell(page, {
      path: "/dashboard/users",
      // The guard leaves the page itself, so assert the URL afterwards.
      waitForUrl: /localhost/,
      beforeNavigate: async (target) => {
        await target.route("**/rest/v1/profiles**", (route) =>
          route.fulfill({
            contentType: "application/json",
            headers: { "content-range": "0-0/1" },
            body: JSON.stringify([
              {
                id: "user-1",
                email: "rina@ojk.test",
                full_name: "Rina Kartika",
                role: "trainer",
                status: "active",
                is_deleted: false,
                active_until: lastDay,
              },
            ]),
          }),
        );
        await target.route("**/auth/v1/logout**", (route) =>
          route.fulfill({ status: 204, body: "" }),
        );
      },
    });

    await expect(page).toHaveURL(/auth=login&message=expired/, {
      timeout: 20000,
    });
    await expect(
      page.getByText(
        "Masa aktif akun Anda sudah berakhir. Hubungi trainer Anda untuk memperpanjang.",
      ),
    ).toBeVisible({ timeout: 20000 });

    // Masuk lagi: alasannya menyebut tanggal terakhir.
    await page.getByLabel("Email").fill("rina@ojk.test");
    await page.getByLabel("Password").fill("rahasia-lokal");
    await page.getByRole("button", { name: "Masuk sekarang" }).click();
    await expect(
      page.getByText(
        `Masa aktif akun Anda berakhir ${longDay(lastDay)}. Hubungi trainer Anda untuk memperpanjang.`,
      ),
    ).toBeVisible();

    expectHermetic(audit);
  });
});
