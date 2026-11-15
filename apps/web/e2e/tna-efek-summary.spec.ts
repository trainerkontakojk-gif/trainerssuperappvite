import { expect, test } from "@playwright/test";
import type { EfekProgramReport } from "@trainers/types";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { setDocumentTheme } from "./helpers/textContrast";
import { ids, openTna } from "./helpers/tnaHarness";
import {
  ok,
  sessionId,
  ketikSummary,
  programReport,
  efekMocks,
} from "./helpers/tnaEfekHarness";

// EFEK screens (plans/markdown/efek.md): TNA tab, report, session form, import.
test.beforeAll(() => assertLocalDevOnlyTarget());

test("ringkasan EFEK menampilkan efek per program dan rincian peserta KETIK", async ({
  page,
}) => {
  const audit = await openTna(page, "/tna/efek", efekMocks);
  await expect(
    page.getByText("Data SIDAK sampai September 2026"),
  ).toBeVisible();
  const ketik = page
    .getByRole("region", { name: "Program pelatihan" })
    .getByRole("article")
    .first();
  await expect(ketik).toContainText("+1,8");
  await expect(ketik).toContainText("+2,4");
  await expect(ketik).toContainText("Dibanding rata-rata layanan");
  await expect(ketik).toContainText("1 / 1 / 0");
  await expect(ketik).toContainText("2 dari 2");
  await expect(ketik).toContainText("1,5 → 0,6");
  await expect(
    page.getByText("4 peserta belum bisa dinilai", { exact: false }),
  ).toBeVisible();
  const table = page.getByRole("region", { name: "Sesi pelatihan" });
  await expect(table.getByRole("row").nth(1)).toContainText("Terukur");

  const widened = page.waitForRequest((r) =>
    r.url().includes("/tna/efek/report?window=6"),
  );
  await page.getByLabel("Jendela banding").selectOption("6");
  await widened;
  await expect(page).toHaveURL(/window=6/);

  await ketik.getByRole("link", { name: "Rincian KETIK" }).click();
  await expect(page).toHaveURL(/\/tna\/efek\/program\/ketik\?window=6/);
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("Skor QA rata-rata, dihitung dari bulan pelatihan").first(),
  ).toBeVisible();
  await expect(
    page.locator("figure span").filter({ hasText: /^Rata-rata layanan Chat$/ }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Dibanding rata-rata layanan", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke EFEK" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Dibanding layanan" }),
  ).toHaveAttribute(
    "title",
    "Perubahan skor peserta dikurangi perubahan rata-rata layanan pada periode yang sama.",
  );
  await expect(
    page.getByText(
      "Garis putus-putus = rata-rata semua agent Chat yang diaudit pada bulan yang sama, termasuk peserta.",
      { exact: false },
    ),
  ).toBeVisible();
  const people = page.getByRole("region", { name: "Peserta" });
  const rows = people.locator("tbody > tr");
  await expect(rows.first()).toContainText("Ana Contoh");
  await expect(rows.first()).toContainText("+4,0");
  await expect(rows.first()).toContainText("Naik");
  await expect(rows.nth(1)).toContainText("Data tipis");
  await expect(rows.nth(1)).toContainText("−0,5");
  await people.getByRole("button", { name: "Δ skor" }).click();
  await expect(rows.first()).toContainText("Budi Contoh");

  await people.getByRole("button", { name: /Ana Contoh/ }).click();
  const monthly = people.getByRole("table", {
    name: "Rincian bulanan Ana Contoh",
  });
  await expect(monthly).toBeVisible();
  await expect(
    monthly.getByRole("columnheader", {
      name: "Rata-rata layanan",
      exact: true,
    }),
  ).toBeVisible();
  await expect(monthly.getByRole("row").nth(1)).toContainText("Februari 2026");
  await expect(monthly.getByRole("row").nth(4)).toContainText(
    "Bulan pelatihan",
  );

  const scoped = page.waitForResponse((r) =>
    r.url().includes(`/tna/efek/report/ketik?window=6&session=${sessionId}`),
  );
  await page.getByLabel(/^Sesi/).selectOption(sessionId);
  await expect(page).toHaveURL(new RegExp(`session=${sessionId}`));
  await scoped;
  await waitForMockedApi(audit, [
    "GET /api/v1/tna/efek/report",
    "GET /api/v1/tna/efek/report/ketik",
  ]);
  expectHermetic(audit);
});

