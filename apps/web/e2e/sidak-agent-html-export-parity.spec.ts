/**
 * SIDAK agent report — paritas halaman live vs dokumen HTML yang diunduh.
 *
 * Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 5.
 *
 * Spec ini sebelumnya memanggil `generateHTML()` langsung lalu `page.setContent`.
 * Keduanya BUKAN bukti jalur unduh: generator dipanggil tanpa menu, tanpa
 * `handleExport`, tanpa Blob, tanpa file. Bentuk lamanya juga tidak punya
 * guard fail-closed, sehingga `/api` yang tidak dimock bisa keluar lewat proxy
 * Vite, dan dokumen offline bisa menarik resource remote tanpa ada yang
 * menangkapnya.
 *
 * Kontrak yang dibuktikan di sini, dan HANYA di sini:
 *
 *   1. **Paritas lintas permukaan.** Fakta yang benar-benar terlihat pembaca di
 *      halaman live `/sidak/agents/:id` harus ada juga di file HTML yang
 *      diunduh dari fixture yang sama. Ini yang tidak bisa dibuktikan spec
 *      unduhan: spec itu membandingkan statis vs interaktif (dua-duanya file
 *      unduhan), tidak pernah live vs unduhan.
 *   2. **Halaman live tetap layak dibaca** di lebar 320/390/768/1024/1440
 *      tanpa meluber horizontal, dan tetap utuh di dark mode, reduced motion,
 *      serta zoom 200%. Bukti live-side ini hilang bersama refaktor ini kalau
 *      spec dibuang.
 *   3. **Dokumen unduhan layak direview mata.** Screenshot desktop + mobile
 *      untuk kedua varian, termasuk keadaan tersaring (tab Tren + filter seri
 *      + disclosure temuan terbuka), sebagai artefak di luar repo.
 *
 * Yang SENGAJA tidak diuji di sini: kesetaraan piksel dengan aplikasi, hex
 * warna, atau ukuran font. Kontrak paritas di atas adalah soal isi dan
 * keterbacaan, bukan piksel.
 *
 * Isolasi: seluruhnya di `helpers/sidakAgentReportFixture.ts` —
 * `assertLocalDevOnlyTarget()` (preflight fail-closed), `openAgentDetail()`
 * (mock auth + mock `/api` + guard fail-closed), `readReportOffline()` (guard
 * egress di level konteks sebelum `file://`), dan `resolveArtifactDir()` yang
 * menolak menulis artefak di dalam repo.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  AGENT_NAME,
  CLEAN_SESSION_TICKET,
  HOSTILE_FINDING_TEXT,
  INDICATOR_NAME,
  REAL_TICKET,
  REMOTE_RESOURCE_PATTERNS,
  YEAR,
  assertLocalDevOnlyTarget,
  captureViewportShot,
  drainAudits,
  expectNoApplicationTraffic,
  expectNoHorizontalOverflow,
  expectNoOfflineEgress,
  exportFromMenu,
  formatAudit,
  missingFacts,
  openAgentDetail,
  readReportOffline,
  reportArtifactDir,
  startAudit,
} from "./helpers/sidakAgentReportFixture";

/** Lebar yang diuji untuk overflow. 320 adalah lebar paling sempit yang dipakai. */
const LIVE_WIDTHS = [320, 390, 768, 1024, 1440] as const;

/**
 * Fakta yang harus terbaca di halaman live. Dipilih dari `REPORT_FACTS` yang
 * sudah dipakai spec unduhan, supaya daftar yang dibandingkan benar-benar sama
 * dan test ini tidak bisa lulus karena dua daftar berbeda.
 */
const LIVE_FACTS: readonly string[] = [
  AGENT_NAME,
  "Tim Call",
  "Batch 7",
  REAL_TICKET,
  INDICATOR_NAME,
];

/** Label periode yang memuat temuan pada fixture: findings live ada di bulan 2. */
const LIVE_FINDING_PERIOD = /Februari 2026/;

/** Teks halaman yang SEDANG terlihat saja — `innerText` tidak masuk node hidden. */
async function visibleLiveText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

