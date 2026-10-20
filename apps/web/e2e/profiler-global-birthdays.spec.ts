import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { PROFILER_MOCKS } from "./helpers/profilerMocks";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Bagian "Ulang tahun terdekat" (seluruh data) di ringkasan tahun `/profiler`.
 *
 * Sejak redesign tahap 4 daftarnya tampil langsung di samping daftar folder,
 * tanpa popup. Spec ini menjaga kontrak bagian tersebut: maksimal 5 data
 * diminta, label "Hari ini"/"N hari lagi", state kosong, dan state error
 * dengan "Coba lagi" yang benar-benar memanggil ulang API.
 */

const BIRTHDAYS_PATH = "/api/v1/profiler/peserta/upcoming-birthdays";

const SAMPLE = [
  {
    id: "b-1",
    nama: "Siti Nur Anisa",
    tgl_lahir: "1998-03-12",
    batch_name: "Batch A",
    daysUntil: 0,
    age: 28,
  },
  {
    id: "b-2",
    nama: "Muhammad Fahmi",
    tgl_lahir: "1995-07-25",
    batch_name: "Batch B",
    daysUntil: 4,
    age: 31,
  },
  {
    id: "b-3",
    nama: "Dwiana Amelia",
    tgl_lahir: "2000-11-02",
    batch_name: "Batch C",
    daysUntil: 15,
    age: 26,
  },
];

function withBirthdays(mock: Omit<ApiMock, "method" | "path">): ApiMock[] {
  return [
    ...PROFILER_MOCKS.filter((m) => m.path !== BIRTHDAYS_PATH),
    { method: "GET", path: BIRTHDAYS_PATH, ...mock },
  ];
}

function birthdaysSection(page: Page) {
  return page.getByRole("region", { name: "Ulang tahun terdekat" });
}

test.describe("Widget ulang tahun global Profiler (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("daftar terdekat tampil langsung tanpa popup", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: withBirthdays({ body: { success: true, data: SAMPLE } }),
    });

    const section = birthdaysSection(page);
    const rows = section.getByRole("listitem");
    await expect(rows).toHaveCount(3, { timeout: 20000 });
    await expect(rows.filter({ hasText: "Siti Nur Anisa" })).toContainText(
      "Hari ini",
    );
    await expect(rows.filter({ hasText: "Muhammad Fahmi" })).toContainText(
      "4 hari lagi",
    );
    await expect(rows.filter({ hasText: "Dwiana Amelia" })).toContainText(
      "15 hari lagi",
    );
    await expect(rows.filter({ hasText: "Dwiana Amelia" })).toContainText(
      "Batch C",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      audit.mockedApi.some((entry) =>
        entry.startsWith(`GET ${BIRTHDAYS_PATH}?limit=5`),
      ),
    ).toBe(true);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("tanpa data: bagian menyatakan kosong dalam bahasa Indonesia", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: withBirthdays({ body: { success: true, data: [] } }),
    });

    const section = birthdaysSection(page);
    await expect(
      section.getByText("Belum ada data tanggal lahir."),
    ).toBeVisible({ timeout: 20000 });
    await expect(section.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No data available")).toHaveCount(0);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("gagal memuat: pesan error tampil dan Coba lagi memanggil ulang API", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: withBirthdays({
        status: 500,
        body: {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Data ulang tahun sedang tidak tersedia.",
          },
        },
      }),
    });

    const section = birthdaysSection(page);
    await expect(section.getByRole("alert")).toHaveText(
      "Gagal memuat ulang tahun.",
      { timeout: 20000 },
    );

    // Percobaan berikutnya berhasil. Route ini didaftarkan setelah guard
    // hermetic sehingga didahulukan Playwright, dan hanya melayani endpoint ini.
    let retryHits = 0;
    await page.route(`**${BIRTHDAYS_PATH}?*`, async (route) => {
      retryHits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: SAMPLE }),
      });
    });

    await section.getByRole("button", { name: "Coba lagi" }).click();
    await expect(section.getByRole("listitem")).toHaveCount(3);
    await expect(section.getByRole("alert")).toHaveCount(0);
    expect(retryHits).toBe(1);

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
