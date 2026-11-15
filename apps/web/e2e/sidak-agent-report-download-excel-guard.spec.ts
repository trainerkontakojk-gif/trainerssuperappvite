import { expect, test, type Download } from "@playwright/test";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  AGENT_NAME,
  APP_ORIGIN,
  DEGENERATE_SERIES_LABEL,
  EMPTY_AGENT_ID,
  EMPTY_AGENT_NAME,
  TIE_AGENT_ID,
  TIE_AGENT_NAME,
  GAP_TREND_AGENT_ID,
  HOSTILE_SERIES_LABEL,
  GAP_TREND_AGENT_NAME,
  SINGLE_POINT_TREND_AGENT_ID,
  SINGLE_POINT_TREND_AGENT_NAME,
  CHAT_TICKET_A,
  CHAT_TICKET_B,
  CLEAN_SESSION_TICKET,
  EXPORT_ERROR_TITLE,
  HOSTILE_FINDING_TEXT,
  REAL_TICKET,
  SECOND_AGENT_ID,
  UNSAFE_NAME,
  UNSAFE_NAME_FILE_PART,
  YEAR,
  assertLocalDevOnlyTarget,
  drainAudits,
  expectNoApplicationTraffic,
  exportFromMenu,
  formatAudit,
  installOfflineEgressGuard,
  openAgentDetail,
  reportArtifactDir,
  startAudit,
} from "./helpers/sidakAgentReportFixture";
import {
  workbookRows,
  summaryFacts,
  TREND_PARAMETER_TABLE_CAPTION,
} from "./helpers/sidakAgentReportDownloadHarness";

