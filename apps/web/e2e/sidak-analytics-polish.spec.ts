/**
 * Perapian analitik SIDAK — Ranking, Heatmap, Laporan Data.
 *
 * Hermetic (semua `/api` dimock, fail-closed). Membuktikan konsistensi
 * komponen: `ui/select` berlabel (bukan `<select>` native), kontrol >= 44px,
 * label >= 12px tanpa uppercase, warna skor Ranking mengikuti
 * `sidakScoreTone` (target 95), tanpa framer-motion di skeleton Ranking, dan
 * tanpa overflow horizontal di 390 dan 1440.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectHermetic } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  openHeatmapPage,
  openRankingPage,
  openReportsDataPage,
} from "./helpers/sidakAnalyticsPolishHarness";

const MIN_TARGET_PX = 44;
const MIN_LABEL_PX = 12;

const PAGES = [
  { name: "Ranking", open: openRankingPage, filters: "Filter ranking", comboboxes: 4 },
  { name: "Heatmap", open: openHeatmapPage, filters: "Filter heatmap", comboboxes: 2 },
  { name: "Laporan Data", open: openReportsDataPage, filters: "Filter temuan", comboboxes: 5 },
] as const;

async function heights(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
}

async function labelStyles(page: Page, region: string) {
  return page
    .getByRole("region", { name: region })
    .locator("label, legend")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return {
          text: (node.textContent ?? "").trim(),
          size: Number.parseFloat(style.fontSize),
          transform: style.textTransform,
          spacing: style.letterSpacing,
        };
      }),
    );
}

test.describe("Perapian analitik SIDAK (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  for (const target of PAGES) {
    test(`${target.name}: filter memakai combobox ui/select berlabel >= 44px, bukan select native`, async ({
      page,
    }) => {
      const audit = await target.open(page);
      const filters = page.getByRole("region", { name: target.filters });

      await expect(page.locator("select")).toHaveCount(0);
      const comboboxes = filters.getByRole("combobox");
      await expect(comboboxes).toHaveCount(target.comboboxes);
      for (const h of await heights(comboboxes)) {
        expect(h).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      // Setiap combobox punya nama aksesibel (label terhubung).
      const names = await comboboxes.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? ""),
      );
      for (const name of names) expect(name.length).toBeGreaterThan(0);
      expectHermetic(audit);
    });

    test(`${target.name}: label filter >= 12px dan tidak uppercase`, async ({
      page,
    }) => {
      const audit = await target.open(page);
      const styles = await labelStyles(page, target.filters);
      expect(styles.length).toBeGreaterThan(0);
      for (const s of styles) {
        expect(s.size, `"${s.text}" ${s.size}px`).toBeGreaterThanOrEqual(MIN_LABEL_PX);
        expect(s.transform, `"${s.text}" text-transform`).not.toBe("uppercase");
        expect(s.spacing, `"${s.text}" letter-spacing`).toBe("normal");
      }
      expectHermetic(audit);
    });

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      test(`${target.name}: tanpa overflow horizontal di ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const audit = await target.open(page);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        expectHermetic(audit);
      });
    }
  }

  test("Heatmap: toggle aria-pressed >= 44px dan Coba lagi memakai tombol >= 44px", async ({
    page,
  }) => {
    const audit = await openHeatmapPage(page);
    const toggles = page.locator("button[aria-pressed]");
    await expect(toggles).toHaveCount(4);
    for (const h of await heights(toggles)) {
      expect(h).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    // Tombol aktif memakai variant default (ui/button), bukan kelas mentah.
    await expect(
      page.getByRole("button", { name: "Agent — Tanggal layanan" }),
    ).toHaveAttribute("data-slot", "button");
    expectHermetic(audit);
  });

  test("Heatmap: error memakai panel status dengan role alert dan tombol Coba lagi >= 44px", async ({
    page,
  }) => {
    await openHeatmapPage(page, { fail: true });
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Gagal memuat heatmap");
    const retry = alert.getByRole("button", { name: "Coba lagi" });
    await expect(retry).toBeVisible();
    expect((await heights(retry))[0]).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await expect(retry).toHaveAttribute("data-slot", "button");
    // Tanpa kelas warna mentah pada kotak error.
    const raw = await alert.evaluate((node) =>
      /(?:^|\s)(?:bg|text|border)-red-/.test(
        [node, ...node.querySelectorAll("*")]
          .map((n) => n.getAttribute("class") ?? "")
          .join(" "),
      ),
    );
    expect(raw).toBe(false);
  });

  test("Ranking: skor 90 berstatus warn, 96 berstatus ok, 70 berstatus bad (target 95)", async ({
    page,
  }) => {
    const audit = await openRankingPage(page);
    const table = page.getByRole("region", { name: "Daftar ranking agen" });
    const cell = (text: string) =>
      table.getByRole("cell", { name: text, exact: true });
    await expect(cell("90.0%")).toHaveClass(/text-amber-700/);
    await expect(cell("90.0%")).not.toHaveClass(/text-emerald/);
    await expect(cell("96.0%")).toHaveClass(/text-emerald-700/);
    await expect(cell("70.0%")).toHaveClass(/text-rose-700/);
    expectHermetic(audit);
  });

  test("Ranking: perubahan posisi memakai token semantik dan teks tetap menyatakan arah", async ({
    page,
  }) => {
    const audit = await openRankingPage(page);
    const table = page.getByRole("region", { name: "Daftar ranking agen" });
    const label = (text: string) => table.getByText(text).last();
    await expect(label("Prioritas naik +1")).toHaveClass(/text-rose-700/);
    await expect(label("Prioritas turun 1")).toHaveClass(/text-emerald-700/);
    await expect(label("Tetap")).toHaveClass(/text-muted-foreground/);
    await expect(label("Baru")).toHaveClass(/text-muted-foreground/);
    expectHermetic(audit);
  });

  test("Ranking: tombol sort >= 44px dan th membawa aria-sort", async ({
    page,
  }) => {
    const audit = await openRankingPage(page);
    const table = page.getByRole("region", { name: "Daftar ranking agen" });
    const sortButtons = table.locator("thead button");
    await expect(sortButtons).toHaveCount(3);
    for (const h of await heights(sortButtons)) {
      expect(h).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    await expect(
      table.getByRole("columnheader", { name: /Total Temuan/ }),
    ).toHaveAttribute("aria-sort", "descending");
    await expect(
      table.getByRole("columnheader", { name: /^Agen/ }),
    ).toHaveAttribute("aria-sort", "none");
    expectHermetic(audit);
  });

  test("Ranking: skeleton memakai ui/skeleton tanpa style opacity inline (tanpa framer-motion)", async ({
    page,
  }) => {
    await openRankingPage(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Tahan respons ranking lalu muat ulang agar skeleton terlihat.
    await page.route("**/api/v1/sidak/ranking?*", async (route) => {
      await gate;
      await route.fallback();
    });
    await page.reload();
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('tbody [data-slot="skeleton"]').first()).toBeVisible();
    await expect(page.locator("tbody tr[style*='opacity']")).toHaveCount(0);
    release();
    await expect(
      page.getByRole("link", { name: "Agent Baru", exact: true }),
    ).toBeVisible();
  });
});
