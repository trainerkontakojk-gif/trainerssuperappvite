/**
 * Input Audit: parameter lama yang belum terhubung ke parameter master
 * (snapshot rule indicator tanpa `legacy_indicator_id`) harus terlihat tidak
 * bisa dicatat SEBELUM pengguna mengisi, dan penolakan batch 422 dari server
 * tampil sebagai error, bukan "0 temuan tersimpan".
 * Plan: `plans/markdown/sidak-unmapped-indicator-findings.md`.
 *
 * Harness mock fail-closed; tidak ada request ke database nyata.
 */
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  captured,
  expectIsolation,
  FIXTURE,
  openInputAudit,
  resetStore,
  selectPeriod,
  startAudit,
  type HarnessFixture,
  type HarnessOptions,
} from "./helpers/sidakTemuanDatesHarness";

const UNLINKED = {
  id: "eeeeeeee-5555-4555-8555-eeeeeeeeeee1",
  service_type: "call",
  name: "Parameter Lama Tanpa Master",
  category: "non_critical",
  bobot: 0.3,
  parameter_group: null,
  is_active: true,
  ruleIndicatorId: "eeeeeeee-5555-4555-8555-eeeeeeeeeee1",
  legacyIndicatorId: null,
};

const fixture: HarnessFixture = {
  ...FIXTURE,
  indicators: [
    ...FIXTURE.indicators.map((indicator, i) => ({
      ...indicator,
      ruleIndicatorId: `ffffffff-6666-4666-8666-fffffffffff${i}`,
      legacyIndicatorId: indicator.id,
    })),
    UNLINKED,
  ],
};

async function openForm(
  page: import("@playwright/test").Page,
  opts: HarnessOptions = {},
) {
  const audit = startAudit();
  await openInputAudit(page, audit, { fixture, ...opts });
  await selectPeriod(page);
  await page.getByRole("button", { name: "Tambah temuan" }).first().click();
  return audit;
}

function parameterTrigger(page: import("@playwright/test").Page) {
  return page
    .locator('button[aria-haspopup="listbox"]:not(fieldset *)')
    .first();
}

test.beforeEach(() => {
  resetStore();
});

test("parameter yang belum terhubung ditandai dan tidak bisa dipilih", async ({ page }) => {
  const audit = await openForm(page);
  await expect(page.getByText(/belum terhubung ke parameter master/)).toBeVisible();

  await parameterTrigger(page).click();
  const option = page.getByRole("option", { name: new RegExp(UNLINKED.name) });
  await expect(option).toBeDisabled();
  await expect(option).toContainText("Belum terhubung");
  await expect(
    page.getByRole("option", { name: new RegExp(FIXTURE.indicators[0]!.name) }),
  ).toBeEnabled();

  expectIsolation(audit);
});

test("import Excel menandai baris parameter yang belum terhubung", async ({ page }) => {
  const audit = startAudit();
  await openInputAudit(page, audit, { fixture });
  await selectPeriod(page);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Input Temuan");
  ws.addRow([
    "No. Tiket",
    "Parameter / Sub-parameter",
    "Nilai (0-3)",
    "Ketidaksesuaian",
    "Sebaiknya",
  ]);
  ws.addRow(["TKT-UNL-1", UNLINKED.name, 1, "Telat", "Tepat waktu"]);
  const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

  await page.getByRole("button", { name: "Impor Excel", exact: true }).click();
  await page.getByRole("button", { name: "Upload & Preview" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "unlinked.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });

  await expect(page.getByText(/belum terhubung ke parameter master/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Import \d+ Temuan$/ }),
  ).toHaveCount(0);
  expect(captured("preview")).toHaveLength(0);
  expect(captured("batch")).toHaveLength(0);

  expectIsolation(audit);
});

test("penolakan batch 422 tampil sebagai error, bukan sukses", async ({ page }) => {
  const message =
    "1 parameter tidak valid, tidak ada temuan yang disimpan. Indikator tidak ditemukan di database";
  const audit = await openForm(page, {
    batch: { kind: "error", status: 422, message },
  });
  await page.getByPlaceholder(/Contoh: L/).fill("TKT-422");
  await parameterTrigger(page).click();
  await page
    .getByRole("option", { name: new RegExp(FIXTURE.indicators[0]!.name) })
    .click();
  await page.getByRole("button", { name: /Simpan Temuan/ }).click();

  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText(/temuan tersimpan/)).toHaveCount(0);

  expectIsolation(audit);
});
