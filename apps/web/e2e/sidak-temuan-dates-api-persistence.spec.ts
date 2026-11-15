/**
 * E2E kontrak TANGGAL untuk `qa_temuan` — Fase 1 heatmap SIDAK.
 *
 * Dipecah per lapisan: kontrak validasi (`sidak-temuan-dates-api-contract`),
 * persistence (`-persistence`), dan agregasi heatmap (`-heatmap`). Guard,
 * pin env, dan fixture bersama ada di `helpers/sidakTemuanDatesApiHarness.ts`.
 *
 * Lapisan yang diuji:
 *   A. Shared schema di `@trainers/types` — sumber kebenaran tunggal yang dipakai
 *      route create/batch/preview/update.
 *   B. Router Hono ASLI (`apps/api/src/routes/sidak/temuan.ts`) dengan
 *      `requireRole` ASLI. Validasi Sharing jalan SEBELUM service dipanggil,
 *      jadi jalur "tidak valid" benar-benar tidak menyentuh database.
 *   C. Migrasi di database disposable lokal: kolom ada, `date`, nullable, dan
 *      baris lama tetap NULL (bukti tidak ada backfill).
 *
 * Keamanan target (wajib, bukan opsional):
 *   `apps/api/src/lib/env.ts` memanggil `process.loadEnvFile(".env.local")` dan
 *   `supabaseAdmin` dibuat PADA SAAT IMPORT dengan service-role key. Kalau spec
 *   ini mengimpor router tanpa_COMMAND pin, `supabaseAdmin` akan terikat ke
 *   project remote dan service bisa menulis ke sana. Jadi:
 *     1. Env Supabase di-pin ke loopback yang tidak listening SEBELUM import
 *        router. `process.loadEnvFile` tidak menimpa variabel yang sudah ada
 *        (dibuktikan di Node v26), jadi pin ini bertahan.
 *     2. `globalThis.fetch` diganti guard fail-closed: host non-loopback langsung
 *        ditolak dan dicatat, sehingga tidak ada jalan egress meski pin somehow
 *        gagal. Setiap test asserting "service tidak terpanggil" memakai penghitung
 *        `remoteAttempts()`.
 */
import { expect, test } from "@playwright/test";
import { cleanupSlikRuleFixture } from "./helpers/sidakSlikFixture";
import {
  guard,
  installTemuanFetchGuard,
  sql,
  mountRouter,
  persistence,
  fixtureSetup,
  fixtureBatch,
  rowsForPeserta,
} from "./helpers/sidakTemuanDatesApiHarness";

/**
 * Teardown `fetch`. `process.env` SENGAJA tidak dipin di level modul — lihat
 * `loadApiModules`. Playwright menjalankan tiap file spec di proses worker
 * yang diwarisi dari proses sebelumnya, sehingga pin env di level modul bocor ke
 * file lain dan tidak bisa dipulihkan dari dalam file ini. Env dipin hanya
 * selama import router dan langsung dikembalikan setelahnya.
 */
test.afterAll(() => {
  globalThis.fetch = guard.originalFetch;
  guard.fetchPatched = false;
});

installTemuanFetchGuard();

