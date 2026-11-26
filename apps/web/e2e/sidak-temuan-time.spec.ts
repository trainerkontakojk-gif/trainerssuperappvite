import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  FIXTURE,
  captured,
  expectIsolation,
  lastBatchItems,
  openInputAudit,
  resetStore,
  selectPeriod,
  startAudit,
} from "./helpers/sidakTemuanDatesHarness";
import {
  lastUpdate,
  openAgentDetail,
  seedRow,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";

async function openInput(page: Page) {
  const audit = startAudit();
  await openInputAudit(page, audit, {
    fixture: {
      ...FIXTURE,
      indicators: [
        ...FIXTURE.indicators,
        {
          ...FIXTURE.indicators[0],
          id: "dddddddd-4444-4444-8444-ddddddddddd4",
          service_type: "chat",
          name: "Respons Chat",
        },
        {
          ...FIXTURE.indicators[0],
          id: "dddddddd-4444-4444-8444-ddddddddddd5",
          service_type: "email",
          name: "Respons Email",
        },
      ],
    },
  });
  await selectPeriod(page);
  return audit;
}
async function chooseService(page: Page, service: string) {
  await page.getByRole("combobox", { name: "Layanan", exact: true }).click();
  await page.getByRole("option", { name: service, exact: true }).click();
}

test.beforeEach(() => resetStore());

test("Call manual and inline edits save seconds; Chat and Email show only appropriate controls", async ({
  page,
}) => {
  const audit = await openInput(page);
  await page.getByRole("button", { name: "Tambah temuan" }).first().click();
  const duration = page.getByLabel(/^Durasi panggilan/);
  const chatTime = page.getByLabel(/^Jam interaksi dimulai/);
  await expect(duration).toBeVisible();
  await expect(chatTime).toHaveCount(0);
  await duration.fill("05:30");
  await page.getByPlaceholder(/Contoh: L/).fill("TKT-TIME-MANUAL");
  await page
    .locator('button[aria-haspopup="listbox"]:not(fieldset *)')
    .first()
    .click();
  await page
    .getByRole("option", { name: FIXTURE.indicators[0].name })
    .first()
    .click();
  await page.getByRole("button", { name: /Simpan Temuan/ }).click();
  await expect.poll(() => lastBatchItems()[0]?.durasi_detik).toBe(330);
  await page
    .getByRole("button", { name: /^Ubah temuan/ })
    .first()
    .click();
  await expect(duration).toHaveValue("05:30");
  await duration.fill("00:59");
  await page.getByRole("button", { name: /^Simpan$/ }).click();
  await expect.poll(() => captured("update").at(-1)?.durasi_detik).toBe(59);

  await chooseService(page, "Chat");
  await page.getByRole("button", { name: "Tambah temuan" }).first().click();
  await expect(chatTime).toBeVisible();
  await expect(duration).toHaveCount(0);
  await chatTime.fill("08:45");
  await page.getByPlaceholder(/Contoh: L/).fill("TKT-CHAT-TIME");
  await page
    .locator('button[aria-haspopup="listbox"]:not(fieldset *)')
    .first()
    .click();
  await page.getByRole("option", { name: "Respons Chat" }).click();
  await page.getByRole("button", { name: /Simpan Temuan/ }).click();
  await expect.poll(() => lastBatchItems()[0]?.jam_layanan).toBe("08:45");

  await chooseService(page, "Email");
  await page.getByRole("button", { name: "Tambah temuan" }).first().click();
  await expect(page.getByPlaceholder(/Contoh: L/)).toBeVisible();
  await expect(chatTime).toHaveCount(0);
  await expect(duration).toHaveCount(0);
  expectIsolation(audit);
});

test("downloaded workbook appends two optional text columns and round-trips with old templates", async ({
  page,
}) => {
  const audit = await openInput(page);
  await page.getByRole("button", { name: "Impor Excel", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Template" }).last().click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await downloaded).path())!);
  const sheet = workbook.getWorksheet("Input Temuan")!;
  expect(sheet.getCell("H1").value).toBe("Jam Layanan (HH:MM)");
  expect(sheet.getCell("I1").value).toBe("Durasi (mm:ss)");
  sheet.getCell("I2").value = "15:01";
  await page.getByRole("button", { name: "Upload & Preview" }).click();
  const upload = async (book: ExcelJS.Workbook) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: "temuan.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    });
    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
  };
  await upload(workbook);
  await expect.poll(() => lastBatchItems()[0]?.durasi_detik).toBe(901);
  await expect(page.getByText(/temuan berhasil diimport/)).toBeVisible();
  const legacy = new ExcelJS.Workbook();
  const old = legacy.addWorksheet("Input Temuan");
  old.addRow([
    "No. Tiket",
    "Parameter / Sub-parameter",
    "Nilai (0-3)",
    "Ketidaksesuaian",
    "Sebaiknya",
  ]);
  old.addRow([
    "TKT-LEGACY-TIME",
    FIXTURE.indicators[0].name,
    1,
    "Telat",
    "Perbaiki",
  ]);
  await page.getByRole("button", { name: "Impor Excel", exact: true }).click();
  await page.getByRole("button", { name: "Upload & Preview" }).click();
  await upload(legacy);
  await expect
    .poll(() => lastBatchItems()[0])
    .toMatchObject({
      no_tiket: "TKT-LEGACY-TIME",
      jam_layanan: null,
      durasi_detik: null,
    });
  expectIsolation(audit);
});

test("agent detail edit sends a Call duration, including zero", async ({
  page,
}) => {
  seedRow({ tanggal_layanan: null, tanggal_sampel: null });
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit);
  const tab = page.getByRole("tab", { name: "Temuan" });
  await tab.press("Enter");
  await page
    .locator("button", { hasText: /temuan · / })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Edit temuan/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Durasi panggilan/).fill("00:00");
  await dialog.getByRole("button", { name: /Simpan Perubahan/ }).click();
  await expect.poll(() => lastUpdate()?.durasi_detik).toBe(0);
  expect(audit.blockedApi).toEqual([]);
  expect(audit.blockedExternal).toEqual([]);
});