test("bukti visual EFEK di ponsel gelap dan desktop terang", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const audit = await openTna(page, "/tna/efek", efekMocks);
  await setDocumentTheme(page, "dark");
  const programs = page.getByRole("region", { name: "Program pelatihan" });
  await expect(programs.getByRole("article")).toHaveCount(4);
  await programs
    .getByRole("article")
    .first()
    .screenshot({
      path: testInfo.outputPath("efek-ringkasan-program-390-dark.png"),
    });

  await programs.getByRole("link", { name: "Rincian KETIK" }).click();
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  const captureDetail = async (width: 390 | 1280, scheme: "dark" | "light") => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ colorScheme: scheme });
    await setDocumentTheme(page, scheme);
    const suffix = `${width}-${scheme}`;
    const conclusion = page.getByRole("region", { name: "Ringkasan program" });
    const charts = page.getByRole("region", {
      name: "Grafik relatif bulan pelatihan",
    });
    const exclusions = page.getByRole("region", {
      name: "Pengecualian analisis",
    });
    const details = exclusions.locator("details");
    const summary = details.locator("summary");

    await expect(conclusion).toBeVisible();
    await expect(charts).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(details).not.toHaveJSProperty("open", true);
    await conclusion.screenshot({
      path: testInfo.outputPath(`efek-kartu-kesimpulan-${suffix}.png`),
    });
    await charts.screenshot({
      path: testInfo.outputPath(`efek-grafik-${suffix}.png`),
    });
    await summary.focus();
    expect(
      await summary.evaluate((el) => (el as HTMLElement).offsetHeight),
    ).toBeGreaterThanOrEqual(44);
    await summary.press("Enter");
    await expect(details).toHaveJSProperty("open", true);
    await exclusions.screenshot({
      path: testInfo.outputPath(`efek-sesuaikan-analisis-${suffix}.png`),
    });
  };

  await captureDetail(390, "dark");
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "EFEK" })
    .click();
  await expect(page).toHaveURL(/\/tna\/efek$/);
  await expect(programs).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await setDocumentTheme(page, "light");
  await programs.screenshot({
    path: testInfo.outputPath("efek-ringkasan-program-1280-light.png"),
  });
  await programs.getByRole("link", { name: "Rincian KETIK" }).click();
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await captureDetail(1280, "light");
  expectHermetic(audit);
});

