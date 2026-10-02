/**
 * E2E kontrak TANGGAL untuk `qa_temuan` — Fase 1 heatmap SIDAK.
 *
 * Fase ini hanya menambah kolom nullable + shared schema. Yang dibuktikan di
 * sini adalah KONTRAK VALIDASI, bukan persistence: persistence/RLS Against DB
 * adalah Fase 2 (`sidak-temuan-dates-api.spec.ts` dilanjutkan di sana) dan
 * tidak diklaim di spec ini.
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

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import * as sidakTypes from "@trainers/types";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// ── Keamanan target ─────────────────────────────────────────────────────────
// Spec ini memakai stack Supabase LOKAL yang disposable (`127.0.0.1:54321`,
// ditulis oleh `scripts/integration/supabase-bootstrap.sh` lewat
// `scratch/sidak-local-db/seed-slik-baseline.sh`), BUKAN project remote repo.
//
// Tiga lapis menjaga itu:
//   1. Kredensial hanya dibaca dari `apps/api/.env.integration` (git-ignored) dan
//      host-nya WAJIB loopback, kalau tidak spec berhenti sebelum apa pun.
//   2. `globalThis.fetch` dibungkus fail-closed: host non-loopback di-`abort`
//      dan dicatat, jadi tidak ada jalan egress walau pin env somehow gagal.
//   3. Env Supabase di-pin ke nilai lokal itu HANYA selama import router, lalu
//      dikembalikan — lihat `loadTemuanRouter`.
const ENV_KEYS_PINNED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type LocalEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

const INTEGRATION_ENV_PATH = path.join(REPO_ROOT, "apps/api/.env.integration");

function readLocalEnv(): LocalEnv {
  if (!existsSync(INTEGRATION_ENV_PATH)) {
    throw new Error(
      "apps/api/.env.integration tidak ada. Jalankan:\n" +
        "  bash scratch/sidak-local-db/seed-slik-baseline.sh\n" +
        "Skrip itu hanya menyiapkan stack lokal yang disposable.",
    );
  }
  const raw = readFileSync(INTEGRATION_ENV_PATH, "utf8");
  const value = (key: string) =>
    raw.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();

  const dbUrl = value("SUPABASE_DB_URL");
  const apiUrl = value("SUPABASE_URL");
  if (!dbUrl || !apiUrl) {
    throw new Error("apps/api/.env.integration tidak lengkap");
  }
  // Fail-closed: TIDAK BOLEH menunjuk ke project remote.
  assertLoopback(new URL(dbUrl).hostname, "SUPABASE_DB_URL");
  assertLoopback(new URL(apiUrl).hostname, "SUPABASE_URL");

  return {
    dbUrl,
    apiUrl,
    anonKey: value("SUPABASE_ANON_KEY") ?? "",
    serviceRoleKey: value("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

function assertLoopback(host: string, label: string): void {
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1" &&
    host !== "[::1]"
  ) {
    throw new Error(
      `[e2e guard] ${label} menunjuk ke host NON-loopback: ${host}. ` +
        "Spesifikasi ini hanya boleh berjalan terhadap database lokal disposable.",
    );
  }
}

const LOCAL_ENV = readLocalEnv();

/**
 * State guard disimpan di `globalThis`, bukan di modul, karena Playwright
 * mengevaluasi ulang file spec ini lebih dari sekali (collection lalu run).
 * Pembungkus `fetch` berbasis modul saja akan rusak: `fetch` dibungkus dua kali
 * dan log attempt terbagi ke dua array berbeda, sehingga assertion "tidak ada
 * outbound" akan selalu hijau tanpa membuktikan apa pun.
 *
 * `allAttempts`/`remoteAttempts` harus di singleton dengan alasan yang sama:
 * wrapper dibuat pada evaluasi pertama, test berjalan pada evaluasi kedua.
 */
type GuardState = {
  originalFetch: typeof globalThis.fetch;
  fetchPatched: boolean;
  allAttempts: string[];
  remoteAttempts: string[];
};

const GUARD_KEY = Symbol.for("trainers.sidak.temuanDates.e2eGuard");
const globalScope = globalThis as typeof globalThis & {
  [GUARD_KEY]?: GuardState;
};

const guard: GuardState = (globalScope[GUARD_KEY] ??= {
  originalFetch: globalThis.fetch,
  fetchPatched: false,
  allAttempts: [],
  remoteAttempts: [],
});

/**
 * Teardown `fetch`. `process.env` SENGAJA tidak dipin di level modul — lihat
 * `loadTemuanRouter`. Playwright menjalankan tiap file spec di proses worker
 * yang diwarisi dari proses sebelumnya, sehingga pin env di level modul bocor ke
 * file lain dan tidak bisa dipulihkan dari dalam file ini. Env dipin hanya
 * selama import router dan langsung dikembalikan setelahnya.
 */
test.afterAll(() => {
  globalThis.fetch = guard.originalFetch;
  guard.fetchPatched = false;
});

// ── Fail-closed fetch guard ────────────────────────────────────────────────
/**
 * Log outbound fetch ada di `guard` (lihat catatan pada `GuardState`).
 *
 * Guard ini membuktikan "service tidak pernah dipanggil": URL lokal sendiri
 * loopback, jadi guard _connection_ tidak akan menandainya. Yang dibuktikan di
 * sini adalah TIDAK ADA outbound sama sekali pada jalur validasi.
 */

/** Host loopback, untuk input berupa hostname (bukan URL lengkap). */
function isLoopbackHost(host: string): boolean {
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]"
  );
}

/** URL loopback, untuk input berupa URL lengkap (dipakai fetch guard). */
function isLoopbackUrl(raw: string): boolean {
  try {
    return isLoopbackHost(new URL(raw).hostname);
  } catch {
    return false;
  }
}

