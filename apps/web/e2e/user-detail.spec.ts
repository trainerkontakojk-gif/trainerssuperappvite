import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Halaman pengguna /dashboard/users/:id (hermetic, sebagai trainer).
 * Kontrak: plans/markdown/kontrol-user-fase-1.md. Mutasi dibuktikan sampai
 * request terkirim dengan payload yang benar; server diuji di
 * user-peserta-link-api.spec.ts.
 */

const ok = (data: unknown) => ({ success: true, data });
const AGENT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const RINA_ID = "55555555-5555-5555-5555-555555555551";
const MARLINA_ID = "55555555-5555-5555-5555-555555555559";

const AGENT = {
  id: AGENT_ID,
  email: "rina.kartika@ojk.test",
  full_name: "Rina Kartika",
  role: "agent",
  status: "active",
  is_deleted: false,
  created_at: "2026-09-01T03:00:00.000Z",
  last_sign_in_at: "2026-10-17T01:12:00.000Z",
};

const detail = (overrides: Record<string, unknown> = {}) => ({
  user: AGENT,
  peserta: null,
  ketik_assignment: null,
  leader_access: [],
  history: [],
  ...overrides,
});

const OPTIONS = [
  {
    id: RINA_ID,
    nama: "Rina Kartika",
    batch_name: "Batch Pagi",
    tim: "Tim Call",
    linked_user: null,
    email_match: true,
  },
  {
    id: MARLINA_ID,
    nama: "Rina Marlina",
    batch_name: "Batch Siang",
    tim: "Tim Email",
    linked_user: {
      id: "other",
      full_name: "Rina M",
      email: "rina.m@ojk.test",
    },
    email_match: false,
  },
];

