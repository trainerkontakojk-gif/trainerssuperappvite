import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Batas latihan dari sisi trainer (hermetic): halaman /dashboard/batas-latihan,
 * panel di halaman pengguna, kolom dan filter di daftar pengguna, dan dialog
 * Setujui pendaftaran. Kontrak: plans/markdown/kontrol-user-fase-4.md.
 * Mutasi dibuktikan sampai request terkirim dengan payload yang benar; server
 * diuji di practice-limits-admin-api.spec.ts.
 */

const ok = (data: unknown) => ({ success: true, data });
const RINA_ID = "aaaaaaaa-0000-4000-8000-000000000011";
const BUDI_ID = "aaaaaaaa-0000-4000-8000-000000000012";
const DEWI_ID = "aaaaaaaa-0000-4000-8000-000000000013";
const TRAINER_ID = "aaaaaaaa-0000-4000-8000-000000000014";
const BUDI_PESERTA = "55555555-5555-5555-5555-555555555561";

const rule = (module: string, role: string, daily_limit: number | null) => ({
  module,
  role,
  daily_limit,
  updated_at: "2026-10-18T03:00:00.000Z",
  updated_by_name: null,
});

const OVERVIEW = {
  rules: [
    rule("ketik", "agent", 3),
    rule("pdkt", "agent", 3),
    rule("telefun", "agent", 0),
    rule("ketik", "leader", 3),
    rule("pdkt", "leader", 3),
    rule("telefun", "leader", 0),
    rule("ketik", "trainer", null),
    rule("pdkt", "trainer", null),
    rule("telefun", "trainer", null),
    rule("ketik", "admin", null),
    rule("pdkt", "admin", null),
    rule("telefun", "admin", null),
  ],
  overrides: [
    {
      id: "ov-1",
      user_id: RINA_ID,
      user_name: "Rina Kartika",
      user_role: "agent",
      module: "telefun",
      daily_limit: 2,
      ends_on: "2099-10-31",
      note: "Persiapan sertifikasi",
      updated_at: "2026-10-18T04:00:00.000Z",
      updated_by_name: "Wulan Sari",
    },
  ],
  today: { started: { ketik: 12, pdkt: 7, telefun: 1 }, users_at_limit: 4 },
};

const account = (
  id: string,
  full_name: string,
  role: string,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  email: `${full_name.split(" ")[0].toLowerCase()}@ojk.test`,
  full_name,
  role,
  status,
  is_deleted: false,
  created_at: "2026-09-01T03:00:00.000Z",
  ...extra,
});

const USERS = [
  account(RINA_ID, "Rina Kartika", "agent", "active", {
    linked_peserta: {
      id: "p-rina",
      nama: "Rina Kartika",
      batch_name: "Batch Pagi",
      tim: "Tim Call",
    },
    practice_overrides: [
      { module: "telefun", daily_limit: 2, ends_on: "2099-10-31" },
    ],
  }),
  account(DEWI_ID, "Dewi Anggraini", "leader", "active"),
  account(TRAINER_ID, "Wulan Sari", "trainer", "active"),
  account(BUDI_ID, "Budi Santoso", "agent", "pending"),
];

const quota = (
  module: string,
  limit: number | null,
  used: number,
  role_limit: number | null,
  override?: { ends_on: string | null; note: string | null },
) => ({
  module,
  limit,
  used,
  source: override ? "override" : "role",
  ends_on: override?.ends_on ?? null,
  resets_at: "2099-01-01T17:00:00.000Z",
  role_limit,
  note: override?.note ?? null,
});