// `guard.originalFetch` selalu fetch yang benar-benar asli, dan `fetchPatched`
// mencegah pembungkusan ganda saat Playwright mengevaluasi ulang file ini.
if (!guard.fetchPatched) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input?.url ?? String(input));
    guard.allAttempts.push(raw);
    if (!isLoopbackUrl(raw)) {
      guard.remoteAttempts.push(raw);
      throw new Error(
        `[e2e guard] egress non-loopback diblokir: ${raw} (spec ini tidak boleh menyentuh host remote)`,
      );
    }
    return guard.originalFetch(input, init);
  }) as typeof fetch;
  guard.fetchPatched = true;
}

function remoteAttemptsSince(mark: number): string[] {
  return guard.remoteAttempts.slice(mark);
}

/**
 * Bukti bahwa service TIDAK terpanggil: nol outbound fetch apa pun sejak `mark`.
 *
 * Ini yang membedakan penolakan yang BENAR (validasi tanggal, sebelum service)
 * dari penolakan yang salah (service terpanggil lalu gagal karena env lokal).
 * Contoh-contoh "salah" sudah nyata terjadi: preview mengembalikan
 * `VALIDATION_ERROR` dari catch block-nya setelah helper DB gagal, jadi status
 * dan `error.code` saja tidak cukup untuk membuktikan apa pun.
 */
/**
 * Jalankan SQL di database lokal disposable. Host sudah divalidasi loopback di
 * `readLocalEnv()`, jadi tidak ada jalur ke project remote dari helper ini.
 */
