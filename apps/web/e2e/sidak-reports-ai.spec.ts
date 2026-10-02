import { expect, test } from "@playwright/test";
import { TEXT_SIMULATION_MODELS } from "@trainers/types";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * SIDAK Reports AI — pemilih model (hermetic).
 *
 * Kontrak: pemilih model hanya memuat model TEKS. Model khusus gambar tidak boleh
 * muncul, karena laporan ini hanya menghasilkan teks.
 *
 * Daftar harapan diambil dari konstanta bersama `TEXT_SIMULATION_MODELS`, bukan
 * nama yang ditulis ulang di sini — supaya spec ini gagal ketika UI menyimpang
 * dari kontrak bersama, dan tidak ikut basi saat daftar model berubah.
 */

const REPORTS_AI_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/sidak/periods",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/agents",
    body: { success: true, data: [] },
  },
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
];

test.describe("SIDAK Reports AI (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("pemilih model hanya memuat model teks", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/reports-ai",
      apiMocks: REPORTS_AI_MOCKS,
    });
    console.log("[audit]", formatAudit(audit));

    await expect(page.getByText("Model:")).toBeVisible({ timeout: 20000 });

    // Pemilih model tidak punya label terprogram, jadi ia ditemukan lewat
    // opsinya, bukan lewat `getByRole("combobox", { name })`.
    const modelSelect = page.locator("select").filter({
      has: page.getByRole("option", {
        name: TEXT_SIMULATION_MODELS[0].name,
        exact: true,
      }),
    });
    await expect(modelSelect).toHaveCount(1);

    // Daftar opsi harus SAMA PERSIS dengan konstanta bersama. Perbandingan eksak
    // ini yang membuat spec gagal saat UI menyimpang; pencocokan nama satu per
    // satu saja tidak cukup karena `getByRole` mencocokkan substring ("Gemini
    // 3.5 Flash" juga cocok dengan "Gemini 3.5 Flash Lite").
    expect(await modelSelect.locator("option").allTextContents()).toEqual(
      TEXT_SIMULATION_MODELS.map((model) => model.name),
    );

    // Model khusus gambar tidak boleh ikut: laporan ini hanya menghasilkan teks.
    await expect(page.getByRole("option", { name: /image/i })).toHaveCount(0);

    await waitForMockedApi(audit, ["/sidak/periods", "/sidak/agents"]);
    expectHermetic(audit);
  });
});
