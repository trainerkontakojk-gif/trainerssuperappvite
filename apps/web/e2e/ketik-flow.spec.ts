import { expect, test } from "@playwright/test";
import {
  DEFAULT_KETIK_SETTINGS,
  type KetikSessionHistoryItem,
} from "@trainers/types";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * KETIK — landing + modal workspace (hermetic).
 *
 * Modul ini sebelumnya tidak punya spec E2E sama sekali (plan 025 Wave 2, spec
 * #9). Semua `/api` dimock; mutasi data nyata tetap milik spec backend loopback.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * bukan salinan yang ditulis tangan, supaya spec gagal ketika UI menyimpang dari
 * kontrak bersama dan tidak basi saat default berubah.
 */

/** Riwayat dengan peserta yang record-nya sudah tidak ada (`participantId` null). */
const HISTORY_UNAVAILABLE_PARTICIPANT: readonly KetikSessionHistoryItem[] = [
  {
    id: "ketik-history-1",
    date: "2026-09-10T00:00:00.000Z",
    scenarioTitle: "Skenario Chat",
    consumerName: "Andi",
    messages: [],
    simulationSubject: {
      type: "participant",
      participantId: null,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    },
  },
];

function ketikMocks(
  history: readonly KetikSessionHistoryItem[],
): readonly ApiMock[] {
  return [
    {
      method: "GET",
      path: "/api/v1/ketik/settings",
      body: { success: true, data: DEFAULT_KETIK_SETTINGS },
      // `ketikApi` menyimpan versi dari header ini; tanpanya jalur simpan
      // kehilangan prasyaratnya.
      headers: {
        "x-settings-version": "v1",
        "x-ketik-templates-version": "t1",
      },
    },
    {
      method: "GET",
      path: "/api/v1/ketik/history",
      body: { success: true, data: history },
    },
  ];
}

/** Landing KETIK merujuk logo OJK dari host eksternal. */
const KETIK_EXPECTED_ASSET_HOSTS = ["ojk.go.id"];

const ACTIVE_SCENARIOS = DEFAULT_KETIK_SETTINGS.scenarios.filter(
  (scenario) => scenario.isActive,
).length;

test.describe("KETIK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("landing KETIK dirender tanpa menyentuh backend", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: ketikMocks([]),
      // Tetap di-abort (tidak ada egress); hanya tidak dihitung sebagai temuan,
      // karena aset dekoratif yang sudah diketahui bukan traffic aplikasi.
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", {
        name: /Latih percakapan chat\. Balas lebih tepat dan empatik\./,
      }),
    ).toBeVisible({ timeout: 20000 });

    // Jumlah skenario aktif berasal dari settings, bukan angka tetap.
    await expect(
      page.getByText(`${ACTIVE_SCENARIOS} skenario aktif`),
    ).toBeVisible();

    for (const label of ["Mulai simulasi", "Pengaturan", "Riwayat"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
        `tombol "${label}" tidak tampil`,
      ).toBeVisible();
    }

    // Copy pengantar landing: bagian dari kontrak "intro" yang sama.
    await expect(page.getByText(/Ketik — singkatan dari/)).toBeVisible();
    await expect(page.getByText(/Pemakaian bulan ini/i).first()).toBeVisible();

    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);
    expectHermetic(audit);
  });

  test("kartu riwayat menampilkan target dan penanda peserta tidak tersedia", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/ketik",
      apiMocks: ketikMocks(HISTORY_UNAVAILABLE_PARTICIPANT),
      expectedThirdPartyHosts: KETIK_EXPECTED_ASSET_HOSTS,
    });
    console.log("[audit]", formatAudit(audit));

    await page
      .getByRole("button", { name: /^Riwayat/ })
      .first()
      .click();

    await expect(page.getByText(/Target: Peserta: Andi/)).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.getByText(/record peserta tidak lagi tersedia/),
    ).toBeVisible();

    expectHermetic(audit);
  });
});
