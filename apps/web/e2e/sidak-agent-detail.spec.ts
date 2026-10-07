/**
 * Detail agent SIDAK — navigasi tab pada halaman live.
 *
 * Semua `/api` yang dipakai halaman ini di-mock oleh
 * `helpers/sidakAgentReportFixture` di bawah guard fail-closed, jadi spec ini
 * tidak menyentuh database mana pun (bukan DB nyata, bukan DB lokal).
 *
 * Tab Simulasi dan Heatmap sengaja TIDAK di-mock oleh fixture. Karena itu test
 * keyboard di bawah hanya membuktikan TAB YANG TERPILIH, bukan isi panelnya:
 * request panel yang tidak di-mock memang di-abort oleh guard, dan itu perilaku
 * yang diinginkan.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  AGENT_ID,
  AGENT_NAME,
  CHAT_INDICATOR_NAME,
  EMPTY_AGENT_ID,
  EMPTY_AGENT_NAME,
  INDICATOR_NAME,
  REAL_TICKET,
  assertLocalDevOnlyTarget,
  drainAudits,
  formatAudit,
  openAgentDetail,
  startAudit,
} from "./helpers/sidakAgentReportFixture";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";

/**
 * Pindah ke tab tertentu dan kembalikan panel-nya.
 *
 * Panel di-scope eksplisit karena `SidakAgentDetailTabs` memakai `keepMounted`:
 * panel tab lain tetap ada di DOM dalam keadaan tersembunyi, sehingga locator
 * global bisa cocok dengan elemen yang tidak terlihat.
 */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await tab.focus();
  await tab.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");

  const panel = page.getByRole("tabpanel", { name });
  await expect(panel).toBeVisible();
  return panel;
}

/** Buka tab Temuan dan perluas grup bulan pertama supaya isinya ter-render. */
async function openTemuanTab(page: Page) {
  const panel = await openTab(page, "Temuan");
  const group = panel.locator("button", { hasText: /temuan · / }).first();
  await group.waitFor({ state: "visible" });
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  return panel;
}

