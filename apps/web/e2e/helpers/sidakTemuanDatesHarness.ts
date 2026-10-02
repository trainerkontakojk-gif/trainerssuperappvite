/**
 * Harness E2E untuk tanggal temuan SIDAK di halaman Input Audit (`/sidak/input`).
 *
 * Berdiri di atas `mockAuth.ts` dan memakai allowlist fail-closed seperti
 * `sidakJadwalShiftingHarness.ts`: satu-satunya host yang boleh disentuh adalah
 * dev-server lokal (termasuk `/api` yang di-mock) dan endpoint auth Supabase
 * yang di-mock. Host lain di-`abort` supaya spec ini tidak bisa diam-diam
 * menyentuh database remote.
 *
 * Data di dalam harness ini SINTETIS. Tidak ada baris nyata yang diambil dari
 * database mana pun.
 */

import { expect, type Page, type Route } from "@playwright/test";
import { mockSupabaseAuth } from "./mockAuth";

export const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/**
 * Allowlist endpoint `/api` yang boleh menyentuh proxy dev. Tanpa daftar ini,
 * guard akan meneruskan SEMUA `/api` ke API sungguhan — dan API itu menunjuk ke
 * project remote. Endpoint yang tidak di-mock di sini di-abort.
 */
const MOCKED_API: RegExp[] = [
  /^\/api\/v1\/me\/access-status$/,
  /^\/api\/v1\/sidak\/folders$/,
  /^\/api\/v1\/sidak\/periods$/,
  /^\/api\/v1\/sidak\/resolved-input-config$/,
  /^\/api\/v1\/sidak\/agents$/,
  /^\/api\/v1\/sidak\/temuan$/,
  /^\/api\/v1\/sidak\/temuan\/batch$/,
  /^\/api\/v1\/sidak\/temuan\/batch\/preview$/,
  /^\/api\/v1\/sidak\/temuan\/[^/]+$/,
  /^\/api\/v1\/sidak\/heatmap$/,
];

export type Audit = {
  mockedApi: string[];
  mockedAuth: string[];
  localDev: number;
  blockedApi: string[];
  blockedExternal: string[];
  allowedFonts: string[];
};

export function startAudit(): Audit {
  return {
    mockedApi: [],
    mockedAuth: [],
    localDev: 0,
    blockedApi: [],
    blockedExternal: [],
    allowedFonts: [],
  };
}

function toJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

