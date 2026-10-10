/**
 * Integrasi end-to-end heatmap SIDAK — Fase 7.
 *
 * Kontrak yang dibuktikan DI SINI, dan hanya di sini:
 *   create/preview/PUT/DELETE lewat ROUTER Hono ASLI (bukan service-role
 *   langsung) → persist ke DB lokal disposable → DUA mode heatmap dibaca
 *   dengan JWT user (RLS aktif) → edit tanggal MEMINDAHKAN hitungan →
 *   delete MENGURANGI hitungan → skor/ranking tidak berubah karena tanggal.
 *
 * Service-role hanya dipakai untuk menyiapkan/membersihkan fixture dan untuk
 * MEMBACA skor lewat service backend (bukan untuk mutasi bisnis). Mutasi bisnis
 * selalu lewat route asli dengan identity admin/trainer, sama seperti produksi.
 *
 * Keamanan target: kredensial dibaca dari `apps/api/.env.integration`
 * (git-ignored) dan host WAJIB loopback; `globalThis.fetch` dibungkus
 * fail-closed supaya tidak ada egress walau pin env gagal.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

const PERIOD_ID = "32e01554-79f1-4b05-b007-d73f451be60c";
const INDICATOR_IDS = [
  "357b53bb-a7c2-4431-9c8f-76e824bcd2cb",
  "8a856193-3aaf-433a-bb34-1fb72ba4c9f6",
  "ba6ee170-ff66-47b4-afe7-17250d4708ff",
];

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const INTEGRATION_ENV = path.join(REPO_ROOT, "apps/api/.env.integration");

function assertLoopback(host: string, label: string): void {
  if (
    host !== "127.0.0.1" &&
    host !== "localhost" &&
    host !== "::1" &&
    host !== "[::1]"
  ) {
    throw new Error(
      `[e2e guard] ${label} menunjuk ke host NON-loopback: ${host}. ` +
        "Spec ini hanya boleh berjalan terhadap database lokal disposable.",
    );
  }
}

function localEnv(): Record<string, string> {
  if (!existsSync(INTEGRATION_ENV)) {
    throw new Error("apps/api/.env.integration tidak ada");
  }
  const raw = readFileSync(INTEGRATION_ENV, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) out[m[1]] = m[2]!.trim();
  }
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"]) {
    if (!out[key]) throw new Error(`${key} tidak ada di .env.integration`);
  }
  for (const key of ["SUPABASE_URL", "SUPABASE_DB_URL"]) {
    // Regex, bukan `new URL()`: skema `postgresql://` tidak selalu bisa di-parse
    // konsisten oleh WHATWG URL.
    const host = out[key]!.replace(/^[a-z]+:\/\//i, "").replace(/^[^@/]*@/, "");
    assertLoopback(host.split(/[/:]/)[0]!, key);
  }
  return out;
}

const LOCAL = localEnv();

function admin() {
  return createClient(LOCAL.SUPABASE_URL!, LOCAL.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function sql(query: string): string {
  const dbUrl = LOCAL.SUPABASE_DB_URL!;
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// ── Fail-closed fetch guard ────────────────────────────────────────────────
type GuardState = {
  originalFetch: typeof globalThis.fetch;
  installed: boolean;
  remoteAttempts: string[];
};
const GUARD_KEY = Symbol.for("trainers.sidak.heatmapIntegration.e2eGuard");
const globalScope = globalThis as typeof globalThis & { [GUARD_KEY]?: GuardState };
const guard: GuardState = (globalScope[GUARD_KEY] ??= {
  originalFetch: globalThis.fetch,
  installed: false,
  remoteAttempts: [],
});

function isLoopbackUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

if (!guard.installed) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input?.url ?? String(input));
    if (!isLoopbackUrl(raw)) {
      guard.remoteAttempts.push(raw);
      throw new Error(`[e2e guard] egress non-loopback diblokir: ${raw}`);
    }
    return guard.originalFetch(input, init);
  }) as typeof fetch;
  guard.installed = true;
}

test.afterAll(() => {
  globalThis.fetch = guard.originalFetch;
  guard.installed = false;
});

// ── Router temuan asli (identity disuntik, seperti produksi) ────────────────
const ENV_KEYS_PINNED = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Envelope = {
  success: boolean;
  data?: any;
  error?: { code: string; message: string };
};

type ApiModules = {
  sidakTemuan: unknown;
  heatmapService: typeof import("../../api/src/services/sidak/heatmap-service");
};

/**
 * Semua modul `apps/api` dimuat di sini, di dalam pin env. JANGAN meng-import
 * modul `apps/api` secara statis di file ini: import statis di-hoist dan
 * berjalan sebelum pin, sehingga `lib/env` mengunci env REMOTE dari `.env.local`
 * untuk seluruh worker dan semua query diblokir guard egress.
 */
