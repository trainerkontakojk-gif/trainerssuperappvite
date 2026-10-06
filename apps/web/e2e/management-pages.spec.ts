import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Halaman Management (Pengguna, Persetujuan Akses, Grup Akses) — hermetic.
 *
 * Kontrak redesain (`plans/markdown/management-pages-redesign.md`): satu shell
 * bersama dengan navigasi seksi, tabel pengguna + panel kelola, konfirmasi
 * in-app (bukan `confirm()` browser), dan alur persetujuan/grup yang tetap
 * memanggil endpoint yang sama. Semua `/api` dimock; mutasi hanya dibuktikan
 * sampai request terkirim dengan payload yang benar.
 */

const ok = (data: unknown) => ({ success: true, data });

const USERS = [
  {
    id: "user-1",
    email: "trainer.visual@trainers.local",
    full_name: "Trainer Visual",
    role: "trainer",
    status: "active",
    is_deleted: false,
    created_at: "2026-07-01T02:00:00.000Z",
  },
  {
    id: "u-pending",
    email: "budi@trainers.local",
    full_name: "Budi Santoso",
    role: "agent",
    status: "pending",
    is_deleted: false,
    created_at: "2026-09-20T02:00:00.000Z",
  },
  {
    id: "u-active",
    email: "sari@trainers.local",
    full_name: "Sari Lestari",
    role: "leader",
    status: "active",
    is_deleted: false,
    created_at: "2026-08-12T02:00:00.000Z",
  },
];

const GROUPS = [
  {
    id: "g-java",
    name: "Tim Java",
    description: "Leader area Jawa",
    scope_type: "union",
    is_active: true,
    created_at: "2026-08-01T00:00:00.000Z",
    item_count: 2,
  },
  {
    id: "g-sum",
    name: "Tim Sumatera",
    description: null,
    scope_type: "union",
    is_active: true,
    created_at: "2026-08-02T00:00:00.000Z",
    item_count: 0,
  },
];

const PENDING_REQUESTS = [
  {
    id: "req-1",
    leader_user_id: "leader-1",
    leader_name: "Dewi Anggraini",
    leader_email: "dewi@trainers.local",
    module: "ktp",
    created_at: "2026-09-30T03:00:00.000Z",
    status: "pending",
  },
];

const APPROVED_REQUESTS = [
  {
    id: "req-9",
    leader_user_id: "leader-9",
    leader_name: "Rudi Hartono",
    leader_email: "rudi@trainers.local",
    module: "sidak",
    access_group_ids: ["g-java"],
    access_group_names: ["Tim Java"],
    approved_at: "2026-09-01T03:00:00.000Z",
  },
];

const GROUP_ITEMS = [
  {
    id: "item-1",
    access_group_id: "g-java",
    field_name: "tim",
    field_value: "Java",
    is_active: true,
  },
  {
    id: "item-2",
    access_group_id: "g-java",
    field_name: "service_type",
    field_value: "call",
    is_active: true,
  },
];

const SCOPE_OPTIONS = {
  teams: ["Java"],
  services: [{ value: "call", label: "Call Center" }],
  agentsByTeam: { Java: [] },
};

const MANAGEMENT_NAV = "Navigasi manajemen";

async function expectManagementNav(page: Page, active: string) {
  const nav = page.getByRole("navigation", { name: MANAGEMENT_NAV });
  await expect(nav).toBeVisible({ timeout: 20000 });
  for (const label of [
    "Pengguna",
    "Persetujuan Akses",
    "Grup Akses",
    "Log Aktivitas",
  ]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: active })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

