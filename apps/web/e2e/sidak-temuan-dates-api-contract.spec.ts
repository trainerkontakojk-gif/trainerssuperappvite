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
import * as sidakTypes from "@trainers/types";
import {
  guard,
  installTemuanFetchGuard,
  remoteAttemptsSince,
  sql,
  outboundSince,
  UUID,
  legacyBatchPayload,
  batchPayloadWithDate,
  mountRouter,
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

// ── A. Shared schema contract ──────────────────────────────────────────────
test.describe("Shared schema tanggal (packages/types)", () => {
  test("qaTemuanSchema menerima dan mempertahankan kedua tanggal", () => {
    const parsed = sidakTypes.qaTemuanSchema.safeParse({
      id: UUID.temuan,
      peserta_id: UUID.peserta,
      period_id: UUID.period,
      indicator_id: UUID.indicator,
      service_type: "call",
      nilai: 1,
      ketidaksesuaian: "Telat respon",
      tanggal_layanan: "2026-02-28",
      tanggal_sampel: "2026-03-01",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Zod strip key yang tidak dikenal, jadi tanpa schema tanggal kedua field ini
    // akan hilang — itulah kegagalan yang harus terlihat, bukan diasumsikan.
    expect(parsed.data.tanggal_layanan).toBe("2026-02-28");
    expect(parsed.data.tanggal_sampel).toBe("2026-03-01");
  });

  test("createTemuanBatchSchema membawa tanggal per baris parameter", () => {
    const parsed = sidakTypes.createTemuanBatchSchema.safeParse(
      batchPayloadWithDate("tanggal_layanan", "2026-02-10"),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const last = parsed.data.items[parsed.data.items.length - 1]!;
    expect(last.tanggal_layanan).toBe("2026-02-10");
    // Baris lama tanpa tanggal tetap sah dan TIDAK ikut mendapat tanggal —
    // kompatibilitas payload lama, tanpa backfill diam-diam.
    expect(parsed.data.items[0]!.tanggal_layanan ?? null).toBeNull();
    expect(parsed.data.items[2]!.tanggal_layanan ?? null).toBeNull();
  });

  test("kedua tanggal boleh berbeda pada item yang sama", () => {
    const payload = legacyBatchPayload() as {
      items: Array<Record<string, unknown>>;
    };
    payload.items.push({
      indicator_id: UUID.indicator,
      nilai: 3,
      ketidaksesuaian: "Kedua tanggal",
      tanggal_layanan: "2026-02-10",
      tanggal_sampel: "2026-02-12",
    });
    const parsed = sidakTypes.createTemuanBatchSchema.safeParse(payload);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const last = parsed.data.items[parsed.data.items.length - 1]!;
    expect(last.tanggal_layanan).toBe("2026-02-10");
    expect(last.tanggal_sampel).toBe("2026-02-12");
  });

  test("menolak tanggal kalender yang tidak ada (2026-02-30)", () => {
    expect(
      sidakTypes.createTemuanBatchSchema.safeParse(
        batchPayloadWithDate("tanggal_layanan", "2026-02-30"),
      ).success,
    ).toBe(false);
    expect(
      sidakTypes.createTemuanBatchSchema.safeParse(
        batchPayloadWithDate("tanggal_sampel", "2026-02-30"),
      ).success,
    ).toBe(false);
    expect(
      sidakTypes.qaTemuanSchema.safeParse({
        id: UUID.temuan,
        peserta_id: UUID.peserta,
        period_id: UUID.period,
        indicator_id: UUID.indicator,
        service_type: "call",
        nilai: 1,
        tanggal_layanan: "2026-02-30",
      }).success,
    ).toBe(false);
  });

  test("leap day mengikuti tahun yang dipilih", () => {
    const build = (tanggal: string) =>
      sidakTypes.createTemuanBatchSchema.safeParse(
        batchPayloadWithDate("tanggal_layanan", tanggal),
      ).success;

    expect(build("2024-02-29")).toBe(true); // 2024 = leap year
    expect(build("2026-02-29")).toBe(false); // 2026 bukan leap year
    expect(build("2000-02-29")).toBe(true); // habis dibagi 400
    expect(build("1900-02-29")).toBe(false); // habis dibagi 100 tapi bukan 400
  });

  test("menolak format ambigu dan timestamp", () => {
    for (const bad of [
      "03/04/2026",
      "2026-2-8",
      "2026-02-28T00:00:00Z",
      "28-02-2026",
      "not-a-date",
      20260228,
    ]) {
      expect(
        sidakTypes.createTemuanBatchSchema.safeParse(
          batchPayloadWithDate("tanggal_sampel", bad),
        ).success,
        `tanggal_sampel ${JSON.stringify(bad)} seharusnya ditolak`,
      ).toBe(false);
    }
  });

  test("payload lama tanpa tanggal tetap valid (backward compatible)", () => {
    expect(
      sidakTypes.createTemuanBatchSchema.safeParse(legacyBatchPayload())
        .success,
    ).toBe(true);
    expect(
      sidakTypes.qaTemuanSchema.safeParse({
        id: UUID.temuan,
        peserta_id: UUID.peserta,
        period_id: UUID.period,
        indicator_id: UUID.indicator,
        service_type: "call",
        nilai: 1,
      }).success,
    ).toBe(true);
  });

  test("schema update bersama ada dan menangani clear serta omission", () => {
    // Schema update harus DIPAKAI bersama oleh route PUT, jadi harus terasa di
    // shared types — bukan z.object inline di dalam route. Zod v3 mengembalikan
    // instance ZodObject (bukan callable), jadi yang dicek adalah_api_-nya.
    expect(sidakTypes.updateTemuanSchema).toBeDefined();
    expect(typeof sidakTypes.updateTemuanSchema?.safeParse).toBe("function");

    const schema = sidakTypes.updateTemuanSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean; data?: any };
    };

    // Omitted → mempertahankan nilai existing (tidak ada default "hari ini").
    expect(schema.safeParse({ nilai: 2 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);

    // Null eksplisit → menghapus tanggal.
    expect(schema.safeParse({ tanggal_layanan: null }).success).toBe(true);
    expect(schema.safeParse({ tanggal_sampel: null }).success).toBe(true);

    // Tanggal nyata diterima, tanggal palsu ditolak.
    expect(schema.safeParse({ tanggal_layanan: "2026-02-28" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ tanggal_layanan: "2026-02-30" }).success).toBe(
      false,
    );

    // Nilai lama tetap dijaga.
    expect(schema.safeParse({ nilai: 4 }).success).toBe(false);
    expect(schema.safeParse({ ketidaksesuaian: "x" }).success).toBe(true);
  });
});

// ── B. Router nyata + requireRole asli ─────────────────────────────────────
test.describe("Instrumentasi guard (bukti guard bisa gagal)", () => {
  // Tanpa test ini, assertion "tidak ada outbound" di spec lain tidak
  // membuktikan apa-apa: kalau log fetch-nya mati, semuanya akan hijau karena
  // array memang kosong. Test ini membuktikan guard benar-benar AKTIF dan
  // MENCAKAT percobaan egress yang gagal.
  test("fetch ke host non-loopback diblokir dan tercatat", async () => {
    const mark = guard.allAttempts.length;
    const target = "https://contoh.example.invalid/probe";

    await expect(globalThis.fetch(target)).rejects.toThrow(
      /egress non-loopback diblokir/,
    );

    expect(outboundSince(mark)).toEqual([target]);
    expect(remoteAttemptsSince(mark)).toEqual([target]);
  });
});

test.describe("Router temuan (Hono asli)", () => {
  test("role gate menutup role non admin/trainer sebelum validasi", async () => {
    for (const role of ["leader", "agent"]) {
      const call = await mountRouter(role);
      const mark = guard.remoteAttempts.length;

      const res = await call("/temuan/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          batchPayloadWithDate("tanggal_layanan", "2026-02-30"),
        ),
      });

      expect(res.status, `role ${role}`).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(
        remoteAttemptsSince(mark),
        "tidak boleh ada egress non-loopback",
      ).toEqual([]);
      expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
    }
  });

  test("admin & trainer boleh mencapai lapis validasi", async () => {
    for (const role of ["admin", "trainer"]) {
      const call = await mountRouter(role);
      const mark = guard.remoteAttempts.length;

      // Tanggal tidak nyata harus ditolak oleh VALIDASI, bukan oleh role gate dan
      // tidak boleh sampai ke service. Jawaban 400 VALIDATION_ERROR + nol egress
      // membuktikan service tidak pernah dipanggil.
      const res = await call("/temuan/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          batchPayloadWithDate("tanggal_layanan", "2026-02-30"),
        ),
      });

      expect(res.status, `role ${role}`).toBe(400);
      expect(res.body.error?.code, `role ${role}`).toBe("VALIDATION_ERROR");
      expect(
        remoteAttemptsSince(mark),
        "tidak boleh ada egress non-loopback",
      ).toEqual([]);
      expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
    }
  });

  test("preview menolak tanggal tidak nyata tanpa menyentuh database", async () => {
    const call = await mountRouter("trainer");
    const mark = guard.remoteAttempts.length;

    const res = await call("/temuan/batch/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        batchPayloadWithDate("tanggal_sampel", "2026-02-30"),
      ),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(
      remoteAttemptsSince(mark),
      "tidak boleh ada egress non-loopback",
    ).toEqual([]);
    expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
  });

  // Menandai dengan `fixme`, bukan `skip`, supaya ketiadaan assertion ini tetap
  // terlihat di laporan dan tidak ikut terhitung sebagai bukti passing.
  test("PUT /temuan/:id menolak tanggal tidak nyata", async () => {
    const call = await mountRouter("trainer");
    const mark = guard.allAttempts.length;

    const res = await call(`/temuan/${UUID.temuan}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nilai: 2, tanggal_layanan: "2026-02-30" }),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    // Pesan harus manusiawi dan menyebut formatnya, bukan membocorkan error
    // database mentah ke user.
    expect(res.body.error?.message).toMatch(/YYYY-MM-DD/);
    expect(res.body.error?.message).not.toMatch(
      /postgres|supabase|pg_|SQLSTATE/i,
    );
    expect(
      remoteAttemptsSince(mark),
      "tidak boleh ada egress non-loopback",
    ).toEqual([]);
    expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
  });

  test("error tanggal dari batch juga manusiawi, bukan raw DB error", async () => {
    const call = await mountRouter("trainer");
    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        batchPayloadWithDate("tanggal_sampel", "03/04/2026"),
      ),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body.error)).not.toMatch(
      /postgres|supabase|pg_|SQLSTATE|violates/i,
    );
  });
});

// ── C. Migrasi di database disposable lokal ────────────────────────────────
test.describe("Migrasi tanggal_layanan / tanggal_sampel (DB lokal)", () => {
  test("kedua kolom ada sebagai DATE dan nullable", () => {
    const rows = sql(`
      SELECT column_name || '|' || data_type || '|' || is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'qa_temuan'
        AND column_name IN ('tanggal_layanan', 'tanggal_sampel')
      ORDER BY column_name;
    `);

    expect(rows.split("\n").filter(Boolean)).toEqual([
      "tanggal_layanan|date|YES",
      "tanggal_sampel|date|YES",
    ]);
  });

  test("tidak ada backfill: baris lama tetap NULL", () => {
    const rows = sql(
      `SELECT count(*) FROM public.qa_temuan
       WHERE tanggal_layanan IS NOT NULL OR tanggal_sampel IS NOT NULL;`,
    );
    expect(Number(rows)).toBe(0);
  });

  test("kolom bisa diisi NULL dan dibersihkan tanpa 제약 silang", () => {
    // Tidak boleh ada constraint tanggal-dalam-periode atau sampel-setelah-layanan.
    const constraints = sql(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.qa_temuan'::regclass
        AND contype = 'c'
        AND (pg_get_constraintdef(oid) ILIKE '%tanggal_layanan%'
          OR pg_get_constraintdef(oid) ILIKE '%tanggal_sampel%');
    `);
    expect(constraints).toBe("");
  });
});