test.describe("Persistence tanggal (route nyata + DB disposable)", () => {
  test.beforeAll(() => {
    persistence.fx = fixtureSetup();
  });

  test.afterAll(() => {
    if (!persistence.fx?.pesertaId) return;
    // ON DELETE CASCADE ikut menghapus qa_temuan milik peserta ini.
    sql(
      `DELETE FROM public.profiler_peserta WHERE id = '${persistence.fx.pesertaId}';`,
    );
    sql(
      `DELETE FROM public.profiler_folders WHERE name = '${persistence.fx.folderName}';`,
    );
    cleanupSlikRuleFixture(sql, persistence.fx.slik);
  });

  test("create menyimpan kedua tanggal dan dapat dibaca ulang dari DB", async () => {
    const call = await mountRouter("trainer");
    const payload = fixtureBatch({
      tanggal_layanan: "2026-01-05",
      tanggal_sampel: "2026-01-09",
    });

    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(201);
    expect((res.body.data as any)?.inserted).toBe(4);

    const row = rowsForPeserta().find(
      (r) => r.tanggal_layanan === "2026-01-05",
    );
    expect(row, "baris bertanggal tidak ditemukan di DB").toBeTruthy();
    expect(row!.tanggal_sampel).toBe("2026-01-09");

    // Tiga item tanpa tanggal TIDAK ikut mendapat tanggal: tidak ada konsep
    // "salin ke semua baris" yang tersembunyi di backend.
    const tanpaTanggal = rowsForPeserta().filter(
      (r) => r.tanggal_layanan === "" && r.tanggal_sampel === "",
    );
    expect(tanpaTanggal).toHaveLength(3);
  });

  test("create tanpa tanggal tetap NULL — tidak ada default hari ini", async () => {
    const call = await mountRouter("trainer");
    const before = rowsForPeserta().length;

    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureBatch()),
    });

    expect(res.status).toBe(201);
    const rows = rowsForPeserta();
    expect(rows.length).toBe(before + 4);
    for (const row of rows.slice(before)) {
      expect(row.tanggal_layanan).toBe("");
      expect(row.tanggal_sampel).toBe("");
    }
  });

  test("hanya tanggal_layanan tersimpan, tanggal_sampel tetap kosong", async () => {
    const call = await mountRouter("trainer");
    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureBatch({ tanggal_layanan: "2026-01-20" })),
    });

    expect(res.status).toBe(201);
    const row = rowsForPeserta().find(
      (r) => r.tanggal_layanan === "2026-01-20",
    );
    expect(row).toBeTruthy();
    expect(row!.tanggal_sampel).toBe("");
  });

  test("preview mempertahankan tanggal per baris", async () => {
    const call = await mountRouter("trainer");
    const res = await call("/temuan/batch/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        fixtureBatch({
          tanggal_layanan: "2026-01-11",
          tanggal_sampel: "2026-01-13",
        }),
      ),
    });

    expect(res.status).toBe(200);
    const data = res.body.data as any;
    expect(data.stats.valid_count).toBe(4);
    expect(data.stats.invalid_count).toBe(0);

    const bertanggal = [...data.valid, ...data.skipped].find(
      (item: any) => item.tanggal_layanan === "2026-01-11",
    );
    expect(bertanggal, "preview membuang tanggal_layanan").toBeTruthy();
    expect(bertanggal.tanggal_sampel).toBe("2026-01-13");

    // Preview tidak boleh menulis apa pun.
    const withDate = rowsForPeserta().filter(
      (r) => r.tanggal_layanan === "2026-01-11",
    );
    expect(withDate).toHaveLength(0);
  });

  test("GET /temuan mengembalikan tanggal yang tersimpan", async () => {
    const call = await mountRouter("trainer");
    await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        fixtureBatch({
          tanggal_layanan: "2026-01-25",
          tanggal_sampel: "2026-01-26",
        }),
      ),
    });

    const res = await call(
      `/temuan?peserta_id=${persistence.fx.pesertaId}&period_id=${persistence.fx.periodId}&limit=100`,
    );
    expect(res.status).toBe(200);

    const items = (res.body.data as any)?.items ?? [];
    const bertanggal = items.filter(
      (item: any) => item.tanggal_layanan === "2026-01-25",
    );
    expect(bertanggal.length).toBe(1);
    expect(bertanggal[0].tanggal_sampel).toBe("2026-01-26");
  });

  test("update set tanggal dan hasilnya persisten", async () => {
    const call = await mountRouter("trainer");
    await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureBatch()),
    });

    const target = rowsForPeserta().at(-1)!;
    const res = await call(`/temuan/${target.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tanggal_layanan: "2026-02-02" }),
    });

    expect(res.status).toBe(200);
    const after = rowsForPeserta().find((r) => r.id === target.id)!;
    expect(after.tanggal_layanan).toBe("2026-02-02");
  });

  test("update tanpa field tanggal mempertahankan nilai existing", async () => {
    const call = await mountRouter("trainer");
    const target = rowsForPeserta().find(
      (r) => r.tanggal_layanan === "2026-01-05",
    )!;

    const res = await call(`/temuan/${target.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ketidaksesuaian: "Diperbarui tanpa tanggal" }),
    });

    expect(res.status).toBe(200);
    const after = rowsForPeserta().find((r) => r.id === target.id)!;
    expect(
      after.tanggal_layanan,
      "tanggal hilang saat field tidak dikirim",
    ).toBe("2026-01-05");
    expect(after.tanggal_sampel).toBe("2026-01-09");
  });

  test("update dengan null menghapus tanggal", async () => {
    const call = await mountRouter("trainer");
    const target = rowsForPeserta().find(
      (r) => r.tanggal_layanan === "2026-01-25",
    )!;

    const res = await call(`/temuan/${target.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tanggal_layanan: null }),
    });

    expect(res.status).toBe(200);
    const after = rowsForPeserta().find((r) => r.id === target.id)!;
    expect(after.tanggal_layanan).toBe("");
    // Hanya field yang dikirim yang berubah.
    expect(after.tanggal_sampel).toBe("2026-01-26");
  });

  test("tanggal tidak nyata ditolak sebelum insert — tidak ada baris baru", async () => {
    const call = await mountRouter("trainer");
    const before = rowsForPeserta().length;

    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureBatch({ tanggal_layanan: "2026-02-30" })),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(rowsForPeserta()).toHaveLength(before);
  });

  test("duplicate existing di-skip, tidak digandakan", async () => {
    const call = await mountRouter("trainer");
    const payload = fixtureBatch({ tanggal_layanan: "2026-03-01" });
    const total = sql(
      `SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${persistence.fx.pesertaId}';`,
    );

    const first = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    expect((first.body.data as any)?.inserted).toBe(4);
    expect(
      sql(
        `SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${persistence.fx.pesertaId}';`,
      ),
    ).toBe(String(Number(total) + 4));

    // Payload identik: tiket + indikator sama → semua harus di-skip.
    const second = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    // Semua duplikat: hasil sah tanpa baris baru → 200, bukan 201 (plan
    // sidak-unmapped-indicator-findings, Opsi B).
    expect(second.status).toBe(200);
    const data = second.body.data as any;
    expect(data.inserted).toBe(0);
    expect(data.skipped).toBe(4);
    expect(
      sql(
        `SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${persistence.fx.pesertaId}';`,
      ),
    ).toBe(String(Number(total) + 4));
  });

  test("delete menghapus baris", async () => {
    const call = await mountRouter("trainer");
    const target = rowsForPeserta().at(-1)!;
    const before = rowsForPeserta().length;

    const res = await call(`/temuan/${target.id}`, { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(rowsForPeserta()).toHaveLength(before - 1);
    expect(rowsForPeserta().some((r) => r.id === target.id)).toBe(false);
  });
});
