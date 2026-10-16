import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { pickSelect, selectTrigger } from "./helpers/pickSelect";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Halaman Agen SIDAK sesuai mockup "Halaman SIDAK" (hermetic): filter Status,
 * urutan skor/nama, ringkasan jumlah, dan satu baris filter di desktop.
 * Plan: plans/markdown/sidak-redesign.md.
 */

function agent(id: string, nama: string, avgScore: number | null) {
  return {
    id,
    nama,
    tim: "Tim Andi",
    batch: "batch alpha",
    batch_name: "batch alpha",
    foto_url: null,
    jabatan: null,
    avgScore,
    trend: "same",
    trendValue: null,
    atRisk: avgScore !== null && avgScore < 95,
    periodMonth: avgScore === null ? null : 9,
  };
}

const AGENTS = [
  agent("a-1", "Dewi Anggraini", 96.5),
  agent("a-2", "Bayu Saputra", 88),
  agent("a-3", "Citra Lestari", null),
  agent("a-4", "Andi Wijaya", 72.4),
  agent("a-5", "Eko Prasetyo", 99),
];

const MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/agents",
    body: {
      success: true,
      data: { agents: AGENTS, batches: ["batch alpha"] },
    },
  },
];

async function open(page: Page) {
  const audit = await openHermeticShell(page, {
    path: "/sidak/agents",
    apiMocks: MOCKS,
  });
  await waitForMockedApi(audit, ["/sidak/agents"]);
  await expect(page.getByText("Dewi Anggraini")).toBeVisible();
  return audit;
}

const cardNames = (page: Page) =>
  page
    .getByRole("region", { name: "Daftar agen" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) =>
        (link.getAttribute("aria-label") ?? "").replace(
          "Lihat detail audit ",
          "",
        ),
      ),
    );

test.describe("Daftar agen SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("urutan bawaan skor terendah dulu; bisa tertinggi dulu dan Nama A–Z", async ({
    page,
  }) => {
    const audit = await open(page);
    const sort = page.getByRole("group", { name: "Urutkan agen" });

    await expect(
      sort.getByRole("button", { name: "Skor terendah" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Belum diaudit selalu di akhir: tidak punya skor untuk dibandingkan.
    expect(await cardNames(page)).toEqual([
      "Andi Wijaya",
      "Bayu Saputra",
      "Dewi Anggraini",
      "Eko Prasetyo",
      "Citra Lestari",
    ]);

    await sort.getByRole("button", { name: "Skor tertinggi" }).click();
    expect(await cardNames(page)).toEqual([
      "Eko Prasetyo",
      "Dewi Anggraini",
      "Bayu Saputra",
      "Andi Wijaya",
      "Citra Lestari",
    ]);

    await sort.getByRole("button", { name: "Nama A–Z" }).click();
    expect(await cardNames(page)).toEqual([
      "Andi Wijaya",
      "Bayu Saputra",
      "Citra Lestari",
      "Dewi Anggraini",
      "Eko Prasetyo",
    ]);
    for (const button of await sort.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expectHermetic(audit);
  });

  test("filter Status menyaring per status skor, termasuk Belum diaudit", async ({
    page,
  }) => {
    const audit = await open(page);

    await pickSelect(page, "Status", "Perlu perhatian");
    expect(await cardNames(page)).toEqual(["Andi Wijaya"]);

    await pickSelect(page, "Status", "Mendekati target");
    expect(await cardNames(page)).toEqual(["Bayu Saputra"]);

    await pickSelect(page, "Status", "Memenuhi target");
    expect(await cardNames(page)).toEqual(["Dewi Anggraini", "Eko Prasetyo"]);

    await pickSelect(page, "Status", "Belum diaudit");
    expect(await cardNames(page)).toEqual(["Citra Lestari"]);

    await page.getByRole("button", { name: "Reset filter" }).first().click();
    await expect(selectTrigger(page, "Status")).toContainText("Semua status");
    expect(await cardNames(page)).toHaveLength(5);
    expectHermetic(audit);
  });

  test("ringkasan jumlah menyebut agen di bawah target", async ({ page }) => {
    const audit = await open(page);
    await expect(page.getByTestId("sidak-agents-count")).toHaveText(
      "5 agen · 2 di bawah target",
    );
    await pickSelect(page, "Status", "Memenuhi target");
    await expect(page.getByTestId("sidak-agents-count")).toHaveText(
      "2 dari 5 agen · 2 di bawah target",
    );
    expectHermetic(audit);
  });

  test("di desktop, Cari, Batch, Status, dan agen tambahan satu baris", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await open(page);
    const tops = await Promise.all(
      [
        page.getByRole("searchbox", { name: /Cari agen/ }),
        selectTrigger(page, "Batch"),
        selectTrigger(page, "Status"),
        page.getByRole("button", { name: /agen tambahan/ }),
      ].map(async (locator) => {
        const box = await locator.boundingBox();
        if (!box) throw new Error("kontrol filter tidak terlihat");
        return Math.round(box.y + box.height);
      }),
    );
    // Sejajar di bawah (label di atas tiap kontrol boleh berbeda tinggi).
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
    expectHermetic(audit);
  });

  test("tanpa overflow horizontal di 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const audit = await open(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expectHermetic(audit);
  });
});