export const FIXTURE = {
  folder: { id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", name: "Batch Uji" },
  period: { id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", month: 1, year: 2026 },
  agent: {
    id: "cccccccc-3333-4333-8333-cccccccccccc",
    nama: "Agen Uji Tanggal",
    batch_name: "Batch Uji",
    tim: "Tim Uji",
    jabatan: "Agent",
  },
  indicators: [
    {
      id: "dddddddd-4444-4444-8444-ddddddddddd1",
      service_type: "call",
      name: "Kesesuaian Data",
      category: "non_critical",
      bobot: 0.15,
      parameter_group: null,
      is_active: true,
    },
    {
      id: "dddddddd-4444-4444-8444-ddddddddddd2",
      service_type: "call",
      name: "Kesesuaian Foto",
      category: "non_critical",
      bobot: 0.15,
      parameter_group: null,
      is_active: true,
    },
    {
      id: "dddddddd-4444-4444-8444-ddddddddddd3",
      service_type: "call",
      name: "Kelengkapan Dokumen",
      category: "critical",
      bobot: 0.4,
      parameter_group: null,
      is_active: true,
    },
  ],
} as const;

export type StoredTemuan = {
  id: string;
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  service_type: string;
  no_tiket: string | null;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  tanggal_layanan: string | null;
  tanggal_sampel: string | null;
  is_phantom_padding: boolean;
};

/** Store findings yang benar-benar diubah oleh spec (bukan mock-opaque). */
const store = new Map<string, StoredTemuan>();
const captures: Array<{ kind: string; body: any }> = [];
let seq = 0;

export function resetStore(): void {
  store.clear();
  captures.length = 0;
  seq = 0;
}

export function allRows(): StoredTemuan[] {
  return [...store.values()];
}

export function captured(kind: string): any[] {
  return captures.filter((c) => c.kind === kind).map((c) => c.body);
}

/** Jumlah item pada batch terakhir yang benar-benar diterima server. */
export function lastBatchItems(): any[] {
  const batches = captured("batch");
  return batches.length ? batches[batches.length - 1].items : [];
}

export function nextId(): string {
  seq += 1;
  return `eeeeeeee-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

/** Perilaku endpoint batch yang bisa dikontrol per test. */
export type BatchBehavior =
  | { kind: "ok" }
  | { kind: "error"; status: number; message: string };

/**
 * Override fixture katalog (folder/periode/agent/indikator) supaya halaman UI
 * dapat diarahkan ke ID NYATA di DB lokal disposable. Default tetap fixture
 * sintetis, jadi spec mock-only tidak berubah.
 */
export type HarnessFixture = {
  folder: { id: string; name: string };
  period: { id: string; month: number; year: number };
  agent: {
    id: string;
    nama: string;
    batch_name: string;
    tim: string;
    jabatan: string;
  };
  indicators: Array<{
    id: string;
    service_type: string;
    name: string;
    category: string;
    bobot: number;
    parameter_group: string | null;
    is_active: boolean;
  }>;
};

/**
 * Jembatan ke backend Hono NYATA (in-process). Dipakai untuk test integrasi
 * browser: request fitur dari halaman diteruskan ke router asli dengan JWT
 * user nyata; bukan mock dan bukan "plausible success".
 */
export type RealApiForwarder = {
  request: (
    pathAndQuery: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ status: number; bodyText: string }>;
};

export type HarnessOptions = {
  role?: string;
  batch?: BatchBehavior;
  fixture?: HarnessFixture;
  realApi?: RealApiForwarder;
};

export async function openInputAudit(
  page: Page,
  audit: Audit,
  opts: HarnessOptions = {},
): Promise<void> {
  const { role = "trainer", batch = { kind: "ok" }, fixture = FIXTURE } = opts;

  await mockSupabaseAuth(page, { role });

  // Bootstrap `LeaderAccessGate`.
  await page.route(`${APP_ORIGIN}/api/v1/me/access-status*`, async (route) => {
    audit.mockedApi.push(new URL(route.request().url()).pathname);
    await route.fulfill(
      toJson({
        success: true,
        data: {
          sidak: { status: "none", module: "sidak", created_at: null },
          ktp: { status: "none", module: "ktp", created_at: null },
        },
      }),
    );
  });

  await page.route(`${APP_ORIGIN}/api/v1/sidak/folders*`, async (route) => {
    audit.mockedApi.push(new URL(route.request().url()).pathname);
    await route.fulfill(toJson({ success: true, data: [fixture.folder] }));
  });

  await page.route(`${APP_ORIGIN}/api/v1/sidak/periods*`, async (route) => {
    audit.mockedApi.push(new URL(route.request().url()).pathname);
    await route.fulfill(toJson({ success: true, data: [fixture.period] }));
  });

  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/resolved-input-config*`,
    async (route) => {
      audit.mockedApi.push(new URL(route.request().url()).pathname);
      await route.fulfill(
        toJson({
          success: true,
          data: {
            indicators: fixture.indicators,
            weight: {
              critical_weight: 0.6,
              non_critical_weight: 0.4,
              scoring_mode: "weighted",
            },
            ruleVersionId: null,
            hasDraftVersion: false,
          },
        }),
      );
    },
  );

  await page.route(`${APP_ORIGIN}/api/v1/sidak/agents*`, async (route) => {
    audit.mockedApi.push(new URL(route.request().url()).pathname);
    await route.fulfill(toJson({ success: true, data: [fixture.agent] }));
  });

  if (!opts.realApi) {
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/temuan/batch/preview*`,
    async (route) => {
      audit.mockedApi.push("preview");
      const body = route.request().postDataJSON();
      captures.push({ kind: "preview", body });

      const invalid = body.items.filter(
        (i: any) => !i.indicator_id || typeof i.nilai !== "number",
      );
      const skipped = body.items.filter((i: any) =>
        [...store.values()].some(
          (row) =>
            row.no_tiket?.toLowerCase() ===
              (i.no_tiket ?? body.no_tiket ?? "").toLowerCase() &&
            row.indicator_id === i.indicator_id,
        ),
      );
      const valid = body.items.filter(
        (i: any) => !invalid.includes(i) && !skipped.includes(i),
      );

      await route.fulfill(
        toJson({
          success: true,
          data: {
            valid,
            invalid: invalid.map((i: any) => ({
              indicator_id: i.indicator_id,
              error: "Indikator tidak ditemukan di database",
            })),
            skipped,
            stats: {
              valid_count: valid.length,
              invalid_count: invalid.length,
              skipped_count: skipped.length,
            },
            active_rule_version_id: null,
          },
        }),
      );
    },
  );

  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/temuan/batch`,
    async (route) => {
      audit.mockedApi.push("batch");
      const body = route.request().postDataJSON();
      captures.push({ kind: "batch", body });

      if (batch.kind === "error") {
        await route.fulfill(
          toJson(
            {
              success: false,
              error: { code: "INSERT_ERROR", message: batch.message },
            },
            batch.status,
          ),
        );
        return;
      }

      let inserted = 0;
      let skipped = 0;
      for (const item of body.items) {
        const ticket = item.no_tiket ?? body.no_tiket ?? null;
        const dup = [...store.values()].some(
          (row) =>
            row.no_tiket?.toLowerCase() === (ticket ?? "").toLowerCase() &&
            row.indicator_id === item.indicator_id,
        );
        if (dup) {
          skipped += 1;
          continue;
        }
        const rowId = nextId();
        store.set(rowId, {
          id: rowId,
          peserta_id: body.peserta_id,
          period_id: body.period_id,
          indicator_id: item.indicator_id,
          service_type: body.service_type,
          no_tiket: ticket,
          nilai: item.nilai,
          ketidaksesuaian: item.ketidaksesuaian ?? null,
          sebaiknya: item.sebaiknya ?? null,
          // Persis seperti backend: tanggal disimpan per baris, `?? null`.
          tanggal_layanan: item.tanggal_layanan ?? null,
          tanggal_sampel: item.tanggal_sampel ?? null,
          is_phantom_padding: false,
        });
        inserted += 1;
      }

      await route.fulfill(
        toJson(
          {
            success: true,
            data: { inserted, skipped, total: body.items.length },
          },
          201,
        ),
      );
    },
  );

  /**
   * CATATAN URUTAN: Playwright mengecocokkan route dalam urutan TERBALIK dari
   * pendaftaran. Pola di sini sengaja memakai `fallback()` supaya rantai
   * terpecah dengan benar:
   *   GET  /temuan?…    → dicocokkan `temuan?*` (paling akhir didaftarkan)
   *   PUT/DELETE /temuan/:id → dicocokkan `temuan/*`
   *   POST /temuan/batch     → `temuan/*` fallback → `batch`
   *   POST /temuan/batch/preview → fallback → `batch` tidak cocok → `preview`
   * Tanpa fallback, `temuan/*` akan menelan POST batch dan membalas 404.
   */
  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/temuan/*`,
    async (route: Route) => {
      const url = new URL(route.request().url());
      const id = url.pathname.split("/").pop()!;
      const method = route.request().method();
      audit.mockedApi.push(`temuan:${method}`);

      if (method !== "PUT" && method !== "DELETE") {
        // Bukan milik handler ini — teruskan ke pola yang lebih spesifik.
        await route.fallback();
        return;
      }

      if (method === "PUT") {
        const body = route.request().postDataJSON();
        captures.push({ kind: "update", body });
        const row = store.get(id);
        if (!row) {
          await route.fulfill(
            toJson(
              { success: false, error: { code: "UPDATE_ERROR", message: "Tidak ditemukan" } },
              400,
            ),
          );
          return;
        }
        // Hanya key yang terkirim yang berubah — persis kontrak backend.
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined) (row as any)[key] = value;
        }
        await route.fulfill(toJson({ success: true, data: row }));
        return;
      }

      store.delete(id);
      await route.fulfill(toJson({ success: true, data: null }));
    },
  );

  await page.route(
    `${APP_ORIGIN}/api/v1/sidak/temuan?*`,
    async (route) => {
      audit.mockedApi.push("temuan:GET");
      const rows = [...store.values()].filter(
        (r) => r.peserta_id === fixture.agent.id,
      );
      await route.fulfill(
        toJson({ success: true, data: { items: rows, total: rows.length } }),
      );
    },
  );
  }

  if (opts.realApi) {
    await installFeatureForwarding(page, opts.realApi, audit);
  }

  await installGuard(page, audit);

  // `domcontentloaded`, bukan default `load`: koneksi HMR membuat event
  // `load` tidak pernah sampai sehingga aksi Playwright menggantung.
  await page.goto(
    `/sidak/input?folder=${encodeURIComponent(fixture.folder.name)}&agent_id=${fixture.agent.id}`,
    { waitUntil: "domcontentloaded" },
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAppDevServer(url: URL): boolean {
  return url.hostname === APP_URL.hostname && url.port === APP_URL.port;
}

/**
 * Teruskan request fitur (temuan + heatmap) dari browser ke router Hono NYATA
 * in-process. Dipakai test integrasi browser: katalog/auth tetap fixture, tapi
 * mutasi bisnis dan heatmap TIDAK di-mock. Didaftarkan SEBELUM guard supaya
 * guard (yang diperiksa lebih dulu) melepas path ini lewat `fallback` ke sini.
 */
async function installFeatureForwarding(
  page: Page,
  realApi: RealApiForwarder,
  audit: Audit,
): Promise<void> {
  await page.route(/\/api\/v1\/sidak\/(temuan|heatmap).*$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    audit.mockedApi.push(`${request.method()} ${url.pathname}`);
    const pathAndQuery = url.pathname.replace(/^\/api/, "") + url.search;
    const result = await realApi.request(pathAndQuery, {
      method: request.method(),
      headers: { "content-type": "application/json" },
      body: request.postData() ?? undefined,
    });
    await route.fulfill({
      status: result.status,
      contentType: "application/json",
      body: result.bodyText,
    });
  });
}

async function installGuard(page: Page, audit: Audit) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const origin = route.request().url();

    if (origin.startsWith(SUPABASE_ORIGIN)) {
      audit.mockedAuth.push(url.pathname);
      await route.fallback();
      return;
    }

    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "ws:" ||
      url.protocol === "wss:"
    ) {
      if (isAppDevServer(url)) {
        if (isApiPath(url.pathname)) {
          // Hanya endpoint yang di-mock boleh lewat ke proxy dev.
          if (!MOCKED_API.some((re) => re.test(url.pathname))) {
            audit.blockedApi.push(origin);
            await route.abort("blockedbyclient");
            return;
          }
        } else {
          audit.localDev += 1;
        }
        await route.fallback();
        return;
      }
      if (EXTERNAL_FONT_HOSTS.includes(url.hostname)) {
        audit.allowedFonts.push(url.hostname);
        await route.fallback();
        return;
      }
      if (isApiPath(url.pathname)) audit.blockedApi.push(origin);
      else audit.blockedExternal.push(origin);
      await route.abort("blockedbyclient");
      return;
    }

    await route.fallback();
  });
}

export function expectIsolation(audit: Audit, opts: { minApi?: number } = {}) {
  const { minApi = 1 } = opts;
  expect(
    audit.blockedExternal,
    "browser menghubungi host eksternal yang tidak diizinkan",
  ).toEqual([]);
  expect(audit.blockedApi, "browser mengirim /api di luar allowlist").toEqual([]);
  expect(audit.mockedApi.length).toBeGreaterThanOrEqual(minApi);
}