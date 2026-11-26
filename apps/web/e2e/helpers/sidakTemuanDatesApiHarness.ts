// Shared by the sidak-temuan-dates-api-*.spec.ts files.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { seedSlikRuleFixture, type SlikRuleFixture } from "./sidakSlikFixture";
import { createClient } from "@supabase/supabase-js";
import { readLoopbackEnv } from "./sidakRealBackend";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

// ── Keamanan target ─────────────────────────────────────────────────────────
// Spec ini memakai stack Supabase LOKAL yang disposable (`127.0.0.1:54321`,
// ditulis oleh `scripts/integration/supabase-bootstrap.sh`), BUKAN project
// remote repo. Data SLIK yang dibutuhkan di-seed sendiri lewat
// `helpers/sidakSlikFixture.ts`.
//
// Tiga lapis menjaga itu:
//   1. Kredensial hanya dibaca dari `apps/api/.env.integration` (git-ignored) dan
//      host-nya WAJIB loopback, kalau tidak spec berhenti sebelum apa pun.
//   2. `globalThis.fetch` dibungkus fail-closed: host non-loopback di-`abort`
//      dan dicatat, jadi tidak ada jalan egress walau pin env somehow gagal.
//   3. Env Supabase di-pin ke nilai lokal itu HANYA selama import router, lalu
//      dikembalikan — lihat `loadApiModules`.
export const ENV_KEYS_PINNED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type LocalEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

export const INTEGRATION_ENV_PATH = path.join(
  REPO_ROOT,
  "apps/api/.env.integration",
);

