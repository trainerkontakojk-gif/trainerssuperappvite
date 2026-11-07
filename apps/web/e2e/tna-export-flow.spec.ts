import { expect, test, type Page } from "@playwright/test";
import type { TnaPlanDetail } from "@trainers/types";
import { expectHermetic } from "./helpers/hermeticShell";
import {
  evaluationDetail,
  ids,
  openTna,
  planDetail,
} from "./helpers/tnaHarness";

// TNA phase 6 T2 (plans/markdown/tna-phase-6.md K40, D30): a printable HTML
// summary per plan, built in the browser from the plan detail already loaded.
// Hermetic: every API response is mocked.
const planPath = `/tna/rencana/${ids.plan}`;
const detailPath = `/api/v1/tna/plans/${ids.plan}`;
const ok = (data: unknown) => ({ success: true, data });

async function open(page: Page, detail: TnaPlanDetail) {
  return openTna(page, planPath, [
    { method: "GET", path: detailPath, body: ok(detail) },
  ]);
}

async function exportHtml(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor ringkasan" }).click();
  const file = await download;
  const html = await (
    await file.createReadStream()
  )
    .toArray()
    .then((parts) => Buffer.concat(parts).toString("utf8"));
  return { name: file.suggestedFilename(), html };
}

// No field may fall through as a JavaScript placeholder.
function expectNoPlaceholders(html: string) {
  const text = html.replace(/<style>[\s\S]*?<\/style>/, "");
  for (const word of ["undefined", "null", "NaN", "[object Object]"])
    expect(text, word).not.toContain(word);
}

test("aktif: ringkasan TNA, target, baseline beku, dan peserta; tanpa evaluasi", async ({
  page,
}) => {
  const detail = planDetail("aktif");
  detail.plan.title = "Latihan <b>verifikasi</b> & data";
  detail.practice_targets = [{ module: "ketik", min_sessions: 3 }];
  const audit = await open(page, detail);
  await expect(
    page.getByRole("heading", { name: "Latihan <b>verifikasi</b> & data" }),
  ).toBeVisible({ timeout: 20000 });

  const { name, html } = await exportHtml(page);
  expect(name).toMatch(
    /^TNA-Latihan-b-verifikasi-b-data-\d{4}-\d{2}-\d{2}\.html$/,
  );
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain(
    "<title>TNA Latihan &lt;b&gt;verifikasi&lt;/b&gt; &amp; data · Ringkasan</title>",
  );
  expect(html).not.toContain("<b>verifikasi</b>");
  for (const text of [
    "Status: Aktif",
    "Program: Ketelitian dan Verifikasi Data (dibekukan saat aktivasi)",
    "Parameter: Ketelitian verifikasi · layanan Call",
    "Kelompok kecil",
    "10 Oktober 2026 – 11 Oktober 2026",
    "<dt>Jatuh tempo evaluasi</dt><dd>11 November 2026</dd>",
    "2 per 100 sesi sampel",
    "10%",
    "KETIK 3 sesi",
    "Baseline beku",
    "4 per 100 sesi sampel",
    "20% (2 dari 10 diaudit)",
    "Ringkasan TNA",
    "Tingkat ketidaksesuaian 4 per 100 sesi sampel.",
    "Ana Contoh",
    "Tim A",
    "Perbandingan dan ringkasan ini indikatif, bukan bukti sebab-akibat.",
  ])
    expect(html, text).toContain(text);
  expect(html).toMatch(/Diekspor \d{1,2} \S+ \d{4} \d{2}\.\d{2} WIB/);
  expect(html).not.toContain("Ringkasan evaluasi");
  expectNoPlaceholders(html);
  expectHermetic(audit);
});

test("selesai: ringkasan evaluasi, verdict, kesimpulan, tindak lanjut, dan hasil per peserta", async ({
  page,
}, testInfo) => {
  await open(page, evaluationDetail("selesai"));
  await expect(
    page.getByRole("heading", { name: "Latihan verifikasi data" }),
  ).toBeVisible({ timeout: 20000 });

  const { html } = await exportHtml(page);
  for (const text of [
    "Status: Selesai",
    "Ringkasan evaluasi",
    "Evaluasi November 2026: narasi deterministik dari server.",
    "Verdict: Tercapai",
    "Kesimpulan: Hasil evaluasi sudah diperiksa trainer.",
    "Tindak lanjut: Perlu rencana lanjutan",
    "1 per 100 sesi sampel",
    "Efek bersih: -20 per 100 sesi sampel",
    "Ana Contoh",
    "Budi Contoh",
    "Tidak diaudit",
  ])
    expect(html, text).toContain(text);
  expectNoPlaceholders(html);

  // Render the exported file itself as printed evidence.
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.setContent(html);
  await expect(
    page.getByRole("heading", { name: "Ringkasan evaluasi" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tna-phase-6-ekspor-selesai.png"),
    fullPage: true,
  });
});

test("evaluasi berjalan: ringkasan evaluasi ditandai pratinjau tanpa verdict", async ({
  page,
}) => {
  await open(page, evaluationDetail("evaluasi"));
  await expect(
    page.getByRole("heading", { name: "Latihan verifikasi data" }),
  ).toBeVisible({ timeout: 20000 });
  const { html } = await exportHtml(page);
  expect(html).toContain("Status: Evaluasi");
  expect(html).toContain("Pratinjau: Evaluasi November 2026");
  expect(html).not.toContain("Verdict:");
  expect(html).not.toContain("Kesimpulan:");
  expectNoPlaceholders(html);
});

test("draf dan dibatalkan tidak punya tombol ekspor", async ({ page }) => {
  for (const status of ["draft", "dibatalkan"] as const) {
    await open(page, planDetail(status));
    await expect(page.getByText(/^Status: /)).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Ekspor ringkasan" }),
    ).toHaveCount(0);
  }
});

test("mobile 390: tombol ekspor tersentuh 44px tanpa scroll horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, evaluationDetail("selesai"));
  const button = page.getByRole("button", { name: "Ekspor ringkasan" });
  await expect(button).toBeVisible({ timeout: 20000 });
  expect(
    await button.evaluate((el) => (el as HTMLElement).offsetHeight),
  ).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
