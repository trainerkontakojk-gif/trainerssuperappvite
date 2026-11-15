/**
 * E2E untuk workspace `/sidak/reports-data`.
 *
 * Kontrak yang dibuktikan (docs/SIDAK_LOGIC_AND_SCORING.md — "Logika Workspace Data"):
 *   - Eksklusi phantom: `is_phantom_padding = true` tidak pernah tampil.
 *   - Findings-only: hanya baris dengan Temuan (`ketidaksesuaian`) DAN
 *     Rekomendasi (`sebaiknya`) yang tampil, lengkap utuh.
 *   - Count, isi tabel, dan export memakai satu sumber hasil terpilih; file
 *     `.xlsx` yang benar-benar diunduh dibaca dengan `exceljs` (dependensi app
 *     yang sudah ada) dan harus memuat dua baris actionable yang sama.
 *
 * Isolasi (WAJIB — jangan dihapus, jangan longgarkan):
 *   1. Semua respons API dimock; tidak ada proses backend yang dijalankan.
 *   2. `assertLocalDevOnlyTarget` (preflight) membuktikan listener
 *      `localhost:3005` adalah dev-server Vite repo ini dan proxy `/api`-nya
 *      hanya menunjuk ke loopback — bukan build produksi atau backend lain.
 *   3. `installNetworkGuard` adalah fail-closed allowlist. Satu-satunya request
 *      yang boleh menyentuh jaringan adalah:
 *        - endpoint yang PERSIS dimock (method + path dari `MOCKED_API`),
 *        - endpoint auth/profile yang PERSIS dimock (`MOCKED_SUPABASE`),
 *        - document/aset/HMR dev-server lokal pada origin app, tanpa `/api`.
 *      Setiap request lain di-`abort`, termasuk `/api/v1/*` yang tidak dimock —
 *      ini mencegah Vite mem-proxy path tak dikenal ke backend non-test
 *      (`server.proxy` hanya `/api` → `http://localhost:3001`) dan mencegah
 *      host eksternal mana pun tersentuh.
 *   4. Bukti isolasi diuji oleh test "Guard memblokir ..." di
 *      `sidak-reports-data-filters.spec.ts`, bukan
 *      hanya diklaim.
 */

import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import path from "node:path";
import {
  closeSelect,
  openSelect,
  pickSelect,
  selectedLabel,
  selectOptionLabels,
  selectTrigger,
  selectValue,
} from "./helpers/pickSelect";
import {
  FINDING_ACTIONABLE_CALL,
  RECOMMENDATION_ACTIONABLE_CALL,
  FINDING_ACTIONABLE_EMAIL,
  RECOMMENDATION_ACTIONABLE_EMAIL,
  PERIODS_FIXTURE,
  ROW_PHANTOM,
  ROW_WITHOUT_FINDING,
  ROW_WITHOUT_RECOMMENDATION,
  ALL_ROWS,
  NON_ACTIONABLE_TEXTS,
  type DataRequest,
  activeReportResponseGate,
  createDeferredReportResponse,
  assertLocalDevOnlyTarget,
  openReportsData,
  expectNoApplicationTraffic,
  MIDDLE_FROM_MONTH,
  MIDDLE_TO_MONTH,
  assertIndonesianMonthOptions,
  RESULTS_COUNT,
  desktopResults,
  resolveArtifactDir,
  ALL_SCOPE_PARAMETER_LABELS,
  parameterSelect,
  cariDataButton,
  parameterPendingStatus,
  parameterErrorAlert,
  activeAudits,
  startAudit,
  settledAgentOptions,
} from "./helpers/sidakReportsDataHarness";