export function readLocalEnv(): LocalEnv {
  if (process.env.E2E_SUPABASE_WORKDIR) return readLoopbackEnv();
  if (!existsSync(INTEGRATION_ENV_PATH)) {
    throw new Error(
      "apps/api/.env.integration tidak ada. Jalankan:\n" +
        "  bash scripts/integration/supabase-bootstrap.sh\n" +
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

export function assertLoopback(host: string, label: string): void {
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

export const LOCAL_ENV = readLocalEnv();

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
export type GuardState = {
  originalFetch: typeof globalThis.fetch;
  fetchPatched: boolean;
  allAttempts: string[];
  remoteAttempts: string[];
};

export const GUARD_KEY = Symbol.for("trainers.sidak.temuanDates.e2eGuard");

export const globalScope = globalThis as typeof globalThis & {
  [GUARD_KEY]?: GuardState;
};

export const guard: GuardState = (globalScope[GUARD_KEY] ??= {
  originalFetch: globalThis.fetch,
  fetchPatched: false,
  allAttempts: [],
  remoteAttempts: [],
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
export function isLoopbackHost(host: string): boolean {
  return (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]"
  );
}

/** URL loopback, untuk input berupa URL lengkap (dipakai fetch guard). */
export function isLoopbackUrl(raw: string): boolean {
  try {
    return isLoopbackHost(new URL(raw).hostname);
  } catch {
    return false;
  }
}

// `guard.originalFetch` selalu fetch yang benar-benar asli, dan `fetchPatched`
// mencegah pembungkusan ganda saat Playwright mengevaluasi ulang file ini.
export function installTemuanFetchGuard() {
  if (guard.fetchPatched) return;
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

export function remoteAttemptsSince(mark: number): string[] {
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
export function sql(queryText: string): string {
  // `-q` WAJIB: `-t` saja tidak menekan command tag (`INSERT 0 1`), sehingga
  // `INSERT ... RETURNING` menghasilkan dua baris dan nilai skalar ikut tercemar.
  return execFileSync(
    "psql",
    [LOCAL_ENV.dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-tAc", queryText],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** Ambil satu nilai skalar; gagal keras kalau kosong atau lebih dari satu baris. */
export function sqlOne(queryText: string): string {
  const lines = sql(queryText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(
      `Diharapkan tepat 1 baris dari query, dapat ${lines.length}: ${queryText.slice(0, 120)}`,
    );
  }
  return lines[0]!;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sqlUuid(queryText: string): string {
  const value = sqlOne(queryText);
  if (!UUID_RE.test(value)) {
    throw new Error(`Bukan UUID yang sah: "${value}"`);
  }
  return value;
}

export function outboundSince(mark: number): string[] {
  return guard.allAttempts.slice(mark);
}

// ── Helper ─────────────────────────────────────────────────────────────────
export const UUID = {
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
export function legacyBatchPayload() {
  return {
    peserta_id: UUID.peserta,
    period_id: UUID.period,
    service_type: "call",
    no_tiket: "TKT-E2E-001",
    items: [
      {
        indicator_id: UUID.indicator,
        nilai: 1,
        ketidaksesuaian: "Telat respon",
      },
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
export function batchPayloadWithDate(
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

export type Envelope = {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

/** `token` dipakai route heatmap untuk membangun user client (RLS aktif). */
export type TestEnv = {
  Variables: { user: unknown; profile: unknown; token?: unknown };
};

/**
 * Mount router temuan yang SEBENARNYA. Hanya identitas yang disuntikkan, karena
 * `authMiddleware` produksi butuh JWT Supabase asli. Role adalah satu-satunya
 * variabel yang diuji, jadi menyuntikkannya tidak melemahkan apa pun.
 */
/**
 * Memuat SEMUA modul API yang dipakai spec ini (router temuan, router heatmap,
 * heatmap service) dalam satu import ber-pin: env Supabase di-pin ke stack
 * lokal HANYA selama import, lalu langsung dipulihkan.
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
 *
 * JANGAN meng-import modul `apps/api` secara statis di file ini. Import statis
 * di-hoist dan berjalan sebelum pin, sehingga `lib/env` mengunci env REMOTE untuk
 * seluruh worker (pernah terjadi: 13 test persistence/heatmap gagal karena semua
 * query diblokir guard egress). Assertion loopback di bawah menangkapnya.
 */
export type ApiModules = {
  sidakTemuan: unknown;
  sidakHeatmap: unknown;
  heatmapService: typeof import("../../../api/src/services/sidak/heatmap-service");
};

export let apiModulesPromise: Promise<ApiModules> | null = null;

export function loadApiModules(): Promise<ApiModules> {
  apiModulesPromise ??= (async () => {
    const saved = ENV_KEYS_PINNED.map(
      (key) => [key, process.env[key]] as const,
    );

    process.env.VITE_SUPABASE_URL = LOCAL_ENV.apiUrl;
    process.env.VITE_SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
    process.env.SUPABASE_ANON_KEY = LOCAL_ENV.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_ENV.serviceRoleKey;

    try {
      const [{ env: apiEnv }, temuan, heatmap, heatmapService] =
        await Promise.all([
          import("../../../api/src/lib/env"),
          import("../../../api/src/routes/sidak/temuan"),
          import("../../../api/src/routes/sidak/heatmap"),
          import("../../../api/src/services/sidak/heatmap-service"),
        ]);
      // Fail-closed: kalau `lib/env` sudah ter-evaluasi sebelum pin, modul API
      // terikat ke project remote. Berhenti di sini, sebelum ada query.
      assertLoopback(
        new URL(apiEnv.VITE_SUPABASE_URL).hostname,
        "API lib/env VITE_SUPABASE_URL",
      );
      return {
        sidakTemuan: temuan.sidakTemuan,
        sidakHeatmap: heatmap.sidakHeatmap,
        heatmapService,
      };
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  })();

  return apiModulesPromise;
}

export async function mountRouter(role: string | undefined) {
  const sidakTemuan = (await loadApiModules()).sidakTemuan as never;

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
 * Layanan yang dipakai adalah `slik`. Fixture membuat periode, master indikator,
 * dan versi aturan published miliknya sendiri, sehingga jalur validasi batch
 * (yang menolak indikator di luar rule aktif) diuji dengan data nyata tanpa
 * baseline yang di-seed manual.
 */
export type TemuanFixture = {
  slik: SlikRuleFixture;
  periodId: string;
  pesertaId: string;
  folderName: string;
  indicators: string[];
  ticketSeq: number;
};

// Set by the persistence describe's beforeAll; a holder so the helpers below
// can live in a shared module.
export const persistence: { fx: TemuanFixture } = {
  fx: undefined as unknown as TemuanFixture,
};

export function fixtureSetup(): TemuanFixture {
  // Periode, master indikator, dan versi aturan published dibuat sendiri per
  // run, jadi spec tidak bergantung pada baseline SLIK yang di-seed manual.
  const slik = seedSlikRuleFixture(sql, {
    label: "e2e-temuan-dates",
    indicatorCount: 4,
  });
  const periodId = slik.periodId;
  const indicators = slik.indicators.map((indicator) => indicator.id);

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
    slik,
    periodId,
    pesertaId,
    folderName,
    indicators,
    ticketSeq: 0,
  };
}

/** Nomor tiket unik per item agar tidak saling ter-skip karena duplikat. */
export function nextTicket(): string {
  persistence.fx.ticketSeq += 1;
  return `TKT-E2E-${persistence.fx.ticketSeq}`;
}

export type BatchPayload = {
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
export function fixtureBatch(
  dates: Record<string, unknown> = {},
): BatchPayload {
  return {
    peserta_id: persistence.fx.pesertaId,
    period_id: persistence.fx.periodId,
    service_type: "slik",
    items: [
      {
        indicator_id: persistence.fx.indicators[0]!,
        nilai: 1,
        ketidaksesuaian: "Telat respon",
        no_tiket: nextTicket(),
      },
      {
        indicator_id: persistence.fx.indicators[1]!,
        nilai: 2,
        ketidaksesuaian: "Data salah",
        no_tiket: nextTicket(),
      },
      {
        indicator_id: persistence.fx.indicators[2]!,
        nilai: 0,
        ketidaksesuaian: "Kosong",
        no_tiket: nextTicket(),
      },
      {
        indicator_id: persistence.fx.indicators[3]!,
        nilai: 1,
        ketidaksesuaian: "Baris bertanggal",
        no_tiket: nextTicket(),
        ...dates,
      },
    ],
  };
}

/** Baris temuan milik peserta fixture, dibaca langsung dari DB. */
export function rowsForPeserta(): Array<{
  id: string;
  no_tiket: string | null;
  tanggal_layanan: string | null;
  tanggal_sampel: string | null;
}> {
  const raw = sql(`
    SELECT id || '|' || COALESCE(no_tiket,'') || '|' ||
           COALESCE(tanggal_layanan::text,'') || '|' ||
           COALESCE(tanggal_sampel::text,'')
    FROM public.qa_temuan WHERE peserta_id = '${persistence.fx.pesertaId}'
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

// ── E. Heatmap agregasi (JWT + RLS pada DB disposable) ──────────────────────
/**
 * Heatmap diuji lewat router Hono ASLI dengan JWT user NYATA dari stack lokal,
 * jadi RLS benar-benar berlaku — bukan client service-role yang selectivity
 * everything.
 *
 * Role diuji dengan injeksi dari middleware test (JWT asli tetap dipakai untuk
 * query, jadi RLS tetap sungguhan).
 */

/** Heatmap service asli, dimuat lewat `loadApiModules` (bukan import statis). */
export async function getSidakHeatmap(
  ...args: Parameters<ApiModules["heatmapService"]["getSidakHeatmap"]>
) {
  return (await loadApiModules()).heatmapService.getSidakHeatmap(...args);
}

export type HeatmapEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function heatmapEnv(): HeatmapEnv {
  return {
    apiUrl: LOCAL_ENV.apiUrl,
    anonKey: LOCAL_ENV.anonKey,
    serviceRoleKey: LOCAL_ENV.serviceRoleKey,
  };
}

/** Route heatmap berada di router sendiri (bukan bagian dari `sidakTemuan`). */
export async function mountHeatmapRouter(
  role: string | undefined,
  token: string,
  userId = "user-test",
) {
  const { sidakHeatmap } = await loadApiModules();
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
export function admin() {
  return createClient(heatmapEnv().apiUrl, heatmapEnv().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/** Buat user sungguhan dan kembalikan JWT-nya. */
export async function createUserWithJwt(role: "trainer" | "leader") {
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

export function userClient(token: string) {
  return createClient(heatmapEnv().apiUrl, heatmapEnv().anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

/** Sisipkan temuan langsung lewat service-role, lalu hitung heatmap-nya. */
export async function seedRows(
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
export function seedLeaderSidakScope(
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
