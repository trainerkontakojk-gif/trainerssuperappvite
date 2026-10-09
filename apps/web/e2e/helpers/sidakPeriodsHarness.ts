/**
 * Harness E2E hermetic untuk halaman Periode QA SIDAK (`/sidak/periods`).
 *
 * Store periode hidup di memori dan DIUBAH oleh request halaman (tambah/hapus),
 * sehingga spec membuktikan state akhir. Periode yang ditandai "dipakai temuan"
 * ditolak `DELETE` dengan 400 `DELETE_ERROR` + pesan Indonesia, persis seperti
 * `sidakCore.delete("/periods/:id")` di apps/api.
 *
 * Isolasi fail-closed (pola `sidakSettingsHarness.ts`): hanya dev-server lokal,
 * auth Supabase yang dimock, dan `/api` yang ada di tabel harness. Data sintetis.
 */

import { expect, type Page, type Route } from "@playwright/test";
import { installMockAuthSession } from "./mockAuth";

export { assertLocalDevOnlyTarget } from "./sidakJadwalShiftingHarness";

export const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";
const API_PREFIX = "/api/v1/sidak";
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export const USED_MESSAGE =
  "Periode ini sudah memiliki data temuan dan tidak bisa dihapus.";

export type Period = { id: string; month: number; year: number };

export type PeriodsAudit = {
  mockedApi: string[];
  blockedApi: string[];
  blockedAuth: string[];
  blockedExternal: string[];
};

export function startAudit(): PeriodsAudit {
  return { mockedApi: [], blockedApi: [], blockedAuth: [], blockedExternal: [] };
}

