import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Halaman Harga `/monitoring/harga` (Monitoring tahap 2). Semua `/api` dimock;
 * kontrak backend jadwal harga dibuktikan di
 * `monitoring-pricing-schedule-api.spec.ts`.
 */

const NULL_RATES = {
  input_text_price_usd_per_million: null,
  cached_input_text_price_usd_per_million: null,
  input_audio_price_usd_per_million: null,
  cached_input_audio_price_usd_per_million: null,
  output_text_price_usd_per_million: null,
  output_audio_price_usd_per_million: null,
};
const SCHEDULE_ID = "6f1c2f8e-6d55-4a8e-9a54-0c4c5d1e2f30";
const PRICING = [
  {
    model_id: "gemini-3.8-flash",
    model_name: "Gemini 3.8 Flash",
    provider: "gemini",
    pricing_mode: "simple",
    input_price_usd_per_million: 0.75,
    output_price_usd_per_million: 3.75,
    image_output_price_usd_per_million: null,
    effective_since: "2026-10-03T02:00:00.000Z",
    next_price: {
      id: SCHEDULE_ID,
      effective_from: "2026-12-31T17:00:00.000Z",
      input_price_usd_per_million: 1.5,
      output_price_usd_per_million: 7.5,
      ...NULL_RATES,
    },
    ...NULL_RATES,
  },
  {
    model_id: "gemini-3.1-flash-image",
    model_name: "Gemini 3.1 Flash Image",
    provider: "gemini",
    pricing_mode: "simple",
    input_price_usd_per_million: 0.5,
    output_price_usd_per_million: 3,
    image_output_price_usd_per_million: 60,
    effective_since: "2026-10-03T02:00:00.000Z",
    next_price: null,
    ...NULL_RATES,
  },
  {
    model_id: "gpt-5.4-mini",
    model_name: "GPT-5.4 mini",
    provider: "openai",
    pricing_mode: "simple",
    input_price_usd_per_million: 0.75,
    output_price_usd_per_million: 4.5,
    image_output_price_usd_per_million: null,
    effective_since: null,
    next_price: null,
    ...NULL_RATES,
  },
  {
    model_id: "gemini-3.0-flash-live",
    model_name: "Gemini 3.0 Flash Live",
    provider: "gemini",
    pricing_mode: "realtime",
    input_price_usd_per_million: 0,
    output_price_usd_per_million: 0,
    image_output_price_usd_per_million: null,
    effective_since: null,
    next_price: null,
    input_text_price_usd_per_million: 0.5,
    cached_input_text_price_usd_per_million: 0.05,
    input_audio_price_usd_per_million: 3,
    cached_input_audio_price_usd_per_million: 0.3,
    output_text_price_usd_per_million: 2,
    output_audio_price_usd_per_million: 12,
  },
  {
    model_id: "gpt-realtime-2.1",
    model_name: "GPT Realtime 2.1",
    provider: "openai",
    pricing_mode: "realtime",
    historical: true,
    editable: false,
    input_price_usd_per_million: 4,
    output_price_usd_per_million: 16,
    image_output_price_usd_per_million: null,
    effective_since: null,
    next_price: null,
    ...NULL_RATES,
  },
];

function hargaMocks(extra: readonly ApiMock[] = []): readonly ApiMock[] {
  return [
    ...extra,
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/pricing",
      body: { success: true, data: PRICING },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/billing",
      body: { success: true, data: { usd_to_idr_rate: 16250 } },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/history",
      body: {
        success: true,
        data: {
          rows: [],
          total: 0,
          page: 1,
          page_size: 25,
          counts: {
            ketik: 0,
            pdkt: 0,
            telefun: 0,
            completed: 0,
            processing: 0,
            failed: 0,
            not_started: 0,
          },
          scope: { kind: "none" },
        },
      },
    },
  ];
}