test("rincian program di ponsel menampilkan peserta sebagai kartu tanpa geser samping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const audit = await openTna(page, "/tna/efek/program/ketik", efekMocks);
  await expect(
    page.getByRole("heading", { name: "KETIK · layanan Chat" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("region", { name: "Peserta" }).getByText("Ana Contoh"),
  ).toBeVisible();
  await expect(
    page.getByText("Sesuaikan analisis", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("details")).toHaveCount(1);
  await expect(page.locator("details")).not.toHaveJSProperty("open", true);
  expect(
    await page.evaluate(() => {
      const summary = document.querySelector(
        '[aria-label="Ringkasan program"]',
      );
      const adjustments = document.querySelector("details");
      return Boolean(
        summary &&
        adjustments &&
        summary.compareDocumentPosition(adjustments) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  await expect(page.getByRole("link", { name: "Kembali ke EFEK" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expectHermetic(audit);
});

for (const width of [390, 1280])
  test(`pengecualian agent transparan, dapat dipulihkan, dan ikut ekspor (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
    const reason = "Audit <perlu> ditinjau";
    const adjusted: EfekProgramReport = {
      ...programReport,
      program: {
        ...ketikSummary,
        participants: 1,
        evaluated: 1,
        stabil: 0,
        avg_delta: 4,
      },
      analysis: {
        all_participants: ketikSummary,
        exclusions: [{ peserta_id: ids.budi, nama: "Budi Contoh", reason }],
      },
      participants: programReport.participants.map((p) =>
        p.peserta_id === ids.budi ? { ...p, exclusion_reason: reason } : p,
      ),
    };
    const audit = await openTna(page, "/tna/efek/program/ketik", [
      {
        method: "GET",
        path: /\/api\/v1\/tna\/efek\/report\/ketik\?.*exclusions=/,
        body: ok(adjusted),
      },
      ...efekMocks,
    ]);
    const filter = page.getByRole("region", { name: "Pengecualian analisis" });
    await expect(filter).toBeVisible();
    const adjustments = page.getByText("Sesuaikan analisis", { exact: true });
    await expect(adjustments).toBeVisible();
    await expect(filter.getByLabel("Agent")).toBeHidden();
    await adjustments.click();
    await filter.getByLabel("Agent").selectOption(ids.budi);
    const apply = filter.getByRole("button", {
      name: "Kecualikan dari analisis",
    });
    await expect(apply).toBeDisabled();
    await filter.getByLabel("Alasan pengecualian").fill("   ");
    await expect(apply).toBeDisabled();
    await filter.getByLabel("Alasan pengecualian").fill(reason);
    await filter.getByLabel("Alasan pengecualian").press("Tab");
    await expect(apply).toBeFocused();
    await apply.press("Enter");
    await expect(page).toHaveURL(/exclusions=/);
    const comparison = page.getByRole("region", {
      name: "Perbandingan analisis",
    });
    await expect(comparison).toContainText("Semua peserta");
    await expect(comparison).toContainText("+1,8");
    await expect(comparison).toContainText("+4,0");
    await expect(filter).toContainText(reason);
    await expect(page.getByRole("region", { name: "Peserta" })).toContainText(
      "Dikecualikan",
    );
    await page.reload();
    await expect(filter).toContainText(reason);
    await expect(filter.getByLabel("Agent")).toBeVisible();
    await adjustments.click();
    await expect(filter.getByLabel("Agent")).toBeHidden();
    await expect(filter).toContainText(reason);
    await expect(comparison).toContainText("Semua peserta");
    await adjustments.click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh laporan" }).click();
    const html = await (
      await (await download).createReadStream()
    )
      .toArray()
      .then((parts) => Buffer.concat(parts).toString("utf8"));
    expect(html).toContain("Semua peserta");
    expect(html).toContain("Setelah pengecualian");
    expect(html).toContain("Audit &lt;perlu&gt; ditinjau");
    expect(html).not.toContain("Audit <perlu>");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const control of [
      filter.getByLabel("Agent"),
      filter.getByLabel("Alasan pengecualian"),
      apply,
    ]) {
      expect(
        await control.evaluate((el) => (el as HTMLElement).offsetHeight),
      ).toBeGreaterThanOrEqual(44);
    }
    await filter.screenshot({
      path: testInfo.outputPath(`exclusions-${width}.png`),
    });
    await page
      .getByRole("region", { name: "Grafik relatif bulan pelatihan" })
      .screenshot({
        path: testInfo.outputPath(`service-average-charts-${width}.png`),
      });
    await comparison.screenshot({
      path: testInfo.outputPath(`comparison-${width}.png`),
    });
    await filter
      .getByRole("button", { name: "Sertakan kembali Budi Contoh" })
      .click();
    await expect(page).not.toHaveURL(/exclusions=/);
    await expect(comparison).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Peserta" }),
    ).not.toContainText("Dikecualikan");
    await waitForMockedApi(audit, ["GET /api/v1/tna/efek/report/ketik"]);
    expectHermetic(audit);
  });

test("grafik skor memakai rentang minimal sepuluh poin dan temuan mulai dari nol", async ({
  page,
}) => {
  const narrowChart = programReport.chart.map((point, index) => ({
    ...point,
    score: 90 + (index - 3) * 0.2,
    comparison_score: 90,
    findings_per_session: 0.2 + index * 0.01,
    comparison_findings_per_session: 0.1,
  }));
  const audit = await openTna(page, "/tna/efek/program/ketik", [
    {
      method: "GET",
      path: "/api/v1/tna/efek/report/ketik",
      body: ok({ ...programReport, chart: narrowChart }),
    },
    ...efekMocks,
  ]);
  const scoreChart = page
    .locator("figure")
    .filter({ hasText: "Skor QA rata-rata, dihitung dari bulan pelatihan" });
  const findingsChart = page.locator("figure").filter({
    hasText: "Temuan per sesi audit, dihitung dari bulan pelatihan",
  });
  await expect(scoreChart).toBeVisible({ timeout: 20000 });
  await expect(findingsChart).toBeVisible();
  const parse = (value: string) => Number.parseFloat(value.replace(",", "."));
  const scoreTicks = (await scoreChart.locator("svg text").allTextContents())
    .slice(0, 3)
    .map(parse);
  const findingsTicks = (
    await findingsChart.locator("svg text").allTextContents()
  )
    .slice(0, 3)
    .map(parse);
  expect(scoreTicks[2]! - scoreTicks[0]!).toBeGreaterThanOrEqual(10);
  expect(findingsTicks[0]).toBe(0);
  await waitForMockedApi(audit, ["GET /api/v1/tna/efek/report/ketik"]);
  expectHermetic(audit);
});