/**
 * Buka tab Temuan lalu perluas periode temuan, supaya kalimat temuan benar-benar
 * terlihat mata. Tanpa ini, temuan hanya ada di panel tersembunyi dan
 * `innerText` tidak akan pernah mengembalikannya.
 */
async function revealLiveFinding(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Temuan" }).click();
  await expect(page.getByRole("tabpanel", { name: "Temuan" })).toBeVisible();
  await page.getByRole("button", { name: LIVE_FINDING_PERIOD }).first().click();
}

/** Scroll container halaman live yang bisa meluber sendiri. */
async function resetLiveScroll(page: Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0 });
    for (const node of Array.from(
      document.querySelectorAll("main > section"),
    )) {
      if (node instanceof HTMLElement) {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      }
    }
  });
}

test.describe("SIDAK agent report: paritas live vs unduhan", () => {
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

  test("Fakta yang terlihat di halaman live ikut ada di HTML Statis dan HTML Interaktif yang diunduh", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();

    // (1) Permukaan live, dari fixture lokal.
    await openAgentDetail(page, audit);
    await resetLiveScroll(page);

    const liveText = await visibleLiveText(page);
    const missingOnLive = LIVE_FACTS.filter((fact) => !liveText.includes(fact));
    expect(
      missingOnLive,
      `halaman live tidak menampilkan fakta ini, jadi tidak ada yang bisa dibandingkan: ${missingOnLive.join(
        " | ",
      )}`,
    ).toEqual([]);

    // Temuan hanya ada di tab Temuan, jadi kalimatnya harus dibaca dari sana.
    await revealLiveFinding(page);
    const liveFindingText = await visibleLiveText(page);
    expect(
      liveFindingText,
      "kalimat temuan tidak terlihat di halaman live, jadi paritas teksnya tidak bisa dibandingkan",
    ).toContain(HOSTILE_FINDING_TEXT);

    // (2) Dua file yang benar-benar diunduh lewat menu, bukan generator.
    const staticFile = await exportFromMenu(page, "HTML Statis", "parity");
    const interactiveFile = await exportFromMenu(
      page,
      "HTML Interaktif",
      "parity",
    );

    expect(staticFile.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.statis.html`,
    );
    expect(interactiveFile.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.interaktif.html`,
    );

    // (3) Paritas isi: fakta live + fakta kontrak unduhan, di kedua dokumen.
    //     Dibaca dari DOM dokumen yang DIBUKA, bukan dari string file, supaya
    //     ini mengukur apa yang benar-benar sampai ke pembaca.
    for (const [label, file] of [
      ["HTML Statis", staticFile],
      ["HTML Interaktif", interactiveFile],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const offline = await readReportOffline(context, file);
        const documentText = offline.state.text.replace(/\s+/g, " ");

        const missingLive = LIVE_FACTS.filter(
          (fact) => !documentText.includes(fact),
        );
        expect(
          missingLive,
          `${label} tidak memuat fakta yang terlihat di halaman live: ${missingLive.join(
            " | ",
          )}`,
        ).toEqual([]);
        expect(
          missingFacts(offline.state.text),
          `${label} kehilangan fakta kontrak laporan`,
        ).toEqual([]);
        // Teks BERBAHAYA: kalimat yang sama yang terbaca di halaman live ikut
        // terbaca di dokumen, TAPI markup-nya ter-escape di file — jadi paritas
        // di atas bukan kebetulan substring dan bukan tanda eksekusi skrip lolos.
        expect(
          documentText,
          `${label} kehilangan kalimat temuan yang terlihat di halaman live`,
        ).toContain(HOSTILE_FINDING_TEXT);
        expect(
          file.text,
          `${label} harus ter-escape, bukan dieksekusi`,
        ).not.toContain("<script>alert");
        expect(file.text).toContain("&lt;script&gt;");

        expectNoOfflineEgress(offline, label);
        expect(
          offline.consoleErrors,
          `${label} error konsol saat dibuka offline: ${offline.consoleErrors.join(" | ")}`,
        ).toEqual([]);
      } finally {
        await context.close();
      }
    }

    // (4) Sesi tanpa temuan dan resource remote.
    for (const [label, file] of [
      ["HTML Statis", staticFile],
      ["HTML Interaktif", interactiveFile],
    ] as const) {
      expect(file.text, `${label} memuat tiket sesi bersih`).not.toContain(
        CLEAN_SESSION_TICKET,
      );
      for (const pattern of REMOTE_RESOURCE_PATTERNS) {
        expect(
          pattern.test(file.text),
          `${label} menarik resource remote (${pattern})`,
        ).toBe(false);
      }
    }

    expectNoApplicationTraffic(audit);
  });

  test("Halaman live dan dokumen unduhan bisa direview mata di desktop, mobile, dan keadaan tersaring", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const dir = reportArtifactDir("parity");

    // (1) Live: lebar sempit hingga lebar penuh, tanpa meluber horizontal.
    for (const width of LIVE_WIDTHS) {
      await resetLiveScroll(page);
      await page.setViewportSize({ width, height: 1400 });
      await expectNoHorizontalOverflow(page, `live ${width}`);
      const shot = await captureViewportShot(page, dir, `live-${width}.png`, {
        width,
        height: 1400,
      });
      expect(shot.startsWith("/")).toBe(true);
    }

    // (2) Live: dark mode, reduced motion, dan zoom 200% tetap utuh.
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await captureViewportShot(page, dir, "live-dark-1440.png", {
      width: 1440,
      height: 1400,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await captureViewportShot(page, dir, "live-reduced-motion-1440.png", {
      width: 1440,
      height: 1400,
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await captureViewportShot(page, dir, "live-zoom-200-1440.png", {
      width: 1440,
      height: 1400,
    });
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });

    // (3) Unduhan: kedua varian, desktop + mobile, dari file sungguhan.
    const staticFile = await exportFromMenu(
      page,
      "HTML Statis",
      "parity-visual",
    );
    const interactiveFile = await exportFromMenu(
      page,
      "HTML Interaktif",
      "parity-visual",
    );

    for (const [label, file] of [
      ["statis", staticFile],
      ["interaktif", interactiveFile],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const offline = await readReportOffline(context, file);
        const document = offline.page;
        // Screenshot hanya berguna kalau dokumennya lengkap: fakta kontrak
        // laporan diukur dari DOM yang benar-benar dibuka, bukan dari string
        // file (markup ter-escape tidak akan cocok di sana).
        expect(
          missingFacts(offline.state.text),
          `${label} kehilangan fakta kontrak laporan, jadi screenshot-nya tidak mereview apa yang pembaca baca`,
        ).toEqual([]);
        await expectNoHorizontalOverflow(document, `${label} 1440`);
        await captureViewportShot(document, dir, `${label}-1440.png`, {
          width: 1440,
          height: 1000,
        });
        await expectNoHorizontalOverflow(document, `${label} 390`);
        await captureViewportShot(document, dir, `${label}-390.png`, {
          width: 390,
          height: 844,
        });
        expectNoOfflineEgress(offline, label);
      } finally {
        await context.close();
      }
    }

    // (4) Keadaan tersaring pada varian interaktif — satu-satunya kondisi yang
    //     tidak ada di screenshot default, dan satu-satunya yang butuh
    //     interaksi nyata untuk dicapai.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const offline = await readReportOffline(context, interactiveFile);
      const document = offline.page;
      await document.getByRole("tab", { name: "Tren" }).click();
      await document.getByRole("button", { name: INDICATOR_NAME }).click();
      await expect(
        document
          .locator('[data-chart-series][data-series-key="series-1"]')
          .first(),
      ).toBeVisible();
      await document.getByRole("tab", { name: "Temuan" }).click();
      const disclosure = document.locator("details.findings-period").first();
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
      await captureViewportShot(
        document,
        dir,
        "interaktif-1440-tersaring.png",
        {
          width: 1440,
          height: 1000,
        },
      );
      await captureViewportShot(document, dir, "interaktif-390-tersaring.png", {
        width: 390,
        height: 844,
      });
      expectNoOfflineEgress(offline, "interaktif tersaring");
      expect(offline.consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });
});