test.describe("SIDAK agent report download nyata", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    for (const audit of drainAudits()) {
      console.log(formatAudit(audit));
    }
  });

  test("Guard offline menutup egress pada konteks file:// sebelum navigasi", async ({
    browser,
  }) => {
    const audit = startAudit();

    // Listener standing-in di loopback: kalau guard bocor, bytes sampai ke sini
    // dan `hits` terisi. Sasarannya loopback, jadi test ini sendiri tidak
    // melakukan egress ke host mana pun.
    const hits: string[] = [];
    const listener = createServer((incoming, response) => {
      hits.push(`${incoming.method} ${incoming.url}`);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("bocor");
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    const foreignOrigin =
      address && typeof address === "object"
        ? `http://127.0.0.1:${address.port}`
        : null;
    expect(foreignOrigin, "listener loopback tidak siap").not.toBeNull();

    // Dokumen yang benar-benar menarik resource jaringan, ditulis di artefak
    // luar repo supaya tidak ada file sementara di dalam repo. Dua sub-sumber
    // berbeda (gambar + skrip) supaya keduanya terisi, bukan cuma yang pertama.
    const documentPath = path.join(
      reportArtifactDir("offline-guard"),
      "luring.html",
    );
    writeFileSync(
      documentPath,
      [
        "<!DOCTYPE html>",
        '<html lang="id"><head><title>luring</title></head><body>',
        `<img src="${foreignOrigin}/pixel.png" alt="">`,
        `<script src="${foreignOrigin}/skrip.js"></script>`,
        "</body></html>",
      ].join("\n"),
    );

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      // Guard dipasang lewat jalur produksi yang sama seperti
      // `readReportOffline`, dan dipasang SEBELUM `page.goto`.
      const blocked: string[] = [];
      await installOfflineEgressGuard(context, blocked);
      const page = await context.newPage();
      await page.goto(`file://${documentPath}`, { waitUntil: "load" });

      // (1) Guard mengklaim kedua request. Urutan intercept tidak dijamin, jadi
      //     yang dibandingkan adalah himpunannya, bukan urutannya.
      expect(
        [...blocked].sort(),
        `guard offline tidak mengklaim semua request: ${blocked.join(" | ")}`,
      ).toEqual(
        [
          `GET ${foreignOrigin}/pixel.png`,
          `GET ${foreignOrigin}/skrip.js`,
        ].sort(),
      );
      // (2) Bukti terkuat: tidak ada satu byte pun yang sampai ke soket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual(
        [],
      );
    } finally {
      await context.close();
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — cakupan per seksi, pengecualian sesi bersih, nama file, error.

  // Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 2.
  // Semua lewat menu nyata + file yang diunduh; tidak ada panggilan generator
  // langsung. Opsi PDF sengaja TIDAK disentuh di fase ini.
  // ═══════════════════════════════════════════════════════════════════════

  test("Excel menyatakan cakupan bulan terpilih dan sheet per-bulan mengikuti pilihan bulan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Default: layanan Call, bulan terakhir = Februari.
    const feb = await exportFromMenu(page, "Excel", "xlsx-bulan-februari");
    expect(feb.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.xlsx`);
    const febBook = await workbookRows(feb);
    expect(summaryFacts(febBook)).toMatchObject({
      Layanan: "Call",
      Tahun: YEAR,
      "Bulan terpilih": `Februari ${YEAR}`,
      "Cakupan tiket": `Hanya Februari ${YEAR}`,
      "Cakupan akar masalah": `Januari s.d. Februari ${YEAR}`,
      "Cakupan perbandingan": `Januari – Februari ${YEAR} • Layanan Call • Tim Call (4 agen di tim, 8 agen di layanan)`,
    });

    // Ganti bulan ke Januari lewat MonthRail nyata, bukan set state internal.
    const januaryChip = page.getByRole("button", {
      name: /Pilih bulan Jan 2026/,
    });
    await januaryChip.click();
    await expect(januaryChip).toHaveAttribute("aria-pressed", "true");

    const jan = await exportFromMenu(page, "Excel", "xlsx-bulan-januari");
    const janBook = await workbookRows(jan);

    // (1) Sheet dan header kolom tidak berubah.
    expect(Object.keys(janBook)).toEqual(Object.keys(febBook));
    // (2) Temuan tetap cakupan tahun+layanan: tidak ikut menyempit ke bulan.
    expect(janBook["Temuan"]).toEqual(febBook["Temuan"]);
    // (3) Cakupan per-bulan mengikuti bulan terpilih.
    expect(summaryFacts(janBook)).toMatchObject({
      "Bulan terpilih": `Januari ${YEAR}`,
      "Cakupan tiket": `Hanya Januari ${YEAR}`,
      "Cakupan akar masalah": `Januari s.d. Januari ${YEAR}`,
    });
    // (4) Januari tidak punya tiket/akar masalah → kalimat kosong yang jujur,
    //     bukan baris angka karangan.
    expect(janBook["Tiket"].slice(1)).toEqual([
      ["Tidak ada tiket yang menurunkan skor pada bulan ini."],
    ]);
    expect(janBook["Akar Masalah"].slice(1)).toEqual([
      ["Belum ada pola akar masalah yang menonjol."],
    ]);
    // (5) Skor bulanan tetap semua bulan pada tahun+layanan.
    expect(janBook["Skor Bulanan"].slice(1)).toEqual([
      [`Januari ${YEAR}`, 82, 84, 80, 1, 0, "Di bawah target 95"],
      [`Februari ${YEAR}`, 91, 92, 90, 2, 1, "Di bawah target 95"],
    ]);

    expectNoApplicationTraffic(audit);
  });

  test("Excel mengikuti layanan audit yang dipilih tanpa membocorkan data layanan lain", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const call = await workbookRows(
      await exportFromMenu(page, "Excel", "layanan-call-xlsx"),
    );
    expect(summaryFacts(call).Layanan).toBe("Call");

    // Ganti layanan lewat Select nyata di ContextControlBar. `combobox` dipakai
    // agar tidak ikut mencocokkan wrapper `role="group"` yang memakai label sama.
    const serviceSelect = page.getByRole("combobox", {
      name: "Pilihan layanan audit",
    });
    await serviceSelect.click();
    await page.getByRole("option", { name: "Chat" }).click();
    await expect(serviceSelect).toContainText("Chat");

    const chat = await workbookRows(
      await exportFromMenu(page, "Excel", "layanan-chat-xlsx"),
    );

    // (1) Cakupan layanan mengikuti UI.
    expect(summaryFacts(chat).Layanan).toBe("Chat");

    // (2) Data bulanan mengikuti layanan terpilih.
    expect(chat["Skor Bulanan"].slice(1)).toEqual([
      [`Februari ${YEAR}`, 88, 89, 87, 3, 2, "Di bawah target 95"],
    ]);

    // (3) Temuan tidak bocor lintas layanan.
    const chatTickets = chat["Temuan"].slice(1).map((row) => row[1]);
    expect(chatTickets.sort()).toEqual([CHAT_TICKET_A, CHAT_TICKET_B]);
    expect(JSON.stringify(chat)).not.toContain(REAL_TICKET);
    expect(JSON.stringify(call)).toContain(REAL_TICKET);
    expect(JSON.stringify(call)).not.toContain(CHAT_TICKET_A);

    expectNoApplicationTraffic(audit);
  });

  test("Sesi tanpa temuan hanya menyumbang angka agregat Sesi, tidak pernah sebagai baris laporan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "Excel", "sesi-bersih-xlsx");
    const book = await workbookRows(file);

    // Angka agregat sesi dari backend diteruskan apa adanya:
    // Januari = 1 sesi tanpa temuan, Februari = 2 sesi dengan 1 temuan.
    expect(book["Skor Bulanan"].slice(1).map((row) => row.slice(0, 6))).toEqual(
      [
        [`Januari ${YEAR}`, 82, 84, 80, 1, 0],
        [`Februari ${YEAR}`, 91, 92, 90, 2, 1],
      ],
    );

    // Bukti `Sesi` bukan hasil hitung baris yang diekspor: Februari punya
    // 2 sesi tapi hanya 1 baris temuan dan 1 baris tiket.
    expect(book["Temuan"]).toHaveLength(2);
    expect(book["Tiket"]).toHaveLength(2);

    // Sebaliknya: sesi bersih tidak pernah muncul sebagai baris.
    expect(JSON.stringify(book)).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  test("Nama file dengan karakter berbahaya disanitasi tanpa mengubah isi laporan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: SECOND_AGENT_ID,
      name: UNSAFE_NAME,
    });

    const file = await exportFromMenu(page, "Excel", "nama-berbahaya");

    // Nama file aman: satu garis bawah per rangkaian karakter berbahaya.
    expect(file.filename).toBe(
      `Laporan_Audit_${UNSAFE_NAME_FILE_PART}_${YEAR}.xlsx`,
    );
    expect(file.filename).not.toMatch(/[/\\:*?"<>|]/);

    // Sanitasi hanya menyentuh nama file: isi laporan tetap memakai nama
    // BERBAHAYA apa adanya, dan teks temuan berisi kutip kembali utuh.
    const book = await workbookRows(file);
    expect(summaryFacts(book).Nama).toBe(UNSAFE_NAME);
    const finding = book["Temuan"].find((row) => row[1] === REAL_TICKET);
    expect(finding?.[6]).toBe(HOSTILE_FINDING_TEXT);

    expectNoApplicationTraffic(audit);
  });

  test("Kegagalan ekspor memberi umpan balik error yang terlihat tanpa menghasilkan file", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    /**
     * Kegagalan nyata, bukan menu yang dinonaktifkan atau data yang hilang:
     * modul yang diimpor dinamis oleh `handleExport` diganti dengan modul yang
     * melempar error saat evaluasi, sehingga `await import(...)` benar-benar
     * menolak. Daftarkan SESUDAH guard — Playwright memeriksa handler dalam
     * urutan terbalik, jadi intercept ini yang pertama kali menangani request.
     */
    const intercepted: string[] = [];
    await page.route(
      `${APP_ORIGIN}/src/utils/exportAgentReport.ts*`,
      async (route) => {
        intercepted.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: 'throw new Error("E2E: modul ekspor gagal dimuat");\n',
        });
      },
    );

    const downloads: Download[] = [];
    page.on("download", (download) => {
      downloads.push(download);
    });

    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    const item = page.getByRole("menuitem").filter({ hasText: "Excel" });
    await expect(item).toBeEnabled();
    await item.click();

    // Bukti kegagalannya di jalur nyata: modul yang di-intercept benar-benar
    // diambil, jadi kegagalan ini bukan caused by menu mati/data kosong.
    expect(
      intercepted.length,
      "intercept modul ekspor tidak pernah dipanggil — test ini tidak membuktikan apa pun",
    ).toBeGreaterThan(0);

    // Umpan balik error terlihat dan diumumkan ke assistive tech lewat
    // live region aplikasi (Toaster), bukan ditelan diam-diam.
    const liveRegion = page.locator('section[aria-live="polite"]');
    await expect(liveRegion.getByText(EXPORT_ERROR_TITLE)).toBeVisible();

    // Tidak ada file palsu yang lahir dari kegagalan: bukan file kosong,
    // bukan file separuh jadi, dan tidak ada unduhan sama sekali.
    expect(
      downloads.map((download) => download.suggestedFilename()),
      "kegagalan ekspor tetap menghasilkan unduhan",
    ).toEqual([]);

    expectNoApplicationTraffic(audit);
  });

  test("Guard memblokir /api yang tidak dimock dan host eksternal tak dikenal", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // (0) Baseline: satu-satunya lalu lintas jaringan adalah font (di-abort).
    expectNoApplicationTraffic(audit);

    // (1) Endpoint yang dimock dilayani fixture lokal, bukan proxy Vite.
    const mocked = await page.evaluate(async () => {
      const response = await fetch("/api/v1/sidak/agents/agent-1?year=2026");
      return { ok: response.ok, body: await response.text() };
    });
    expect(mocked.ok).toBe(true);
    expect(mocked.body).toContain(AGENT_NAME);
    expect(
      audit.mockedApi.some((label) =>
        label.includes("/api/v1/sidak/agents/agent-1?"),
      ),
    ).toBe(true);

    // (2) `/api/v1/*` yang tidak dimock tidak boleh sampai ke proxy `localhost:3001`.
    const unmockedApi = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/v1/sidak/agents/agent-1/tidak-ada");
        return { failed: false, status: response.status };
      } catch {
        return { failed: true, status: 0 };
      }
    });
    expect(unmockedApi).toEqual({ failed: true, status: 0 });
    expect(audit.blockedApi).toContain(
      `GET ${APP_ORIGIN}/api/v1/sidak/agents/agent-1/tidak-ada`,
    );

    // (3) Host eksternal yang reachable (example.com) tidak boleh keluar dari mesin.
    const externalBefore = audit.blockedExternal.length;
    const external = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/probe-unduhan");
        return false;
      } catch {
        return true;
      }
    });
    expect(external).toBe(true);
    expect(audit.blockedExternal.slice(externalBefore)).toEqual([
      "GET https://example.com/probe-unduhan",
    ]);
  });

  test("Guard memblokir path yang dimock dari origin lain tanpa menyentuh socket", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // (0) Baseline: sebelum ada probe, tidak ada lalu lintas jaringan.
    expectNoApplicationTraffic(audit);

    // Listener standing-in di loopback dengan port ephemeral: origin-nya BERBEDA
    // dari `APP_ORIGIN`, jadi test ini tidak pernah melakukan egress ke host
    // eksternal mana pun, tetapi tetap membuktikan hal yang sama — kalau guard
    // meloloskan path yang dimock ke jaringan, listener lokal inilah yang
    // mencatatnya.
    const hits: string[] = [];
    const listener = createServer((incoming, response) => {
      hits.push(`${incoming.method} ${incoming.url}`);
      response.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      response.end(JSON.stringify({ success: true, data: [{ leaked: true }] }));
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    const foreignOrigin =
      address && typeof address === "object"
        ? `http://127.0.0.1:${address.port}`
        : null;
    expect(
      foreignOrigin,
      "listener loopback tidak siap untuk probe",
    ).not.toBeNull();

    try {
      const blockedBefore = audit.blockedExternal.length;
      const probe = await page.evaluate(async (origin) => {
        try {
          const response = await fetch(
            `${origin}/api/v1/sidak/agents/agent-1?year=2026`,
          );
          return {
            failed: false,
            status: response.status,
            body: await response.text(),
          };
        } catch {
          return { failed: true, status: 0, body: "" };
        }
      }, foreignOrigin!);

      // (1) Guard harus mengklaim request itu. `fallback` tidak pernah mencatat
      // apa pun, jadi label yang tidak muncul di sini berarti request lolos ke
      // jaringan atau dilayani handler lain.
      expect(
        audit.blockedExternal.slice(blockedBefore),
        `path yang dimock dari origin lain lolos tanpa di-abort; respons nyata: ${probe.status} ${probe.body}`,
      ).toEqual([`GET ${foreignOrigin}/api/v1/sidak/agents/agent-1?year=2026`]);

      // (2) Bukti terkuat: tidak ada byte yang sampai ke socket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual(
        [],
      );

      // (3) Foreign origin tidak boleh dilayani fixture mock app.
      expect(probe.body).not.toContain(AGENT_NAME);
      expect(
        probe.failed,
        `respons dari jaringan: ${probe.status} ${probe.body}`,
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 5 — dua invarian yang tadinya hanya bisa dibuktikan lewat unit test.
  //
  // Keduanya di sini diukur dari file yang diunduh dan dari perilaku yang
  // terlihat mata di browser, bukan dari kelas CSS atau atribut SVG.
  // ═══════════════════════════════════════════════════════════════════════

  test("Menu Unduh Laporan tidak terpotong di layar sempit dan semua empat format tetap terjangkau", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Invariant lamanya diuji sebagai kelas CSS (`overflow-hidden`, `z-50`).
    // Yang bisa dilihat pembaca sebenarnya lebih sederhana dan lebih jujur:
    // menu utuh di dalam viewport, dan item format TERAKHIR (yang paling dekat
    // tepi bawah) tetap terlihat serta bisa diklik.
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      const trigger = page.getByRole("button", { name: "Unduh Laporan" });
      await expect(trigger).toBeVisible();
      await trigger.click();

      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();

      const viewport = page.viewportSize();
      expect(viewport, "viewport tidak terbaca").not.toBeNull();
      const box = await menu.boundingBox();
      expect(box, `menu tidak punya bounding box di ${width}px`).not.toBeNull();
      expect(
        box!.x >= -0.5 && box!.y >= -0.5,
        `menu keluar dari atas/kiri viewport di ${width}px: ${JSON.stringify(box)}`,
      ).toBe(true);
      expect(
        box!.x + box!.width <= viewport!.width + 0.5,
        `menu melebar melewati kanan viewport di ${width}px: ${JSON.stringify(box)} vs ${viewport!.width}`,
      ).toBe(true);
      expect(
        box!.y + box!.height <= viewport!.height + 0.5,
        `menu terpotong bawah viewport di ${width}px: ${JSON.stringify(box)} vs ${viewport!.height}`,
      ).toBe(true);

      // Empat format, dan yang terakhir (PDF) benar-benar terlihat.
      await expect(page.getByRole("menuitem")).toHaveCount(4);
      const lastItem = page.getByRole("menuitem", { name: /PDF/ });
      await expect(lastItem).toBeVisible();
      const lastBox = await lastItem.boundingBox();
      expect(
        lastBox !== null &&
          lastBox.y + lastBox.height <= viewport!.height + 0.5,
        `item format terakhir terpotong di ${width}px: ${JSON.stringify(lastBox)}`,
      ).toBe(true);

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }

    expectNoApplicationTraffic(audit);
  });

  test("Tren degeneratif (titik tunggal, celah null, seri semua nol) menghasilkan koordinat berhingga di file yang diunduh", async ({
    page,
  }) => {
    const agents = [
      {
        id: SINGLE_POINT_TREND_AGENT_ID,
        name: SINGLE_POINT_TREND_AGENT_NAME,
        what: "satu label, satu titik, dan satu seri bernilai nol",
        seriesLabelInFile: DEGENERATE_SERIES_LABEL,
      },
      {
        id: GAP_TREND_AGENT_ID,
        name: GAP_TREND_AGENT_NAME,
        what: "celah null di tengah seri dan seri seluruhnya nol",
        // Label seri agen ini sengaja menutup <script>; yang ada di file harus
        // bentuk ter-escape-nya.
        seriesLabelInFile: HOSTILE_SERIES_LABEL.replace(
          "</script>",
          "&lt;/script&gt;",
        )
          .replace("<script>", "&lt;script&gt;")
          .replace("</script>", "&lt;/script&gt;"),
      },
    ];

    for (const agent of agents) {
      const audit = startAudit();
      await openAgentDetail(page, audit, { id: agent.id, name: agent.name });

      const file = await exportFromMenu(
        page,
        "HTML Statis",
        `tren-${agent.id}`,
      );

      // (1) Tidak ada nilai tidak berhingga yang bocor ke dokumen. Ini yang dulu
      //     hanya bisa dicek di string generator; di sini yang dibaca adalah
      //     file yang benar-benar keluar dari browser.
      expect(
        file.text,
        `${agent.name} (${agent.what}): nilai tidak berhingga bocor ke HTML`,
      ).not.toMatch(/\bNaN\b|\bInfinity\b|\bundefined\b/);
      expect(file.text).not.toMatch(
        /(?:x|y|x1|y1|x2|y2|width|height|r|cx|cy|rx|ry)="[^"]*(?:NaN|Infinity)/,
      );

      // (2) Grafik benar-benar dirender — bukan dokumen tanpa sumbu.
      expect(file.text).toContain('<svg class="trend-chart');
      // (3) Setiap nilai seri tetap TERLIHAT di tabel temuan per parameter,
      //     termasuk periode yang tidak punya angka: pembaca harus bisa
      //     membedakan "tidak ada data" dari "nol". Label seri diuji dalam
      //     bentuk yang benar-benar keluar dari file, jadi label BERBAHAYA
      //     ikut ter-escape.
      expect(file.text).toContain(TREND_PARAMETER_TABLE_CAPTION);
      expect(file.text).toContain(agent.seriesLabelInFile);
      expect(file.text).toContain("Feb");

      expectNoApplicationTraffic(audit);
    }
  });

  test("Agen tanpa data audit: unduhan tetap jujur — profil ada, seksi kosong dinyatakan kosong", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(
      page,
      audit,
      { id: EMPTY_AGENT_ID, name: EMPTY_AGENT_NAME },
      // Agen tanpa periode tidak memanggil endpoint quickview sama sekali.
      { expectQuickviewRequest: false },
    );

    // (1) Format tetap menghasilkan file yang ADA isinya. Unduhan kosong
    //     yang "berhasil" adalah kegagalan yang lebih buruk daripada error.
    const xlsx = await exportFromMenu(page, "Excel", "kosong");
    const html = await exportFromMenu(page, "HTML Statis", "kosong");
    expect(xlsx.bytes.length).toBeGreaterThan(0);
    expect(html.bytes.length).toBeGreaterThan(0);

    // (2) Identitas tetap terbaca — ini satu-satunya isi yang benar-benar ada.
    const book = await workbookRows(xlsx);
    expect(summaryFacts(book).Nama).toBe(EMPTY_AGENT_NAME);
    expect(summaryFacts(book).Tahun).toBe(YEAR);
    expect(html.text).toContain(EMPTY_AGENT_NAME);

    // (3) Seksi kosong dinyatakan eksplisit, bukan diisi nol. Ini bedanya
    //     "tidak ada data" dengan "nilainya nol". Sheet tetap ada dengan
    //     header-nya, tapi baris datanya adalah satu kalimat kosong yang jujur.
    expect(Object.keys(book)).toEqual([
      "Ringkasan",
      "Skor Bulanan",
      "Temuan",
      "Tiket",
      "Akar Masalah",
      "Tren Temuan",
      "Perbandingan",
    ]);
    expect(book["Skor Bulanan"].slice(1)).toEqual([
      ["Belum ada skor untuk tahun dan layanan ini."],
    ]);
    expect(book["Temuan"].slice(1)).toEqual([
      ["Tidak ada temuan pada tahun dan layanan ini."],
    ]);
    expect(book["Tiket"].slice(1)).toEqual([
      ["Tidak ada tiket yang menurunkan skor pada bulan ini."],
    ]);
    expect(book["Akar Masalah"].slice(1)).toEqual([
      ["Belum ada pola akar masalah yang menonjol."],
    ]);

    // HTML menyatakan tiap seksi kosong dengan kalimatnya sendiri, dan tren
    // yang tidak punya data tidak dikarang jadi garis lurus.
    for (const sentence of [
      "Belum ada skor audit pada 2026.",
      "Tidak ada temuan pada tahun dan layanan ini.",
      "Tidak ada tiket yang menurunkan skor pada bulan ini.",
      "Data tren temuan belum tersedia untuk tahun dan layanan ini.",
      "Riwayat skor belum tersedia untuk tahun dan layanan ini.",
    ]) {
      expect(html.text, `kalimat kosong hilang: ${sentence}`).toContain(
        sentence,
      );
    }
    expect(html.text).not.toContain("<svg");
    expect(html.text).not.toContain("T-");

    expectNoApplicationTraffic(audit);
  });

  test("Data BERBAHAYA dari label seri, cakupan benchmark, dan quickview masuk laporan sebagai teks, bukan markup", async ({
    page,
  }) => {
    // (1) Label seri tren yang menutup <script> dari DALAM data seri.
    const gapAudit = startAudit();
    await openAgentDetail(page, gapAudit, {
      id: GAP_TREND_AGENT_ID,
      name: GAP_TREND_AGENT_NAME,
    });
    const gapFile = await exportFromMenu(page, "HTML Statis", "hostile-gap");

    expect(
      gapFile.text,
      "label seri tren menutup <script> dan berhasil dieksekusi",
    ).not.toContain("<script>alert(1)</script>");
    expect(gapFile.text).toContain("&lt;/script&gt;");
    // Cakupan benchmark berasal dari backend dan ikut ke ringkasan + heading.
    expect(gapFile.text).toContain("&lt;b&gt;Tim Call&lt;/b&gt;");
    expect(gapFile.text).not.toMatch(/<img[^>]*>/i);
    expect(gapFile.text).not.toMatch(/<script[^>]*>/i);
    expectNoApplicationTraffic(gapAudit);

    // (2) Peer seri dari respons lama tidak lagi masuk laporan, termasuk
    //     nama yang mengandung markup berbahaya.
    const tieAudit = startAudit();
    await openAgentDetail(page, tieAudit, {
      id: TIE_AGENT_ID,
      name: TIE_AGENT_NAME,
    });
    const tieFile = await exportFromMenu(page, "HTML Statis", "hostile-tie");

    expect(tieFile.text).not.toMatch(/Berbagi\s+peringkat/);
    expect(tieFile.text).not.toContain("Nurul &lt;Hidayah&gt;");
    expect(tieFile.text).not.toMatch(/<script[^>]*>/i);
    expect(tieFile.text).not.toMatch(/quickview-ties/);
    expect(tieFile.text).not.toContain("Yoga Saputra");
    expectNoApplicationTraffic(tieAudit);
  });
});