let apiModulesPromise: Promise<ApiModules> | null = null;
function loadApiModules(): Promise<ApiModules> {
  apiModulesPromise ??= (async () => {
    const saved = ENV_KEYS_PINNED.map((key) => [key, process.env[key]] as const);
    process.env.VITE_SUPABASE_URL = LOCAL.SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = LOCAL.SUPABASE_ANON_KEY ?? "";
    process.env.SUPABASE_ANON_KEY = LOCAL.SUPABASE_ANON_KEY ?? "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const [{ env: apiEnv }, temuan, heatmapService] = await Promise.all([
        import("../../api/src/lib/env"),
        import("../../api/src/routes/sidak/temuan"),
        import("../../api/src/services/sidak/heatmap-service"),
      ]);
      // Fail-closed: berhenti sebelum query kalau modul API terikat ke remote.
      assertLoopback(
        new URL(apiEnv.VITE_SUPABASE_URL).hostname,
        "API lib/env VITE_SUPABASE_URL",
      );
      return { sidakTemuan: temuan.sidakTemuan, heatmapService };
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  })();
  return apiModulesPromise;
}

async function getSidakHeatmap(
  ...args: Parameters<ApiModules["heatmapService"]["getSidakHeatmap"]>
) {
  return (await loadApiModules()).heatmapService.getSidakHeatmap(...args);
}

async function mountTemuanRouter(role: string | undefined) {
  const sidakTemuan = (await loadApiModules()).sidakTemuan as never;
  const app = new Hono<{
    Variables: { user: unknown; profile: unknown };
  }>()
    .use("*", async (c, next) => {
      c.set("user", { id: "user-integration", email: "e2e-int@local.test" });
      c.set("profile", { role, full_name: "Uji Integrasi" });
      await next();
    })
    .route("/", sidakTemuan as never);

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

async function createUserWithJwt(role: "trainer" | "leader") {
  const email = `e2e-heatmap-int-${role}-${Date.now()}@local.test`;
  const password = "Probe-Passw0rd!";
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });
  if (created.error) throw created.error;
  const userId = created.data.user!.id;
  const { error: profileError } = await admin().from("profiles").upsert({
    id: userId,
    email,
    full_name: `E2E ${role}`,
    role,
    status: "active",
    is_deleted: false,
  });
  if (profileError) throw profileError;

  const client = createClient(LOCAL.SUPABASE_URL!, LOCAL.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { userId, token: signedIn.data.session!.access_token };
}

