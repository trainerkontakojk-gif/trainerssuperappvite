import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { HOME_YEAR, homeMocks } from "./helpers/sidakHomeFixture";

/**
 * Kunjungan pertama SIDAK (cakupan tim belum dipilih) — hermetic.
 *
 * Kontrak (`plans/markdown/sidak-parallel-paging.md`, batch 3):
 * - tim bawaan dipilih dari `/sidak/folders` (daftar tim yang di-scope untuk
 *   leader) SEBELUM data pertama dimuat, jadi Dashboard, Ranking, dan Forecast
 *   memuat datanya satu kali, langsung dengan tim bawaan;
 * - tim bawaan di luar daftar itu tidak pernah dipakai; tanpa kecocokan,
 *   halaman memuat "Semua tim";
 * - `/sidak/folders` gagal → halaman tetap memuat "Semua tim", tidak macet.
 */

const SCOPED_CALL_TEAM = [
  { id: "team-call", name: "Tim Call", parent_id: null },
];

function foldersMock(folders: unknown[], status = 200): ApiMock {
  return {
    method: "GET",
    path: "/api/v1/sidak/folders",
    status,
    body:
      status === 200
        ? { success: true, data: folders }
        : { success: false, error: { code: "SERVER_ERROR", message: "x" } },
  };
}

const RANKING_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/sidak/ranking",
  body: {
    success: true,
    data: {
      rankings: [],
      periods: [],
      // Daftar tim respons halaman tetap tanpa scope, seperti di production.
      folders: [{ id: "team-call", name: "Tim Call" }],
      availableYears: [HOME_YEAR],
      availableServices: ["call", "chat"],
    },
  },
};

/**
 * URL berbeda yang diminta. Dev server memakai React StrictMode, yang
 * menjalankan effect dua kali, jadi request identik dihitung satu.
 */
function requests(audit: ShellAudit, fragment: string): string[] {
  return [
    ...new Set(audit.mockedApi.filter((entry) => entry.includes(fragment))),
  ];
}

/** Tunggu request data pertama, lalu sampai tidak ada request baru 1,5 detik. */
async function settle(page: Page, audit: ShellAudit, fragment: string) {
  await waitForMockedApi(audit, [fragment]);
  for (let quiet = 0; quiet < 8; quiet += 1) {
    const seen = audit.mockedApi.length;
    await page.waitForTimeout(1500);
    if (audit.mockedApi.length === seen) return;
  }
}

test.describe("Kunjungan pertama SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  for (const target of [
    {
      page: "dashboard",
      data: "/sidak/dashboard?",
      team: "folder_ids=team-call",
    },
    { page: "ranking", data: "/sidak/ranking?", team: "folder=team-call" },
    {
      page: "forecast",
      data: "/sidak/dashboard?",
      team: "folder_ids=team-call",
    },
  ]) {
    test(`${target.page}: tim bawaan dari daftar ber-scope, data dimuat sekali`, async ({
      page,
    }) => {
      const audit = await openHermeticShell(page, {
        path: `/sidak/${target.page}`,
        apiMocks: [foldersMock(SCOPED_CALL_TEAM), RANKING_MOCK, ...homeMocks()],
      });
      await settle(page, audit, target.data);

      const dataRequests = requests(audit, target.data);
      expect(dataRequests).toHaveLength(1);
      expect(dataRequests[0]).toContain(target.team);
      await expect(page).toHaveURL(/tim=team-call/);
      expectHermetic(audit);
    });
  }

  test("tim bawaan di luar scope tidak dipakai: Semua tim, data dimuat sekali", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: [
        foldersMock([{ id: "team-wa", name: "Tim Whatsapp", parent_id: null }]),
        ...homeMocks(),
      ],
    });
    await settle(page, audit, "/sidak/dashboard?");

    const dataRequests = requests(audit, "/sidak/dashboard?");
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0]).not.toContain("folder_ids");
    await expect(page).not.toHaveURL(/tim=team-call/);
    expectHermetic(audit);
  });

  test("daftar tim gagal dimuat: halaman tetap memuat Semua tim", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: [foldersMock([], 503), ...homeMocks()],
    });
    await settle(page, audit, "/sidak/dashboard?");

    const dataRequests = requests(audit, "/sidak/dashboard?");
    expect(dataRequests.length).toBeGreaterThan(0);
    expect(dataRequests.at(-1)).not.toContain("folder_ids");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tim sudah dipilih di URL: daftar tim tidak diminta", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: `/sidak/dashboard?layanan=call&tahun=${HOME_YEAR}&tim=ALL`,
      apiMocks: [foldersMock(SCOPED_CALL_TEAM), ...homeMocks()],
    });
    await settle(page, audit, "/sidak/dashboard?");

    expect(requests(audit, "/sidak/folders")).toHaveLength(0);
    const dataRequests = requests(audit, "/sidak/dashboard?");
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0]).not.toContain("folder_ids");
    expectHermetic(audit);
  });
});

test("selama tim bawaan dicari: skeleton tampil, bukan pesan gagal", async ({
  page,
}) => {
  await assertLocalDevOnlyTarget();
  let releaseFolders: () => void = () => {};
  const foldersHeld = new Promise<void>((resolve) => {
    releaseFolders = resolve;
  });
  const audit = await openHermeticShell(page, {
    path: "/sidak/dashboard",
    apiMocks: homeMocks(),
    beforeNavigate: async (p) => {
      await p.route("**/api/v1/sidak/folders", async (route) => {
        await foldersHeld;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: SCOPED_CALL_TEAM }),
        });
      });
    },
  });

  await expect(page.getByTestId("sidak-dashboard-skeleton")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("Gagal memuat data")).toHaveCount(0);
  expect(requests(audit, "/sidak/dashboard?")).toHaveLength(0);

  releaseFolders();
  await settle(page, audit, "/sidak/dashboard?");
  const dataRequests = requests(audit, "/sidak/dashboard?");
  expect(dataRequests).toHaveLength(1);
  expect(dataRequests[0]).toContain("folder_ids=team-call");
  await expect(page.getByText("Gagal memuat data")).toHaveCount(0);
});