test.describe("Monitoring Harga (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("tabel harga per penyedia dengan harga berikutnya dan output gambar", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks(),
    });
    await waitForMockedApi(audit, [
      "/ai/monitoring/pricing",
      "/ai/monitoring/billing",
    ]);
    await expect(
      page.getByRole("tab", { name: "Harga & kurs" }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20000 });
    await expect(page.getByLabel("Kurs USD ke IDR")).toHaveValue("16250");

    const table = page.getByRole("table", { name: "Harga per model" });
    await expect(table.getByRole("row", { name: /^Gemini$/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /^OpenAI$/ })).toBeVisible();

    const flash = table.getByRole("row", { name: /Gemini 3\.8 Flash/ });
    await expect(flash).toContainText("0,75");
    await expect(flash).toContainText("Mulai 1 Jan 2027: 1,50 / 7,50");
    await expect(flash).toContainText("3 Okt 2026");
    await expect(
      flash.getByRole("button", { name: "Batalkan jadwal" }),
    ).toBeVisible();

    const image = table.getByRole("row", { name: /Gemini 3\.1 Flash Image/ });
    await expect(image).toContainText("60,00");

    // Model lama terlipat dan tidak bisa diubah.
    await expect(table.getByText("GPT Realtime 2.1")).toBeHidden();
    await page
      .getByRole("button", { name: /Model lama, hanya untuk riwayat \(1\)/ })
      .click();
    const legacy = table.getByRole("row", { name: /GPT Realtime 2\.1/ });
    await expect(legacy).toBeVisible();
    await expect(legacy.getByRole("button", { name: "Ubah" })).toHaveCount(0);
    expectHermetic(audit);
  });

  test("ubah harga bisa dijadwalkan mulai tanggal tertentu", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks([
        {
          method: "PUT",
          path: "/api/v1/ai/monitoring/pricing",
          body: { success: true, data: null },
        },
      ]),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/pricing"]);
    const row = page.getByRole("row", { name: /GPT-5\.4 mini/ });
    await row.getByRole("button", { name: "Ubah" }).click({ timeout: 20000 });

    const dialog = page.getByRole("dialog", {
      name: "Ubah harga GPT-5.4 mini",
    });
    await dialog.getByLabel("Input").fill("1.5");
    await dialog.getByLabel("Output").fill("9");
    await dialog.getByRole("radio", { name: "Mulai tanggal…" }).click();
    await dialog.getByLabel("Tanggal mulai (00.00 WIB)").fill("2027-02-01");

    const request = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/ai/monitoring/pricing"),
    );
    await dialog.getByRole("button", { name: "Jadwalkan" }).click();
    expect((await request).postDataJSON()).toMatchObject({
      model_id: "gpt-5.4-mini",
      input_price_usd_per_million: 1.5,
      output_price_usd_per_million: 9,
      effective_from: "2027-02-01",
    });
    await expect(dialog).toHaveCount(0);
    expectHermetic(audit);
  });

  test("model realtime diubah lewat enam harga terpisah", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks([
        {
          method: "PUT",
          path: "/api/v1/ai/monitoring/pricing",
          body: { success: true, data: null },
        },
      ]),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/pricing"]);
    const row = page.getByRole("row", { name: /Gemini 3\.0 Flash Live/ });
    await expect(row).toContainText("6 harga terpisah (teks, audio, cache)", {
      timeout: 20000,
    });
    await row.getByRole("button", { name: "Ubah" }).click();

    const dialog = page.getByRole("dialog", {
      name: "Ubah harga Gemini 3.0 Flash Live",
    });
    await expect(dialog.getByLabel("Input audio", { exact: true })).toHaveValue(
      "3",
    );
    await expect(dialog.getByLabel("Output audio")).toHaveValue("12");
    await expect(dialog.getByLabel("Input", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("Output audio").fill("14");

    const request = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/ai/monitoring/pricing"),
    );
    await dialog.getByRole("button", { name: "Simpan" }).click();
    const body = (await request).postDataJSON();
    expect(body).toMatchObject({
      model_id: "gemini-3.0-flash-live",
      input_text_price_usd_per_million: 0.5,
      cached_input_text_price_usd_per_million: 0.05,
      input_audio_price_usd_per_million: 3,
      cached_input_audio_price_usd_per_million: 0.3,
      output_text_price_usd_per_million: 2,
      output_audio_price_usd_per_million: 14,
    });
    expect(body).not.toHaveProperty("effective_from");
    expectHermetic(audit);
  });

  test("Batal membuang perubahan yang belum disimpan", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks(),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/pricing"]);
    const edit = page
      .getByRole("row", { name: /GPT-5\.4 mini/ })
      .getByRole("button", { name: "Ubah" });
    await edit.click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", {
      name: "Ubah harga GPT-5.4 mini",
    });
    await dialog.getByLabel("Input").fill("99");
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);

    await edit.click();
    await expect(dialog.getByLabel("Input")).toHaveValue("0.75");
    expectHermetic(audit);
  });

  test("jadwal yang belum berlaku bisa dibatalkan", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks([
        {
          method: "DELETE",
          path: `/api/v1/ai/monitoring/pricing/schedule/${SCHEDULE_ID}`,
          body: { success: true, data: null },
        },
      ]),
    });
    await waitForMockedApi(audit, ["/ai/monitoring/pricing"]);
    await page
      .getByRole("row", { name: /Gemini 3\.8 Flash/ })
      .getByRole("button", { name: "Batalkan jadwal" })
      .click({ timeout: 20000 });
    await page
      .getByRole("alertdialog", { name: "Batalkan jadwal harga?" })
      .getByRole("button", { name: "Ya, batalkan" })
      .click();
    await waitForMockedApi(audit, [`/pricing/schedule/${SCHEDULE_ID}`]);
    expectHermetic(audit);
  });

  test("leader dialihkan ke Riwayat", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring/harga",
      apiMocks: hargaMocks(),
      auth: { role: "leader" },
      waitForUrl: /\/monitoring$/,
    });
    await expect(page).toHaveURL(/\/monitoring$/, { timeout: 20000 });
    await expect(
      page.getByRole("tab", { name: "Riwayat", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expectHermetic(audit);
  });
});