function sql(queryText: string): string {
  // `-q` WAJIB: `-t` saja tidak menekan command tag (`INSERT 0 1`), sehingga
  // `INSERT ... RETURNING` menghasilkan dua baris dan nilai skalar ikut tercemar.
  return execFileSync(
    "psql",
    [LOCAL_ENV.dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-tAc", queryText],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** Ambil satu nilai skalar; gagal keras kalau kosong atau lebih dari satu baris. */
function sqlOne(queryText: string): string {
  const lines = sql(queryText).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(
      `Diharapkan tepat 1 baris dari query, dapat ${lines.length}: ${queryText.slice(0, 120)}`,
    );
  }
  return lines[0]!;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sqlUuid(queryText: string): string {
  const value = sqlOne(queryText);
  if (!UUID_RE.test(value)) {
    throw new Error(`Bukan UUID yang sah: "${value}"`);
  }
  return value;
}

function outboundSince(mark: number): string[] {
  return guard.allAttempts.slice(mark);
}

// ── Helper ─────────────────────────────────────────────────────────────────
const UUID = {
  peserta: "11111111-1111-4111-8111-111111111111",
  period: "22222222-2222-4222-8222-222222222222",
  indicator: "33333333-3333-4333-8333-333333333333",
  temuan: "44444444-4444-4444-8444-444444444444",
};

/**
 * Payload batch LEGACY: tiga item parameter, tanpa tanggal apa pun.
 * Dipakai sebagai baseline kompatibilitas dan sebagai "baris lain" pada test
 * tanggal, supaya kegagalan sebuah test benar-benar karena aturan tanggal —
 * bukan karena item-nya sendiri tidak valid.
 */
function legacyBatchPayload() {
  return {
    peserta_id: UUID.peserta,
    period_id: UUID.period,
    service_type: "call",
    no_tiket: "TKT-E2E-001",
    items: [
      { indicator_id: UUID.indicator, nilai: 1, ketidaksesuaian: "Telat respon" },
      { indicator_id: UUID.indicator, nilai: 2, ketidaksesuaian: "Data salah" },
      { indicator_id: UUID.indicator, nilai: 0, ketidaksesuaian: "Kosong" },
    ],
  };
}

/**
 * Payload batch dengan satu item PARAMETER LAIN yang membawa tanggal.
 * Item tambahan ini lengkap (punya `indicator_id` + `nilai`), jadi kalau test
 * gagal, penyebabnya benar-benar aturan tanggal.
 */
function batchPayloadWithDate(
  field: "tanggal_layanan" | "tanggal_sampel",
  value: unknown,
) {
  const payload = legacyBatchPayload();
  return {
    ...payload,
    items: [
      ...payload.items,
      {
        indicator_id: UUID.indicator,
        nilai: 3,
        ketidaksesuaian: "Baris dengan tanggal",
        [field]: value,
      },
    ],
  };
}

type Envelope = {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

/** `token` dipakai route heatmap untuk membangun user client (RLS aktif). */
type TestEnv = {
  Variables: { user: unknown; profile: unknown; token?: unknown };
};

/**
 * Mount router temuan yang SEBENARNYA. Hanya identitas yang disuntikkan, karena
 * `authMiddleware` produksi butuh JWT Supabase asli. Role adalah satu-satunya
 * variabel yang diuji, jadi menyuntikkannya tidak melemahkan apa pun.
 */
/**
 * Memuat router temuan asli dengan env Supabase di-pin ke loopback mati HANYA
 * selama import, lalu langsung dipulihkan.
 *
 * Kenapa tidak men-pin di level modul: `apps/api/src/lib/env.ts` membaca
 * `.env.local` (project REMOTE) dan `supabaseAdmin` dibangun saat import. Kalau
 * dibiarkan ter-pin di `process.env`, pin itu diwarisi proses worker berikutnya
 * dan tidak bisa dipulihkan dari file ini — sempat terbukti: spec berikutnya
 * melihat `VITE_SUPABASE_URL=http://127.0.0.1:9/`.
 *
 * Pin hanya perlu bertahan sampai `lib/env` selesai mem-parse dan meng-export
 * snapshot-nya; setelah import selesai, modul yang sudah ter-import tidak lagi
 * membaca `process.env`, jadi env bisa dikembalikan dengan aman.
 */
let routerModulePromise: Promise<unknown> | null = null;

function loadTemuanRouter(): Promise<unknown> {
  routerModulePromise ??= (async () => {
    const saved = ENV_KEYS_PINNED.map((key) => [key, process.env[key]] as const);

    process.env.VITE_SUPABASE_URL = LOCAL_ENV.apiUrl;
    process.env.VITE_SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
    process.env.SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_ENV.serviceRoleKey;

    try {
      const mod = await import("../../api/src/routes/sidak/temuan");
      return mod.sidakTemuan;
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  })();

  return routerModulePromise;
}

async function mountRouter(role: string | undefined) {
  const sidakTemuan = (await loadTemuanRouter()) as never;

  const app = new Hono<TestEnv>()
    .use("*", async (c, next) => {
      c.set("user", { id: "user-test", email: "e2e@local.test" });
      c.set("profile", { role, full_name: "Uji Role" });
      await next();
    })
    .route("/", sidakTemuan as never);

  return async (
    routePath: string,
    init?: RequestInit,
  ): Promise<{ status: number; body: Envelope }> => {
    const res = await app.request(`http://local.test${routePath}`, init);
    let body: Envelope;
    try {
      body = (await res.json()) as Envelope;
    } catch {
      body = { success: false };
    }
    return { status: res.status, body };
  };
}

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
    expect(sidakTypes.createTemuanBatchSchema.safeParse(legacyBatchPayload()).success).toBe(
      true,
    );
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
    expect(schema.safeParse({ tanggal_layanan: "2026-02-28" }).success).toBe(true);
    expect(schema.safeParse({ tanggal_layanan: "2026-02-30" }).success).toBe(false);

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
        body: JSON.stringify(batchPayloadWithDate("tanggal_layanan", "2026-02-30")),
      });

      expect(res.status, `role ${role}`).toBe(403);
      expect(res.body.error?.code).toBe("FORBIDDEN");
      expect(remoteAttemptsSince(mark), "tidak boleh ada egress non-loopback").toEqual([]);
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
        body: JSON.stringify(batchPayloadWithDate("tanggal_layanan", "2026-02-30")),
      });

      expect(res.status, `role ${role}`).toBe(400);
      expect(res.body.error?.code, `role ${role}`).toBe("VALIDATION_ERROR");
      expect(remoteAttemptsSince(mark), "tidak boleh ada egress non-loopback").toEqual([]);
      expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
    }
  });

  test("preview menolak tanggal tidak nyata tanpa menyentuh database", async () => {
    const call = await mountRouter("trainer");
    const mark = guard.remoteAttempts.length;

    const res = await call("/temuan/batch/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchPayloadWithDate("tanggal_sampel", "2026-02-30")),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(remoteAttemptsSince(mark), "tidak boleh ada egress non-loopback").toEqual([]);
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
    expect(res.body.error?.message).not.toMatch(/postgres|supabase|pg_|SQLSTATE/i);
    expect(remoteAttemptsSince(mark), "tidak boleh ada egress non-loopback").toEqual([]);
    expect(outboundSince(mark), "service tidak boleh terpanggil").toEqual([]);
  });

  test("error tanggal dari batch juga manusiawi, bukan raw DB error", async () => {
    const call = await mountRouter("trainer");
    const res = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchPayloadWithDate("tanggal_sampel", "03/04/2026")),
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
// ── D. Persistence tanggal (route nyata + database disposable) ─────────────
/**
 * Bagian ini membuktikan tanggal benar-benar DISIMPAN dan DIBACA ULANG, bukan
 * sekadar lolos di payload mock. Semua lewat router Hono asli + database lokal
 * disposable, jadi tidak ada mock yang bisa menutupi mapping insert yang lupa
 * tanggal.
 *
 * Fixture dibuat per-run dan dibersihkan di `afterAll`. `profiler_peserta`
 * men-cascade ke `qa_temuan`, jadi menghapus peserta cukup untuk melapakan
 * semua baris temuan milik run ini.
 *
 * Layanan yang dipakai adalah `slik`: satu-satunya service type di stack lokal
 * yang punya versi aturan published beserta indikator active-nya, sehingga
 * jalur validasi batch (yang menolak indikator di luar rule aktif) bisa diuji
 * dengan data nyata.
 */
type TemuanFixture = {
  periodId: string;
  pesertaId: string;
  folderName: string;
  indicators: string[];
  ticketSeq: number;
};

let fx: TemuanFixture;

function fixtureSetup(): TemuanFixture {
  const periodId = sqlUuid(
    `SELECT id FROM public.qa_periods WHERE month = 1 AND year = 2026 LIMIT 1;`,
  );
  if (!periodId) {
    throw new Error(
      "Periode Januari 2026 tidak ada di DB lokal. Jalankan " +
        "bash scratch/sidak-local-db/seed-slik-baseline.sh",
    );
  }

  const indicators = sql(`
    SELECT i.id FROM public.qa_indicators i
    WHERE i.service_type = 'slik' AND i.is_active
      AND EXISTS (
        SELECT 1 FROM public.qa_service_rule_indicators r
        WHERE r.legacy_indicator_id = i.id
      )
    ORDER BY i.sort_order LIMIT 4;
  `)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (indicators.length < 4) {
    throw new Error(
      `Butuh ≥4 indikator SLIK aktif di rule, dapat ${indicators.length}. ` +
        "Jalankan bash scratch/sidak-local-db/seed-slik-baseline.sh",
    );
  }

  // Nama unik per run supaya folder lama dari run sebelumnya tidak bentrok.
  const folderName = `e2e-temuan-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const yearId = sqlUuid(
    `INSERT INTO public.profiler_years (year, label)
     VALUES (2026, 'E2E Temuan 2026')
     ON CONFLICT (year) DO UPDATE SET label = EXCLUDED.label
     RETURNING id;`,
  );
  sql(
    `INSERT INTO public.profiler_folders (name, year_id) VALUES ('${folderName}', '${yearId}');`,
  );
  const pesertaId = sqlUuid(
    `INSERT INTO public.profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
     VALUES ('${folderName}', 'Agen Uji Tanggal', 'Tim Uji', 'Agent', 1)
     RETURNING id;`,
  );

  return {
    periodId,
    pesertaId,
    folderName,
    indicators,
    ticketSeq: 0,
  };
}

/** Nomor tiket unik per item agar tidak saling ter-skip karena duplikat. */
function nextTicket(): string {
  fx.ticketSeq += 1;
  return `TKT-E2E-${fx.ticketSeq}`;
}

type BatchPayload = {
  peserta_id: string;
  period_id: string;
  service_type: string;
  no_tiket?: string;
  items: Array<Record<string, unknown>>;
};

/**
 * Batch dengan empat item PARAMETER BERBEDA. Item keempat opsionalnya membawa
 * tanggal, sehingga test tanggal bisa ditambahkan tanpa mengubah tiga item lain.
 */
function fixtureBatch(dates: Record<string, unknown> = {}): BatchPayload {
  return {
    peserta_id: fx.pesertaId,
    period_id: fx.periodId,
    service_type: "slik",
    items: [
      { indicator_id: fx.indicators[0]!, nilai: 1, ketidaksesuaian: "Telat respon", no_tiket: nextTicket() },
      { indicator_id: fx.indicators[1]!, nilai: 2, ketidaksesuaian: "Data salah", no_tiket: nextTicket() },
      { indicator_id: fx.indicators[2]!, nilai: 0, ketidaksesuaian: "Kosong", no_tiket: nextTicket() },
      {
        indicator_id: fx.indicators[3]!,
        nilai: 1,
        ketidaksesuaian: "Baris bertanggal",
        no_tiket: nextTicket(),
        ...dates,
      },
    ],
  };
}

/** Baris temuan milik peserta fixture, dibaca langsung dari DB. */
function rowsForPeserta(): Array<{
  id: string;
  no_tiket: string | null;
  tanggal_layanan: string | null;
  tanggal_sampel: string | null;
}> {
  const raw = sql(`
    SELECT id || '|' || COALESCE(no_tiket,'') || '|' ||
           COALESCE(tanggal_layanan::text,'') || '|' ||
           COALESCE(tanggal_sampel::text,'')
    FROM public.qa_temuan WHERE peserta_id = '${fx.pesertaId}'
    ORDER BY created_at ASC;
  `);
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, no_tiket, tanggal_layanan, tanggal_sampel] = line.split("|");
      return { id: id!, no_tiket, tanggal_layanan, tanggal_sampel };
    });
}

test.describe("Persistence tanggal (route nyata + DB disposable)", () => {
  test.beforeAll(() => {
    fx = fixtureSetup();
  });

  test.afterAll(() => {
    if (!fx?.pesertaId) return;
    // ON DELETE CASCADE ikut menghapus qa_temuan milik peserta ini.
    sql(`DELETE FROM public.profiler_peserta WHERE id = '${fx.pesertaId}';`);
    sql(`DELETE FROM public.profiler_folders WHERE name = '${fx.folderName}';`);
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
      body: JSON.stringify(
        fixtureBatch({ tanggal_layanan: "2026-01-20" }),
      ),
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
      `/temuan?peserta_id=${fx.pesertaId}&period_id=${fx.periodId}&limit=100`,
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
    expect(after.tanggal_layanan, "tanggal hilang saat field tidak dikirim").toBe(
      "2026-01-05",
    );
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
      body: JSON.stringify(
        fixtureBatch({ tanggal_layanan: "2026-02-30" }),
      ),
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(rowsForPeserta()).toHaveLength(before);
  });

  test("duplicate existing di-skip, tidak digandakan", async () => {
    const call = await mountRouter("trainer");
    const payload = fixtureBatch({ tanggal_layanan: "2026-03-01" });
    const total = sql(
      `SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${fx.pesertaId}';`,
    );

    const first = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    expect((first.body.data as any)?.inserted).toBe(4);
    expect(sql(`SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${fx.pesertaId}';`)).toBe(
      String(Number(total) + 4),
    );

    // Payload identik: tiket + indikator sama → semua harus di-skip.
    const second = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(201);
    const data = second.body.data as any;
    expect(data.inserted).toBe(0);
    expect(data.skipped).toBe(4);
    expect(
      sql(`SELECT count(*) FROM public.qa_temuan WHERE peserta_id = '${fx.pesertaId}';`),
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

// ── E. Heatmap agregasi (JWT + RLS pada DB disposable) ──────────────────────
/**
 * Heatmap diuji lewat router Hono ASLI dengan JWT user NYATA dari stack lokal,
 * jadi RLS benar-benar berlaku — bukan client service-role yang selectivity
 * everything.
 *
 * Role diuji dengan injeksi dari middleware test (JWT asli tetap dipakai untuk
 * query, jadi RLS tetap sungguhan).
 */
import { createClient } from "@supabase/supabase-js";
import { getSidakHeatmap } from "../../api/src/services/sidak/heatmap-service";
import { buildMockAuth } from "./helpers/mockAuth";

type HeatmapEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

function heatmapEnv(): HeatmapEnv {
  return {
    apiUrl: LOCAL_ENV.apiUrl,
    anonKey: LOCAL_ENV.anonKey,
    serviceRoleKey: LOCAL_ENV.serviceRoleKey,
  };
}

/** Route heatmap berada di router sendiri (bukan bagian dari `sidakTemuan`). */
async function mountHeatmapRouter(
  role: string | undefined,
  token: string,
  userId = "user-test",
) {
  // Pin env loopback HANYA selama import modul route (yang meng-import `lib/env`
  // + `supabaseAdmin`). Tanpa ini, worker yang di-restart Playwright bisa
  // mengevaluasi `lib/env` tanpa `VITE_SUPABASE_URL` dan keluar dengan exit 1.
  const saved = ENV_KEYS_PINNED.map((key) => [key, process.env[key]] as const);
  process.env.VITE_SUPABASE_URL = LOCAL_ENV.apiUrl;
  process.env.VITE_SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
  process.env.SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_ENV.serviceRoleKey;
  let sidakHeatmap: unknown;
  try {
    ({ sidakHeatmap } = await import("../../api/src/routes/sidak/heatmap"));
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const app = new Hono<TestEnv>()
    .use("*", async (c, next) => {
      c.set("user", { id: userId, email: "e2e@local.test" });
      c.set("profile", { role, full_name: "Uji Role" });
      // Token dikirim sebagai parameter, bukan dibaca dari scope luar: variabel
      // `trainerToken` hidup di dalam describe, sehingga membacanya dari sini
      // menghasilkan ReferenceError di dalam middleware — yang Hono ubah jadi
      // 500, bukan 403.
      c.set("token", token);
      await next();
    })
    .route("/", sidakHeatmap as never);

  return async (routePath: string, init?: RequestInit) => {
    const res = await app.request(`http://local.test${routePath}`, init);
    let body: Envelope;
    try {
      body = (await res.json()) as Envelope;
    } catch {
      body = { success: false };
    }
    return { status: res.status, body };
  };
}

/** Client service-role untuk menyiapkan fixture (bukan untuk query heatmap). */
function admin() {
  return createClient(heatmapEnv().apiUrl, heatmapEnv().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/** Buat user sungguhan dan kembalikan JWT-nya. */
async function createUserWithJwt(role: "trainer" | "leader") {
  const env = heatmapEnv();
  const email = `e2e-heatmap-${role}-${Date.now()}@local.test`;
  const password = "Probe-Passw0rd!";
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });
  if (created.error) throw created.error;
  const userId = created.data.user!.id;

  // Profil menentukan role; RLS `read_all` hanya untuk authenticated.
  const { error: profileError } = await admin()
    .from("profiles")
    .upsert({
      id: userId,
      email,
      full_name: `E2E ${role}`,
      role,
      status: "active",
      is_deleted: false,
    });
  if (profileError) throw profileError;

  const client = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { userId, token: signedIn.data.session!.access_token };
}

function userClient(token: string) {
  return createClient(heatmapEnv().apiUrl, heatmapEnv().anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

/** Sisipkan temuan langsung lewat service-role, lalu hitung heatmap-nya. */
async function seedRows(
  periodId: string,
  pesertaId: string,
  indicatorId: string,
  rows: Array<{
    indicator_id?: string;
    service_type?: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    is_phantom_padding?: boolean;
    no_tiket?: string | null;
    tanggal_layanan?: string | null;
    tanggal_sampel?: string | null;
  }>,
) {
  const payload = rows.map((r) => ({
    peserta_id: pesertaId,
    period_id: periodId,
    indicator_id: r.indicator_id ?? indicatorId,
    service_type: r.service_type ?? "slik",
    nilai: r.nilai,
    ketidaksesuaian: r.ketidaksesuaian ?? "",
    sebaiknya: "",
    no_tiket: r.no_tiket ?? null,
    is_phantom_padding: r.is_phantom_padding ?? false,
    tanggal_layanan: r.tanggal_layanan ?? null,
    tanggal_sampel: r.tanggal_sampel ?? null,
  }));
  const { error } = await admin().from("qa_temuan").insert(payload);
  if (error) throw error;
}

/**
 * Beri seorang leader scope SIDAK lewat rantai access_groups yang sama dengan
 * produksi: request approved → request_groups → access_group_items.
 */
function seedLeaderSidakScope(
  userId: string,
  pesertaId: string,
  serviceTypes: string[] = [],
): string {
  const groupId = sqlUuid(
    `INSERT INTO public.access_groups (name, description, is_active)
     VALUES ('e2e-heatmap-leader-${Date.now()}-${Math.floor(Math.random() * 1e6)}', 'e2e', true)
     RETURNING id;`,
  );
  sql(
    `INSERT INTO public.access_group_items (access_group_id, field_name, field_value, is_active)
     VALUES ('${groupId}', 'peserta_id', '${pesertaId}', true);`,
  );
  for (const serviceType of serviceTypes) {
    sql(
      `INSERT INTO public.access_group_items (access_group_id, field_name, field_value, is_active)
       VALUES ('${groupId}', 'service_type', '${serviceType}', true);`,
    );
  }
  const requestId = sqlUuid(
    `INSERT INTO public.leader_access_requests (leader_user_id, module, status)
     VALUES ('${userId}', 'sidak', 'approved')
     RETURNING id;`,
  );
  sql(
    `INSERT INTO public.leader_access_request_groups (request_id, access_group_id)
     VALUES ('${requestId}', '${groupId}');`,
  );
  return groupId;
}

test.describe("Heatmap agregasi", () => {
  let fx: TemuanFixture;
  let trainerToken: string;
  let leaderToken: string;
  let trainerUserId: string;
  let leaderUserId: string;
  let lockedLeaderUserId: string;
  let lockedLeaderToken: string;

  let otherPesertaId: string | null = null;
  const leaderGroupIds: string[] = [];

  test.beforeAll(async () => {
    fx = fixtureSetup();
    const trainer = await createUserWithJwt("trainer");
    const leader = await createUserWithJwt("leader");
    const lockedLeader = await createUserWithJwt("leader");
    trainerToken = trainer.token;
    leaderUserId = leader.userId;
    trainerUserId = trainer.userId;
    leaderToken = leader.token;
    lockedLeaderUserId = lockedLeader.userId;
    lockedLeaderToken = lockedLeader.token;

    // Scope leader: satu tanpa lock layanan, satu terkunci ke `call`.
    leaderGroupIds.push(seedLeaderSidakScope(leaderUserId, fx.pesertaId));
    leaderGroupIds.push(
      seedLeaderSidakScope(lockedLeaderUserId, fx.pesertaId, ["call"]),
    );
  });

  test.afterAll(async () => {
    if (otherPesertaId) {
      sql(`DELETE FROM public.profiler_peserta WHERE id = '${otherPesertaId}';`);
    }
    if (fx?.pesertaId) {
      sql(`DELETE FROM public.profiler_peserta WHERE id = '${fx.pesertaId}';`);
      sql(`DELETE FROM public.profiler_folders WHERE name = '${fx.folderName}';`);
    }
    if (leaderGroupIds.length > 0) {
      sql(
        `DELETE FROM public.access_groups WHERE id IN ('${leaderGroupIds.join("','")}');`,
      );
    }
    for (const id of [trainerUserId, leaderUserId, lockedLeaderUserId]) {
      if (id) await admin().auth.admin.deleteUser(id);
    }
  });

  test("satu tiket tiga parameter = tiga temuan", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "A", tanggal_layanan: "2026-01-05" },
      { nilai: 1, ketidaksesuaian: "B", tanggal_layanan: "2026-01-05" },
      { nilai: 1, ketidaksesuaian: "C", tanggal_layanan: "2026-01-05" },
    ]);

    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const day = res.days.find((d) => d.date === "2026-01-05")!;
    expect(day.count).toBeGreaterThanOrEqual(3);
  });

  test("satuan per-tiket menghitung distinct no_tiket per hari", async () => {
    const beforeParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    const day = "2026-05-05";
    // Satu tiket boleh punya banyak parameter, tapi constraint unik DB
    // membedakannya lewat `indicator_id` — jadi tiap baris memakai indikator
    // berbeda dengan nomor tiket yang sama.
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { indicator_id: fx.indicators[0]!, nilai: 1, ketidaksesuaian: "A", no_tiket: "TKT-SAME", tanggal_layanan: day },
      { indicator_id: fx.indicators[1]!, nilai: 1, ketidaksesuaian: "B", no_tiket: "TKT-SAME", tanggal_layanan: day },
      { indicator_id: fx.indicators[2]!, nilai: 1, ketidaksesuaian: "C", no_tiket: "TKT-SAME", tanggal_layanan: day },
      { indicator_id: fx.indicators[3]!, nilai: 1, ketidaksesuaian: "D", no_tiket: "TKT-OTHER", tanggal_layanan: day },
      // Tanpa nomor tiket tidak bisa dikelompokkan → dihitung per baris.
      { indicator_id: fx.indicators[0]!, nilai: 1, ketidaksesuaian: "E", no_tiket: null, tanggal_layanan: day },
    ]);

    const afterParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const afterTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    const countAt = (
      res: Awaited<ReturnType<typeof getSidakHeatmap>>,
      date: string,
    ) => res.days.find((d) => d.date === date)!.count;

    // Parameter: 5 baris baru = 5 temuan. Tiket: 3 (TKT-SAME, TKT-OTHER, null).
    expect(countAt(afterParam, day) - countAt(beforeParam, day)).toBe(5);
    expect(countAt(afterTicket, day) - countAt(beforeTicket, day)).toBe(3);
    expect(afterTicket.countBy).toBe("tiket");
    expect(afterTicket.totalFindings).toBe(
      afterTicket.days.reduce((sum, d) => sum + d.count, 0),
    );
  });

  test("satuan per-tiket juga berlaku pada temuan tanpa tanggal", async () => {
    const beforeParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { indicator_id: fx.indicators[0]!, nilai: 1, ketidaksesuaian: "N1", no_tiket: "TKT-NULL" },
      { indicator_id: fx.indicators[1]!, nilai: 1, ketidaksesuaian: "N2", no_tiket: "TKT-NULL" },
      { indicator_id: fx.indicators[2]!, nilai: 1, ketidaksesuaian: "N3", no_tiket: null },
    ]);

    const afterParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const afterTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    expect(
      afterParam.missingDateFindingsAllPeriods -
        beforeParam.missingDateFindingsAllPeriods,
    ).toBe(3);
    expect(
      afterTicket.missingDateFindingsAllPeriods -
        beforeTicket.missingDateFindingsAllPeriods,
    ).toBe(2);
  });

  test("filter agent_id hanya menghitung agent tersebut", async () => {
    otherPesertaId = sqlUuid(
      `INSERT INTO public.profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
       VALUES ('${fx.folderName}', 'Agen Kedua E2E', 'Tim Uji', 'Agent', 2)
       RETURNING id;`,
    );
    const day = "2026-06-06";
    await seedRows(fx.periodId, otherPesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "Agent lain", tanggal_layanan: day },
    ]);

    const all = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const onlyOther = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      agentId: otherPesertaId,
    });
    const onlyFirst = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      agentId: fx.pesertaId,
    });

    const countAt = (
      res: Awaited<ReturnType<typeof getSidakHeatmap>>,
      date: string,
    ) => res.days.find((d) => d.date === date)!.count;

    expect(countAt(all, day)).toBeGreaterThanOrEqual(1);
    expect(countAt(onlyOther, day)).toBe(1);
    expect(onlyOther.totalFindings).toBe(1);
    expect(onlyOther.agentId).toBe(otherPesertaId);
    // Agent pertama tidak punya baris pada tanggal itu.
    expect(countAt(onlyFirst, day)).toBe(0);
  });

  test("mode memakai kolom tanggal yang berbeda", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[1]!, [
      { nilai: 1, ketidaksesuaian: "X", tanggal_layanan: "2026-02-10", tanggal_sampel: "2026-03-11" },
    ]);

    const agent = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const qa = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "qa",
      year: 2026,
    });

    expect(agent.days.find((d) => d.date === "2026-02-10")!.count).toBeGreaterThanOrEqual(1);
    expect(agent.days.find((d) => d.date === "2026-03-11")!.count).toBe(0);
    expect(qa.days.find((d) => d.date === "2026-03-11")!.count).toBeGreaterThanOrEqual(1);
    expect(qa.days.find((d) => d.date === "2026-02-10")!.count).toBe(0);
    expect(agent.dateBasis).toBe("tanggal_layanan");
    expect(qa.dateBasis).toBe("tanggal_sampel");
  });

  test("phantom dan baris complies dikeluarkan", async () => {
    const before = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[2]!, [
      { nilai: 1, ketidaksesuaian: "Asli", tanggal_layanan: "2026-04-10" },
      { nilai: 3, ketidaksesuaian: "", tanggal_layanan: "2026-04-11" },
      { nilai: 1, ketidaksesuaian: "Phantom", tanggal_layanan: "2026-04-12", is_phantom_padding: true },
    ]);
    const after = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });

    expect(after.days.find((d) => d.date === "2026-04-10")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-10")!.count + 1,
    );
    // Completes (nilai 3 tanpa catatan) tidak menambah hitungan.
    expect(after.days.find((d) => d.date === "2026-04-11")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-11")!.count,
    );
    // Phantom tidak pernah dihitung.
    expect(after.days.find((d) => d.date === "2026-04-12")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-12")!.count,
    );
  });

  test("tahun tanpa data tetap punya 365/366 hari penuh", async () => {
    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2024,
    });
    expect(res.days.length).toBe(366); // 2024 leap
    expect(res.days.some((d) => d.date === "2024-02-29")).toBe(true);
    expect(res.days.every((d) => d.count === 0)).toBe(true);

    const nonLeap = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2025,
    });
    expect(nonLeap.days.length).toBe(365);
    expect(nonLeap.days.some((d) => d.date === "2025-02-29")).toBe(false);
  });

  test("temuan tanpa tanggal dihitung pada scope seluruh periode", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[3]!, [
      { nilai: 1, ketidaksesuaian: "Tanpa tanggal" },
    ]);

    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    // Baris ini tidak boleh masuk kalender, tapi WAJIB muncul di metadata.
    expect(res.totalFindings).toBe(
      res.days.reduce((sum, d) => sum + d.count, 0),
    );
    expect(res.missingDateFindingsAllPeriods).toBeGreaterThanOrEqual(1);
  });

  /**
   * REGRESI P1 — `missingDateFindingsAllPeriods` harus memakai predikat yang
   * SAMA dengan kalender (countable, non-phantom, satu baris = satu temuan).
   *
   * Bug baseline: jalur `count: "exact"` mengembalikan hitungan MENTAH semua
   * baris non-phantom bertanggal-null, termasuk baris `nilai=3` tanpa catatan
   * yang sebenarnya complies. Akibatnya kartu "Tanggal belum diisi"
   * menggelembung dan tidak sepakat dengan `days`.
   *
   * Delta diukur sebelum/sesudah agar tidak bergantung pada baris test lain.
   */
  async function missingCount(
    mode: "agent" | "qa",
    serviceType?: "slik" | "call",
  ): Promise<number> {
    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode,
      year: 2026,
      serviceType,
    });
    return res.missingDateFindingsAllPeriods;
  }

  test("hitungan tanpa tanggal hanya countable, tepat per mode dan filter layanan", async () => {
    const agentBefore = await missingCount("agent");
    const qaBefore = await missingCount("qa");
    const callBefore = await missingCount("agent", "call");

    // Tiga baris countable (nilai<3 atau catatan) pada layanan default (slik)…
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "countable A" },
      { nilai: 2, ketidaksesuaian: "countable B" },
      { nilai: 0, ketidaksesuaian: "" },
      // …plus baris complies yang TIDAK boleh dihitung: nilai 3 tanpa catatan.
      { nilai: 3, ketidaksesuaian: "" },
      { nilai: 3, ketidaksesuaian: "   " },
      // Phantom selalu keluar, meski countable.
      { nilai: 1, ketidaksesuaian: "phantom", is_phantom_padding: true },
    ]);

    // Filter layanan: satu countable + satu complies pada layanan lain.
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[1]!, [
      { service_type: "call", nilai: 1, ketidaksesuaian: "countable call" },
      { service_type: "call", nilai: 3, ketidaksesuaian: "" },
    ]);

    // Tepat +4 (3 slik + 1 call countable), bukan +7 (semua baris non-phantom
    // null-date).
    expect(await missingCount("agent")).toBe(agentBefore + 4);
    expect(await missingCount("qa")).toBe(qaBefore + 4);
    // Filter layanan memisahkan call dari slik.
    expect(await missingCount("agent", "call")).toBe(callBefore + 1);

    // Konsistensi eksplisit: metadata wajib sepakat dengan kalender.
    const agent = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    expect(agent.totalFindings).toBe(
      agent.days.reduce((sum, d) => sum + d.count, 0),
    );
  });

  /**
   * REGRESI P5 — paging > 1.000 baris harus lengkap dan tetap menyaring
   * countable. PostgREST membatasi satu halaman 1.000 baris; kalau agregasi
   * tidak memakai `fetchAllPages`, hitungan terpotong atau memakai `count`
   * mentah yang ikut menghitung baris complies.
   */
  test("hitungan tanpa tanggal tetap tepat di atas 1.000 baris (paging penuh)", async () => {
    const before = await missingCount("agent");
    const COUNTABLE = 1005;
    const CLEAN = 7;

    const base = {
      peserta_id: fx.pesertaId,
      period_id: fx.periodId,
      indicator_id: fx.indicators[0]!,
      service_type: "slik",
      sebaiknya: "",
      no_tiket: null,
      is_phantom_padding: false,
      tanggal_layanan: null,
      tanggal_sampel: null,
    };
    const payload = [
      ...Array.from({ length: COUNTABLE }, () => ({
        ...base,
        nilai: 1,
        ketidaksesuaian: "bulk countable",
      })),
      ...Array.from({ length: CLEAN }, () => ({
        ...base,
        nilai: 3,
        ketidaksesuaian: "",
      })),
    ];

    const { error } = await admin().from("qa_temuan").insert(payload);
    expect(error).toBeNull();

    // Tepat +1005, bukan +1012 (semua baris null-date) dan bukan 1000 (terpotong).
    expect(await missingCount("agent")).toBe(before + COUNTABLE);
  });

  /**
   * P5 (kalender): agregasi `days`/`totalFindings` juga harus lengkap di atas
   * 1.000 baris dan tetap mengeluarkan baris complies. Test sebelumnya hanya
   * membuktikan paging pada hitungan tanggal-null.
   */
  test("kalender >1.000 baris menghitung countable tepat dan mengeluarkan complies", async () => {
    const date = "2026-08-15";
    const before = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeDay = before.days.find((d) => d.date === date)!.count;
    const beforeTotal = before.totalFindings;

    const COUNTABLE = 1005;
    const CLEAN = 7;
    const base = {
      peserta_id: fx.pesertaId,
      period_id: fx.periodId,
      indicator_id: fx.indicators[0]!,
      service_type: "slik",
      sebaiknya: "",
      no_tiket: null,
      is_phantom_padding: false,
      tanggal_layanan: date,
      tanggal_sampel: null,
    };
    const payload = [
      ...Array.from({ length: COUNTABLE }, () => ({
        ...base,
        nilai: 1,
        ketidaksesuaian: "kalender countable",
      })),
      ...Array.from({ length: CLEAN }, () => ({
        ...base,
        nilai: 3,
        ketidaksesuaian: "",
      })),
    ];
    const { error } = await admin().from("qa_temuan").insert(payload);
    expect(error).toBeNull();

    const after = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    expect(after.days.find((d) => d.date === date)!.count).toBe(
      beforeDay + COUNTABLE,
    );
    expect(after.totalFindings).toBe(beforeTotal + COUNTABLE);
  });

  /**
   * Kegagalan halaman lanjutan tidak boleh menjadi sukses parsial/kosong.
   * Client palsu mengembalikan satu halaman penuh (1000 baris) lalu gagal.
   */
  test("kegagalan halaman lanjutan menggagalkan respons, bukan data parsial", async () => {
    // `fetchAllPages` memanggil `build` sekali per halaman, dan `build` memanggil
    // `.from()` lagi setiap kali — jadi status "halaman pertama" harus hidup di
    // closure client, bukan di builder. Kalau tidak, setiap panggilan kembali
    // "halaman pertama" dan loop paging tidak pernah berhenti.
    let servedFirstPage = false;
    function failingSecondPageClient() {
      const makeBuilder = () => {
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is", "gte", "lte", "order"]) {
          builder[method] = () => builder;
        }
        builder.range = () => {
          if (!servedFirstPage) {
            servedFirstPage = true;
            return Promise.resolve({
              data: Array.from({ length: 1000 }, (_, i) => ({
                id: `page-1-${i}`,
                nilai: 1,
                ketidaksesuaian: "x",
                sebaiknya: null,
                tanggal: null,
              })),
              error: null,
            });
          }
          return Promise.resolve({
            data: null,
            error: new Error("probe: halaman kedua gagal"),
          });
        };
        return builder;
      };
      return { from: () => makeBuilder() } as never;
    }

    await expect(
      getSidakHeatmap({
        supabase: failingSecondPageClient(),
        mode: "agent",
        year: 2026,
      }),
    ).rejects.toThrow("probe: halaman kedua gagal");
  });

  test("leader hanya melihat agent dalam scope-nya", async () => {
    const call = await mountHeatmapRouter("leader", leaderToken, leaderUserId);
    const res = await call("/heatmap?mode=agent&year=2026");
    expect(res.status).toBe(200);
    const data = res.body.data as {
      agentId: string | null;
      days: Array<{ date: string; count: number }>;
    };
    const countAt = (date: string) =>
      data.days.find((d) => d.date === date)!.count;

    // Hari milik agent dalam scope terlihat…
    expect(countAt("2026-01-05")).toBeGreaterThanOrEqual(1);
    // …dan hari milik agent di luar scope TIDAK terlihat (baris 2026-06-06
    // dibuat oleh test `filter agent_id` pada agent kedua).
    expect(countAt("2026-06-06")).toBe(0);
  });

  test("leader ditolak meminta agent di luar scope, diizinkan di dalam scope", async () => {
    expect(otherPesertaId).not.toBeNull();
    const call = await mountHeatmapRouter("leader", leaderToken, leaderUserId);

    const forbidden = await call(
      `/heatmap?mode=agent&year=2026&agent_id=${otherPesertaId}`,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error?.code).toBe("FORBIDDEN");

    const allowed = await call(
      `/heatmap?mode=agent&year=2026&agent_id=${fx.pesertaId}`,
    );
    expect(allowed.status).toBe(200);
  });

  test("leader terkunci layanan ditolak meminta layanan lain", async () => {
    const call = await mountHeatmapRouter(
      "leader",
      lockedLeaderToken,
      lockedLeaderUserId,
    );
    const forbidden = await call(
      "/heatmap?mode=agent&year=2026&service_type=slik",
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error?.code).toBe("FORBIDDEN");

    const allowed = await call(
      "/heatmap?mode=agent&year=2026&service_type=call",
    );
    expect(allowed.status).toBe(200);
  });

  test("parameter tidak valid ditolak 400", async () => {
    const call = await mountHeatmapRouter("trainer", trainerToken);
    for (const query of [
      "/heatmap?mode=bogus&year=2026",
      "/heatmap?mode=agent&year=abc",
      "/heatmap?mode=agent&year=1800",
      "/heatmap?mode=agent&year=2026&service_type=invalid",
      "/heatmap?mode=agent&year=2026&count_by=bogus",
      "/heatmap?mode=agent&year=2026&agent_id=not-a-uuid",
    ]) {
      const res = await call(query);
      expect(res.status, query).toBe(400);
      expect(res.body.error?.code, query).toBe("VALIDATION_ERROR");
    }
  });

  test("query gagal menjadi error, bukan heatmap kosong", async () => {
    /**
     * Injeksi kegagalan DETERMINISTIK di lapisan client, bukan lewat jaringan.
     * Client jaringan membuat supabase-js melakukan retry, sehingga assertion
     * jadi tidak stabil dan tidak membuktikan apa pun.
     *
     * Yang diuji adalah kontraknya: kegagalan query harus DILEWARKAN sebagai
     * error. Kalau dil swallow, heatmap akan tampil "tidak ada temuan" padahal
     * datanya gagal dimuat — kesimpulan yang lebih buruk daripada error.
     */
    const broken = {
      from() {
        throw new Error("probe: sumber data tidak bisa diakses");
      },
    } as never;

    await expect(
      getSidakHeatmap({ supabase: broken, mode: "agent", year: 2026 }),
    ).rejects.toThrow("probe: sumber data tidak bisa diakses");
  });
});
