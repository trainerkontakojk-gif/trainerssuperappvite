import { expect, test, type Locator } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { pickSelect, selectTrigger } from "./helpers/pickSelect";
import {
  OVERNIGHT_AGENT,
  assertLocalDevOnlyTarget,
  expectIsolation,
  openJadwalShifting,
} from "./helpers/sidakJadwalShiftingHarness";

/**
 * Sisa perapian SIDAK (hermetic): filter batch Daftar agen, label beranda
 * SIDAK, dan penanda shift lintas tengah malam di Jadwal Shifting.
 * Plan: plans/markdown/sidak-minor-polish.md.
 */

const ACCESS_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/me/access-status",
  body: { success: true, data: {} },
};

function agent(
  id: string,
  nama: string,
  batch: string,
  avgScore = 96,
  atRisk = false,
) {
  return {
    id,
    nama,
    tim: "Call",
    batch,
    batch_name: batch,
    foto_url: null,
    jabatan: null,
    avgScore,
    trend: "same",
    trendValue: null,
    atRisk,
    periodMonth: null,
  };
}

const AGENTS_MOCKS: readonly ApiMock[] = [
  ACCESS_MOCK,
  {
    method: "GET",
    path: "/api/v1/sidak/agents",
    body: {
      success: true,
      data: {
        agents: [
          agent("a-1", "Alya Pranoto", "batch alpha"),
          agent("a-2", "Bima Saputra", "batch beta"),
        ],
        batches: ["batch alpha", "batch beta"],
      },
    },
  },
];

async function fontSize(locator: Locator): Promise<number> {
  return locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

test.describe("Sisa perapian SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("Daftar agen: filter batch memakai ui/select 44px dan tetap menyaring", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/agents",
      apiMocks: AGENTS_MOCKS,
    });
    await waitForMockedApi(audit, ["/sidak/agents"]);
    await expect(page.getByText("Alya Pranoto")).toBeVisible();

    await expect(page.locator("select")).toHaveCount(0);
    const trigger = selectTrigger(page, "Batch");
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(
      await fontSize(page.locator('label[for="sidak-batch-filter"]')),
    ).toBeGreaterThanOrEqual(12);

    await pickSelect(page, "Batch", "Batch Beta");
    await expect(page.getByText("Bima Saputra")).toBeVisible();
    await expect(page.getByText("Alya Pranoto")).toHaveCount(0);

    await pickSelect(page, "Batch", "Semua batch");
    await expect(page.getByText("Alya Pranoto")).toBeVisible();
    expectHermetic(audit);
  });

  test("Daftar agen: warna skor mengikuti target QA 95 seperti detail agent", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak/agents",
      apiMocks: [
        ACCESS_MOCK,
        {
          method: "GET",
          path: "/api/v1/sidak/agents",
          body: {
            success: true,
            data: {
              agents: [
                agent("a-1", "Alya Pranoto", "batch alpha", 96),
                agent("a-2", "Bima Saputra", "batch alpha", 88, true),
                agent("a-3", "Citra Lestari", "batch alpha", 72, true),
              ],
              batches: ["batch alpha"],
            },
          },
        },
      ],
    });
    await waitForMockedApi(audit, ["/sidak/agents"]);

    // Same tones as utils/sidakScoreStatus.ts: >=95 met, >=85 near, else attention.
    await expect(page.getByText("96.0%", { exact: true })).toHaveClass(
      /text-emerald-700/,
    );
    await expect(page.getByText("88.0%", { exact: true })).toHaveClass(
      /text-amber-700/,
    );
    await expect(page.getByText("72.0%", { exact: true })).toHaveClass(
      /text-rose-700/,
    );
    expectHermetic(audit);
  });

  test("Beranda SIDAK: label modul tanpa huruf kapital dan teks kartu >= 12px", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/sidak",
      apiMocks: [ACCESS_MOCK],
    });
    const badge = page.getByText("Modul Utama", { exact: true });
    await expect(badge).toBeVisible({ timeout: 20000 });
    expect(
      await badge.evaluate((el) => getComputedStyle(el).textTransform),
    ).not.toBe("uppercase");
    expect(await fontSize(badge)).toBeGreaterThanOrEqual(12);

    const cta = page.getByText("Buka Modul").first();
    expect(await fontSize(cta)).toBeGreaterThanOrEqual(12);
    const desc = page.getByText(/Proyeksi tren temuan dan sinyal agent/i);
    expect(await fontSize(desc)).toBeGreaterThanOrEqual(12);

    // Kartu modul tidak lagi dibungkus elemen framer-motion (transform inline).
    const forecastLink = page.getByRole("link", { name: /forecast/i }).first();
    await forecastLink.hover();
    const inlineTransforms = await forecastLink.evaluate(
      (el) =>
        [el, ...Array.from(el.querySelectorAll("*"))].filter(
          (node) => (node as HTMLElement).style.transform,
        ).length,
    );
    expect(inlineTransforms).toBe(0);
    expectHermetic(audit);
  });

  test("Jadwal Shifting: penanda +1 >= 12px tanpa warna mentah", async ({
    page,
  }) => {
    const audit = await openJadwalShifting(page, { role: "trainer" });
    const marker = page
      .getByTestId("jadwal-shifting-row")
      .filter({ hasText: OVERNIGHT_AGENT.nama })
      .locator('[title="Shift melintasi tengah malam"]');
    await expect(marker).toBeVisible();
    expect(await fontSize(marker)).toBeGreaterThanOrEqual(12);
    expect(await marker.getAttribute("class")).not.toMatch(/amber-\d/);
    expectIsolation(audit);
  });
});
