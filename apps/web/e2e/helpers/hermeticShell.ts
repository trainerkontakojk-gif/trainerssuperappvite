/**
 * Harness shell terautentikasi HERMETIC.
 *
 * Dipakai spec yang ingin membuktikan shell + navigasi aplikasi tanpa backend.
 * Tiga hal yang wajib, dan sudah dipenuhi di sini:
 *
 *   1. Sesi mock lengkap, TERMASUK refresh token (`POST /auth/v1/token`). Tanpa
 *      mock itu, supabase-js melakukan SIGNED_OUT saat bootstrap dan aplikasi
 *      redirect ke landing — inilah yang membuat shell tidak pernah muncul.
 *   2. SATU guard jaringan fail-closed yang menangani semua request: hanya
 *      dokumen/aset dev-server lokal, tiga jalur auth yang dimock, dan `/api`
 *      yang PERSIS ada di allowlist yang boleh lewat. Sisanya di-abort.
 *   3. Audit yang bisa di-assert spec, sehingga "hermetic" dibuktikan, bukan
 *      diklaim.
 *
 * Catatan: spec pemanggil wajib menjalankan `assertLocalDevOnlyTarget()` (dari
 * `sidakJadwalShiftingHarness.ts`) di `beforeAll` sebelum memakai harness ini,
 * supaya target terbukti dev-server lokal. Duplikasi tiga salinan preflight itu
 * dicatat sebagai temuan terpisah.
 */

import { expect, type Page, type Route } from "@playwright/test";
import { installMockAuthSession, type MockAuthOptions } from "./mockAuth";

export const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

/**
 * Host aset pihak ketiga yang memang dirujuk markup index/landing.
 *
 * Tetap DIBLOKIR (tidak ada egress); hanya tidak dihitung sebagai temuan
 * `blockedExternal`, karena aset dekoratif yang sudah diketahui bukan traffic
 * aplikasi. Host di luar daftar ini tetap menggagalkan `expectHermetic`.
 */
const DEFAULT_EXPECTED_ASSET_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

export type ApiMock = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** pathname saja, tanpa origin. RegExp diuji terhadap `pathname + search`. */
  path: string | RegExp;
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};

export type ShellAudit = {
  mockedApi: string[];
  mockedAuth: string[];
  localDev: number;
  blockedApi: string[];
  blockedAuth: string[];
  blockedExternal: string[];
};

export type HermeticShellOptions = {
  /** Route aplikasi yang dibuka, mis. `/dashboard`. */
  path: string;
  /** `/api` yang boleh dijawab. Yang tidak ada di sini akan di-abort. */
  apiMocks?: readonly ApiMock[];
  /**
   * `false` = sengaja TANPA sesi (mode tamu). Saat itu setiap panggilan auth
   * Supabase dicatat sebagai `blockedAuth`, jadi spec tamu yang diam-diam
   * mencoba memakai sesi akan gagal, bukan lulus tanpa bukti.
   */
  auth?: MockAuthOptions | false;
  /**
   * Host aset pihak ketiga tambahan yang dirujuk halaman ini dan boleh diblokir
   * tanpa dihitung sebagai egress tak terduga. Tetap di-abort.
   */
  expectedThirdPartyHosts?: readonly string[];
  /** Pola URL yang ditunggu setelah navigasi. Default: string `options.path`. */
  waitForUrl?: string | RegExp;
};

export function startAudit(): ShellAudit {
  return {
    mockedApi: [],
    mockedAuth: [],
    localDev: 0,
    blockedApi: [],
    blockedAuth: [],
    blockedExternal: [],
  };
}

