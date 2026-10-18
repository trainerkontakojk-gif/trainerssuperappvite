import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";

/**
 * Monitoring tahap 5 — halaman Biaya AI dan rincian per orang (hermetic).
 * Plan `plans/markdown/monitoring-phase-5-biaya.md`; mockup bagian Biaya AI,
 * Biaya per orang, dan Tampilan HP.
 */

const RINA = "11111111-1111-4111-8111-111111111111";
const AYU = "22222222-2222-4222-8222-222222222222";

function model(
  model_id: string,
  module: string,
  action: string,
  action_category: "simulation" | "review" | "other",
  calls: number,
  input_tokens: number,
  output_tokens: number,
  cost_idr: number,
) {
  return {
    model_id,
    module,
    action,
    action_category,
    calls,
    input_tokens,
    output_tokens,
    total_tokens: input_tokens + output_tokens,
    cost_idr,
  };
}

const RINA_ROW = {
  user_id: RINA,
  user_name: "Rina Kartika",
  user_email: "rina@ojk.test",
  user_role: "agent",
  total_calls: 72,
  total_input_tokens: 249_600,
  total_output_tokens: 62_400,
  total_tokens: 312_000,
  total_cost_idr: 11_900,
  simulation_cost_idr: 9_800,
  review_cost_idr: 2_100,
  other_cost_idr: 0,
  models: [
    model(
      "gemini-3.8-flash",
      "ketik",
      "chat_response",
      "simulation",
      64,
      200_800,
      50_200,
      9_800,
    ),
    model(
      "gemini-3.8-flash",
      "ketik",
      "review",
      "review",
      8,
      48_800,
      12_200,
      2_100,
    ),
  ],
};
const AYU_ROW = {
  user_id: AYU,
  user_name: "Ayu Lestari",
  user_email: "ayu@ojk.test",
  user_role: "trainer",
  total_calls: 5,
  total_input_tokens: 10_000,
  total_output_tokens: 2_000,
  total_tokens: 12_000,
  total_cost_idr: 2_600,
  simulation_cost_idr: 0,
  review_cost_idr: 0,
  other_cost_idr: 2_600,
  models: [
    model(
      "gemini-3.8-flash",
      "qa-analyzer",
      "generate-trend-forecast",
      "other",
      5,
      10_000,
      2_000,
      2_600,
    ),
  ],
};

function mocks(rows: unknown[] = [RINA_ROW, AYU_ROW]): ApiMock[] {
  return [
    {
      method: "GET",
      path: /\/aggregation\?.*user_id=11111111/,
      body: { success: true, data: [RINA_ROW] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/aggregation",
      body: { success: true, data: rows },
    },
  ];
}

const wibMonth = (delta = 0) => {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1),
  );
  return {
    key: date.toISOString().slice(0, 7),
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    label: date.toLocaleString("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
};

async function openBiaya(
  page: Page,
  path = "/monitoring/biaya",
  rows?: unknown[],
  role?: "leader",
) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks: mocks(rows),
    ...(role ? { auth: { role } } : {}),
  });
  await waitForMockedApi(audit, ["/ai/monitoring/aggregation"]);
  return audit;
}

