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
 * Landing SIDAK — kartu modul (hermetic).
 *
 * Home untuk kontrak "kartu Forecast ada dan mengarah ke /sidak/forecast", yang
 * sebelumnya hanya dipegang unit test komponen. Copy diambil dari `CARDS` di
 * `apps/web/src/routes/sidak/index.tsx`.
 */

const SIDAK_LANDING_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
];

test.describe("Landing SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("kartu Forecast tampil dengan copy dan tujuan yang benar", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: SIDAK_LANDING_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    const forecastCard = page.getByRole("link", { name: /forecast/i }).first();
    await expect(forecastCard).toBeVisible({ timeout: 20000 });
    await expect(forecastCard).toHaveAttribute("href", "/sidak/forecast");
    await expect(page.getByText("Forecast", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Proyeksi tren temuan dan sinyal agent/i),
    ).toBeVisible();

    // Kartu ini hidup di dalam gate akses; buktikan gate-nya memang dievaluasi
    // (jadi kontraknya bukan sekadar markup statis).
    await waitForMockedApi(audit, ["/me/access-status"]);
    expectHermetic(audit);
  });
});