export function formatAudit(audit: ShellAudit): string {
  return [
    `mockedApi=${JSON.stringify(audit.mockedApi)}`,
    `mockedAuth=${JSON.stringify(audit.mockedAuth)}`,
    `localDev=${audit.localDev}`,
    `blockedApi=${JSON.stringify(audit.blockedApi)}`,
    `blockedAuth=${JSON.stringify(audit.blockedAuth)}`,
    `blockedExternal=${JSON.stringify(audit.blockedExternal)}`,
  ].join(" ");
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

function matchesApiMock(
  mock: ApiMock,
  method: string,
  pathAndSearch: string,
): boolean {
  if (mock.method !== method) return false;
  if (typeof mock.path === "string") {
    return (
      pathAndSearch === mock.path || pathAndSearch.startsWith(`${mock.path}?`)
    );
  }
  return mock.path.test(pathAndSearch);
}

/**
 * Pasang guard + sesi mock, lalu buka `options.path`.
 *
 * Panggil `assertLocalDevOnlyTarget()` di `beforeAll` spec sebelum ini, agar
 * target terbukti dev-server lokal repo ini.
 *
 * @example
 *   test.beforeAll(() => assertLocalDevOnlyTarget());
 *   const audit = await openHermeticShell(page, { path: "/dashboard" });
 */
export async function openHermeticShell(
  page: Page,
  options: HermeticShellOptions,
): Promise<ShellAudit> {
  const authPayload =
    options.auth === false
      ? null
      : await installMockAuthSession(page, options.auth);
  const apiMocks = options.apiMocks ?? [];
  const expectedAssetHosts = new Set([
    ...DEFAULT_EXPECTED_ASSET_HOSTS,
    ...(options.expectedThirdPartyHosts ?? []),
  ]);
  const audit = startAudit();

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathAndSearch = url.pathname + url.search;

    // (1) Origin aplikasi: `/api` wajib lewat allowlist, sisanya aset dev-server.
    if (url.origin === APP_URL.origin) {
      if (url.pathname.startsWith("/api/")) {
        const mock = apiMocks.find((candidate) =>
          matchesApiMock(candidate, method, pathAndSearch),
        );
        if (mock) {
          audit.mockedApi.push(`${method} ${pathAndSearch}`);
          await route.fulfill(
            toJson(mock.body, mock.status ?? 200, mock.headers ?? {}),
          );
          return;
        }
        // Tidak ada fallback ke proxy: request tak dikenal tidak boleh keluar.
        audit.blockedApi.push(`${method} ${pathAndSearch}`);
        await route.abort();
        return;
      }
      audit.localDev += 1;
      await route.continue();
      return;
    }

    // (2) Origin Supabase: hanya tiga jalur auth, dan hanya kalau sesi mock dipasang.
    if (url.origin === SUPABASE_ORIGIN) {
      if (authPayload && url.pathname === "/auth/v1/user") {
        audit.mockedAuth.push(`GET /auth/v1/user`);
        await route.fulfill(toJson({ user: authPayload.authUser }));
        return;
      }
      if (authPayload && url.pathname === "/rest/v1/profiles") {
        audit.mockedAuth.push(`GET /rest/v1/profiles`);
        await route.fulfill(
          toJson([authPayload.authProfile], 200, { "content-range": "0-0/1" }),
        );
        return;
      }
      if (authPayload && url.pathname.startsWith("/auth/v1/token")) {
        audit.mockedAuth.push(`${method} /auth/v1/token`);
        await route.fulfill(
          toJson({
            ...authPayload.authSession,
            user: authPayload.authUser,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        );
        return;
      }
      audit.blockedAuth.push(`${method} ${pathAndSearch}`);
      await route.abort();
      return;
    }

    // (3) Sisanya: tidak boleh keluar dari mesin.
    if (!expectedAssetHosts.has(url.hostname)) {
      audit.blockedExternal.push(`${method} ${url.origin}${url.pathname}`);
    }
    await route.abort();
  });

  await page.goto(options.path);
  const waitFor = options.waitForUrl ?? options.path;
  await page.waitForURL(typeof waitFor === "string" ? `**${waitFor}` : waitFor);
  return audit;
}

/**
 * Assertion standar: tidak ada `/api` yang di-abort, tidak ada host luar yang
 * disentuh. Dipakai setiap spec hermetic supaya klaim "tidak menyentuh backend"
 * dan "tidak ada egress" selalu diuji, bukan hanya ditulis di komentar.
 */
export function expectHermetic(audit: ShellAudit): void {
  expect(
    audit.blockedApi,
    `ada /api yang tidak dimock sehingga di-abort: ${audit.blockedApi.join(" | ")}`,
  ).toEqual([]);
  expect(
    audit.blockedExternal,
    `ada egress non-lokal yang diblokir: ${audit.blockedExternal.join(" | ")}`,
  ).toEqual([]);
  expect(
    audit.blockedAuth,
    `ada jalur auth Supabase yang tidak dimock: ${audit.blockedAuth.join(" | ")}`,
  ).toEqual([]);
}

/**
 * Tunggu sampai halaman benar-benar memanggil endpoint yang diharapkan.
 *
 * `expectHermetic` yang dipanggil terlalu dini bisa lulus secara palsu: fetch
 * awal aplikasi masih berjalan, jadi `blockedApi` masih kosong bukan karena tidak
 * ada yang bocor, tetapi karena belum ada request sama sekali. Polling ini
 * membuktikan request-nya memang terjadi lebih dulu.
 */
export async function waitForMockedApi(
  audit: ShellAudit,
  expected: readonly string[],
  timeoutMs = 15000,
): Promise<void> {
  await expect
    .poll(
      () =>
        expected.filter((needle) =>
          audit.mockedApi.some((entry) => entry.includes(needle)),
        ).length,
      { timeout: timeoutMs },
    )
    .toBe(expected.length);
}