function userClient(token: string) {
  return createClient(LOCAL.SUPABASE_URL!, LOCAL.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function anonClient() {
  return createClient(LOCAL.SUPABASE_URL!, LOCAL.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/** Buang field tanggal/timestamp supaya perbandingan fokus ke skor/ranking. */
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^tanggal_/.test(k) || k === "created_at" || k === "updated_at") continue;
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return value;
}

test.describe("Integrasi heatmap end-to-end (route nyata + JWT/RLS + DB lokal)", () => {
  let pesertaId: string;
  let folderName: string;
  let trainerToken: string;
  let trainerUserId: string;
  let leaderUserId: string;

  const batchPayload = (dates: Record<string, unknown> = {}) => ({
    peserta_id: pesertaId,
    period_id: PERIOD_ID,
    service_type: "slik",
    no_tiket: `TKT-INT-${Date.now()}`,
    items: [
      { indicator_id: INDICATOR_IDS[0], nilai: 1, ketidaksesuaian: "Telat respon", ...dates },
      { indicator_id: INDICATOR_IDS[1], nilai: 1, ketidaksesuaian: "Data salah", ...dates },
      { indicator_id: INDICATOR_IDS[2], nilai: 1, ketidaksesuaian: "Dokumen kurang", ...dates },
    ],
  });

  async function countOn(mode: "agent" | "qa", date: string): Promise<number> {
    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken) as never,
      mode,
      year: 2026,
    });
    return res.days.find((d) => d.date === date)?.count ?? 0;
  }

  function rowsForPeserta() {
    const raw = sql(`
      SELECT id || '|' || COALESCE(tanggal_layanan::text,'') || '|' ||
             COALESCE(tanggal_sampel::text,'')
      FROM public.qa_temuan WHERE peserta_id = '${pesertaId}'
      ORDER BY created_at ASC;
    `);
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, tanggal_layanan, tanggal_sampel] = line.split("|");
        return { id: id!, tanggal_layanan, tanggal_sampel };
      });
  }

  test.beforeAll(async () => {
    folderName = `e2e-heatmap-int-${Date.now()}`;
    const yearId = sql(
      `INSERT INTO public.profiler_years (year, label) VALUES (2026,'E2E')
       ON CONFLICT (year) DO UPDATE SET label=EXCLUDED.label RETURNING id;`,
    );
    sql(`INSERT INTO public.profiler_folders (name, year_id) VALUES ('${folderName}','${yearId}');`);
    pesertaId = sql(
      `INSERT INTO public.profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
       VALUES ('${folderName}','Agen Integrasi','Tim Uji','Agent',1) RETURNING id;`,
    );
    const trainer = await createUserWithJwt("trainer");
    const leader = await createUserWithJwt("leader");
    trainerToken = trainer.token;
    trainerUserId = trainer.userId;
    leaderUserId = leader.userId;
  });

  test.afterAll(async () => {
    if (pesertaId) {
      sql(`DELETE FROM public.profiler_peserta WHERE id='${pesertaId}';`);
      sql(`DELETE FROM public.profiler_folders WHERE name='${folderName}';`);
    }
    for (const id of [trainerUserId, leaderUserId]) {
      if (id) await admin().auth.admin.deleteUser(id);
    }
  });

  test("route nyata + JWT/RLS: create → dua mode → PUT memindahkan → DELETE mengurangi", async () => {
    const call = await mountTemuanRouter("trainer");

    // 1. Preview + create lewat route asli (bukan service-role).
    const payload = batchPayload({
      tanggal_layanan: "2026-06-01",
      tanggal_sampel: "2026-07-01",
    });
    const preview = await call("/temuan/batch/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(preview.status).toBe(200);
    expect(preview.body.success).toBe(true);

    const created = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    expect(created.body.data.inserted).toBe(3);

    // Persistence dibaca ULANG dari DB, bukan dari respons.
    expect(rowsForPeserta()).toHaveLength(3);
    expect(rowsForPeserta().every((r) => r.tanggal_layanan === "2026-06-01")).toBe(true);

    // 2. Dua mode membaca kolom berbeda, lewat JWT (RLS aktif).
    expect(await countOn("agent", "2026-06-01")).toBe(3);
    expect(await countOn("qa", "2026-07-01")).toBe(3);

    // 3. PUT route asli memindahkan tanggal sampel satu baris.
    const targetId = rowsForPeserta()[0]!.id;
    const moved = await call(`/temuan/${targetId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tanggal_sampel: "2026-07-03" }),
    });
    expect(moved.status).toBe(200);

    expect(await countOn("qa", "2026-07-01")).toBe(2);
    expect(await countOn("qa", "2026-07-03")).toBe(1);

    // 4. DELETE route asli mengurangi hitungan.
    const removed = await call(`/temuan/${targetId}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    expect(await countOn("qa", "2026-07-03")).toBe(0);
    expect(rowsForPeserta()).toHaveLength(2);

    // 5. RLS nyata: anon TIDAK bisa melihat baris peserta ini (denied/0 baris)
    //    sementara JWT trainer melihatnya. Bukti akses bukan "kebetulan kosong".
    const anonRows = await anonClient()
      .from("qa_temuan")
      .select("id")
      .eq("peserta_id", pesertaId);
    expect(anonRows.data ?? []).toHaveLength(0);
    expect(anonRows.error).not.toBeNull();
    const trainerRows = await userClient(trainerToken)
      .from("qa_temuan")
      .select("id")
      .eq("peserta_id", pesertaId);
    expect(trainerRows.error).toBeNull();
    expect(trainerRows.data ?? []).toHaveLength(2);
  });

  test("role leader ditolak oleh route temuan (batch)", async () => {
    const call = await mountTemuanRouter("leader");
    const denied = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchPayload()),
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("FORBIDDEN");
  });

  test("skor/ranking tidak berubah karena tanggal tambahan (output backend nyata)", async () => {
    const call = await mountTemuanRouter("trainer");
    const created = await call("/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchPayload()),
    });
    expect(created.status).toBe(201);

    // `supabaseAdmin` di `lib/env` sudah terikat loopback setelah `loadApiModules`.
    const { getAgentDetail } = await import(
      "../../api/src/services/sidak/agent-directory"
    );
    const before = await getAgentDetail(pesertaId, 2026, "slik");
    const beforeStable = JSON.stringify(stripVolatile(before));

    // Isi tanggal lewat route asli pada setiap baris.
    for (const row of rowsForPeserta()) {
      const res = await call(`/temuan/${row.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tanggal_layanan: "2026-06-01",
          tanggal_sampel: "2026-07-01",
        }),
      });
      expect(res.status).toBe(200);
    }

    const after = await getAgentDetail(pesertaId, 2026, "slik");
    // Semua field non-tanggal (termasuk skor) harus identik.
    expect(JSON.stringify(stripVolatile(after))).toBe(beforeStable);

    // Dan tanggal benar-benar tersimpan (bukan karena update di-drop).
    expect(rowsForPeserta().every((r) => r.tanggal_layanan === "2026-06-01")).toBe(true);
  });
});