test.describe("Batas latihan (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("halaman Batas latihan: ringkasan, ubah aturan peran, tambah pengecualian", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: "/api/v1/admin/practice-limits",
        body: ok(OVERVIEW),
      },
      {
        method: "PUT",
        path: "/api/v1/admin/practice-limits/rules",
        body: ok(null),
      },
      { method: "GET", path: "/api/v1/admin/users", body: ok(USERS) },
      {
        method: "PUT",
        path: `/api/v1/admin/users/${DEWI_ID}/practice-limits/ketik`,
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/batas-latihan",
      apiMocks: mocks,
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Batas latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("simulasi dimulai")).toContainText("20");
    await expect(page.getByText("orang sudah mencapai batas")).toContainText(
      "4",
    );

    const save = page.getByRole("button", { name: "Simpan aturan" });
    await expect(save).toBeDisabled();
    const ketikAgent = page.getByRole("combobox", {
      name: "KETIK untuk Agent",
    });
    await expect(ketikAgent).toContainText("3 per hari");
    await expect(
      page.getByRole("combobox", { name: "Telefun untuk Agent" }),
    ).toContainText("Tutup");
    await ketikAgent.click();
    await page.getByRole("option", { name: "5 per hari", exact: true }).click();
    const rulesRequest = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith("/admin/practice-limits/rules"),
    );
    await save.click();
    // Hanya aturan yang berubah yang dikirim.
    expect((await rulesRequest).postDataJSON()).toEqual({
      rules: [{ module: "ketik", role: "agent", daily_limit: 5 }],
    });

    const exception = page.getByRole("row", { name: /Rina Kartika/ });
    await expect(exception).toContainText("Telefun");
    await expect(exception).toContainText("2 per hari");
    await expect(exception).toContainText("31 Okt 2099");
    await expect(exception).toContainText("Persiapan sertifikasi");

    await page.getByRole("button", { name: "Tambah pengecualian" }).click();
    // Judul dialog berganti mengikuti pengguna yang dipilih.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Tambah pengecualian");
    await dialog.getByRole("combobox", { name: "Pengguna" }).click();
    // Hanya agent dan leader aktif; trainer dan akun menunggu tidak muncul.
    await expect(page.getByRole("option", { name: /Wulan Sari/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("option", { name: /Budi Santoso/ }),
    ).toHaveCount(0);
    await page.getByRole("option", { name: /Dewi Anggraini/ }).click();
    await expect(dialog).toHaveAccessibleName(
      "Batas Telefun untuk Dewi Anggraini",
    );
    await dialog.getByRole("combobox", { name: "Modul" }).click();
    await page.getByRole("option", { name: "KETIK" }).click();
    await dialog.getByRole("radio", { name: /^Batas khusus/ }).check();
    await dialog.getByRole("spinbutton", { name: "Jumlah per hari" }).fill("6");
    await dialog.getByRole("textbox", { name: "Catatan" }).fill("Remedial");
    const override = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith(`/admin/users/${DEWI_ID}/practice-limits/ketik`),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    expect((await override).postDataJSON()).toEqual({
      daily_limit: 6,
      ends_on: null,
      note: "Remedial",
    });
    await expect(dialog).toHaveCount(0);

    expectHermetic(audit);
  });

  test("halaman pengguna: panel Batas latihan, ubah dan kembalikan ke aturan peran", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: `/api/v1/admin/users/${RINA_ID}`,
        body: ok({
          user: { ...USERS[0], last_sign_in_at: null },
          peserta: null,
          ketik_assignment: null,
          leader_access: [],
          history: [],
          practice_limits: [
            quota("ketik", 3, 1, 3),
            quota("pdkt", 3, 0, 3),
            quota("telefun", 2, 0, 0, {
              ends_on: "2099-10-31",
              note: "Persiapan sertifikasi",
            }),
          ],
        }),
      },
      {
        method: "PUT",
        path: `/api/v1/admin/users/${RINA_ID}/practice-limits/ketik`,
        body: ok(null),
      },
      {
        method: "DELETE",
        path: `/api/v1/admin/users/${RINA_ID}/practice-limits/telefun`,
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: `/dashboard/users/${RINA_ID}`,
      apiMocks: mocks,
    });

    const panel = page.getByRole("region", { name: "Batas latihan" });
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel.getByRole("row", { name: /KETIK/ })).toContainText(
      "1 dari 3",
    );
    await expect(panel.getByRole("row", { name: /Telefun/ })).toContainText(
      "Pengecualian sampai 31 Okt 2099 · Persiapan sertifikasi",
    );

    await panel.getByRole("button", { name: "Ubah batas Telefun" }).click();
    let dialog = page.getByRole("dialog", {
      name: "Batas Telefun untuk Rina Kartika",
    });
    await expect(dialog).toContainText("Aturan agent: tidak bisa mulai");
    await expect(
      dialog.getByRole("radio", { name: /^Batas khusus/ }),
    ).toBeChecked();
    await dialog.getByRole("radio", { name: "Ikuti aturan peran" }).check();
    const clear = page.waitForRequest(
      (req) =>
        req.method() === "DELETE" &&
        req.url().endsWith(`/admin/users/${RINA_ID}/practice-limits/telefun`),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await clear;
    await expect(dialog).toHaveCount(0);

    await panel.getByRole("button", { name: "Ubah batas KETIK" }).click();
    dialog = page.getByRole("dialog", {
      name: "Batas KETIK untuk Rina Kartika",
    });
    await dialog.getByRole("radio", { name: /^Tutup/ }).check();
    await dialog.getByLabel("Berlaku sampai").fill("2099-11-30");
    const close = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith(`/admin/users/${RINA_ID}/practice-limits/ketik`),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    expect((await close).postDataJSON()).toEqual({
      daily_limit: 0,
      ends_on: "2099-11-30",
      note: null,
    });

    expectHermetic(audit);
  });

  test("daftar pengguna: kolom Batas latihan, filter peserta, dan dialog Setujui", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      { method: "GET", path: "/api/v1/admin/users", body: ok(USERS) },
      {
        method: "GET",
        path: "/api/v1/admin/peserta-options",
        body: ok([
          {
            id: BUDI_PESERTA,
            nama: "Budi Santoso",
            batch_name: "Batch Siang",
            tim: "Tim Email",
            linked_user: null,
            email_match: true,
          },
        ]),
      },
      {
        method: "GET",
        path: "/api/v1/admin/practice-limits",
        body: ok(OVERVIEW),
      },
      {
        method: "POST",
        path: `/api/v1/admin/users/${BUDI_ID}/approve`,
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/users",
      apiMocks: mocks,
    });

    await expect(
      page.getByRole("columnheader", { name: "Batas latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("row", { name: /Rina Kartika/ })).toContainText(
      "Telefun 2 per hari s.d. 31 Okt",
    );
    await expect(
      page.getByRole("row", { name: /Dewi Anggraini/ }),
    ).toContainText("Bawaan peran");
    await expect(page.getByRole("row", { name: /Wulan Sari/ })).toContainText(
      "Tanpa batas",
    );

    await page.getByRole("combobox", { name: "Filter peserta KTP" }).click();
    await page.getByRole("option", { name: "Belum tertaut" }).click();
    await expect(page.getByRole("row", { name: /Rina Kartika/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("row", { name: /Dewi Anggraini/ }),
    ).toBeVisible();

    await page
      .getByRole("row", { name: /Budi Santoso/ })
      .getByRole("button", { name: "Setujui" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Setujui Budi Santoso?" });
    // Kecocokan email hanya saran, tetapi dipilih lebih dulu dan bisa diganti.
    const suggested = dialog.getByRole("radio", {
      name: /Budi Santoso · Batch Siang · Tim Email/,
    });
    await expect(suggested).toBeChecked();
    await expect(dialog).toContainText(
      "Batas latihan mengikuti aturan agent: KETIK 3 per hari, PDKT 3 per hari, Telefun tidak bisa mulai.",
    );
    // Trainer tidak bisa memberi role admin.
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await expect(page.getByRole("option", { name: "Admin" })).toHaveCount(0);
    await page.getByRole("option", { name: "Leader" }).click();

    const approve = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith(`/admin/users/${BUDI_ID}/approve`),
    );
    await dialog.getByRole("button", { name: "Setujui" }).click();
    expect((await approve).postDataJSON()).toEqual({
      role: "leader",
      peserta_id: BUDI_PESERTA,
    });
    await expect(dialog).toHaveCount(0);

    expectHermetic(audit);
  });
});
