import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

const apiMocks: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/sidak/periods",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: /^\/api\/v1\/sidak\/agents(?:\?|$)/,
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/indicators",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
];

test.beforeAll(() => assertLocalDevOnlyTarget());

for (const path of ["/sidak/reports", "/sidak/reports-ai"]) {
  test(`${path} redirects to data reports`, async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path,
      apiMocks,
      auth: { role: "admin" },
      waitForUrl: /\/sidak\/reports(?:-data|-ai)?$/,
    });
    await expect(page).toHaveURL(/\/sidak\/reports-data$/, { timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Laporan Data", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Kembali ke Laporan" }),
    ).toHaveCount(0);
    await waitForMockedApi(audit, [
      "/sidak/periods",
      "/sidak/agents",
      "/sidak/indicators",
    ]);
    expectHermetic(audit);
  });
}

for (const path of [
  "/sidak/reports",
  "/sidak/reports-ai",
  "/sidak/reports-data",
]) {
  for (const role of ["leader", "agent"] as const) {
    test(`${role} cannot bypass the destination guard via ${path}`, async ({
      page,
    }) => {
      const audit = await openHermeticShell(page, {
        path,
        auth: { role },
        waitForUrl: "/unauthorized",
      });
      await expect(page).toHaveURL(/\/unauthorized$/);
      await expect(
        page.getByRole("heading", { name: "Laporan Data", exact: true }),
      ).toHaveCount(0);
      expectHermetic(audit);
    });
  }
}

test("SIDAK card and Laporan navigation open data reports", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: "/sidak",
    apiMocks,
    auth: { role: "admin" },
  });
  const card = page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Laporan", exact: true }),
    });
  await expect(card).toHaveAttribute("href", "/sidak/reports-data", {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "SIDAK", exact: true }).click();
  const nav = page.getByRole("link", { name: "Laporan", exact: true });
  await expect(nav).toHaveAttribute("href", "/sidak/reports-data");
  await nav.click();
  await expect(page).toHaveURL(/\/sidak\/reports-data$/);
  await page.goto("/sidak");
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/sidak\/reports-data$/);
  await expect(
    page.getByRole("heading", { name: "Laporan Data", exact: true }),
  ).toBeVisible();
  await waitForMockedApi(audit, [
    "/me/access-status",
    "/sidak/periods",
    "/sidak/agents",
    "/sidak/indicators",
  ]);
  expectHermetic(audit);
});
