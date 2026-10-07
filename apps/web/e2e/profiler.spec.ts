import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS, TEAM_ID } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Profiler — flow browser-level HERMETIC (plan 025 spec #5).
 *
 * Menggantikan browser-level Profiler yang hilang bersama `e2e-p0-p1.spec.ts`.
 * Semua `/api` yang dipakai halaman ini dimock lewat `helpers/profilerMocks.ts`,
 * sehingga spec bisa lulus tanpa backend; mutasi data nyata (termasuk error
 * duplikat dari server) tetap milik spec backend loopback.
 */

test.describe("Profiler (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("workspace Profiler dirender tanpa menyentuh backend", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", { level: 1, name: /Batch tahun 2026/ }),
    ).toBeVisible({ timeout: 20000 });

    // Buktikan fetch awal benar-benar terjadi DAN semuanya dilayani mock.
    await waitForMockedApi(audit, [
      "/profiler/years",
      "/profiler/folders",
      "/profiler/counts",
      "/profiler/peserta/upcoming-birthdays",
      "/me/access-status",
    ]);
    expectHermetic(audit);
  });

  test("navigasi tim → batch dirender dari fixture lokal", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: PROFILER_MOCKS,
    });

    // Tim dan batch langsung tampil di satu navigasi; batch membuka workspace.
    const nav = page.getByRole("navigation", { name: "Daftar tim dan batch" });
    await expect(nav.getByText("Tim Call")).toBeVisible({ timeout: 20000 });
    await nav.getByRole("button", { name: /^Batch Pagi/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Batch Pagi" }),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test(`teks halaman impor Profiler minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler/import?batch=Batch%20Pagi",
      apiMocks: [
        ...PROFILER_MOCKS,
        {
          method: "GET",
          path: "/api/v1/profiler/teams",
          body: {
            success: true,
            data: [{ id: TEAM_ID, nama: "Tim Call" }],
          },
        },
      ],
    });
    // Label grup kolom template (mis. "Identitas Utama") adalah teks kecil
    // yang dulu text-[10px]; pastikan sudah tampil sebelum dipindai.
    await expect(page.getByText("Identitas Utama")).toBeVisible({
      timeout: 20000,
    });

    // Slide peserta (ParticipantSlide) tidak ada di halaman ini, jadi tidak
    // perlu pengecualian; seluruh <main> dipindai.
    const offenders = await findTextBelowFloor(page.locator("main").first());
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});
