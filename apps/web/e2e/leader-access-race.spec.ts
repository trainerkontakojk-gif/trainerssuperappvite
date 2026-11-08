import { expect, test, type Route } from "@playwright/test";
import { expectHermetic, openHermeticShell } from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test("status akses terbaru menang meski respons selesai terbalik", async ({
  page,
}) => {
  const audit = await openHermeticShell(page, {
    path: "/profiler?batch=Batch%20Pagi",
    waitForUrl: /\/profiler/,
    auth: { role: "leader" },
    apiMocks: [
      {
        method: "GET",
        path: "/api/v1/me/access-status",
        body: {
          success: true,
          data: {
            ktp: { status: "approved", module: "ktp", created_at: null },
          },
        },
      },
      ...PROFILER_MOCKS,
    ],
  });
  await expect(
    page.getByRole("navigation", { name: "Daftar tim dan folder" }),
  ).toBeVisible({ timeout: 20000 });

  const pending: Route[] = [];
  await page.route("**/api/v1/me/access-status", (route) => {
    pending.push(route);
  });
  const focus = () =>
    page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const resolve = (route: Route, status: "approved" | "revoked") =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { ktp: { status, module: "ktp", created_at: null } },
      }),
    });

  await focus();
  await expect.poll(() => pending.length).toBe(1);
  await focus();
  await expect.poll(() => pending.length).toBe(2);
  await resolve(pending[1]!, "revoked");
  await expect(page.getByText("Akses Dicabut")).toBeVisible();
  await resolve(pending[0]!, "approved");
  await page.waitForTimeout(200);
  await expect(page.getByText("Akses Dicabut")).toBeVisible();

  await focus();
  await expect.poll(() => pending.length).toBe(3);
  await focus();
  await expect.poll(() => pending.length).toBe(4);
  await resolve(pending[2]!, "approved");
  await page.waitForTimeout(200);
  await expect(page.getByText("Memuat status akses...")).toBeVisible();
  await resolve(pending[3]!, "revoked");
  await expect(page.getByText("Akses Dicabut")).toBeVisible();
  expectHermetic(audit);
});