test.describe("Halaman pengguna (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("akun belum tertaut: tautkan peserta, kirim reset password, tangguhkan", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: `/api/v1/admin/users/${AGENT_ID}`,
        body: ok(detail()),
      },
      {
        method: "GET",
        path: "/api/v1/admin/peserta-options",
        body: ok(OPTIONS),
      },
      {
        method: "PUT",
        path: `/api/v1/admin/users/${AGENT_ID}/peserta`,
        body: ok(null),
      },
      {
        method: "POST",
        path: `/api/v1/admin/users/${AGENT_ID}/reset-password`,
        body: ok({ email: AGENT.email }),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: `/dashboard/users/${AGENT_ID}`,
      apiMocks: mocks,
    });
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Rina Kartika" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("link", { name: "Kembali ke Pengguna" }),
    ).toHaveAttribute("href", "/dashboard/users");
    const akun = page.getByRole("region", { name: "Akun" });
    await expect(akun).toContainText("Terakhir masuk");
    await expect(akun).toContainText("WIB");
    const pesertaPanel = page.getByRole("region", { name: "Peserta KTP" });
    await expect(pesertaPanel).toContainText("Belum tertaut");

    await pesertaPanel.getByRole("button", { name: "Tautkan peserta" }).click();
    const dialog = page.getByRole("dialog", { name: "Tautkan ke peserta KTP" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Email OJK peserta Rina Kartika sama dengan email akun ini",
    );
    // Saran tidak memilih otomatis; peserta milik akun lain tidak bisa dipilih.
    const tautkan = dialog.getByRole("button", { name: "Tautkan" });
    await expect(tautkan).toBeDisabled();
    await expect(
      dialog.getByRole("radio", { name: /Rina Marlina/ }),
    ).toBeDisabled();
    await dialog.getByRole("radio", { name: /Rina Kartika/ }).check();
    const link = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith(`/admin/users/${AGENT_ID}/peserta`),
    );
    await tautkan.click();
    expect((await link).postDataJSON()).toEqual({ peserta_id: RINA_ID });
    await expect(dialog).toHaveCount(0);

    // Reset password tidak lagi mengirim email dari browser.
    await page.getByRole("button", { name: "Kirim reset password" }).click();
    const resetConfirm = page.getByRole("alertdialog", {
      name: "Kirim email reset password?",
    });
    await expect(resetConfirm).toContainText(AGENT.email);
    const reset = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith(`/admin/users/${AGENT_ID}/reset-password`),
    );
    await resetConfirm.getByRole("button", { name: "Kirim email" }).click();
    expect((await reset).postData()).toBeNull();

    await page.getByRole("button", { name: "Tangguhkan" }).click();
    const suspend = page.getByRole("alertdialog", {
      name: "Tangguhkan Rina Kartika?",
    });
    await expect(suspend).toBeVisible();
    await suspend.getByRole("button", { name: "Batal" }).click();
    await expect(suspend).toHaveCount(0);
    expect(nativeDialog).toBe(false);

    expectHermetic(audit);
  });

  test("akun tertaut: data peserta, riwayat, dan lepas tautan", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: `/api/v1/admin/users/${AGENT_ID}`,
        body: ok(
          detail({
            peserta: {
              id: RINA_ID,
              nama: "Rina Kartika",
              batch_name: "Batch Pagi",
              tim: "Tim Call",
              jabatan: "Agent",
              nik_ojk: "157-2309-0041",
            },
            ketik_assignment: {
              assigned_at: "2026-10-12T06:40:00.000Z",
              assigned_by_name: "Wulan Sari",
            },
            history: [
              {
                id: "log-1",
                created_at: "2026-10-12T07:02:00.000Z",
                actor_name: "fajar@ojk.test",
                action:
                  "Menautkan akun Rina Kartika ke peserta Rina Kartika (Batch Pagi)",
              },
            ],
          }),
        ),
      },
      {
        method: "DELETE",
        path: `/api/v1/admin/users/${AGENT_ID}/peserta`,
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: `/dashboard/users/${AGENT_ID}`,
      apiMocks: mocks,
    });

    const pesertaPanel = page.getByRole("region", { name: "Peserta KTP" });
    await expect(
      pesertaPanel.getByRole("link", { name: "Rina Kartika" }),
    ).toHaveAttribute(
      "href",
      /\/profiler\?batch=Batch(\+|%20)Pagi&participant=/,
      {
        timeout: 20000,
      },
    );
    await expect(pesertaPanel).toContainText("157-2309-0041");
    await expect(
      page.getByRole("region", { name: "Penugasan KETIK" }),
    ).toContainText("Wulan Sari");
    await expect(
      page.getByRole("region", { name: "Riwayat perubahan" }),
    ).toContainText("Menautkan akun Rina Kartika");

    await pesertaPanel.getByRole("button", { name: "Lepas tautan" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Lepas tautan peserta?",
    });
    const unlink = page.waitForRequest(
      (req) =>
        req.method() === "DELETE" &&
        req.url().endsWith(`/admin/users/${AGENT_ID}/peserta`),
    );
    await confirm.getByRole("button", { name: "Lepas tautan" }).click();
    await unlink;

    expectHermetic(audit);
  });

  test("trainer melihat akun admin tanpa tombol ubah", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: `/dashboard/users/${ADMIN_ID}`,
      apiMocks: [
        {
          method: "GET",
          path: `/api/v1/admin/users/${ADMIN_ID}`,
          body: ok(
            detail({
              user: {
                ...AGENT,
                id: ADMIN_ID,
                full_name: "Fajar",
                email: "fajar@ojk.test",
                role: "admin",
              },
            }),
          ),
        },
      ],
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Fajar" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText("Hanya admin yang bisa mengubah akun admin."),
    ).toBeVisible();
    for (const name of [
      "Kirim reset password",
      "Tangguhkan",
      "Tautkan peserta",
      "Hapus pengguna",
    ])
      await expect(page.getByRole("button", { name })).toHaveCount(0);

    expectHermetic(audit);
  });

  test("profil KTP menampilkan akun aplikasi yang tertaut", async ({
    page,
  }) => {
    const peserta = {
      id: RINA_ID,
      batch_name: "Batch Pagi",
      nomor_urut: 1,
      nama: "Rina Kartika",
      tim: "Tim Call",
      jabatan: "cca",
      email_ojk: "rina.kartika@ojk.test",
      akun_id: AGENT_ID,
    };
    const audit = await openHermeticShell(page, {
      path: `/profiler?batch=Batch%20Pagi&participant=${RINA_ID}`,
      waitForUrl: /\/profiler/,
      apiMocks: [
        {
          method: "GET",
          path: /^\/api\/v1\/profiler\/peserta\/batch\/Batch(%20|\+)Pagi$/,
          body: ok([peserta]),
        },
        {
          method: "GET",
          path: `/api/v1/profiler/peserta/${RINA_ID}/account`,
          body: ok({
            id: AGENT_ID,
            full_name: "Rina Kartika",
            email: AGENT.email,
            role: "agent",
            status: "active",
          }),
        },
        ...PROFILER_MOCKS,
      ],
    });

    const row = page
      .locator("div")
      .filter({ has: page.getByText("Akun aplikasi", { exact: true }) })
      .last();
    await expect(row.getByRole("link", { name: AGENT.email })).toHaveAttribute(
      "href",
      `/dashboard/users/${AGENT_ID}`,
      { timeout: 20000 },
    );
    await expect(row).toContainText("Agent · Aktif");

    expectHermetic(audit);
  });
});
