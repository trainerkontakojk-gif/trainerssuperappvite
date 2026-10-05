/**
 * E2E tata letak detail agent (`/sidak/agents/:id`) — sidebar profil.
 *
 * Hermetic: semua `/api` di-mock lewat harness detail agent (fail-closed),
 * dengan fixture sintetis enam bulan (`sidakAgentDetailLayoutFixture`). Spec
 * ini mengunci hierarki halaman: sidebar profil sticky dengan foto besar di
 * kiri, tab → toolbar → isi di kanan, grafik skor dengan garis target, satu
 * pemilih agen, dan klik tiket membuka tab Temuan.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  openAgentDetail,
  type AgentAudit,
} from "./helpers/sidakAgentDetailDatesHarness";
import {
  LAYOUT_DIRECTORY_AGENTS,
  LAYOUT_FOLDER_AGENTS,
  LAYOUT_FOLDERS,
  richAgentDetailPayload,
  richQuickviewPayload,
} from "./helpers/sidakAgentDetailLayoutFixture";

const AGENT_NAME = "Rahmawati Kusumaningrum";

async function openRichDetail(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  const audit: AgentAudit = {
    mockedApi: [],
    blockedApi: [],
    blockedExternal: [],
  };
  await openAgentDetail(page, audit, {
    detailPayload: richAgentDetailPayload,
    quickviewPayload: richQuickviewPayload(),
    folders: LAYOUT_FOLDERS,
    folderAgents: LAYOUT_FOLDER_AGENTS,
    directoryAgents: LAYOUT_DIRECTORY_AGENTS,
  });
  // Timeout dinaikkan untuk cold-start Vite, bukan untuk melonggarkan asersi.
  await expect(page.getByRole("heading", { name: AGENT_NAME })).toBeVisible({
    timeout: 20000,
  });
  return audit;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "elemen harus ter-render").not.toBeNull();
  return b!;
}

function sidebar(page: Page) {
  return page.getByRole("complementary", { name: "Profil agen" });
}

test.describe("Tata letak detail agent", () => {
  test.slow();

  test("desktop: sidebar profil di kiri dengan foto besar, tab di kanan", async ({
    page,
  }) => {
    const audit = await openRichDetail(page, { width: 1440, height: 1000 });
    const aside = sidebar(page);

    const asideBox = await box(aside);
    const avatar = await box(aside.locator("[data-slot=avatar]"));
    expect(avatar.width).toBeGreaterThanOrEqual(150);
    expect(asideBox.width).toBeLessThanOrEqual(300);

    // Identitas, aksi, pemilih agen, skor terbaru, dan peringkat ada di sidebar.
    await expect(
      aside.getByRole("heading", { level: 1, name: AGENT_NAME }),
    ).toBeVisible();
    await expect(
      aside.getByRole("list", { name: "Info agen" }).getByRole("listitem"),
    ).toHaveCount(4);
    await expect(
      aside.getByRole("button", { name: "Input Audit" }),
    ).toBeVisible();
    await expect(
      aside.getByRole("button", { name: /Unduh Laporan/ }),
    ).toBeVisible();
    await expect(
      aside.getByRole("button", { name: "Muat ulang profil agen" }),
    ).toBeVisible();
    await expect(
      aside.getByRole("combobox", { name: "Ganti agen" }),
    ).toBeVisible();
    await expect(aside.getByLabel("Kembali ke daftar agen")).toBeVisible();
    await expect(
      aside.getByRole("region", { name: /Performa tahun 2026/ }),
    ).toBeVisible();

    // Kolom kanan: tab di atas toolbar; toolbar tanpa Folder/Agen select.
    const tablist = await box(
      page.getByRole("tablist", { name: "Bagian profil agen" }),
    );
    const year = await box(page.getByRole("combobox", { name: "Tahun audit" }));
    expect(tablist.x).toBeGreaterThan(asideBox.x + asideBox.width);
    expect(tablist.y + tablist.height).toBeLessThanOrEqual(year.y);
    await expect(
      page.getByRole("combobox", { name: "Folder agen" }),
    ).toHaveCount(0);

    // Di layar setinggi ini seluruh sidebar muat, jadi ia menempel saat konten
    // kanan di-scroll.
    await expect(aside).toHaveAttribute("data-sticky", "true");
    await page
      .getByRole("region", { name: "Akar masalah" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("tablist", { name: "Bagian profil agen" }),
    ).not.toBeInViewport();
    await expect(aside.getByRole("heading", { level: 1 })).toBeInViewport();

    expect(audit.blockedApi).toEqual([]);
    expect(audit.blockedExternal).toEqual([]);
  });

  test("sidebar tidak pernah butuh scroll sendiri; layar pendek ikut scroll halaman", async ({
    page,
  }) => {
    for (const height of [768, 1100]) {
      await openRichDetail(page, { width: 1440, height });
      const aside = sidebar(page);
      const metrics = await aside.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
      }));
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
      expect(metrics.overflowY).toBe("visible");
      await expect(aside).toHaveAttribute(
        "data-sticky",
        height === 768 ? "false" : "true",
      );
      // Isi paling bawah selalu bisa dicapai dengan scroll halaman biasa.
      const lastItem = aside.getByRole("button", {
        name: "Cara membaca peringkat",
      });
      await lastItem.scrollIntoViewIfNeeded();
      await expect(lastItem).toBeInViewport();
    }
  });

  test("status skor mengikuti target 95%", async ({ page }) => {
    await openRichDetail(page, { width: 1440, height: 1000 });

    // Skor terbaru Juni 84.1 < 85 → perlu perhatian, selisih dari Mei.
    const latest = sidebar(page).getByRole("region", { name: "Skor terbaru" });
    await expect(latest.getByText("Skor terbaru · Juni 2026")).toBeVisible();
    await expect(latest.getByText(/^84\.1\s*%$/)).toBeVisible();
    await expect(latest.getByText("Perlu perhatian")).toBeVisible();
    await expect(latest.getByText("Naik 4.3 poin dari Mei")).toBeVisible();

    const panel = page.getByRole("tabpanel", { name: "Ringkasan" });
    await panel.getByRole("button", { name: /^Pilih bulan Feb 2026/ }).click();
    await expect(
      panel
        .getByRole("region", { name: "Detail Februari 2026" })
        .getByText("Mendekati target"),
    ).toBeVisible();
    await panel.getByRole("button", { name: /^Pilih bulan Jan 2026/ }).click();
    await expect(
      panel
        .getByRole("region", { name: "Detail Januari 2026" })
        .getByText("Memenuhi target"),
    ).toBeVisible();
  });

  test("grafik skor: 12 slot bulan, garis target, bulan berdata bisa dipilih", async ({
    page,
  }) => {
    await openRichDetail(page, { width: 1440, height: 1000 });
    const panel = page.getByRole("tabpanel", { name: "Ringkasan" });

    await expect(
      panel.getByText("5 dari 6 bulan di bawah target QA 95%"),
    ).toBeVisible();
    await expect(panel.getByText("Target 95%")).toBeVisible();
    // Enam bulan berdata = enam tombol; Jul–Des bukan tombol.
    await expect(
      panel.getByRole("button", { name: /^Pilih bulan / }),
    ).toHaveCount(6);
    await expect(
      panel.getByRole("button", { name: /^Pilih bulan Jul/ }),
    ).toHaveCount(0);
    await expect(panel.getByText("Des", { exact: true })).toBeVisible();

    const june = panel.getByRole("button", { name: /^Pilih bulan Jun 2026/ });
    const jan = panel.getByRole("button", { name: /^Pilih bulan Jan 2026/ });
    const may = panel.getByRole("button", { name: /^Pilih bulan Mei 2026/ });
    await expect(june).toHaveAttribute("aria-pressed", "true");

    // Batang Jan (96.4) lebih tinggi dari Mei (79.8) dan melewati garis target.
    const bar = (button: Locator) => button.locator("[data-bar]");
    expect((await box(bar(jan))).height).toBeGreaterThan(
      (await box(bar(may))).height,
    );
    const targetLine = await box(panel.getByTestId("qa-target-line"));
    expect((await box(bar(jan))).y).toBeLessThan(targetLine.y);
    expect((await box(bar(may))).y).toBeGreaterThan(targetLine.y);

    await jan.focus();
    await jan.press("Enter");
    await expect(jan).toHaveAttribute("aria-pressed", "true");
    await expect(
      panel.getByRole("region", { name: "Detail Januari 2026" }),
    ).toBeVisible();
  });

  test("pemilih agen: cari lintas tim lalu pindah profil", async ({ page }) => {
    const audit = await openRichDetail(page, { width: 1440, height: 1000 });
    // Direktori baru dimuat saat pemilih dibuka.
    expect(audit.mockedApi).not.toContain("agent-directory");

    // Navigasi ke profil lain dibalas halaman kosong supaya tidak ada request
    // detail agent yang tidak di-mock.
    await page.route(
      (url) => url.pathname === "/sidak/agents/peer-2",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<p>ok</p>",
        }),
    );

    await sidebar(page).getByRole("combobox", { name: "Ganti agen" }).click();
    await expect
      .poll(() => audit.directoryQueries?.at(-1) ?? "")
      .toContain("show_all=true");

    const search = page.getByRole("combobox", { name: "Cari agen" });
    await search.fill("tabungan");
    await expect(
      page.getByRole("option", { name: /Sari Wulandari/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Dimas Prakoso/ }),
    ).toHaveCount(0);
    // Agen yang sedang dibuka tidak ditawarkan.
    await search.fill("rahma");
    await expect(page.getByText("Tidak ada agen yang cocok.")).toBeVisible();

    await search.fill("sari");
    await page.getByRole("option", { name: /Sari Wulandari/ }).click();
    await page.waitForURL("**/sidak/agents/peer-2");
  });

  test("klik tiket pengurang membuka tab Temuan pada grup tiket itu", async ({
    page,
  }) => {
    await openRichDetail(page, { width: 1440, height: 1000 });
    const tickets = page
      .getByRole("tabpanel", { name: "Ringkasan" })
      .getByRole("region", { name: "Tiket pengurang skor terbesar" });

    await tickets.getByRole("button", { name: /TKT-2026-06-142/ }).click();

    await expect(page.getByRole("tab", { name: "Temuan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const temuan = page.getByRole("tabpanel", { name: "Temuan" });
    const group = temuan.getByRole("region", { name: "Tiket TKT-2026-06-142" });
    await expect(group).toBeVisible();
    await expect(group).toBeFocused();
    await expect(
      group.getByText("Verifikasi Identitas", { exact: true }),
    ).toBeVisible();
    await expect(group).toBeInViewport();
  });

  test("mobile: sidebar jadi blok atas, toolbar dua kolom, tanpa scroll horizontal", async ({
    page,
  }) => {
    await openRichDetail(page, { width: 390, height: 900 });
    const aside = sidebar(page);

    const avatar = await box(aside.locator("[data-slot=avatar]"));
    const name = await box(aside.getByRole("heading", { level: 1 }));
    expect(avatar.width).toBeGreaterThanOrEqual(90);
    expect(name.x).toBeGreaterThan(avatar.x + avatar.width);

    const asideBox = await box(aside);
    const tablist = await box(
      page.getByRole("tablist", { name: "Bagian profil agen" }),
    );
    expect(tablist.y).toBeGreaterThan(asideBox.y + asideBox.height - 1);

    const year = await box(page.getByRole("combobox", { name: "Tahun audit" }));
    const service = await box(
      page.getByRole("combobox", { name: "Pilihan layanan audit" }),
    );
    expect(Math.abs(year.y - service.y)).toBeLessThanOrEqual(2);

    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return Array.from(main.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return false;
          // Strip yang memang scroll horizontal (tab) dikecualikan.
          if (el.closest("[data-scroll-x]")) return false;
          return r.right > window.innerWidth + 1;
        })
        .map((el) => el.tagName + "." + el.className.toString().slice(0, 60));
    });
    expect(overflow).toEqual([]);
  });
});