test.describe("Biaya AI (hermetic)", () => {
  test("ringkasan, tabel per pengguna dan per model dengan baris total", async ({
    page,
  }) => {
    const audit = await openBiaya(page);

    for (const name of ["Riwayat", "Biaya AI", "Harga & kurs"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("tab", { name: "Biaya AI" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("heading", { name: "Monitoring", exact: true }),
    ).toBeVisible();
    const cell = (label: string) =>
      page
        .getByLabel("Ringkasan biaya")
        .locator("div", { has: page.getByText(label, { exact: true }) });
    await expect(cell("Total biaya")).toContainText("Rp 14.500");
    await expect(cell("Simulasi")).toContainText("Rp 9.800");
    await expect(cell("Penilaian")).toContainText("Rp 2.100");
    await expect(cell("Lainnya")).toContainText("Rp 2.600");
    await expect(cell("Panggilan AI")).toContainText("77");
    await expect(cell("Token")).toContainText("324.000");

    const users = page.getByRole("table", { name: "Biaya per pengguna" });
    const body = users.locator("tbody tr");
    await expect(body).toHaveCount(2);
    // Termahal dulu.
    await expect(body.nth(0)).toContainText("Rina Kartika");
    await expect(body.nth(0)).toContainText("rina@ojk.test");
    await expect(body.nth(0)).toContainText("Agent");
    await expect(body.nth(1)).toContainText("Trainer");
    await expect(
      body.nth(1).getByRole("cell", { name: "2.600" }).first(),
    ).toBeVisible();
    const total = users.locator("tfoot tr");
    await expect(total).toContainText("Total");
    await expect(total).toContainText("14.500");
    await expect(total).toContainText("324.000");

    const models = page.getByRole("table", { name: "Biaya per model" });
    await expect(models.locator("tbody tr")).toHaveCount(3);
    await expect(models.locator("tbody tr").nth(0)).toContainText(
      "Gemini 3.8 Flash",
    );
    await expect(models.locator("tbody tr").nth(0)).toContainText(
      "gemini-3.8-flash",
    );
    await expect(models.locator("tbody tr").nth(0)).toContainText("Simulasi");
    await expect(models.getByText("Analisis QA")).toBeVisible();
    await expect(models.locator("tfoot tr")).toContainText("14.500");
    await expect(
      page.getByText(/Mengubah harga atau kurs tidak mengubah biaya/),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("bulan, modul, dan pencarian tersimpan di alamat", async ({ page }) => {
    const audit = await openBiaya(page);
    const now = wibMonth();
    const prev = wibMonth(-1);
    await expect(page.getByRole("combobox", { name: "Bulan" })).toContainText(
      now.label,
      { ignoreCase: true },
    );
    await expect(
      page.getByRole("button", { name: "Bulan berikutnya" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Bulan sebelumnya" }).click();
    await expect(page).toHaveURL(new RegExp(`bulan=${prev.key}`));
    await expect(page.getByRole("combobox", { name: "Bulan" })).toContainText(
      prev.label,
      { ignoreCase: true },
    );
    await expect
      .poll(() => audit.mockedApi.at(-1) ?? "")
      .toContain(`year=${prev.year}&month=${prev.month}`);

    const moduleSelect = page.getByRole("combobox", { name: "Modul" });
    await moduleSelect.click();
    await page.getByRole("option", { name: "PDKT" }).click();
    await expect(page).toHaveURL(/modul=pdkt/);
    await expect
      .poll(() => audit.mockedApi.at(-1) ?? "")
      .toContain("module=pdkt");

    await page.getByRole("searchbox", { name: "Cari pengguna" }).fill("ayu");
    await expect(page).toHaveURL(/q=ayu/);
    const rows = page
      .getByRole("table", { name: "Biaya per pengguna" })
      .locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Ayu Lestari");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Modul" })).toContainText(
      "PDKT",
      { timeout: 20000 },
    );
    await expect(
      page.getByRole("searchbox", { name: "Cari pengguna" }),
    ).toHaveValue("ayu");
    await expect(page.getByRole("combobox", { name: "Bulan" })).toContainText(
      prev.label,
      { ignoreCase: true },
    );
    expectHermetic(audit);
  });

  test("rincian satu orang punya halaman sendiri dengan tautan ke Riwayat", async ({
    page,
  }) => {
    const audit = await openBiaya(page);
    const prev = wibMonth(-1);
    await page.getByRole("button", { name: "Bulan sebelumnya" }).click();
    await expect(page).toHaveURL(new RegExp(`bulan=${prev.key}`));

    await page.getByRole("link", { name: "Rina Kartika" }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/monitoring/biaya/${RINA}\\?bulan=${prev.key}`),
    );
    await expect
      .poll(() => audit.mockedApi.at(-1) ?? "")
      .toContain(`user_id=${RINA}`);
    await expect(
      page.getByRole("heading", { name: "Rina Kartika", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(`rina@ojk.test · Agent · ${prev.label}`, { exact: false }),
    ).toBeVisible();

    const table = page.getByRole("table", { name: "Biaya per model" });
    await expect(
      table.getByRole("columnheader", { name: "Token masuk" }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Token keluar" }),
    ).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("tbody tr").nth(0)).toContainText("200.800");
    await expect(table.locator("tbody tr").nth(0)).toContainText("50.200");
    await expect(table.locator("tfoot tr")).toContainText("11.900");

    const riwayat = page.getByRole("link", {
      name: "Lihat sesinya di Riwayat",
    });
    const href = (await riwayat.getAttribute("href")) ?? "";
    expect(href).toContain("q=rina%40ojk.test");
    expect(href).toContain(`dari=${prev.key}-01`);

    await page.getByRole("link", { name: "Kembali ke Biaya AI" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/monitoring/biaya\\?bulan=${prev.key}`),
    );
    await expect(
      page.getByRole("table", { name: "Biaya per pengguna" }),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("bulan tanpa pemakaian menjelaskan kapan biaya muncul", async ({
    page,
  }) => {
    const audit = await openBiaya(page, "/monitoring/biaya", []);
    await expect(page.getByText(/Belum ada pemakaian AI di/)).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Biaya per model" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });

  test("leader tidak melihat tab Harga dan diberi tahu cakupan timnya", async ({
    page,
  }) => {
    const audit = await openBiaya(
      page,
      "/monitoring/biaya",
      undefined,
      "leader",
    );
    await expect(page.getByRole("tab", { name: "Biaya AI" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Harga & kurs" })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(
        "Menampilkan biaya akun di tim yang aksesnya sudah disetujui.",
      ),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("di HP biaya tampil sebagai daftar ringkas tanpa geser ke samping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await openBiaya(page);
    const list = page.getByRole("list", { name: "Biaya per pengguna" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem").first()).toContainText(
      "Rina Kartika",
    );
    await expect(list.getByRole("listitem").first()).toContainText("Rp 11.900");
    await expect(list.getByRole("listitem").first()).toContainText(
      "Agent · 72 panggilan",
    );
    await expect(list.getByRole("listitem").last()).toContainText("Rp 14.500");
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
    expectHermetic(audit);
  });
});