test.describe("SIDAK reports data workspace", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    // Jangan biarkan penahanan respons bocor ke test berikutnya.
    activeReportResponseGate.current = null;
    for (const audit of activeAudits.splice(0)) {
      console.log(
        [
          "[audit] mockedApi:",
          JSON.stringify(audit.mockedApi),
          "[audit] mockedAuth:",
          JSON.stringify(audit.mockedAuth),
          "[audit] localDev:",
          String(audit.localDev.length),
          "[audit] blockedApi:",
          JSON.stringify(audit.blockedApi),
          "[audit] blockedExternal:",
          JSON.stringify(audit.blockedExternal),
          "[audit] blockedLocal:",
          JSON.stringify(audit.blockedLocal),
        ].join("\n"),
      );
    }
  });

  test("Filter tahun, bulan, dan layanan diteruskan ke endpoint data", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // Label opsi bulan = nama Indonesia penuh, default = setahun penuh, dan
    // `value` tetap angka. Dibuktikan SEBELUM request apa pun dikirim.
    await assertIndonesianMonthOptions(page);

    // Hasil pertama diambil dengan filter default, lalu dibuang saat filter
    // berubah supaya hasil lama tidak pernah diklaim sebagai filter baru.
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");

    await pickSelect(page, "Layanan", "Email");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);

    await pickSelect(page, "Tahun", "2025");
    // Dipilih berdasarkan LABEL yang terlihat, bukan angka: ini yang membuktikan
    // label Indonesia terikat ke `value` angka yang benar.
    await pickSelect(page, "Dari bulan", MIDDLE_FROM_MONTH.label);
    await pickSelect(page, "Ke bulan", MIDDLE_TO_MONTH.label);
    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(page.getByTestId(RESULTS_COUNT)).toBeVisible();
    expect(dataRequests).toHaveLength(2);
    // Default tetap 1..12 walaupun labelnya sudah nama bulan.
    expect(dataRequests[0].body).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(dataRequests[1].method).toBe("POST");
    // Payload tetap ANGKA, bukan nama bulan: 3 dan 5, bukan "Maret"/"Mei".
    expect(dataRequests[1].body).toEqual({
      serviceType: "email",
      year: 2025,
      startMonth: Number(MIDDLE_FROM_MONTH.value),
      endMonth: Number(MIDDLE_TO_MONTH.value),
    });
    expect(dataRequests[1].body.startMonth).toBe(3);
    expect(dataRequests[1].body.endMonth).toBe(5);

    // Label terpilih mengikuti nilai yang dikirim, jadi tidak ada ambigu
    // "Maret" = bulan ke berapa.
    expect(
      await selectedLabel(page.getByRole("combobox", { name: "Dari bulan" })),
    ).toBe(MIDDLE_FROM_MONTH.label);
    expect(
      await selectedLabel(page.getByRole("combobox", { name: "Ke bulan" })),
    ).toBe(MIDDLE_TO_MONTH.label);

    expectNoApplicationTraffic(audit);
  });

  test("Cakupan bersama dari alamat mengisi Layanan, Tahun, dan Bulan", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(
      page,
      audit,
      dataRequests,
      ALL_ROWS,
      undefined,
      undefined,
      "/sidak/reports-data?layanan=email&tahun=2025&dari=3&sampai=5",
    );
    await expect(page.getByRole("combobox", { name: "Layanan" })).toContainText(
      "Email",
    );
    await expect(page.getByRole("combobox", { name: "Tahun" })).toContainText(
      "2025",
    );

    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toBeVisible();
    expect(dataRequests[0].body).toEqual({
      serviceType: "email",
      year: 2025,
      startMonth: 3,
      endMonth: 5,
    });

    // Mengubah tahun di sini ikut menulis cakupan bersama.
    const thisYear = new Date().getFullYear();
    await pickSelect(page, "Tahun", String(thisYear));
    await expect(page).toHaveURL(new RegExp(`tahun=${thisYear}`));
    expectNoApplicationTraffic(audit);
  });

  test("Respons request yang telat tidak boleh muncul sebagai hasil filter baru", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const deferred = createDeferredReportResponse();

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // Nama tombol berubah jadi "Memuat..." saat loading, jadi regex ini
    // tetap menunjuk elemen yang sama pada kedua status.
    const searchButton = page.getByRole("button", { name: /Cari Data|Memuat/ });

    // (1) Request pertama DILETAK: handler mock menahan `route.fulfill`, jadi
    // respons belum ada sementara filter masih yang lama (± 2026).
    await searchButton.click();
    await deferred.arrived;
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0].body).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    // (2) User mengubah filter (tahun → 2025) sebelum respons request pertama tiba.
    await pickSelect(page, "Tahun", "2025");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    // (3) Respons request LAMA sekarang tiba dan diproses aplikasi.
    deferred.release();
    // `toBeEnabled` hanya benar setelah `setLoading(false)` ter-commit. React
    // membatch `setResults` dan `setLoading(false)` dari continuation yang sama,
    // jadi assertion di bawah tidak berlomba dengan respons yang baru diproses.
    await expect(searchButton).toBeEnabled();

    // (4) Kontrak: baris request lama tidak boleh diklaim sebagai hasil filter
    // 2025 yang sedang terlihat. Count, isi tabel, dan tombol export semuanya
    // harus tetap tersembunyi — kalau bocor, ketiganya akan terlihat bersama.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "Temuan" }),
    ).toHaveCount(0);
    for (const text of [
      FINDING_ACTIONABLE_CALL,
      RECOMMENDATION_ACTIONABLE_CALL,
      FINDING_ACTIONABLE_EMAIL,
      RECOMMENDATION_ACTIONABLE_EMAIL,
    ]) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }
    for (const ticket of ["TKT-2026-0142", "TKT-2026-0310"]) {
      await expect(page.getByText(ticket)).toHaveCount(0);
    }
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);

    // (5) Guard tidak mematikan flow: request kedua dengan filter baru tetap
    // normal dan mengisi hasil. Tidak ada auto refetch — total tetap 2 request.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    expect(dataRequests).toHaveLength(2);
    expect(dataRequests[1].body).toEqual({
      year: 2025,
      startMonth: 1,
      endMonth: 12,
    });

    expectNoApplicationTraffic(audit);
  });

  test("Per Individu mewajibkan Agen dan meneruskan pesertaId", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    const searchButton = page.getByRole("button", { name: "Cari Data" });
    await page.getByRole("button", { name: "Per Individu" }).click();

    // Direktori `{agents,batches}` diterima tanpa crash.
    const agentListbox = await openSelect(selectTrigger(page, "Agen"));
    await expect(
      agentListbox.getByRole("option", { name: /Alya Pranoto/ }),
    ).toHaveCount(1);
    await expect(
      agentListbox.getByRole("option", { name: /Bima Saputra/ }),
    ).toHaveCount(1);
    await closeSelect(selectTrigger(page, "Agen"));
    await expect(searchButton).toBeDisabled();

    await pickSelect(page, "Agen", "Alya Pranoto — Batch 7");
    await expect(searchButton).toBeEnabled();
    await searchButton.click();

    await expect(
      desktopResults(page).getByText(FINDING_ACTIONABLE_CALL, { exact: false }),
    ).toBeVisible();
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0].body).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
    });
    expect(dataRequests[0].body).not.toHaveProperty("serviceType");

    expectNoApplicationTraffic(audit);
  });

  test("Direktori agen yang malformed tidak menawarkan agen dan menutup pencarian", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // HTTP 200 `success: true` dengan `data` yang salah BENTUK, bukan request
    // gagal: dua bentuk berbeda dilayani per Tahun yang dipilih, jadi keduanya
    // harus lewat alur user yang nyata: load halaman, lalu ganti Tahun.
    //   2026 → `agents` bukan array  (menolak di guard array)
    //   2025 → `data` null          (menolak di guard `!raw`)
    await openReportsData(page, audit, dataRequests, ALL_ROWS, undefined, {
      byYear: { "2026": { agents: "not-an-array" }, "2025": null },
    });

    await page.getByRole("button", { name: "Per Individu" }).click();

    const agentSelect = page.getByRole("combobox", { name: "Agen" });
    // (1) Tidak ada agen yang bisa dipilih, dan label placeholder bukan "Memuat
    // agen..." — jadi respons SUDAH sampai dan ditolak oleh normalisasi, bukan
    // sekadar masih di-flight.
    await expect(selectValue(agentSelect)).toHaveText("Pilih Agen");
    expect(
      await settledAgentOptions(agentSelect),
      "label opsi Agen saat malformed",
    ).toEqual(["Pilih Agen"]);
    const malformedListbox = await openSelect(agentSelect);
    for (const agent of ["Alya Pranoto", "Bima Saputra"]) {
      await expect(
        malformedListbox.getByRole("option", { name: new RegExp(agent) }),
        `agen "${agent}" tidak boleh tetap selectable`,
      ).toHaveCount(0);
    }
    await closeSelect(agentSelect);

    // (2) Penyebab `disabled` harus terbukti JUSTRU direktori agen, bukan
    // katalog Parameter: katalog sudah selesai dan utuh saat tombol dinilai.
    const parameter = parameterSelect(page);
    await expect(parameter).toBeEnabled();
    expect(
      await selectOptionLabels(parameter),
      "katalog Parameter belum selesai",
    ).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    await expect(parameterPendingStatus(page)).toHaveCount(0);
    await expect(parameterErrorAlert(page)).toHaveCount(0);

    const searchButton = cariDataButton(page);
    await expect(searchButton).toBeDisabled();

    // (3) "Aman" = tidak bisa mengirim apa pun dan halaman tidak rusak: hasil
    // tidak pernah ada, tidak ada request data, dan filter masih terbaca.
    expect(dataRequests, "pencarian tidak boleh jalan tanpa agen").toEqual([]);
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(page.getByText("Belum ada pencarian.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);

    // (4) Bentuk malformed kedua, lewat Tahun yang sama: `data: null`. Request
    // direktori agen yang kedua harus benar-benar terkirim — kalau tidak, test
    // ini hanya mengulang bentuk pertama.
    await pickSelect(page, "Tahun", "2025");
    expect(
      await settledAgentOptions(agentSelect),
      "label opsi Agen saat data null",
    ).toEqual(["Pilih Agen"]);
    await expect(searchButton).toBeDisabled();
    expect(dataRequests).toEqual([]);
    expect(
      audit.mockedApi.filter((label) =>
        label.includes("/sidak/agents?year=2025"),
      ),
      "request direktori agen untuk 2025 tidak terkirim",
    ).not.toHaveLength(0);

    // Bukti kedua bentuk malformed benar-benar dilayani mock, bukan kebetulan
    // respons default.
    const agentRequests = audit.mockedApi.filter((label) =>
      label.includes("/sidak/agents"),
    );
    expect(agentRequests.some((label) => label.includes("year=2026"))).toBe(
      true,
    );
    expect(agentRequests.some((label) => label.includes("year=2025"))).toBe(
      true,
    );

    expectNoApplicationTraffic(audit);
  });

  test("Respons tanpa temuan actionable menampilkan state kosong tanpa export", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ROW_PHANTOM,
      ROW_WITHOUT_FINDING,
      ROW_WITHOUT_RECOMMENDATION,
    ]);

    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("0 temuan");
    await expect(
      page.getByText(
        "Tidak ada temuan dengan Temuan dan Rekomendasi lengkap untuk filter yang dipilih.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export Excel" }),
    ).toHaveCount(0);
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }

    // Bukti visual state kosong (desktop default) untuk review manual.
    const emptyShot = path.join(
      resolveArtifactDir(),
      `state-empty-${page.viewportSize()?.width}.png`,
    );
    await page.screenshot({ path: emptyShot });
    console.log(`[artifact] screenshot: ${emptyShot}`);

    expectNoApplicationTraffic(audit);
  });

  test("Rentang bulan terbalik ditolak tanpa memanggil endpoint data", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    await pickSelect(page, "Dari bulan", "Juli");
    await pickSelect(page, "Ke bulan", "Maret");
    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(
      page.getByText("Bulan awal tidak boleh setelah bulan akhir."),
    ).toBeVisible();
    expect(dataRequests).toEqual([]);

    // Bukti visual state error (desktop default) untuk review manual.
    const errorShot = path.join(
      resolveArtifactDir(),
      `state-error-${page.viewportSize()?.width}.png`,
    );
    await page.screenshot({ path: errorShot });
    console.log(`[artifact] screenshot: ${errorShot}`);

    expectNoApplicationTraffic(audit);
  });

  test("Pesan error lama harus hilang begitu filter yang memicunya diperbaiki", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // (1) Rentang terbalik ditolak, jadi tidak ada request data sama sekali.
    await pickSelect(page, "Dari bulan", "Juli");
    await pickSelect(page, "Ke bulan", "Maret");
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(
      page.getByText("Bulan awal tidak boleh setelah bulan akhir."),
    ).toBeVisible();
    expect(dataRequests).toEqual([]);

    // (2) User memperbaiki filter (7..3 → 1..12) tanpa mencari ulang. Error
    // lama tidak lagi menggambarkan filter yang sedang terlihat, jadi tidak
    // boleh terus menyalahkan filter yang sekarang sudah valid — harus kembali
    // ke prompt netral "belum ada pencarian". Kalau bocor, user akan mengira
    // rentang 1..12 juga tidak valid.
    await pickSelect(page, "Dari bulan", "Januari");
    await expect(
      page.getByText("Bulan awal tidak boleh setelah bulan akhir."),
    ).toHaveCount(0);
    await expect(page.getByText("Belum ada pencarian.")).toBeVisible();

    // (3) Guard tidak mematikan flow: pencarian dengan filter yang sudah valid
    // tetap mengisi hasil.
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    expect(dataRequests).toHaveLength(1);

    expectNoApplicationTraffic(audit);
  });

  test("Guard memblokir /api yang tidak dimock dan host eksternal tak dikenal", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // (0) Baseline: satu-satunya lalu lintas jaringan adalah font (di-abort).
    expectNoApplicationTraffic(audit);

    // (1) Endpoint yang dimock dilayani fixture lokal, bukan proxy Vite.
    const mocked = await page.evaluate(async () => {
      const response = await fetch("/api/v1/sidak/periods");
      return { ok: response.ok, body: await response.text() };
    });
    expect(mocked.ok).toBe(true);
    expect(mocked.body).toContain(PERIODS_FIXTURE[0].id);
    expect(
      audit.mockedApi.some((label) => label.includes("/api/v1/sidak/periods")),
    ).toBe(true);

    // (2) `/api/v1/*` yang tidak dimock tidak boleh sampai ke proxy `localhost:3001`.
    const unmockedApi = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/v1/sidak/periods-tidak-adapter");
        return { failed: false, status: response.status };
      } catch {
        return { failed: true, status: 0 };
      }
    });
    expect(unmockedApi).toEqual({ failed: true, status: 0 });
    expect(audit.blockedApi).toContain(
      "GET http://localhost:3005/api/v1/sidak/periods-tidak-adapter",
    );

    // (3) Host eksternal yang reachable (example.com) tidak boleh keluar dari mesin.
    const externalBefore = audit.blockedExternal.length;
    const external = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/probe-isolasi");
        return false;
      } catch {
        return true;
      }
    });
    expect(external).toBe(true);
    expect(audit.blockedExternal.slice(externalBefore)).toEqual([
      "GET https://example.com/probe-isolasi",
    ]);
  });

  test("Guard memblokir path yang dimock dari origin lain tanpa menyentuh jaringan", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

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
          const response = await fetch(`${origin}/api/v1/sidak/periods`);
          return {
            failed: false,
            status: response.status,
            body: await response.text(),
          };
        } catch {
          return { failed: true, status: 0, body: "" };
        }
      }, foreignOrigin!);

      // (1) Guard harus mengklaim request itu. `fallback` tidak pernah
      // mencatat apa pun, jadi label yang tidak muncul di sini berarti request
      // lolos ke jaringan atau dilayani handler lain.
      expect(
        audit.blockedExternal.slice(blockedBefore),
        `path yang dimock dari origin lain lolos tanpa di-abort; respons nyata: ${probe.status} ${probe.body}`,
      ).toEqual([`GET ${foreignOrigin}/api/v1/sidak/periods`]);

      // (2) Bukti terkuat: tidak ada byte yang sampai ke socket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual(
        [],
      );

      // (3) Foreign origin tidak boleh dilayani fixture mock app, dan tidak
      // boleh dibiarkan menjawab sebagai sukses.
      expect(probe.body).not.toContain(PERIODS_FIXTURE[0].id);
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
});