test.describe("Detail agent SIDAK: tab", () => {
  // Halaman detail agent adalah SPA terberat di feature ini; run pertama setelah
  // Vite meng-optimasi ulang dependency bisa jauh lebih lambat dari run berikutnya.
  test.slow();

  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal
  // repo ini, bukan hasil build produksi dan bukan backend produksi.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    for (const audit of drainAudits()) {
      console.log(formatAudit(audit));
    }
  });

  test(`teks Ringkasan dan Temuan minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const main = page.locator("main").first();

    await expect(
      page.getByRole("tabpanel", { name: "Ringkasan" }),
    ).toBeVisible();
    const summary = await findTextBelowFloor(main);

    await openTemuanTab(page);
    const findings = await findTextBelowFloor(main);

    const offenders = [...new Set([...summary, ...findings])];
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  test("Ringkasan aktif lebih dulu dan panel hanya di-mount setelah dibuka", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const summaryTab = page.getByRole("tab", { name: "Ringkasan" });
    await expect(summaryTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tabpanel", { name: "Ringkasan" }),
    ).toBeVisible();

    // Panel tab lain belum ada di DOM sebelum pernah dibuka. Ini yang membedakan
    // "lazy mount" dari sekadar "disembunyikan".
    await expect(page.getByRole("tabpanel", { name: "Tren" })).toHaveCount(0);
    await expect(page.getByRole("tabpanel", { name: "Temuan" })).toHaveCount(0);

    // Tab diaktifkan lewat keyboard: `role="tab"` mendukung roving focus, dan
    // ini menghindari wait actionability yang tidak selesai karena container
    // sedang beranimasi (pola yang sama dipakai spec tanggal temuan).
    const trendTab = page.getByRole("tab", { name: "Tren" });
    await trendTab.focus();
    await trendTab.press("Enter");

    await expect(trendTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Tren" })).toBeVisible();
    // Panel lama tetap ter-mount (keepMounted) tapi tidak lagi terlihat — jadi
    // perpindahan tab tidak menghapus state panel sebelumnya.
    await expect(
      page.getByRole("tabpanel", { name: "Ringkasan" }),
    ).toBeHidden();
  });

  test("panah, Home, dan End memindahkan tab aktif", async ({ page }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const summaryTab = page.getByRole("tab", { name: "Ringkasan" });
    await summaryTab.focus();

    await summaryTab.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Tren" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await summaryTab.press("End");
    await expect(page.getByRole("tab", { name: "Simulasi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await summaryTab.press("Home");
    await expect(summaryTab).toHaveAttribute("aria-selected", "true");
  });

  test("agen tanpa data audit menampilkan empty state temuan, bukan tabel kosong", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(
      page,
      audit,
      { id: EMPTY_AGENT_ID, name: EMPTY_AGENT_NAME },
      { expectQuickviewRequest: false },
    );

    const temuanTab = page.getByRole("tab", { name: "Temuan" });
    await temuanTab.focus();
    await temuanTab.press("Enter");
    await expect(temuanTab).toHaveAttribute("aria-selected", "true");

    await expect(
      page.getByText("Belum ada temuan", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Belum ada temuan untuk layanan/),
    ).toBeVisible();
  });

  test("trainer melihat kontrol edit temuan", async ({ page }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const panel = await openTemuanTab(page);

    await expect(panel.getByText(REAL_TICKET).first()).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /^Edit temuan/ }).first(),
    ).toBeVisible();
  });

  test("leader read-only tidak melihat kontrol edit temuan", async ({
    page,
  }) => {
    const audit = startAudit();
    // `canEdit = role === "trainer" || role === "admin"`, jadi leader harus
    // kehilangan kontrol mutasi walau modul SIDAK-nya disetujui.
    await openAgentDetail(
      page,
      audit,
      { id: AGENT_ID, name: AGENT_NAME },
      { role: "leader" },
    );
    const panel = await openTemuanTab(page);

    // Bukti panel benar-benar berisi temuan, sehingga `toHaveCount(0)` di bawah
    // bermakna "kontrolnya disembunyikan", bukan "panel kosong".
    await expect(panel.getByText(REAL_TICKET).first()).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /^Edit temuan/ }),
    ).toHaveCount(0);
  });

  test("accordion temuan menutup kembali saat layanan audit berubah", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const panel = await openTemuanTab(page);
    const february = panel
      .getByRole("button")
      .filter({ hasText: "Februari 2026" })
      .first();

    await expect(february).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("combobox", { name: "Pilihan layanan audit" }).click();
    await page.getByRole("option", { name: "Chat", exact: true }).click();

    await expect(february).toContainText("2 temuan");
    await expect(february).toHaveAttribute("aria-expanded", "false");
  });

  test("tiap temuan menampilkan nilai 'dari 3' dan kategori parameternya", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const panel = await openTemuanTab(page);

    // Layanan default Call: satu temuan nilai 1 pada parameter kritis.
    const critical = panel
      .locator("article")
      .filter({ hasText: INDICATOR_NAME })
      .first();
    await expect(critical.locator("> div").first()).toHaveText(
      /^\s*1\s*dari 3\s*$/,
    );
    await expect(critical.getByText("Kritis", { exact: true })).toBeVisible();

    // Layanan Chat: dua temuan (nilai 2 dan 1) pada parameter non-kritis.
    await page.getByRole("combobox", { name: "Pilihan layanan audit" }).click();
    await page.getByRole("option", { name: "Chat", exact: true }).click();
    await panel
      .getByRole("button")
      .filter({ hasText: "Februari 2026" })
      .first()
      .click();

    const nonCritical = panel
      .locator("article")
      .filter({ hasText: CHAT_INDICATOR_NAME });
    await expect(nonCritical).toHaveCount(2);
    const scores = await nonCritical
      .locator("> div:first-child")
      .allTextContents();
    expect(scores.map((score) => score.replace(/\s+/g, "")).sort()).toEqual([
      "1dari3",
      "2dari3",
    ]);
    await expect(
      nonCritical.first().getByText("Non-kritis", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("Poin", { exact: true })).toHaveCount(0);
  });

  test("tabel benchmark menampilkan baris total dan parameter", async ({ page }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const panel = await openTab(page, "Tren");

    // Cakupan benchmark berasal dari `comparisonTable.scope` milik fixture.
    await expect(panel.getByText(/Tim Call/).first()).toBeVisible();
    await expect(panel.getByText("Parameter").first()).toBeVisible();
    await expect(panel.getByText("Rata-rata tim").first()).toBeVisible();
    await expect(panel.getByText("Total Temuan").first()).toBeVisible();
    await expect(panel.getByText(INDICATOR_NAME).first()).toBeVisible();
    // Delta dirender sebagai persentase bertanda dari `comparisonTable.rows`.
    await expect(panel.getByText(/-?\d+([.,]\d+)?%/).first()).toBeVisible();
  });

  test("agen tanpa data pembanding tidak merender tabel benchmark", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(
      page,
      audit,
      { id: EMPTY_AGENT_ID, name: EMPTY_AGENT_NAME },
      { expectQuickviewRequest: false },
    );
    const panel = await openTab(page, "Tren");

    // `comparisonTable` undefined pada fixture agen kosong; header benchmark
    // harus tidak ada, dan tab Tren tetap ter-render.
    await expect(panel.getByText("Rata-rata tim")).toHaveCount(0);
  });
});
