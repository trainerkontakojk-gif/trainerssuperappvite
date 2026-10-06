import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Log Aktivitas (`/dashboard/activities`) — hermetic.
 *
 * Kontrak: header + tabel log, pencarian menyaring baris, dan empty state saat
 * tidak ada yang cocok. Endpoint `GET /api/v1/admin/activity-logs` membalas
 * `{ success: true, data }` (lihat `apps/api/src/routes/admin.ts`).
 */

const LOGS = [
  {
    id: "log-1",
    created_at: "2026-09-10T03:15:00.000Z",
    user_name: "Fajar Nugroho",
    action: "approve_leader_access",
    type: "APPROVAL",
    module: "sidak",
  },
  {
    id: "log-2",
    created_at: "2026-09-11T04:20:00.000Z",
    user_name: "Rina Wijaya",
    action: "delete_peserta",
    type: "DELETE",
    module: "ktp",
  },
];

const ACTIVITIES_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/admin/activity-logs",
    body: { success: true, data: LOGS },
  },
];

const SEARCH = "Cari aktor, tipe aksi, atau modul";

test.describe("Log Aktivitas (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("header dan tabel log dirender dari data lokal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/activities",
      apiMocks: ACTIVITIES_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", { name: "Log Aktivitas" }),
    ).toBeVisible({ timeout: 20000 });

    for (const column of ["Waktu", "Aktor", "Aksi"]) {
      await expect(
        page.getByRole("columnheader", { name: column }),
      ).toBeVisible();
    }

    await expect(page.getByText("Fajar Nugroho")).toBeVisible();
    await expect(page.getByText("Rina Wijaya")).toBeVisible();

    await waitForMockedApi(audit, ["/admin/activity-logs"]);
    expectHermetic(audit);
  });

  test("log bersifat append-only: tidak ada kontrol hapus", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/activities",
      apiMocks: ACTIVITIES_MOCKS,
    });

    await expect(page.getByText("Fajar Nugroho")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("button", { name: /hapus/i })).toHaveCount(0);
    expectHermetic(audit);
  });

  test("pencarian menyaring baris, dan yang tidak cocok menampilkan empty state", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/activities",
      apiMocks: ACTIVITIES_MOCKS,
    });

    const search = page.getByRole("textbox", { name: SEARCH });
    await expect(search).toBeVisible({ timeout: 20000 });

    await search.fill("Fajar");
    await expect(page.getByText("Fajar Nugroho")).toBeVisible();
    await expect(page.getByText("Rina Wijaya")).toHaveCount(0);

    // Tidak ada yang cocok → empty state, bukan tabel kosong tanpa penjelasan.
    await search.fill("tidak-ada-aktor-ini");
    await expect(page.getByText("Belum ada aktivitas")).toBeVisible();
    await expect(
      page.getByText("Belum ada rekaman mutasi yang terekam."),
    ).toBeVisible();

    expectHermetic(audit);
  });
});

test.describe("Log Aktivitas — ekspor CSV (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("CSV berisi baris yang tersaring dan meng-escape tanda kutip", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/dashboard/activities",
      apiMocks: [
        {
          method: "GET",
          path: "/api/v1/admin/activity-logs",
          body: {
            success: true,
            data: [
              ...LOGS,
              {
                id: "log-3",
                created_at: "2026-09-12T05:00:00.000Z",
                user_name: 'Andi "QA" Pratama',
                action: "update_role",
                type: "UPDATE",
                module: "admin",
              },
            ],
          },
        },
      ],
    });

    await page.getByRole("textbox", { name: SEARCH }).fill("Andi");
    await expect(page.getByText('Andi "QA" Pratama')).toBeVisible({
      timeout: 20000,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Ekspor CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^log_aktivitas_\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n");

    expect(lines[0]).toBe('"Waktu","Aktor","Aksi","Tipe","Modul"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(
      '"Andi ""QA"" Pratama","update_role","UPDATE","admin"',
    );
    expectHermetic(audit);
  });
});
