/**
 * Harness E2E hermetic untuk halaman Parameter QA SIDAK (`/sidak/settings`).
 *
 * Berbeda dari mock statis: store versi aturan dan parameter hidup di memori
 * dan DIUBAH oleh request halaman (buat draft, ubah bobot, tambah/edit/hapus
 * parameter, publish, hapus draft). Dengan begitu spec bisa membuktikan state
 * akhir setelah aksi, bukan hanya payload yang dikirim.
 *
 * Isolasi (fail-closed), mengikuti `sidakTemuanDatesHarness.ts`:
 *   - satu guard `page.route("**\/*")`: hanya dev-server lokal, jalur auth
 *     Supabase yang dimock, dan `/api` yang PERSIS ada di tabel route harness;
 *   - `/api` di luar tabel, host eksternal, dan jalur auth lain di-abort dan
 *     dicatat di audit supaya spec bisa menggagalkan diri;
 *   - `assertLocalDevOnlyTarget()` dipakai spec di `beforeAll`.
 *
 * Seluruh data SINTETIS. Tidak ada Supabase/produksi yang disentuh.
 */

import { expect, type Page, type Route } from "@playwright/test";
import { installMockAuthSession } from "./mockAuth";

export { assertLocalDevOnlyTarget } from "./sidakJadwalShiftingHarness";

export const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";
const API_PREFIX = "/api/v1/sidak";
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export type SettingsAudit = {
  mockedApi: string[];
  mockedAuth: string[];
  localDev: number;
  blockedApi: string[];
  blockedAuth: string[];
  blockedExternal: string[];
};

export function startAudit(): SettingsAudit {
  return {
    mockedApi: [],
    mockedAuth: [],
    localDev: 0,
    blockedApi: [],
    blockedAuth: [],
    blockedExternal: [],
  };
}

export type ServiceKey =
  | "call"
  | "chat"
  | "email"
  | "cso"
  | "pencatatan"
  | "bko"
  | "slik";

export type Period = { id: string; month: number; year: number };
export type StoredVersion = {
  id: string;
  service_type: ServiceKey;
  effective_period_id: string;
  status: "draft" | "published" | "superseded";
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: "weighted" | "flat" | "no_category";
  version_number: number;
  change_reason: string | null;
  created_from_version_id: string | null;
  created_at: string;
};
export type StoredIndicator = {
  id: string;
  rule_version_id: string;
  service_type: ServiceKey;
  name: string;
  parameter_group: string | null;
  category: "critical" | "non_critical" | "none";
  bobot: number;
  has_na: boolean;
  threshold: number | null;
  sort_order: number;
  legacy_indicator_id: string | null;
};

