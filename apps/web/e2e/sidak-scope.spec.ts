import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { ACCESS_MOCK, homeDashboardData } from "./helpers/sidakHomeFixture";
import { pickSelect } from "./helpers/pickSelect";

/**
 * Cakupan bersama SIDAK — hermetic.
 *
 * Kontrak dari `plans/markdown/sidak-redesign.md` requirement 2:
 * - layanan, tahun, dan rentang bulan dibaca dari query (`layanan`, `tahun`,
 *   `dari`, `sampai`) dan dipakai untuk request halaman;
 * - mengubah cakupan menulis query, jadi tautan bisa dibagikan;
 * - cakupan terbawa ketika pindah halaman SIDAK lewat sidebar;
 * - Heatmap menyatakan filter yang tidak dipakainya.
 */

const YEAR = new Date().getFullYear();
const PAST_YEAR = YEAR - 1;

function heatmapBody(year: number) {
  return {
    success: true,
    data: {
      days: [],
      totalFindings: 0,
      missingDateFindingsAllPeriods: 0,
      mode: "agent",
      year,
      serviceType: "chat",
      dateBasis: "tanggal_layanan",
    },
  };
}

const SCOPE_MOCKS: readonly ApiMock[] = [
  ACCESS_MOCK,
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard",
    body: {
      success: true,
      data: homeDashboardData({
        availableYears: [PAST_YEAR, YEAR],
        availableServices: ["call", "chat"],
      }),
    },
  },
  {
    method: "POST",
    path: "/api/v1/sidak/dashboard/forecast",
    body: { success: true, data: { status: "missing", snapshot: null } },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/heatmap",
    body: heatmapBody(PAST_YEAR),
  },
  {
    method: "GET",
    path: "/api/v1/sidak/ranking",
    body: {
      success: true,
      data: {
        rankings: [],
        periods: [],
        folders: [],
        availableYears: [PAST_YEAR, YEAR],
        availableServices: ["call", "chat"],
      },
    },
  },
];

function lastRequest(audit: ShellAudit, fragment: string): string {
  const matches = audit.mockedApi.filter((entry) => entry.includes(fragment));
  return matches[matches.length - 1] ?? "";
}

function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Navigasi utama" });
}

test.describe("Cakupan bersama SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("query membuka cakupan yang sama dan terbawa ke Ranking dan Heatmap", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: `/sidak/dashboard?layanan=chat&tahun=${PAST_YEAR}&dari=3&sampai=6`,
      apiMocks: SCOPE_MOCKS,
      waitForUrl: /\/sidak\/dashboard/,
    });
    console.log("[audit]", formatAudit(audit));

    await waitForMockedApi(audit, ["/sidak/dashboard?"]);
    await expect
      .poll(() => lastRequest(audit, "/sidak/dashboard?"), { timeout: 20000 })
      .toContain("service_type=chat");
    const dashboardRequest = lastRequest(audit, "/sidak/dashboard?");
    expect(dashboardRequest).toContain(`year=${PAST_YEAR}`);
    expect(dashboardRequest).toContain("startMonth=3");
    expect(dashboardRequest).toContain("endMonth=6");
    await expect(page.getByTestId("sidak-scope-line")).toContainText("Chat");
    await expect(page.getByTestId("sidak-scope-line")).toContainText(
      `Mar–Jun ${PAST_YEAR}`,
    );

    // Pindah lewat sidebar: cakupan ikut.
    const nav = sidebar(page);
    await nav.getByRole("link", { name: "Ranking", exact: true }).click();
    await expect(page).toHaveURL(/\/sidak\/ranking\?.*layanan=chat/);
    await expect(page).toHaveURL(new RegExp(`tahun=${PAST_YEAR}`));
    await expect
      .poll(() => lastRequest(audit, "/sidak/ranking?"))
      .toContain("service_type=chat");
    expect(lastRequest(audit, "/sidak/ranking?")).toContain(
      `year=${PAST_YEAR}`,
    );

    await nav.getByRole("link", { name: "Heatmap", exact: true }).click();
    await expect(page).toHaveURL(/\/sidak\/heatmap\?.*layanan=chat/);
    await expect
      .poll(() => lastRequest(audit, "/sidak/heatmap?"))
      .toContain(`year=${PAST_YEAR}`);
    expect(lastRequest(audit, "/sidak/heatmap?")).toContain(
      "service_type=chat",
    );
    await expect(
      page.getByText("Heatmap memakai tahun dan layanan saja"),
    ).toBeVisible();

    expectHermetic(audit);
  });

  test("/sidak langsung membuka Dashboard dengan cakupan yang sama", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: `/sidak?layanan=chat&tahun=${PAST_YEAR}&dari=3&sampai=6`,
      apiMocks: SCOPE_MOCKS,
      waitForUrl: /\/sidak\/dashboard/,
    });
    await expect(page).toHaveURL(
      new RegExp(`/sidak/dashboard\\?.*layanan=chat.*tahun=${PAST_YEAR}`),
    );
    await expect
      .poll(() => lastRequest(audit, "/sidak/dashboard?"), { timeout: 20000 })
      .toContain("service_type=chat");
    expectHermetic(audit);
  });

  test("mengubah layanan di Dashboard menulis query", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard",
      apiMocks: SCOPE_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?"]);
    await pickSelect(page, "Layanan", "Chat");
    await expect(page).toHaveURL(/layanan=chat/);
    await expect
      .poll(() => lastRequest(audit, "/sidak/dashboard?"))
      .toContain("service_type=chat");
    expectHermetic(audit);
  });

  test("Atur ulang mengembalikan cakupan ke bawaan dan membersihkan query", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: `/sidak/dashboard?layanan=chat&tahun=${PAST_YEAR}&dari=3&sampai=6`,
      apiMocks: SCOPE_MOCKS,
      waitForUrl: /\/sidak\/dashboard/,
    });
    await expect
      .poll(() => lastRequest(audit, "/sidak/dashboard?"), { timeout: 20000 })
      .toContain("service_type=chat");

    const bar = page.getByTestId("sidak-filter-bar");
    await bar.getByRole("button", { name: "Atur ulang" }).click();
    await expect(page).not.toHaveURL(/layanan=chat/);
    await expect
      .poll(() => lastRequest(audit, "/sidak/dashboard?"))
      .toContain("service_type=call");
    const request = lastRequest(audit, "/sidak/dashboard?");
    expect(request).toContain(`year=${YEAR}`);
    expect(request).toContain("startMonth=1");
    expect(request).toContain(`endMonth=${new Date().getMonth() + 1}`);

    // Cakupan lama tidak terbawa lagi lewat sidebar.
    await sidebar(page)
      .getByRole("link", { name: "Ranking", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sidak\/ranking/);
    await expect
      .poll(() => lastRequest(audit, "/sidak/ranking?"))
      .toContain(`year=${YEAR}`);
    expectHermetic(audit);
  });

  test("query tidak valid diabaikan dan memakai bawaan", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/dashboard?layanan=bogus&tahun=20x6&dari=14&sampai=0",
      apiMocks: SCOPE_MOCKS,
      waitForUrl: /\/sidak\/dashboard/,
    });
    await waitForMockedApi(audit, ["/sidak/dashboard?"]);
    const request = lastRequest(audit, "/sidak/dashboard?");
    expect(request).toContain("service_type=call");
    expect(request).toContain(`year=${YEAR}`);
    expect(request).toContain("startMonth=1");
    expectHermetic(audit);
  });
});