function uid(n: number): string {
  return `5e771195-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const SEED: Period[] = [
  { id: uid(1), month: 12, year: 2023 },
  { id: uid(2), month: 1, year: 2025 },
  { id: uid(3), month: 2, year: 2025 },
  { id: uid(4), month: 3, year: 2026 },
  { id: uid(5), month: 10, year: 2026 },
];
/** Periode yang sudah punya temuan: tidak boleh dihapus. */
export const USED_ID = uid(5);

let store = { periods: [] as Period[], seq: 1000 };
let captures: Array<{ kind: string; body: unknown; param?: string }> = [];
let failures = new Map<string, number>();

export function resetStore(): void {
  store = { periods: SEED.map((p) => ({ ...p })), seq: 1000 };
  captures = [];
  failures = new Map();
}
resetStore();

/** Kosongkan store langsung (setup test, bukan lewat UI). */
export function emptyStore(): void {
  store.periods = [];
}

export function captured(kind: string): any[] {
  return captures.filter((c) => c.kind === kind).map((c) => c.body);
}
export function capturedParams(kind: string): Array<string | undefined> {
  return captures.filter((c) => c.kind === kind).map((c) => c.param);
}
export function storedPeriods(): Period[] {
  return store.periods.map((p) => ({ ...p }));
}
/** Request berikutnya dari `kind` dijawab 500. `failAlways` sampai di-clear. */
export function failNext(kind: string, times = 1): void {
  failures.set(kind, times);
}
export function failAlways(kind: string): void {
  failures.set(kind, Number.POSITIVE_INFINITY);
}
export function clearFailures(): void {
  failures.clear();
}
function shouldFail(kind: string): boolean {
  const left = failures.get(kind) ?? 0;
  if (left <= 0) return false;
  failures.set(kind, left - 1);
  return true;
}

function toJson(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}
const ok = (data: unknown, status = 200) => toJson({ success: true, data }, status);

function handle(method: string, pathname: string, body: any) {
  const path = pathname.slice(API_PREFIX.length);

  if (method === "GET" && path === "/periods") {
    if (shouldFail("listPeriods"))
      return toJson(
        { success: false, error: { code: "INTERNAL_ERROR", message: "boom" } },
        500,
      );
    // API mengurutkan year desc, month desc.
    return ok(
      [...store.periods].sort((a, b) => b.year - a.year || b.month - a.month),
    );
  }

  if (method === "POST" && path === "/periods") {
    captures.push({ kind: "createPeriod", body });
    if (shouldFail("createPeriod"))
      return toJson(
        { success: false, error: { code: "INTERNAL_ERROR", message: "insert failed: pg 23505" } },
        500,
      );
    store.seq += 1;
    const created: Period = { id: uid(store.seq), month: body.month, year: body.year };
    store.periods.push(created);
    return ok({ ...created, label: `${created.month}/${created.year}` }, 201);
  }

  const m = path.match(/^\/periods\/([^/]+)$/);
  if (m && method === "DELETE") {
    captures.push({ kind: "deletePeriod", body: null, param: m[1] });
    if (m[1] === USED_ID) {
      return toJson(
        { success: false, error: { code: "DELETE_ERROR", message: USED_MESSAGE } },
        400,
      );
    }
    if (shouldFail("deletePeriod"))
      return toJson(
        { success: false, error: { code: "DELETE_ERROR", message: "Gagal memverifikasi status periode." } },
        400,
      );
    store.periods = store.periods.filter((p) => p.id !== m[1]);
    return ok({ success: true });
  }
  return null;
}

export type OpenPeriodsOptions = {
  role?: string;
  viewport?: { width: number; height: number };
  colorScheme?: "light" | "dark";
};

export async function openPeriods(
  page: Page,
  audit: PeriodsAudit,
  opts: OpenPeriodsOptions = {},
): Promise<void> {
  const { role = "admin", viewport = { width: 1440, height: 900 } } = opts;
  await page.setViewportSize(viewport);
  if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme });
  const auth = await installMockAuthSession(page, { role });

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.origin === APP_URL.origin) {
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/v1/me/access-status") {
          audit.mockedApi.push(`${method} ${url.pathname}`);
          await route.fulfill(
            ok({
              sidak: { status: "none", module: "sidak", created_at: null },
              ktp: { status: "none", module: "ktp", created_at: null },
            }),
          );
          return;
        }
        if (url.pathname.startsWith(`${API_PREFIX}/`)) {
          let body: unknown = null;
          if (method === "POST" || method === "PUT") {
            try {
              body = request.postDataJSON();
            } catch {
              body = null;
            }
          }
          const handled = handle(method, url.pathname, body);
          if (handled) {
            audit.mockedApi.push(`${method} ${url.pathname}${url.search}`);
            await route.fulfill(handled);
            return;
          }
        }
        audit.blockedApi.push(`${method} ${url.pathname}${url.search}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
      return;
    }

    if (url.origin === SUPABASE_ORIGIN) {
      if (url.pathname === "/auth/v1/user") {
        await route.fulfill(toJson({ user: auth.authUser }));
        return;
      }
      if (url.pathname === "/rest/v1/profiles") {
        await route.fulfill({
          ...toJson([auth.authProfile]),
          headers: { "content-range": "0-0/1" },
        });
        return;
      }
      if (url.pathname.startsWith("/auth/v1/token")) {
        await route.fulfill(
          toJson({
            ...auth.authSession,
            user: auth.authUser,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        );
        return;
      }
      audit.blockedAuth.push(`${method} ${url.pathname}${url.search}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (!EXTERNAL_FONT_HOSTS.includes(url.hostname)) {
      audit.blockedExternal.push(`${method} ${url.origin}${url.pathname}`);
    }
    await route.abort("blockedbyclient");
  });

  await page.goto("/sidak/periods", { waitUntil: "domcontentloaded" });
}

export function expectIsolation(audit: PeriodsAudit): void {
  expect(audit.blockedExternal, "host eksternal disentuh").toEqual([]);
  expect(audit.blockedApi, "/api di luar tabel harness").toEqual([]);
  expect(audit.blockedAuth, "jalur auth Supabase tak dimock").toEqual([]);
  expect(audit.mockedApi.length).toBeGreaterThan(0);
}
