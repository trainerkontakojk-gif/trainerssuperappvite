import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Halaman Monitoring -> Model `/monitoring/model`.
 * Memverifikasi:
 * 1. Trainer melihat tab Model, daftar tugas sistem beserta model yang aktif.
 * 2. Mengubah model untuk tugas (contoh: Prediksi Dashboard SIDAK ke Gemini 3.5 Flash Lite).
 * 3. Memverifikasi badge kustom dan riwayat perubahan.
 * 4. Mengembalikan model ke bawaan sistem (revert).
 */

const INITIAL_MODELS = [
  {
    task: "ketik_review",
    label: "Review KETIK (Utama)",
    description: "Evaluasi coaching simulasi percakapan teks KETIK.",
    modelId: "gemini-3.8-flash",
    source: "code",
    codeDefault: "gemini-3.8-flash",
    eligible: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", hasPricing: true },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "gemini", hasPricing: true },
      { id: "gpt-5.4-mini", name: "GPT 5.4 Mini", provider: "openai", hasPricing: true },
    ],
    updatedBy: null,
    updatedAt: null,
  },
  {
    task: "sidak_forecast",
    label: "Prediksi Dashboard SIDAK",
    description: "Narasi ringkasan forecast dan insight performa SIDAK.",
    modelId: "gemini-3.8-flash",
    source: "code",
    codeDefault: "gemini-3.8-flash",
    eligible: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", hasPricing: true },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "gemini", hasPricing: true },
    ],
    updatedBy: null,
    updatedAt: null,
  },
];

const INITIAL_AUDIT = [
  {
    id: "a1",
    task: "ketik_review",
    oldModelId: null,
    newModelId: "gemini-3.8-flash",
    changedBy: null,
    changedByName: "Sistem",
    changedAt: "2026-11-01T08:00:00.000Z",
  },
];

test.beforeEach(async () => {
  await assertLocalDevOnlyTarget();
});

test("Trainer can view Model tab, change a model policy, and revert to default", async ({
  page,
}) => {
  const modelsState = JSON.parse(JSON.stringify(INITIAL_MODELS));
  const auditState = JSON.parse(JSON.stringify(INITIAL_AUDIT));

  const mocks: ApiMock[] = [
    {
      path: "/api/v1/ai/monitoring/models",
      method: "GET",
      body: { success: true, data: { items: modelsState } },
    },
    {
      path: "/api/v1/ai/monitoring/models/audit",
      method: "GET",
      body: { success: true, data: { items: auditState } },
    },
    {
      path: "/api/v1/ai/monitoring/models/sidak_forecast",
      method: "PUT",
      body: { success: true, data: null },
    },
    {
      path: "/api/v1/ai/monitoring/models/sidak_forecast",
      method: "DELETE",
      body: { success: true, data: null },
    },
  ];

  const audit = await openHermeticShell(page, {
    path: "/monitoring/model",
    apiMocks: mocks,
  });

  // Verify tab Model is active
  await expect(page.getByRole("tab", { name: "Model" })).toBeVisible();
  await expect(page.getByText("Model AI per Tugas")).toBeVisible();
  await expect(page.getByText("Prediksi Dashboard SIDAK")).toBeVisible();

  // Change model for sidak_forecast
  const sidakRow = page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" });
  await sidakRow.getByRole("button", { name: "Ubah" }).click();

  // Dialog should open
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Ubah Model: Prediksi Dashboard SIDAK")).toBeVisible();

  // Select Gemini 3.5 Flash Lite
  await page.locator("label", { hasText: "Gemini 3.5 Flash Lite" }).click();

  // Setup mock for updated state
  modelsState[1].modelId = "gemini-3.5-flash-lite";
  modelsState[1].source = "policy";
  modelsState[1].updatedAt = "2026-11-13T10:00:00.000Z";

  auditState.unshift({
    id: "a2",
    task: "sidak_forecast",
    oldModelId: "gemini-3.8-flash",
    newModelId: "gemini-3.5-flash-lite",
    changedBy: "trainer-1",
    changedByName: "Trainer Test",
    changedAt: "2026-11-13T10:00:00.000Z",
  });

  // Click Simpan
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();

  // Verify updated state in table
  await expect(page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" }).getByText("Kustom (Database)")).toBeVisible();
  await expect(page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" }).getByRole("button", { name: "Bawaan" })).toBeVisible();

  // Now revert back to default
  await page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" }).getByRole("button", { name: "Bawaan" }).click();

  // Confirm dialog
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Kembalikan ke Bawaan Sistem?")).toBeVisible();

  modelsState[1].modelId = "gemini-3.8-flash";
  modelsState[1].source = "code";
  modelsState[1].updatedAt = null;

  await page.getByRole("button", { name: "Kembalikan" }).click();

  // Verify back to default
  await expect(page.locator("tr", { hasText: "Prediksi Dashboard SIDAK" }).getByText("Bawaan Sistem")).toBeVisible();

  expectHermetic(audit);
});