/** ID deterministik (UUID v4-shaped) supaya lolos validasi bentuk di klien. */
function uid(n: number): string {
  return `5e771195-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const PERIODS: Period[] = [
  { id: uid(1), month: 3, year: 2026 },
  { id: uid(2), month: 10, year: 2026 },
  { id: uid(3), month: 11, year: 2026 },
  { id: uid(4), month: 1, year: 2027 },
];
export const P_MAR26 = PERIODS[0].id;
export const P_OKT26 = PERIODS[1].id;
export const P_NOV26 = PERIODS[2].id;
export const P_JAN27 = PERIODS[3].id;

export const IDS = {
  callV2: uid(100),
  callV3: uid(101),
  callV4: uid(102),
  slikV1: uid(110),
  // Parameter call v3 (published) dan v4 (draft) berbagi `legacy_indicator_id`
  // untuk parameter yang sama, seperti hasil salinan server.
  legacy: {
    salam: uid(200),
    masalah: uid(201),
    empati: uid(202),
    informasi: uid(203),
    penutup: uid(204),
  },
};

let store = {
  versions: [] as StoredVersion[],
  indicators: [] as StoredIndicator[],
  emailBaselineCount: 7,
  seq: 1000,
};
let captures: Array<{ kind: string; body: unknown; param?: string }> = [];
let failures = new Map<string, number>();

function nextId(): string {
  store.seq += 1;
  return uid(store.seq);
}

function ind(
  id: number,
  versionId: string,
  service: ServiceKey,
  name: string,
  category: StoredIndicator["category"],
  bobot: number,
  extra: Partial<StoredIndicator> = {},
): StoredIndicator {
  return {
    id: uid(id),
    rule_version_id: versionId,
    service_type: service,
    name,
    parameter_group: null,
    category,
    bobot,
    has_na: false,
    threshold: null,
    sort_order: 0,
    legacy_indicator_id: null,
    ...extra,
  };
}

function seed() {
  const v = (
    id: string,
    service: ServiceKey,
    status: StoredVersion["status"],
    period: string,
    n: number,
    nc: number,
    from: string | null,
    created: string,
  ): StoredVersion => ({
    id,
    service_type: service,
    effective_period_id: period,
    status,
    critical_weight: Number((1 - nc).toFixed(2)),
    non_critical_weight: nc,
    scoring_mode: "weighted",
    version_number: n,
    change_reason: null,
    created_from_version_id: from,
    created_at: created,
  });
  store = {
    versions: [
      // Urutan seperti API: version_number menurun.
      v(IDS.callV4, "call", "draft", P_JAN27, 4, 0.4, IDS.callV3, "2026-10-05T08:00:00.000Z"),
      v(IDS.callV3, "call", "published", P_OKT26, 3, 0.5, IDS.callV2, "2026-09-20T08:00:00.000Z"),
      v(IDS.callV2, "call", "superseded", P_MAR26, 2, 0.5, null, "2026-02-10T08:00:00.000Z"),
      v(IDS.slikV1, "slik", "draft", P_JAN27, 1, 0.4, null, "2026-10-01T08:00:00.000Z"),
    ],
    indicators: [
      // call v3 (published): 5 parameter, bobot kategori 50/50.
      ind(300, IDS.callV3, "call", "Salam Pembuka", "non_critical", 0.25, { legacy_indicator_id: IDS.legacy.salam, has_na: true, sort_order: 1 }),
      ind(301, IDS.callV3, "call", "Pemahaman Masalah", "non_critical", 0.25, { legacy_indicator_id: IDS.legacy.masalah, sort_order: 2 }),
      ind(302, IDS.callV3, "call", "Empati", "non_critical", 0.5, { legacy_indicator_id: IDS.legacy.empati, sort_order: 3 }),
      ind(303, IDS.callV3, "call", "Ketepatan Informasi", "critical", 0.6, { legacy_indicator_id: IDS.legacy.informasi, threshold: 2 }),
      ind(304, IDS.callV3, "call", "Penutupan Layanan", "critical", 0.4, { legacy_indicator_id: IDS.legacy.penutup }),
      // call v4 (draft): "Pemahaman Masalah" dihapus, "Empati" 50% -> 30%,
      // "Verifikasi Identitas" ditambah. Bobot kategori 40/60 (published 50/50).
      ind(310, IDS.callV4, "call", "Salam Pembuka", "non_critical", 0.25, { legacy_indicator_id: IDS.legacy.salam, has_na: true, sort_order: 1 }),
      ind(312, IDS.callV4, "call", "Empati", "non_critical", 0.3, { legacy_indicator_id: IDS.legacy.empati, sort_order: 3 }),
      ind(315, IDS.callV4, "call", "Verifikasi Identitas", "non_critical", 0.45, { sort_order: 4 }),
      ind(313, IDS.callV4, "call", "Ketepatan Informasi", "critical", 0.6, { legacy_indicator_id: IDS.legacy.informasi, threshold: 2 }),
      ind(314, IDS.callV4, "call", "Penutupan Layanan", "critical", 0.4, { legacy_indicator_id: IDS.legacy.penutup }),
      // slik v1 (draft) dengan parameter_group.
      ind(320, IDS.slikV1, "slik", "Nama debitur", "non_critical", 0.5, { parameter_group: "Pemeriksaan Data" }),
      ind(321, IDS.slikV1, "slik", "Nomor KTP", "non_critical", 0.5, { parameter_group: "Pemeriksaan Data" }),
      ind(322, IDS.slikV1, "slik", "Kolektibilitas", "critical", 1, {}),
    ],
    emailBaselineCount: 7,
    seq: 1000,
  };
}
seed();

export function resetStore(): void {
  seed();
  captures = [];
  failures = new Map();
}

/** Payload yang benar-benar diterima "server", per jenis request. */
export function captured(kind: string): any[] {
  return captures.filter((c) => c.kind === kind).map((c) => c.body);
}
export function capturedWithParam(
  kind: string,
): Array<{ body: any; param?: string }> {
  return captures
    .filter((c) => c.kind === kind)
    .map((c) => ({ body: c.body, param: c.param }));
}

/** Request berikutnya dari `kind` dijawab 500 sebanyak `times` kali. */
export function failNext(kind: string, times = 1): void {
  failures.set(kind, times);
}

/**
 * Semua request `kind` dijawab 500 sampai `clearFailures()`. Dipakai untuk
 * pemuatan awal, yang di dev (StrictMode) bisa mengirim lebih dari satu request.
 */
export function failAlways(kind: string): void {
  failures.set(kind, Number.POSITIVE_INFINITY);
}
export function clearFailures(): void {
  failures.clear();
}

/** Kosongkan parameter sebuah versi langsung di store (setup test, bukan lewat UI). */
export function clearIndicators(versionId: string): void {
  store.indicators = store.indicators.filter((x) => x.rule_version_id !== versionId);
}

export function versionsFor(service: ServiceKey): StoredVersion[] {
  return store.versions.filter((x) => x.service_type === service);
}
export function getVersion(id: string): StoredVersion | undefined {
  return store.versions.find((x) => x.id === id);
}
export function indicatorsOf(versionId: string): StoredIndicator[] {
  return store.indicators.filter((x) => x.rule_version_id === versionId);
}

function toJson(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}
const ok = (data: unknown, status = 200) =>
  toJson({ success: true, data }, status);
const err = (message: string, status = 500) =>
  toJson({ success: false, error: { code: "INTERNAL_ERROR", message } }, status);

function withPeriod(v: StoredVersion) {
  const period = PERIODS.find((p) => p.id === v.effective_period_id) ?? null;
  return {
    ...v,
    indicator_count: indicatorsOf(v.id).length,
    qa_periods: period,
  };
}

function shouldFail(kind: string): boolean {
  const left = failures.get(kind) ?? 0;
  if (left <= 0) return false;
  failures.set(kind, left - 1);
  return true;
}

type Handled = Awaited<ReturnType<typeof toJson>> | null;

function handle(
  method: string,
  pathname: string,
  search: URLSearchParams,
  body: any,
): Handled {
  const path = pathname.slice(API_PREFIX.length);

  if (method === "GET" && path === "/periods") return ok(PERIODS);

  if (method === "GET" && path === "/rule-versions") {
    if (shouldFail("listVersions")) return err("Gagal memuat versi aturan");
    const service = search.get("service_type");
    const rows = store.versions
      .filter((x) => !service || x.service_type === service)
      .sort((a, b) => b.version_number - a.version_number)
      .map(withPeriod);
    return ok(rows);
  }

  if (method === "GET" && path === "/rule-versions/meta") {
    const service = search.get("service_type") ?? "";
    const list = store.versions.filter((x) => x.service_type === service);
    return ok({
      service_type: service,
      indicator_count: service === "email" ? store.emailBaselineCount : 0,
      has_weight: service === "email",
      draft_count: list.filter((x) => x.status === "draft").length,
      published_count: list.filter((x) => x.status === "published").length,
    });
  }

  if (method === "POST" && path === "/rule-versions") {
    captures.push({ kind: "createVersion", body });
    if (shouldFail("createVersion")) return err("Gagal membuat draft");
    const service = body.service_type as ServiceKey;
    const source = body.source_version_id
      ? getVersion(body.source_version_id)
      : undefined;
    const inService = versionsFor(service);
    const created: StoredVersion = {
      id: nextId(),
      service_type: service,
      effective_period_id: source?.effective_period_id ?? P_JAN27,
      status: "draft",
      critical_weight: source?.critical_weight ?? 0.5,
      non_critical_weight: source?.non_critical_weight ?? 0.5,
      scoring_mode: source?.scoring_mode ?? "weighted",
      version_number:
        Math.max(0, ...inService.map((x) => x.version_number)) + 1,
      change_reason: null,
      created_from_version_id: source?.id ?? null,
      created_at: "2026-10-08T08:00:00.000Z",
    };
    store.versions.push(created);
    if (source) {
      for (const row of indicatorsOf(source.id)) {
        store.indicators.push({ ...row, id: nextId(), rule_version_id: created.id });
      }
    } else if (service === "email") {
      for (let i = 0; i < 3; i += 1) {
        store.indicators.push(
          ind(0, created.id, service, `Parameter email ${i + 1}`, "non_critical", 1 / 3),
        );
        store.indicators[store.indicators.length - 1].id = nextId();
      }
    }
    return ok(withPeriod(created), 201);
  }

  let m = path.match(/^\/rule-versions\/([^/]+)$/);
  if (m && method === "PUT") {
    captures.push({ kind: "updateWeights", body, param: m[1] });
    if (shouldFail("updateWeights")) return err("Gagal mengupdate bobot");
    const version = getVersion(m[1]);
    if (!version) return err("Versi aturan tidak ditemukan", 404);
    if (typeof body.non_critical_weight === "number")
      version.non_critical_weight = body.non_critical_weight;
    if (typeof body.critical_weight === "number")
      version.critical_weight = body.critical_weight;
    return ok(withPeriod(version));
  }
  if (m && method === "DELETE") {
    captures.push({ kind: "deleteVersion", body: null, param: m[1] });
    if (shouldFail("deleteVersion")) return err("Gagal menghapus draft");
    const version = getVersion(m[1]);
    if (!version || version.status !== "draft")
      return err("Hanya draft yang bisa dihapus", 400);
    store.versions = store.versions.filter((x) => x.id !== m![1]);
    store.indicators = store.indicators.filter((x) => x.rule_version_id !== m![1]);
    return toJson({ success: true, message: "Draft berhasil dihapus" });
  }

  m = path.match(/^\/rule-versions\/([^/]+)\/publish$/);
  if (m && method === "POST") {
    captures.push({ kind: "publish", body, param: m[1] });
    if (shouldFail("publish")) return err("Gagal mempublish rules");
    const version = getVersion(m[1]);
    if (!version || version.status !== "draft")
      return err("Hanya versi draft yang bisa dipublikasikan", 400);
    const target = body.effective_period_id ?? version.effective_period_id;
    let number = version.version_number;
    if (target !== version.effective_period_id) {
      const inTarget = versionsFor(version.service_type).filter(
        (x) => x.effective_period_id === target,
      );
      number = Math.max(0, ...inTarget.map((x) => x.version_number)) + 1;
    }
    for (const other of versionsFor(version.service_type)) {
      if (
        other.id !== version.id &&
        other.status === "published" &&
        other.effective_period_id === target
      ) {
        other.status = "superseded";
      }
    }
    version.status = "published";
    version.effective_period_id = target;
    version.version_number = number;
    if (body.change_reason !== undefined) version.change_reason = body.change_reason;
    return ok(version);
  }

  m = path.match(/^\/rule-versions\/([^/]+)\/indicators$/);
  if (m && method === "GET") {
    return ok(indicatorsOf(m[1]));
  }
  if (m && method === "POST") {
    captures.push({ kind: "addIndicator", body, param: m[1] });
    if (shouldFail("addIndicator")) return err("Gagal menambahkan parameter");
    const row: StoredIndicator = {
      id: nextId(),
      rule_version_id: m[1],
      service_type: body.service_type,
      name: body.name,
      parameter_group: body.parameter_group ?? null,
      category: body.category,
      bobot: body.bobot,
      has_na: body.has_na,
      threshold: body.threshold ?? null,
      sort_order: body.sort_order ?? 0,
      legacy_indicator_id: null,
    };
    store.indicators.push(row);
    return ok(row, 201);
  }

  m = path.match(/^\/rule-versions\/([^/]+)\/indicators\/([^/]+)$/);
  if (m && method === "PUT") {
    captures.push({ kind: "updateIndicator", body, param: m[2] });
    if (shouldFail("updateIndicator")) return err("Gagal memperbarui parameter");
    const row = store.indicators.find((x) => x.id === m![2]);
    if (!row) return err("Parameter tidak ditemukan", 404);
    Object.assign(row, {
      ...body,
      threshold: body.threshold ?? null,
      parameter_group: body.parameter_group ?? null,
    });
    return ok(row);
  }
  if (m && method === "DELETE") {
    captures.push({ kind: "deleteIndicator", body: null, param: m[2] });
    if (shouldFail("deleteIndicator")) return err("Gagal menghapus parameter");
    store.indicators = store.indicators.filter((x) => x.id !== m![2]);
    return toJson({ success: true, message: "Parameter dihapus" });
  }

  return null;
}

export type OpenSettingsOptions = {
  role?: string;
  /** Viewport awal; default desktop 1440x900. */
  viewport?: { width: number; height: number };
  colorScheme?: "light" | "dark";
  path?: string;
};

export async function openSettings(
  page: Page,
  audit: SettingsAudit,
  opts: OpenSettingsOptions = {},
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
          const handled = handle(method, url.pathname, url.searchParams, body);
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
      audit.localDev += 1;
      await route.continue();
      return;
    }

    if (url.origin === SUPABASE_ORIGIN) {
      if (url.pathname === "/auth/v1/user") {
        audit.mockedAuth.push("GET /auth/v1/user");
        await route.fulfill(toJson({ user: auth.authUser }));
        return;
      }
      if (url.pathname === "/rest/v1/profiles") {
        audit.mockedAuth.push("GET /rest/v1/profiles");
        await route.fulfill({
          ...toJson([auth.authProfile]),
          headers: { "content-range": "0-0/1" },
        });
        return;
      }
      if (url.pathname.startsWith("/auth/v1/token")) {
        audit.mockedAuth.push(`${method} /auth/v1/token`);
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

  await page.goto(opts.path ?? "/sidak/settings", {
    waitUntil: "domcontentloaded",
  });
}

export function expectIsolation(audit: SettingsAudit): void {
  expect(audit.blockedExternal, "host eksternal disentuh").toEqual([]);
  expect(audit.blockedApi, "/api di luar tabel harness").toEqual([]);
  expect(audit.blockedAuth, "jalur auth Supabase tak dimock").toEqual([]);
  expect(audit.mockedApi.length).toBeGreaterThan(0);
}
