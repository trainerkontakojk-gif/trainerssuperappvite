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
 * Widget "Ulang Tahun Terdekat" (seluruh data) di ringkasan tahun `/profiler`.
 *
 * Menggantikan unit test `global-birthdays-widget.test.tsx`: kartu hanya
 * menampilkan yang terdekat, daftar lengkap ada di popup, state kosong, dan
 * state error dengan "Coba lagi" yang benar-benar memanggil ulang API.
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

function widgetCard(page: Page) {
  return page.getByRole("button", { name: "Lihat ulang tahun terdekat" });
}

test.describe("Widget ulang tahun global Profiler (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("kartu menampilkan yang terdekat; daftar lengkap hanya di popup", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: withBirthdays({ body: { success: true, data: SAMPLE } }),
    });

    const card = widgetCard(page);
    await expect(card.getByText("Siti Nur Anisa")).toBeVisible({
      timeout: 20000,
    });
    await expect(card.getByText("Hari ini!")).toBeVisible();
    await expect(page.getByText("Muhammad Fahmi")).toHaveCount(0);
    expect(
      audit.mockedApi.some((entry) =>
        entry.startsWith(`GET ${BIRTHDAYS_PATH}?limit=5`),
      ),
    ).toBe(true);

    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Muhammad Fahmi")).toBeVisible();
    await expect(dialog.getByText("Dwiana Amelia")).toBeVisible();
    await expect(dialog.getByText("HARI INI")).toBeVisible();
    await expect(dialog.getByText("4 HARI LAGI")).toBeVisible();
    await expect(dialog.getByText("15 HARI LAGI")).toBeVisible();
    await expect(dialog.getByText("Menampilkan 5 data terdekat")).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("tanpa data: kartu dan popup menyatakan kosong dalam bahasa Indonesia", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/profiler",
      apiMocks: withBirthdays({ body: { success: true, data: [] } }),
    });

    const card = widgetCard(page);
    await expect(card.getByText("Belum ada ulang tahun terdekat")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("No data available")).toHaveCount(0);

    await card.click();
    await expect(
      page.getByRole("dialog").getByText("Tidak ada data ulang tahun."),
    ).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });

  test("gagal memuat: pesan server tampil dan Coba lagi memanggil ulang API", async ({
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

    const card = widgetCard(page);
    await expect(
      card.getByText("Data ulang tahun sedang tidak tersedia."),
    ).toBeVisible({ timeout: 20000 });

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

    await card.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Coba lagi" }).click();
    await expect(dialog.getByText("Muhammad Fahmi")).toBeVisible();
    expect(retryHits).toBe(1);

    // Kartu di belakang modal ikut diperbarui setelah dialog ditutup.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card.getByText("Siti Nur Anisa")).toBeVisible();

    console.log("[audit]", formatAudit(audit));
    expectHermetic(audit);
  });
});