test.describe("Management pages (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("pengguna: tabel, filter status, setujui inline, dan panel kelola", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      { method: "GET", path: "/api/v1/admin/users", body: ok(USERS) },
      {
        method: "PUT",
        path: "/api/v1/admin/users/u-pending/status",
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/users",
      apiMocks: mocks,
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Pengguna" }),
    ).toBeVisible({ timeout: 20000 });
    await expectManagementNav(page, "Pengguna");

    for (const column of ["Pengguna", "Role", "Status", "Terdaftar"]) {
      await expect(
        page.getByRole("columnheader", { name: column }),
      ).toBeVisible();
    }

    // Filter status menyaring baris.
    await page.getByRole("button", { name: /Menunggu/ }).click();
    await expect(page.getByRole("row", { name: /Budi Santoso/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Sari Lestari/ })).toHaveCount(
      0,
    );

    // Pending → setujui langsung dari baris, memanggil endpoint status lama.
    const statusRequest = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().endsWith("/admin/users/u-pending/status"),
    );
    await page
      .getByRole("row", { name: /Budi Santoso/ })
      .getByRole("button", { name: "Setujui" })
      .click();
    expect((await statusRequest).postDataJSON()).toEqual({
      status: "approved",
    });

    // Panel kelola: aksi destruktif memakai dialog in-app, bukan confirm().
    await page.getByRole("button", { name: "Semua" }).click();
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });
    await page
      .getByRole("row", { name: /Sari Lestari/ })
      .getByRole("button", { name: "Kelola" })
      .click();
    const panel = page.getByRole("dialog", { name: "Sari Lestari" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Tangguhkan" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Tangguhkan pengguna?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Batal" }).click();
    await expect(confirm).toHaveCount(0);
    expect(nativeDialog).toBe(false);

    // Pengguna tidak bisa mengelola akunnya sendiri dari panel.
    await expect(
      page
        .getByRole("row", { name: /Trainer Visual/ })
        .getByRole("button", { name: "Kelola" }),
    ).toHaveCount(0);

    expectHermetic(audit);
  });

  test("persetujuan: approve butuh grup, cabut akses butuh alasan", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: "/api/v1/admin/leader-requests/pending",
        body: ok(PENDING_REQUESTS),
      },
      {
        method: "GET",
        path: "/api/v1/admin/leader-requests/approved",
        body: ok(APPROVED_REQUESTS),
      },
      { method: "GET", path: "/api/v1/admin/access-groups", body: ok(GROUPS) },
      {
        method: "POST",
        path: "/api/v1/admin/leader-requests/req-1/approve",
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/access-approval",
      apiMocks: mocks,
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Persetujuan Akses" }),
    ).toBeVisible({ timeout: 20000 });
    await expectManagementNav(page, "Persetujuan Akses");

    await page.getByRole("button", { name: /Dewi Anggraini/ }).click();
    const approve = page.getByRole("button", { name: /Setujui akses KTP/ });
    await expect(approve).toBeDisabled();

    await page.getByRole("checkbox", { name: /Tim Java/ }).click();
    await expect(approve).toBeEnabled();

    const approveRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/admin/leader-requests/req-1/approve"),
    );
    await approve.click();
    expect((await approveRequest).postDataJSON()).toEqual({
      accessGroupIds: ["g-java"],
    });

    // Tab disetujui → cabut akses lewat dialog yang mewajibkan alasan.
    await page.getByRole("button", { name: /Disetujui/ }).click();
    const approvedCard = page.getByRole("button", { name: /Rudi Hartono/ });
    await expect(approvedCard).toContainText("Modul SIDAK");
    await approvedCard.click();
    // Grup yang sudah diberikan tampil tercentang dan terkunci sampai "Ubah grup".
    const javaGroup = page.getByRole("checkbox", { name: /Tim Java/ });
    await expect(javaGroup).toBeChecked();
    await expect(javaGroup).toBeDisabled();
    await page.getByRole("button", { name: "Ubah grup" }).click();
    await expect(javaGroup).toBeEnabled();
    await page.getByRole("button", { name: "Batal" }).click();
    await page.getByRole("button", { name: "Cabut akses" }).click();
    const revoke = page.getByRole("alertdialog", { name: "Cabut akses?" });
    await expect(revoke).toBeVisible();
    const confirmRevoke = revoke.getByRole("button", { name: "Cabut akses" });
    await expect(confirmRevoke).toBeDisabled();
    await revoke.getByRole("textbox", { name: "Alasan" }).fill("Rotasi tim");
    await expect(confirmRevoke).toBeEnabled();
    await revoke.getByRole("button", { name: "Batal" }).click();

    expectHermetic(audit);
  });

  test("grup akses: aturan terbaca sebagai kalimat dan hapus aturan dikonfirmasi", async ({
    page,
  }) => {
    const mocks: ApiMock[] = [
      { method: "GET", path: "/api/v1/admin/access-groups", body: ok(GROUPS) },
      {
        method: "GET",
        path: "/api/v1/admin/access-scope-options",
        body: ok(SCOPE_OPTIONS),
      },
      {
        method: "GET",
        path: "/api/v1/admin/access-groups/g-java/items",
        body: ok(GROUP_ITEMS),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/access-groups",
      apiMocks: mocks,
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Grup Akses" }),
    ).toBeVisible({ timeout: 20000 });
    await expectManagementNav(page, "Grup Akses");

    const rules = page.getByRole("list", { name: "Aturan data Tim Java" });
    await expect(rules.getByRole("listitem")).toHaveCount(2);
    await expect(rules).toContainText("Tim");
    await expect(rules).toContainText("Java — Semua subfolder");
    await expect(rules).toContainText("atau");
    await expect(rules).toContainText("Call Center");

    // Tombol hapus aturan selalu terlihat dan memakai dialog in-app.
    const remove = rules.getByRole("button", { name: /Hapus aturan/ }).first();
    await expect(remove).toBeVisible();
    await remove.click();
    const confirm = page.getByRole("alertdialog", { name: "Hapus aturan?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Batal" }).click();

    // Buat grup memakai dialog bersama.
    await page.getByRole("button", { name: "Buat grup" }).click();
    await expect(
      page.getByRole("dialog", { name: "Grup akses baru" }),
    ).toBeVisible();

    expectHermetic(audit);
  });

  test("persetujuan: permintaan multi-modul, mutasi per modul aktif, dan cari label modul", async ({
    page,
  }) => {
    const leader = {
      leader_user_id: "leader-2",
      leader_name: "Trainers",
      leader_email: "trainer@example.com",
      status: "pending",
    };
    const requests = [
      {
        ...leader,
        id: "request-ktp",
        module: "ktp",
        created_at: "2026-06-04T08:00:00.000Z",
      },
      {
        ...leader,
        id: "request-sidak",
        module: "sidak",
        created_at: "2026-06-04T09:00:00.000Z",
      },
      {
        id: "request-all",
        leader_user_id: "leader-3",
        leader_name: "Lina Marlina",
        leader_email: "lina@example.com",
        module: "all",
        created_at: "2026-06-05T09:00:00.000Z",
        status: "pending",
      },
    ];
    const mocks: ApiMock[] = [
      {
        method: "GET",
        path: "/api/v1/admin/leader-requests/pending",
        body: ok(requests),
      },
      { method: "GET", path: "/api/v1/admin/access-groups", body: ok(GROUPS) },
      {
        method: "POST",
        path: "/api/v1/admin/leader-requests/request-sidak/approve",
        body: ok(null),
      },
      {
        method: "POST",
        path: "/api/v1/admin/leader-requests/request-ktp/reject",
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/access-approval",
      apiMocks: mocks,
    });

    // Dua permintaan dari leader yang sama = satu kartu.
    const card = page.getByRole("button", { name: /^Trainers/ });
    await expect(card).toHaveCount(1, { timeout: 20000 });
    await expect(card).toContainText("Modul KTP + SIDAK · 2 permintaan");

    // Cari dengan label modul yang manusiawi, termasuk "semua modul" untuk `all`.
    const search = page.getByRole("textbox", {
      name: "Cari leader, email, atau modul",
    });
    await search.fill("semua modul");
    await expect(
      page.getByRole("button", { name: /Lina Marlina/ }),
    ).toContainText("Modul KTP + SIDAK");
    await expect(card).toHaveCount(0);
    await search.fill("");

    // Pindah ke modul SIDAK: approve hanya mengenai request SIDAK.
    await card.click();
    const modules = page.getByRole("group", { name: "Modul permintaan" });
    await modules.getByRole("button", { name: "SIDAK" }).click();
    await expect(
      modules.getByRole("button", { name: "SIDAK" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("checkbox", { name: /Tim Java/ }).click();
    const approveRequest = page.waitForRequest((req) =>
      req.url().endsWith("/request-sidak/approve"),
    );
    await page.getByRole("button", { name: "Setujui akses SIDAK" }).click();
    expect((await approveRequest).postDataJSON()).toEqual({
      accessGroupIds: ["g-java"],
    });

    // Tolak modul KTP: catatan wajib dan dikirim apa adanya.
    await card.click();
    await modules.getByRole("button", { name: "KTP" }).click();
    const reject = page.getByRole("button", { name: "Tolak" });
    await expect(reject).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Catatan penolakan" })
      .fill("Alasan penolakan");
    const rejectRequest = page.waitForRequest((req) =>
      req.url().endsWith("/request-ktp/reject"),
    );
    await reject.click();
    expect((await rejectRequest).postDataJSON()).toEqual({
      note: "Alasan penolakan",
    });

    expectHermetic(audit);
  });

  test("grup akses: subfolder tersimpan sebagai batch_name dan agen difilter per tim", async ({
    page,
  }) => {
    const scope = {
      teams: ["Tim Alpha", "Tim Beta"],
      services: [{ value: "call", label: "Call/Voice" }],
      agentsByTeam: {
        "Tim Alpha": [
          {
            id: "agent-1",
            name: "Agent Alpha 1",
            team: "Tim Alpha",
            batch_name: "Batch A",
          },
          {
            id: "agent-2",
            name: "Agent Alpha 2",
            team: "Tim Alpha",
            batch_name: "Batch B",
          },
        ],
        "Tim Beta": [
          {
            id: "agent-3",
            name: "Agent Beta 1",
            team: "Tim Beta",
            batch_name: "Batch C",
          },
        ],
      },
    };
    const mocks: ApiMock[] = [
      { method: "GET", path: "/api/v1/admin/access-groups", body: ok(GROUPS) },
      {
        method: "GET",
        path: "/api/v1/admin/access-scope-options",
        body: ok(scope),
      },
      {
        method: "GET",
        path: "/api/v1/admin/access-groups/g-java/items",
        body: ok([]),
      },
      {
        method: "POST",
        path: "/api/v1/admin/access-groups/g-java/items",
        body: ok(null),
      },
    ];
    const audit = await openHermeticShell(page, {
      path: "/dashboard/access-groups",
      apiMocks: mocks,
    });

    const form = page.getByRole("form", { name: "Tambah aturan" });
    const value = form.getByRole("combobox", { name: "Tim atau batch" });
    await expect(value).toBeVisible({ timeout: 20000 });
    await expect(
      value.getByRole("option", { name: "Tim Alpha — Semua subfolder" }),
    ).toHaveCount(1);
    await value.selectOption({ label: "Batch B" });

    const addRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        req.url().endsWith("/access-groups/g-java/items"),
    );
    await form.getByRole("button", { name: "Tambah" }).click();
    expect((await addRequest).postDataJSON()).toEqual({
      fieldName: "batch_name",
      fieldValue: "Batch B",
    });

    // Agen tertentu: pilihan agen terkunci sampai tim dipilih, lalu hanya tim itu.
    await form
      .getByRole("combobox", { name: "Jenis" })
      .selectOption("peserta_id");
    const agent = form.getByRole("combobox", { name: "Agen" });
    await expect(agent).toBeDisabled();
    await form
      .getByRole("combobox", { name: "Tim", exact: true })
      .selectOption("Tim Beta");
    await expect(agent).toBeEnabled();
    await expect(
      agent.getByRole("option", { name: "Agent Beta 1" }),
    ).toHaveCount(1);
    await expect(
      agent.getByRole("option", { name: /Agent Alpha/ }),
    ).toHaveCount(0);

    expectHermetic(audit);
  });
});
